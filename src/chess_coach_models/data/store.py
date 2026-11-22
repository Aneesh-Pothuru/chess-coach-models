"""A built dataset on disk: its rows, its encoded boards and a manifest.

``rows.parquet`` holds one row per example with its split, ``tokens.npy`` and
``marks.npy`` the boards in the same order (``encode/board.py``), and
``manifest.json`` what the dataset was built from, so a result can name the
data it ran on.

A dataset whose rows are sequences (a player's moves through a game) also
holds its ``steps``: every row's positions one after another, as
``step_tokens.npy``, ``step_marks.npy`` and ``step_numbers.npy``. A row says
where its own start (``first_step``) and how many they are (``steps``).
"""

from __future__ import annotations

import hashlib
import json
import subprocess
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from multiprocessing import get_context
from multiprocessing.pool import Pool
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from .. import paths


CHUNK = 50_000
# What a result is made from: the harness, the dataset recipes, each model's task and its run configs.
# A session writes results, papers and the README's tables over tracked files as it goes, and those
# are not code. Nor is a model's analysis.yaml: it changes how results are cut, and no run.
CODE = ("src", "datasets", ":(glob)models/*/task.yaml", ":(glob)models/*/configs/**")


def batches(items: Iterable[Any], size: int) -> Iterator[list[Any]]:
    """Lists of up to ``size`` items, so a build never holds a whole dataset as Python objects."""
    batch: list[Any] = []
    for item in items:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def worker_pool(workers: int | None) -> Pool:
    """A pool of fresh processes: a build's parent may already hold threads, which a forked child must not inherit."""
    return get_context("spawn").Pool(workers)


def fed(items: Iterable[Any]) -> Iterator[Any]:
    """The items a pool's ``imap`` is given, so that whatever stops them stops the build.

    The thread that feeds a pool hands an ``Exception`` on to the build and dies on anything else, and the
    build then waits for results that never come. A Rust panic in Polars is such a thing: it is raised as a
    ``BaseException``. Here it becomes an error the pool passes on.
    """
    try:
        yield from items
    except (Exception, GeneratorExit):
        raise
    except BaseException as error:
        raise RuntimeError(f"the rows for the pool stopped on {type(error).__name__}: {error}") from error


@dataclass
class Steps:
    """The positions of a dataset whose rows are sequences, every row's one after another: each position's
    board, its marks and the numbers that go with it (named by the manifest's ``steps``)."""

    tokens: np.ndarray
    marks: np.ndarray
    numbers: np.ndarray


@dataclass
class Dataset:
    name: str
    rows: pl.DataFrame
    tokens: np.ndarray
    marks: np.ndarray
    manifest: dict[str, Any]
    steps: Steps | None = None

    def split(self, name: str) -> np.ndarray:
        """The row numbers of one split."""
        return np.flatnonzero((self.rows["split"] == name).to_numpy())


def code_commit() -> str:
    """The lab commit a build or a run was made from, marked when its code, a recipe or a config had changes."""
    try:
        commit = subprocess.run(
            ["git", "-C", str(paths.ROOT), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "-C", str(paths.ROOT), "status", "--porcelain", "--", *CODE],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return f"{commit}+changes" if dirty else commit


def dataset_dir(name: str) -> Path:
    return paths.processed() / name


def fingerprint(rows: pl.DataFrame, tokens: np.ndarray, marks: np.ndarray, steps: Steps | None = None) -> str:
    """A hash of everything exact in a dataset: its boards and every column of whole numbers, of yes or no, or of text.

    Two builds with the same fingerprint hold the same rows with the same labels, whichever machine built them and
    when, so runs on either can share a leaderboard. Columns of fractions are left out, since the last digit of a
    logarithm can differ between processors; each is computed from columns that are in. Of a dataset's steps
    the boards and marks are in, and their numbers are fractions.
    """
    digest = hashlib.sha256()
    digest.update(np.ascontiguousarray(tokens).tobytes())
    digest.update(np.ascontiguousarray(marks).tobytes())
    for name in rows.columns:
        column = rows[name]
        if column.dtype == pl.String:
            digest.update(name.encode("utf-8"))
            digest.update("\n".join(column.fill_null("").to_list()).encode("utf-8"))
        elif column.dtype == pl.Boolean or column.dtype.is_integer():
            digest.update(name.encode("utf-8"))
            digest.update(column.cast(pl.Int64).fill_null(-1).to_numpy().tobytes())
    if steps is not None:
        digest.update(np.ascontiguousarray(steps.tokens).tobytes())
        digest.update(np.ascontiguousarray(steps.marks).tobytes())
    return digest.hexdigest()


def check_steps(rows: pl.DataFrame, steps: Steps, manifest: dict[str, Any]) -> None:
    """Holds a dataset's steps to its rows: every row's positions one after another, and none left over."""
    if not (len(steps.tokens) == len(steps.marks) == len(steps.numbers)):
        raise ValueError("a dataset's steps have one board, one set of marks and one row of numbers a position")
    if steps.numbers.shape[1] != len(manifest.get("steps", [])):
        raise ValueError("a dataset's manifest names every number of a step, in order, as `steps`")
    counts = rows["steps"].to_numpy().astype(np.int64)
    first = rows["first_step"].to_numpy().astype(np.int64)
    if (counts < 1).any() or not np.array_equal(first, np.cumsum(counts) - counts) or int(counts.sum()) != len(steps.tokens):
        raise ValueError("each row's steps must follow the row before it, and every step belong to a row")


def write_dataset(
    name: str,
    rows: pl.DataFrame,
    tokens: np.ndarray,
    marks: np.ndarray,
    manifest: dict[str, Any],
    steps: Steps | None = None,
) -> Path:
    if not (len(rows) == len(tokens) == len(marks)):
        raise ValueError("rows, tokens and marks must have one entry per example")
    if steps is not None:
        check_steps(rows, steps, manifest)
    directory = dataset_dir(name)
    directory.mkdir(parents=True, exist_ok=True)
    rows.write_parquet(directory / "rows.parquet", compression="zstd")
    np.save(directory / "tokens.npy", tokens)
    np.save(directory / "marks.npy", marks)
    if steps is not None:
        np.save(directory / "step_tokens.npy", steps.tokens)
        np.save(directory / "step_marks.npy", steps.marks)
        np.save(directory / "step_numbers.npy", steps.numbers)
    counts = dict(rows.group_by("split").len().sort("split").iter_rows())
    full = {
        "dataset": name,
        **manifest,
        "rows": len(rows),
        **({} if steps is None else {"positions": len(steps.tokens)}),
        "splits": counts,
        "fingerprint": fingerprint(rows, tokens, marks, steps),
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "code": code_commit(),
    }
    (directory / "manifest.json").write_text(json.dumps(full, indent=2) + "\n", encoding="utf-8")
    return directory


def read_dataset(name: str) -> Dataset:
    directory = dataset_dir(name)
    if not (directory / "manifest.json").exists():
        raise FileNotFoundError(
            f"{directory} holds no dataset: build it first with `lab data <dataset>`"
        )
    steps = None
    if (directory / "step_tokens.npy").exists():
        steps = Steps(
            tokens=np.load(directory / "step_tokens.npy"),
            marks=np.load(directory / "step_marks.npy"),
            numbers=np.load(directory / "step_numbers.npy"),
        )
    return Dataset(
        name=name,
        rows=pl.read_parquet(directory / "rows.parquet"),
        tokens=np.load(directory / "tokens.npy"),
        marks=np.load(directory / "marks.npy"),
        manifest=json.loads((directory / "manifest.json").read_text(encoding="utf-8")),
        steps=steps,
    )
