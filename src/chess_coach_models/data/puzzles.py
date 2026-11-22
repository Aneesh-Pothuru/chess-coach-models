"""The Lichess puzzle database as a dataset.

A puzzle row gives the position before the opponent's last move, that move,
and the solution: the solver's moves alternating with the forced replies. A
dataset row holds the position the solver sees, the line, the puzzle's rating
(what the crowd's attempts made it) and features of the position and the line.
Puzzles cut from one game share a split.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import chess
import numpy as np
import polars as pl

from .. import bands
from ..encode.board import CASTLING, encode_positions, move_squares, white_to_move
from ..encode.hand import LINE_FEATURES, POSITION_FEATURES, line_features, position_features
from .lichess import LICENCE, open_zst, puzzle_rows
from .splits import keep, split_of
from .store import CHUNK, batches, fed, worker_pool


MARKS = (
    "en_passant",
    "setup_from",
    "setup_to",
    "solver1_from",
    "solver1_to",
    "reply1_from",
    "reply1_to",
    "solver2_from",
    "solver2_to",
    "reply2_from",
    "reply2_to",
    "solver3_from",
    "solver3_to",
    "later",
)
LATER = MARKS.index("later")
HAND = POSITION_FEATURES + LINE_FEATURES


def puzzle_band(rating: int) -> str:
    return bands.band(rating, bands.PUZZLE)


def source_game(url: str) -> str:
    """The id of the game a puzzle was cut from, out of its link."""
    parts = url.split("#", 1)[0].rstrip("/").split("/")[3:]
    return next((part for part in parts if part != "game"), "")


def line_marks(setup: str, line: list[str], white: bool) -> list[tuple[int, int]]:
    """The mark channels of a puzzle: where the setup move and each move of the line start and end."""
    pairs = []
    for index, uci in enumerate([setup, *line]):
        start, end = move_squares(uci, white)
        if index < 6:
            pairs += [(1 + 2 * index, start), (2 + 2 * index, end)]
        else:
            pairs += [(LATER, start), (LATER, end)]
    return pairs


def example(item: tuple[str, str, str, int, int, int, str, str]) -> dict[str, Any] | None:
    puzzle_id, fen, moves, rating, deviation, plays, themes, url = item
    try:
        board = chess.Board(fen)
        ucis = moves.split()
        setup = board.parse_uci(ucis[0])
        setup_capture = board.is_capture(setup)
        board.push(setup)
        walk = board.copy(stack=False)
        line = []
        for uci in ucis[1:]:
            line.append(walk.parse_uci(uci))
            walk.push(line[-1])
    except (ValueError, IndexError):
        return None
    if not line:
        return None
    return {
        "key": puzzle_id,
        "puzzle_id": puzzle_id,
        "game_id": source_game(url) or puzzle_id,
        "fen": board.fen(),
        "setup": ucis[0],
        "line": " ".join(ucis[1:]),
        "rating": rating,
        "rating_deviation": deviation,
        "plays": plays,
        "themes": themes,
        "band": puzzle_band(rating),
        **position_features(board),
        **line_features(board, line, setup_capture=setup_capture),
    }


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any]]:
    filters = recipe["filters"]
    salt = recipe["split"]["salt"]
    counts = {"read": 0, "kept": 0}

    def items(text) -> Iterator[tuple[str, str, str, int, int, int, str, str]]:
        for row in puzzle_rows(text):
            counts["read"] += 1
            deviation, plays = int(row["RatingDeviation"]), int(row["NbPlays"])
            if deviation > filters["max_rating_deviation"] or plays < filters["min_plays"]:
                continue
            if not keep(row["PuzzleId"], salt, float(recipe["sample"])):
                continue
            counts["kept"] += 1
            yield (
                row["PuzzleId"],
                row["FEN"],
                row["Moves"],
                int(row["Rating"]),
                deviation,
                plays,
                row["Themes"],
                row["GameUrl"],
            )

    def encode(rows: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
        for row in rows:
            row["split"] = split_of(
                row["game_id"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"]
            )
        tokens, marks, castling = encode_positions(
            [row["fen"] for row in rows],
            (
                line_marks(row["setup"], row["line"].split(), white_to_move(row["fen"]))
                for row in rows
            ),
        )
        frame = pl.DataFrame(rows, infer_schema_length=None).with_columns(
            [pl.Series(name, castling[:, index]) for index, name in enumerate(CASTLING)]
        )
        return frame, tokens, marks

    parts = []
    with open_zst(source or recipe["source"]) as text, worker_pool(workers) as pool:
        replayed = (row for row in pool.imap(example, fed(items(text)), chunksize=500) if row is not None)
        for rows in batches(replayed, CHUNK):
            parts.append(encode(rows))
            log(f"puzzles: read {counts['read']:,}, rows {sum(len(part[0]) for part in parts):,}")
    frame = pl.concat([part[0] for part in parts], how="vertical_relaxed")
    log(f"puzzles: kept {counts['kept']:,} of {counts['read']:,}, {counts['kept'] - len(frame):,} unreadable")
    manifest = {
        "builder": "puzzles",
        "source": recipe["source"],
        "licence": LICENCE,
        "recipe": {key: recipe[key] for key in ("filters", "sample", "split")},
        "source_rows_read": counts["read"],
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
