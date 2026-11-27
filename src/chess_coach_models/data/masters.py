"""Moves strong players made in classical over-the-board games, as a dataset (``broadcasts.py``).

The months of the Lichess broadcast database are read oldest first, each from its local copy in
``data/raw/lichess-broadcasts`` when there is one and from its URL otherwise. A game can give rows when it
is a finished standard game at a classical pace (``broadcasts.classical_game``) and a hash of the game
keeps it in the recipe's sample. A game relayed twice is read once: the second copy, which has its own
relay id, is known by its players, month and moves, and that key is the row's ``game_id``. A row is a move a strong player made from ``min_ply`` on, with
at least ``ample_clock`` seconds on the mover's clock and both ratings known, up to ``per_game`` of them
chosen by a hash of the game and the ply.

Each row says what a model may read (the board, the last move, both ratings, both clocks, the time
control, the mover's title) and what it may be asked to predict (the move, the seconds it took, what it
lost by Lichess's evaluation when the game has one, the result). The columns a position row of
``game-positions`` has are here under the same names, so a task written for one reads the other.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from typing import Any

import chess
import numpy as np
import polars as pl

from ..bands import rating_band
from ..encode.board import CASTLING, encode_positions, white_to_move
from ..encode.hand import POSITION_FEATURES, position_features
from . import broadcasts
from .lichess import game_blocks, open_zst
from .positions import MARKS, last_move_marks
from .splits import keep, split_of, unit_hash
from .store import batches, fed, worker_pool


HAND = POSITION_FEATURES
GAMES_A_CHUNK = 2000


def _rows(job: tuple[dict[str, str], str, dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    headers, movetext, plan = job
    game, _ = broadcasts.classical_game(headers, movetext)
    # The sample is drawn by the game, not by the relay, so both relays of a game are in it or out of it,
    # and a larger build keeps the same relay of each game the smaller one kept.
    if game is None or not keep(game.copy_key, plan["salt"], plan["sample"]):
        return "", []
    eligible = [
        row
        for row in broadcasts.strong_moves(game, features=False)
        if row["ply"] >= plan["min_ply"]
        and row["clock"] is not None
        and row["clock"] >= plan["ample_clock"]
        and row["opponent_clock"] is not None
        and row["mover_elo"] is not None
        and row["opponent_elo"] is not None
    ]
    chosen = sorted(eligible, key=lambda row: unit_hash(f"{game.copy_key}:{row['ply']}", plan["salt"]))[: plan["per_game"]]
    chosen.sort(key=lambda row: row["ply"])
    for row in chosen:
        row["game_id"] = game.copy_key
        row["key"] = f"{game.copy_key}:{row['ply']}"
        row["relay_id"] = game.game_id
        row["month"] = plan["month"]
        row["champion"] = int(bool(row.pop("mover_champion")))
        row["plies"] = row.pop("game_plies")
        for name in ("mover_name", "mover_fide_id", "comment"):
            row.pop(name)
        row.update(position_features(chess.Board(row["fen"])))
    return game.copy_key, chosen


def _wanted(headers: dict[str, str]) -> bool:
    """A cheap look at the headers before a game is parsed: finished, and someone in it could be strong."""
    if headers.get("Result", "*").strip() not in broadcasts.RESULTS:
        return False
    return broadcasts.is_strong(broadcasts.player(headers, "White")) or broadcasts.is_strong(broadcasts.player(headers, "Black"))


def months_of(recipe: dict[str, Any]) -> list[str]:
    """The recipe's months, from ``first_month`` to ``last_month``, as the database lists them."""
    listed = broadcasts.local_months() or broadcasts.listed_months()
    return [month for month in listed if recipe["first_month"] <= month <= recipe["last_month"]]


def kept_games(recipe: dict[str, Any], workers: int | None, counts: dict[str, int]) -> Iterator[list[list[dict[str, Any]]]]:
    salt = recipe["split"]["salt"]
    months = months_of(recipe)
    counts["months"] = len(months)
    seen: set[str] = set()

    def jobs() -> Iterator[tuple]:
        for month in months:
            plan = {
                "min_ply": int(recipe["min_ply"]),
                "ample_clock": float(recipe["ample_clock"]),
                "per_game": int(recipe["per_game"]),
                "sample": float(recipe.get("sample", 1.0)),
                "salt": salt,
                "month": month,
            }
            with open_zst(broadcasts.month_source(month)) as text:
                for headers, movetext in game_blocks(text):
                    counts["read"] += 1
                    if _wanted(headers):
                        yield headers, movetext, plan

    def kept(pool) -> Iterator[list[dict[str, Any]]]:
        given = 0
        for copy_key, rows in pool.imap(_rows, fed(jobs()), chunksize=16):
            if not rows or copy_key in seen:
                counts["copies"] += int(bool(rows))
                continue
            seen.add(copy_key)
            given += 1
            yield rows
            if given >= int(recipe["games"]):
                return

    with worker_pool(workers) as pool:
        yield from batches(kept(pool), GAMES_A_CHUNK)
        pool.terminate()


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any]]:
    salt = recipe["split"]["salt"]
    counts = {"read": 0, "copies": 0}

    def encode(rows: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
        for row in rows:
            row["split"] = split_of(row["game_id"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"])
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

    parts = []
    games = 0
    for chunk in kept_games(recipe, workers, counts):
        games += len(chunk)
        parts.append(encode([row for game in chunk for row in game]))
        log(f"games: read {counts['read']:,}, kept {games:,}, rows {sum(len(part[0]) for part in parts):,}")
    frame = pl.concat([part[0] for part in parts], how="diagonal_relaxed")
    tokens = np.concatenate([part[1] for part in parts])
    marks = np.concatenate([part[2] for part in parts])
    manifest = {
        "builder": "master_positions",
        "source": broadcasts.LIST_URL,
        "licence": broadcasts.LICENCE,
        "recipe": {
            key: recipe[key]
            for key in ("first_month", "last_month", "min_ply", "per_game", "ample_clock", "sample", "games", "split")
            if key in recipe
        },
        "months": counts["months"],
        "strong": {"titles": list(broadcasts.STRONG_TITLES), "or_rating_at_least": broadcasts.STRONG_ELO},
        "games_read": counts["read"],
        "games_kept": games,
        "relay_copies_skipped": counts["copies"],
        "marks": list(MARKS),
        "hand": list(HAND),
        "group": "game_id",
    }
    return frame, tokens, marks, manifest
