"""Positions from a month of rated Lichess games as a dataset.

The stream is read from its start until enough analysed games at the wanted
speed have given rows, so a build downloads only the part of the month it
uses. Each row is one position with the move a human played there, what it
cost, how long it took and how the game ended (``games.py``), so one dataset
serves every model that reads a position from a game.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import chess
import numpy as np
import polars as pl

from ..bands import rating_band
from ..encode.board import CASTLING, encode_positions, move_squares, white_to_move
from ..encode.hand import POSITION_FEATURES, position_features
from .games import game_rows, wanted
from .lichess import LICENCE, game_blocks, games_url, open_zst
from .splits import split_of
from .store import batches, worker_pool


MARKS = ("en_passant", "last_from", "last_to")
GAMES_A_CHUNK = 2000
HAND = POSITION_FEATURES


def _rows(job: tuple[dict[str, str], str, int, int, str]) -> list[dict[str, Any]]:
    headers, movetext, min_ply, per_game, salt = job
    rows = game_rows(headers, movetext, min_ply=min_ply, per_game=per_game, salt=salt)
    for row in rows:
        row.update(position_features(chess.Board(row["fen"])))
    return rows


def last_move_marks(last_move: str, white: bool) -> list[tuple[int, int]]:
    if not last_move:
        return []
    start, end = move_squares(last_move, white)
    return [(1, start), (2, end)]


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any]]:
    salt = recipe["split"]["salt"]
    speeds = tuple(recipe["speeds"])
    origin = source or games_url(recipe["month"])
    counts = {"read": 0, "wanted": 0}

    def jobs(text) -> Iterator[tuple[dict[str, str], str, int, int, str]]:
        for headers, movetext in game_blocks(text):
            counts["read"] += 1
            if wanted(headers, movetext, speeds=speeds):
                counts["wanted"] += 1
                yield headers, movetext, int(recipe["min_ply"]), int(recipe["per_game"]), salt

    def encode(rows: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
        for row in rows:
            row["split"] = split_of(
                row["game_id"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"]
            )
            row["band"] = rating_band(row["mover_elo"])
        tokens, marks, castling = encode_positions(
            [row["fen"] for row in rows],
            (last_move_marks(row["last_move"], white_to_move(row["fen"])) for row in rows),
        )
        frame = pl.DataFrame(rows, infer_schema_length=None).with_columns(
            [pl.Series(name, castling[:, index]) for index, name in enumerate(CASTLING)]
            + [
                pl.col("spent").log1p().alias("log_spent"),
                pl.col("clock").log1p().alias("log_clock"),
                pl.col("opponent_clock").log1p().alias("log_opponent_clock"),
                pl.col("base").cast(pl.Float64).log1p().alias("log_base"),
            ]
        )
        return frame, tokens, marks

    def kept_games(pool) -> Iterator[list[dict[str, Any]]]:
        games = 0
        for game in pool.imap(_rows, jobs(text), chunksize=32):
            if game:
                games += 1
                yield game
                if games >= int(recipe["games"]):
                    return

    parts = []
    games = 0
    with open_zst(origin) as text, worker_pool(workers) as pool:
        for chunk in batches(kept_games(pool), GAMES_A_CHUNK):
            games += len(chunk)
            parts.append(encode([row for game in chunk for row in game]))
            log(
                f"games: read {counts['read']:,}, kept {games:,}, "
                f"rows {sum(len(part[0]) for part in parts):,}"
            )
        pool.terminate()
    frame = pl.concat([part[0] for part in parts], how="vertical_relaxed")
    tokens = np.concatenate([part[1] for part in parts])
    marks = np.concatenate([part[2] for part in parts])
    manifest = {
        "builder": "game_positions",
        "source": games_url(recipe["month"]),
        "licence": LICENCE,
        "recipe": {key: recipe[key] for key in ("month", "speeds", "min_ply", "per_game", "games", "split")},
        "games_read": counts["read"],
        "games_kept": games,
        "marks": list(MARKS),
        "hand": list(HAND),
        "group": "game_id",
    }
    return frame, tokens, marks, manifest
