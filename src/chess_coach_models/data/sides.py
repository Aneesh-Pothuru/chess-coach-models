"""A player's moves through a game, as a dataset whose rows are sequences.

A row is one player in one rated Lichess game: who they were (their rating,
which a model predicts, and never reads), what the game was (the time control,
its length, how it ended for them), counts over their moves for the trees
(``encode/hand.py``), and their moves in order as the row's steps
(``games.game_sides``). A step is the position before a move, with the
opponent's last move and the move itself marked, and the numbers that go with
it. Both players of a game are rows, and a game's rows share a split.

The stream is read as the positions dataset reads it (``positions.py``), from
the start of the month until enough games have given rows.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import numpy as np
import polars as pl

from ..bands import rating_band
from ..encode.board import CASTLING, encode_positions, move_squares, white_to_move
from ..encode.hand import GAME_FEATURES
from .games import game_sides
from .lichess import LICENCE, games_url
from .positions import kept_chunks
from .splits import split_of
from .store import Steps


MARKS = ("en_passant", "last_from", "last_to", "move_from", "move_to")
# The numbers of a step, in the order ``step_numbers.npy`` holds them.
STEPS = (
    "ply",
    "log_clock",
    "log_opponent_clock",
    "log_spent",
    "win_before",
    "loss",
    "legal_moves",
    "capture",
    "check",
    *CASTLING,
)
HAND = GAME_FEATURES


def _sides(job: tuple[dict[str, str], str, int, int, int]) -> list[dict[str, Any]]:
    headers, movetext, min_ply, least_moves, most_moves = job
    return game_sides(headers, movetext, min_ply=min_ply, least_moves=least_moves, most_moves=most_moves)


def move_marks(last_move: str, move: str, white: bool) -> list[tuple[int, int]]:
    """The squares the opponent's last move and the player's own move leave and reach, on the mover's board."""
    marks = []
    for first, uci in ((1, last_move), (3, move)):
        if uci:
            start, end = move_squares(uci, white)
            marks += [(first, start), (first + 1, end)]
    return marks


def boards(positions: list[dict[str, Any]], move: str) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tokens, marks and castling rights for positions that each carry a ``fen``, a ``last_move`` and a move
    under the name ``move``."""
    return encode_positions(
        [position["fen"] for position in positions],
        (move_marks(position["last_move"], position[move], white_to_move(position["fen"])) for position in positions),
    )


def step_numbers(steps: list[dict[str, Any]], castling: np.ndarray) -> np.ndarray:
    """The numbers of every step, one column a name of ``STEPS``."""
    numbers = np.empty((len(steps), len(STEPS)), dtype=np.float32)
    numbers[:, 0] = [step["ply"] for step in steps]
    numbers[:, 1] = np.log1p([step["clock"] for step in steps])
    numbers[:, 2] = np.log1p([step["opponent_clock"] for step in steps])
    numbers[:, 3] = np.log1p([step["spent"] for step in steps])
    for column, name in enumerate(("win_before", "loss", "legal_moves", "capture", "check"), start=4):
        numbers[:, column] = [step[name] for step in steps]
    numbers[:, 9:] = castling
    return numbers


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any], Steps]:
    salt = recipe["split"]["salt"]
    counts = {"read": 0}
    sizes = (int(recipe["min_ply"]), int(recipe["least_moves"]), int(recipe["most_moves"]))

    def encode(sides: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, Steps]:
        steps = [step for side in sides for step in side.pop("steps")]
        for side in sides:
            side["steps"] = side.pop("moves")
            side["split"] = split_of(side["game_id"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"])
            side["band"] = rating_band(side["player_elo"])
        tokens, marks, _ = boards(sides, "worst_move")
        step_tokens, step_marks, castling = boards(steps, "move")
        frame = pl.DataFrame(sides, infer_schema_length=None).with_columns(
            pl.col("base").cast(pl.Float64).log1p().alias("log_base"),
            pl.col("steps").cast(pl.Int32),
        )
        return frame, tokens, marks, Steps(step_tokens, step_marks, step_numbers(steps, castling))

    parts = []
    games = 0
    for chunk in kept_chunks(
        source or games_url(recipe["month"]),
        speeds=tuple(recipe["speeds"]),
        games=int(recipe["games"]),
        job=lambda headers, movetext: (headers, movetext, *sizes),
        work=_sides,
        workers=workers,
        counts=counts,
    ):
        games += len(chunk)
        parts.append(encode([side for game in chunk for side in game]))
        log(
            f"games: read {counts['read']:,}, kept {games:,}, players {sum(len(part[0]) for part in parts):,}, "
            f"moves {sum(len(part[3].tokens) for part in parts):,}"
        )
    frame = pl.concat([part[0] for part in parts], how="vertical_relaxed")
    frame = frame.with_columns((pl.col("steps").cast(pl.Int64).cum_sum() - pl.col("steps")).alias("first_step"))
    steps = Steps(
        tokens=np.concatenate([part[3].tokens for part in parts]),
        marks=np.concatenate([part[3].marks for part in parts]),
        numbers=np.concatenate([part[3].numbers for part in parts]),
    )
    manifest = {
        "builder": "game_sides",
        "source": games_url(recipe["month"]),
        "licence": LICENCE,
        "recipe": {key: recipe[key] for key in ("month", "speeds", "min_ply", "least_moves", "most_moves", "games", "split")},
        "games_read": counts["read"],
        "games_kept": games,
        "marks": list(MARKS),
        "hand": list(HAND),
        "steps": list(STEPS),
        "group": "game_id",
    }
    return (
        frame,
        np.concatenate([part[1] for part in parts]),
        np.concatenate([part[2] for part in parts]),
        manifest,
        steps,
    )
