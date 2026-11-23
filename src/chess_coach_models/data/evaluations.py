"""Positions with an engine's evaluation, from the open Lichess evaluations file.

The file holds every position Lichess has an evaluation for, one a line, each
with the evaluations it was given at several depths. A row here is one
position with its deepest evaluation, read as the mover's chance of winning.
Nobody played these positions for the dataset and no label is about a person:
it is what a body is trained on before it learns about people
(``docs/design.md``, "Starting from another run").

The file is some twenty gigabytes and is read as a stream. A position is kept
by a hash of itself until the recipe's count is reached, so the sample is
spread over a stretch of the file many times its own size, and a build stops
downloading as soon as it has its rows.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterator
from typing import Any

import chess
import numpy as np
import polars as pl

from ..bands import men_band
from ..encode.board import CASTLING, encode_positions
from ..encode.hand import POSITION_FEATURES, position_features
from ..winprob import mover_win_percent
from .lichess import LICENCE, open_zst
from .splits import keep, split_of
from .store import batches, fed, worker_pool


EVALUATIONS_URL = "https://database.lichess.org/lichess_db_eval.jsonl.zst"
MARKS = ("en_passant",)
HAND = POSITION_FEATURES
LINES_A_JOB = 2_000
ROWS_A_CHUNK = 100_000
MATE_CP = 10_000
# Every line starts with its position: {"fen":"<position>","evals":[...
_HEAD = '{"fen":"'


def position_of(line: str) -> str | None:
    """A line's position, cut from its start without parsing the line: most lines are turned away on it."""
    if not line.startswith(_HEAD):
        return None
    end = line.find('"', len(_HEAD))
    return line[len(_HEAD) : end] if end > 0 else None


def position_key(position: str) -> str:
    """A short name for a position: the row's key, and the group its split is drawn by."""
    return hashlib.sha256(position.encode("utf-8")).hexdigest()[:16]


def deepest(evaluations: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The evaluation searched deepest that names a best line, the first of them when two are as deep."""
    with_line = [one for one in evaluations if one.get("pvs")]
    return max(with_line, key=lambda one: one["depth"]) if with_line else None


def example(line: str, min_depth: int) -> dict[str, Any] | None:
    """One line of the file as a row, or nothing when it has no evaluation deep enough or no legal position."""
    try:
        loaded = json.loads(line)
        position = loaded["fen"]
        best = deepest(loaded["evals"])
        if best is None or int(best["depth"]) < min_depth:
            return None
        first = best["pvs"][0]
        board = chess.Board(f"{position} 0 1")
    except (ValueError, KeyError, TypeError):
        return None
    if not board.is_valid() or not any(board.legal_moves):
        return None
    # The file's evaluations are from White's side: a positive mate is White's.
    mate = first.get("mate")
    if mate is None and "cp" not in first:
        return None
    cp_white = float(first["cp"]) if mate is None else float(MATE_CP if mate > 0 else -MATE_CP)
    men = chess.popcount(board.occupied)
    return {
        "key": position_key(position),
        "fen": board.fen(),
        "depth": int(best["depth"]),
        "cp": None if mate is not None else int(first["cp"]),
        "mate": None if mate is None else int(mate),
        "win": mover_win_percent(cp_white, board.turn),
        "men": men,
        "band": men_band(men),
        **position_features(board),
    }


def _rows(job: tuple[list[str], int, int]) -> tuple[list[dict[str, Any]], int]:
    """A job's lines as rows, with the number of lines the stream had given when the job was made."""
    lines, min_depth, read = job
    return [row for row in (example(line, min_depth) for line in lines) if row is not None], read


def build(
    recipe: dict[str, Any],
    *,
    source: str | None = None,
    workers: int | None = None,
    log: Callable[[str], None] = print,
) -> tuple[pl.DataFrame, np.ndarray, np.ndarray, dict[str, Any]]:
    salt = recipe["split"]["salt"]
    wanted, min_depth, sample = int(recipe["positions"]), int(recipe["min_depth"]), float(recipe["sample"])
    # The pool reads the stream ahead of the rows it has given back. Each job carries the number of lines read
    # when it was made, so a build reports the count up to the last job it took, the same on every machine.
    counts = {"read": 0}

    def jobs(text) -> Iterator[tuple[list[str], int, int]]:
        lines: list[str] = []
        read = 0
        for line in text:
            read += 1
            position = position_of(line)
            if position is None or not keep(position, salt, sample):
                continue
            lines.append(line)
            if len(lines) == LINES_A_JOB:
                yield lines, min_depth, read
                lines = []
        if lines:
            yield lines, min_depth, read

    def kept(pool, text) -> Iterator[dict[str, Any]]:
        rows = 0
        for found, read in pool.imap(_rows, fed(jobs(text)), chunksize=1):
            counts["read"] = read
            for row in found:
                yield row
                rows += 1
                if rows >= wanted:
                    return

    def encode(rows: list[dict[str, Any]]) -> tuple[pl.DataFrame, np.ndarray, np.ndarray]:
        for row in rows:
            row["split"] = split_of(row["key"], salt, valid=recipe["split"]["valid"], test=recipe["split"]["test"])
        tokens, marks, castling = encode_positions([row["fen"] for row in rows], ([] for _ in rows))
        frame = pl.DataFrame(
            rows, schema_overrides={"cp": pl.Int64, "mate": pl.Int64}, infer_schema_length=None
        ).with_columns([pl.Series(name, castling[:, index]) for index, name in enumerate(CASTLING)])
        return frame, tokens, marks

    parts = []
    with open_zst(source or recipe["source"]) as text, worker_pool(workers) as pool:
        for chunk in batches(kept(pool, text), ROWS_A_CHUNK):
            parts.append(encode(chunk))
            log(f"evaluations: read {counts['read']:,} lines, rows {sum(len(part[0]) for part in parts):,}")
        pool.terminate()
    frame = pl.concat([part[0] for part in parts], how="vertical_relaxed")
    manifest = {
        "builder": "evaluations",
        "source": recipe["source"],
        "licence": LICENCE,
        "recipe": {key: recipe[key] for key in ("min_depth", "sample", "positions", "split")},
        "lines_read": counts["read"],
        "marks": list(MARKS),
        "hand": list(HAND),
        "group": "key",
    }
    return frame, np.concatenate([part[1] for part in parts]), np.concatenate([part[2] for part in parts]), manifest
