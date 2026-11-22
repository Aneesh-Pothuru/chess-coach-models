"""Lichess puzzles joined to the games they were cut from, as a dataset.

A puzzle begins with the opponent's mistake, and its solution is the line that
punishes it. ``Lichess/chess-puzzles-with-games`` (CC0, on Hugging Face) gives
each puzzle beside its game: both ratings, the time control, and every move
with its clock and the engine's evaluation. So a row here is a tactic that was
on the board in a real game, with what the player to move was rated and had
left on the clock, and whether the move he played was the tactic's first move.

The source is fourteen Parquet files of about 1.3 GB, ordered by the first two
characters of the puzzle id, which are random: the first few files are a
random share of the puzzles, and a build that reads more of them contains one
that reads fewer. A build fetches one file at a time into a temporary folder,
reads the columns it needs and lets the file go.
"""

from __future__ import annotations

import subprocess
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import chess
import numpy as np
import polars as pl

from ..encode.board import CASTLING, encode_positions, white_to_move
from ..encode.hand import line_features, position_features
from ..winprob import mover_win_percent
from .games import parse_export
from .puzzles import HAND, MARKS, line_marks
from .splits import keep, split_of
from .store import CHUNK, batches, fed, worker_pool


LICENCE = "CC0 1.0, huggingface.co/datasets/Lichess/chess-puzzles-with-games"
FILES = 14
READ = 20_000
COLUMNS = (
    "PuzzleId",
    "FEN",
    "Moves",
    "Rating",
    "RatingDeviation",
    "NbPlays",
    "Themes",
    "GameId",
    "WhiteElo",
    "BlackElo",
    "WhiteTitle",
    "BlackTitle",
    "clock",
    "speed",
    "variant",
    "movetext",
)
DROPPED = ("unreadable", "no reply", "no clock", "no evaluation")
BANDS = ((2300, "2300+"), (2100, "2100-2299"), (1900, "1900-2099"), (1700, "1700-1899"), (0, "<1700"))

Item = tuple[str, str, str, int, int, int, str, str, int, int, int, int, str, str]


def file_name(index: int) -> str:
    return f"train-{index:05d}-of-{FILES:05d}.parquet"


def file_url(source: str, revision: str, index: int) -> str:
    return f"{source}/resolve/{revision}/data/{file_name(index)}"


def mover_band(elo: int) -> str:
    """The band of the player to move. Lichess cuts its puzzles from games between players rated about 1500 and up, so these bands start higher than the lab's usual ones."""
    return next(name for floor, name in BANDS if elo >= floor)


def game_and_ply(value: str) -> tuple[str, int] | None:
    """A puzzle's game and the ply of the move that sets it up, from ``AiNXhpcc#27`` or ``NcD6lul8/black#50``."""
    path, _, ply = value.partition("#")
    identity = path.split("/")[0]
    if not identity or not ply.isdigit() or int(ply) < 2:
        return None
    return identity, int(ply)


def candidates(frame: pl.DataFrame, filters: dict[str, Any]) -> pl.DataFrame:
    """The source rows a recipe's filters let through, with the columns in the order ``example`` reads them."""
    passes = (
        (pl.col("variant") == "standard")
        & pl.col("speed").is_in(list(filters["speeds"]))
        & (pl.col("RatingDeviation") <= filters["max_rating_deviation"])
        & (pl.col("NbPlays") >= filters["min_plays"])
        & pl.col("WhiteElo").is_not_null()
        & pl.col("BlackElo").is_not_null()
        & pl.col("clock").is_not_null()
        & (pl.col("WhiteTitle").fill_null("") != "BOT")
        & (pl.col("BlackTitle").fill_null("") != "BOT")
    )
    return frame.filter(passes).select(
        "PuzzleId",
        "FEN",
        "Moves",
        "Rating",
        "RatingDeviation",
        "NbPlays",
        pl.col("Themes").list.join(" "),
        "GameId",
        "WhiteElo",
        "BlackElo",
        pl.col("clock").struct.field("initial").alias("base"),
        pl.col("clock").struct.field("increment").alias("increment"),
        "speed",
        "movetext",
    )


def found(board: chess.Board, first: chess.Move, played: chess.Move) -> bool:
    """Whether the move played takes the tactic: it is the solution's first move, or the solution mates at once and so does the move played, as Lichess accepts any mate in one."""
    return played == first or (_mates(board, first) and _mates(board, played))


def _mates(board: chess.Board, move: chess.Move) -> bool:
    board.push(move)
    try:
        return board.is_checkmate()
    finally:
        board.pop()


def example(item: Item) -> dict[str, Any] | str:
    """A source row as a dataset row, or the reason it gives none (one of ``DROPPED``).

    The puzzle's position and the move that sets it up have to be the game's
    own at the ply the puzzle names, or the row is unreadable. The move the
    player made next is the label (``found``). His clock is the one he had
    after his last move, and the two evaluations are the engine's before and
    after the opponent's mistake.
    """
    puzzle_id, fen, moves, rating, deviation, plays, themes, game = item[:8]
    white_elo, black_elo, base, increment, speed, movetext = item[8:]
    located = game_and_ply(game)
    if located is None:
        return "unreadable"
    identity, setup_ply = located
    plies = parse_export(movetext)
    try:
        board = chess.Board(fen)
        ucis = moves.split()
        setup = board.parse_uci(ucis[0])
        if board.ply() != setup_ply - 1 or len(plies) < setup_ply:
            return "unreadable"
        if board.parse_san(plies[setup_ply - 1].san) != setup:
            return "unreadable"
        setup_capture = board.is_capture(setup)
        board.push(setup)
        walk = board.copy(stack=False)
        line = []
        for uci in ucis[1:]:
            line.append(walk.parse_uci(uci))
            walk.push(line[-1])
        if not line:
            return "unreadable"
        if len(plies) == setup_ply:
            return "no reply"
        played = board.parse_san(plies[setup_ply].san)
    except (ValueError, IndexError):
        return "unreadable"
    before, mistake, reply = plies[setup_ply - 2], plies[setup_ply - 1], plies[setup_ply]
    if before.clock is None or mistake.clock is None:
        return "no clock"
    if before.eval_cp_white is None or mistake.eval_cp_white is None:
        return "no evaluation"
    solver = board.turn
    return {
        "key": puzzle_id,
        "puzzle_id": puzzle_id,
        "game_id": identity,
        "ply": setup_ply + 1,
        "fen": board.fen(),
        "setup": ucis[0],
        "line": " ".join(ucis[1:]),
        "played": played.uci(),
        "found": int(found(board, line[0], played)),
        "mover_elo": white_elo if solver == chess.WHITE else black_elo,
        "opponent_elo": black_elo if solver == chess.WHITE else white_elo,
        "base": base,
        "increment": increment,
        "clock": before.clock,
        "opponent_clock": mistake.clock,
        "spent": None if reply.clock is None else max(0.0, before.clock - reply.clock + increment),
        "win_prior": mover_win_percent(before.eval_cp_white, solver),
        "win_before": mover_win_percent(mistake.eval_cp_white, solver),
        "rating": rating,
        "rating_deviation": deviation,
        "plays": plays,
        "themes": themes,
        "speed": speed,
        **position_features(board),
        **line_features(board, line, setup_capture=setup_capture),
    }


def _files(recipe: dict[str, Any], source: str | None, log: Callable[[str], None]) -> Iterator[Path]:
    """The recipe's Parquet files, one at a time: local copies when ``source`` names a file or a folder of them, else each fetched and then let go."""
    wanted = int(recipe["files"])
    if source:
        given = Path(source)
        local = sorted(given.glob("*.parquet")) if given.is_dir() else [given]
        if len(local) < wanted:
            raise ValueError(f"the recipe reads {wanted} files and {given} holds {len(local)}")
        yield from local[:wanted]
        return
    with tempfile.TemporaryDirectory(prefix="lab-tactics-") as folder:
        for index in range(wanted):
            path = Path(folder) / file_name(index)
            log(f"tactics: fetching {file_name(index)} ({index + 1} of {wanted})")
            url = file_url(recipe["source"], recipe["revision"], index)
            subprocess.run(["curl", "-sSL", "--fail", "--retry", "3", "-o", str(path), url], check=True)
            yield path
            path.unlink()


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any]]:
    filters = recipe["filters"]
    salt = recipe["split"]["salt"]
    limit = recipe.get("source_rows")
    counts = {"read": 0, "kept": 0}

    def full() -> bool:
        return limit is not None and counts["read"] >= limit

    def items() -> Iterator[Item]:
        files = _files(recipe, source, log)
        for path in files:
            scan = pl.scan_parquet(path).select(COLUMNS)
            offset = 0
            while not full():
                room = READ if limit is None else min(READ, limit - counts["read"])
                frame = scan.slice(offset, room).collect()
                if not len(frame):
                    break
                offset += len(frame)
                counts["read"] += len(frame)
                for row in candidates(frame, filters).iter_rows():
                    if keep(row[0], salt, float(recipe["sample"])):
                        counts["kept"] += 1
                        yield row
            if full():
                files.close()
                break

    def encode(rows: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
        for row in rows:
            row["split"] = split_of(
                row["game_id"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"]
            )
            row["band"] = mover_band(row["mover_elo"])
        tokens, marks, castling = encode_positions(
            [row["fen"] for row in rows],
            (
                line_marks(row["setup"], row["line"].split(), white_to_move(row["fen"]))
                for row in rows
            ),
        )
        frame = pl.DataFrame(rows, infer_schema_length=None).with_columns(
            [pl.Series(name, castling[:, index]) for index, name in enumerate(CASTLING)]
            + [
                pl.col("spent").cast(pl.Float64),
                pl.col("clock").log1p().alias("log_clock"),
                pl.col("opponent_clock").log1p().alias("log_opponent_clock"),
                pl.col("base").cast(pl.Float64).log1p().alias("log_base"),
            ]
        )
        return frame, tokens, marks

    parts = []
    dropped = dict.fromkeys(DROPPED, 0)

    def readable(results: Iterator[dict[str, Any] | str]) -> Iterator[dict[str, Any]]:
        for result in results:
            if isinstance(result, str):
                dropped[result] += 1
            else:
                yield result

    with worker_pool(workers) as pool:
        for rows in batches(readable(pool.imap(example, fed(items()), chunksize=200)), CHUNK):
            parts.append(encode(rows))
            log(f"tactics: read {counts['read']:,}, rows {sum(len(part[0]) for part in parts):,}")
    if not parts:
        raise ValueError("no source row gave a dataset row: check the recipe's filters against the source")
    frame = pl.concat([part[0] for part in parts], how="vertical_relaxed")
    log(
        f"tactics: {counts['kept']:,} of {counts['read']:,} passed the recipe, {len(frame):,} gave rows; "
        + ", ".join(f"{count:,} {reason}" for reason, count in dropped.items())
    )
    manifest = {
        "builder": "tactics",
        "source": f"{recipe['source']}/tree/{recipe['revision']}",
        "licence": LICENCE,
        "recipe": {
            key: recipe[key]
            for key in ("revision", "files", "source_rows", "filters", "sample", "split")
            if key in recipe
        },
        "source_rows_read": counts["read"],
        "passed_recipe": counts["kept"],
        "dropped": dropped,
        "found": int(frame["found"].sum()),
        "marks": list(MARKS),
        "hand": list(HAND),
        "group": "game_id",
    }
    return (
        frame,
        np.concatenate([part[1] for part in parts]),
        np.concatenate([part[2] for part in parts]),
        manifest,
    )
