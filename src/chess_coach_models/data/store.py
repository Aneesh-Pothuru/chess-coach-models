"""A built dataset on disk: its rows, its encoded boards and a manifest.

``rows.parquet`` holds one row per example with its split, ``tokens.npy`` and
``marks.npy`` the boards in the same order (``encode/board.py``), and
``manifest.json`` what the dataset was built from, so a result can name the
data it ran on.
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
# are not code.
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
class Dataset:
    name: str
    rows: pl.DataFrame
    tokens: np.ndarray
    marks: np.ndarray
    manifest: dict[str, Any]

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


def fingerprint(rows: pl.DataFrame, tokens: np.ndarray, marks: np.ndarray) -> str:
    """A hash of everything exact in a dataset: its boards and every column of whole numbers, of yes or no, or of text.

    Two builds with the same fingerprint hold the same rows with the same labels, whichever machine built them and
    when, so runs on either can share a leaderboard. Columns of fractions are left out, since the last digit of a
    logarithm can differ between processors; each is computed from columns that are in.
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
    return digest.hexdigest()


def write_dataset(
    name: str,
    rows: pl.DataFrame,
    tokens: np.ndarray,
    marks: np.ndarray,
    manifest: dict[str, Any],
) -> Path:
    if not (len(rows) == len(tokens) == len(marks)):
        raise ValueError("rows, tokens and marks must have one entry per example")
    directory = dataset_dir(name)
    directory.mkdir(parents=True, exist_ok=True)
    rows.write_parquet(directory / "rows.parquet", compression="zstd")
    np.save(directory / "tokens.npy", tokens)
    np.save(directory / "marks.npy", marks)
    counts = dict(rows.group_by("split").len().sort("split").iter_rows())
    full = {
        "dataset": name,
        **manifest,
        "rows": len(rows),
        "splits": counts,
        "fingerprint": fingerprint(rows, tokens, marks),
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
    return Dataset(
        name=name,
        rows=pl.read_parquet(directory / "rows.parquet"),
        tokens=np.load(directory / "tokens.npy"),
        marks=np.load(directory / "marks.npy"),
        manifest=json.loads((directory / "manifest.json").read_text(encoding="utf-8")),
    )
