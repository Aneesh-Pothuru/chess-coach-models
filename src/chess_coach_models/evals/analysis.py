"""A closer look at a model's results, for its paper.

A leaderboard says which run is best. A paper also has to say where a model is
right and wrong, how sure it is, and what its data looks like. Those answers
need the dataset and every run's test predictions, which live only on the
machine that built and trained them. ``lab analyse <model>`` reads them there
and writes ``results/analysis.json``: small tables, committed, from which the
paper's figures are drawn on any machine.

What it looks at is the task's ``analysis`` block (``models/<model>/task.yaml``):

    analysis:
      label: {low: 400, high: 3200, bins: 28}       a quantity's histogram
      within: {"100": 100, "200": 200}              shares of test rows predicted this close, by name
      slices:                                       the results by a column
        - {key: moves, column: solver_moves, title: Moves the solver plays, values: [1, 2, 3], rest: 4+}
        - {key: mate, column: ends_in_mate, title: Ends in mate, values: [0, 1], labels: [no, yes]}
        - {key: clock, column: clock, title: Seconds on the clock, edges: [30, 60, 180, 600]}
        - {key: themes, column: themes, title: Theme, tags: 16}
      grids:                                        the label by two columns at once
        - {key: ratings, rows: {column: mover_elo, edges: [...]}, columns: {column: rating, edges: [...]}}
      examples: {count: 3, id: puzzle_id, moves: [setup, line], show: [rating, themes]}

Every number is rounded to six significant digits, so two machines write the
same file.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import numpy as np
import polars as pl

from .. import paths, tasks
from ..data import recipe
from ..data.store import Dataset, code_commit, read_dataset
from .leaderboard import ranked, records
from .metrics import METRICS


SHARES = (0.01, 0.02, 0.05, 0.10, 0.20, 0.50)
QUANTILES = (1, 5, 25, 50, 75, 95, 99)
Group = tuple[str, np.ndarray]


def _edge(value: float) -> str:
    return f"{value:g}"


def groups(rows: pl.DataFrame, spec: dict[str, Any]) -> list[Group]:
    """The named groups of rows a slice asks for, each as a mask over every row.

    ``values`` gives one group a value (named by ``labels`` when a value says little, as 0 and 1 do), and
    ``rest`` names everything else; ``edges`` cuts a number into ``<a``, ``a-b`` and so on up to ``z+``;
    ``tags`` takes the most common words of a column of space-separated tags, and a row can then be in
    several groups.
    """
    column = rows[spec["column"]]
    if "values" in spec:
        data = column.to_numpy()
        names = spec.get("labels", [str(value) for value in spec["values"]])
        found = [(str(name), data == value) for name, value in zip(names, spec["values"], strict=True)]
        if "rest" in spec:
            taken = np.zeros(len(data), dtype=bool)
            for _, mask in found:
                taken |= mask
            found.append((str(spec["rest"]), ~taken))
        return found
    if "edges" in spec:
        data = column.to_numpy().astype(np.float64)
        edges = [float(edge) for edge in spec["edges"]]
        found = [(f"<{_edge(edges[0])}", data < edges[0])]
        for low, high in zip(edges, edges[1:]):
            found.append((f"{_edge(low)}-{_edge(high)}", (data >= low) & (data < high)))
        found.append((f"{_edge(edges[-1])}+", data >= edges[-1]))
        return found
    if "tags" in spec:
        words = [set(text.split()) for text in column.fill_null("").to_list()]
        counts = Counter(word for row in words for word in row)
        common = [word for word, _ in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[: int(spec["tags"])]]
        return [(word, np.fromiter((word in row for row in words), dtype=bool, count=len(words))) for word in common]
    raise ValueError(f"a slice names `values`, `edges` or `tags`: {spec}")


def _metric(kind: str, name: str, y: np.ndarray, p: np.ndarray) -> float | None:
    if len(y) < 2:
        return None
    value = METRICS[kind][name](y, p)
    return None if math.isnan(value) else float(value)


def _run_stats(task: tasks.Task, y: np.ndarray, p: np.ndarray) -> dict[str, float | None]:
    if not len(y):
        return {"mean": None, "bias": None, task.primary: None}
    return {
        "mean": float(p.mean()),
        "bias": float((p - y).mean()),
        task.primary: _metric(task.kind, task.primary, y, p),
    }


def _mean(values: np.ndarray) -> float | None:
    return float(values.mean()) if len(values) else None


def slice_table(
    task: tasks.Task,
    spec: dict[str, Any],
    dataset: Dataset,
    y: np.ndarray,
    test: np.ndarray,
    predictions: dict[str, np.ndarray],
) -> dict[str, Any]:
    """One slice: for each group how many rows it has, what happened there, and what each run said and scored."""
    table = []
    for label, mask in groups(dataset.rows, spec):
        inside = mask[test]
        table.append(
            {
                "group": label,
                "rows_all": int(mask.sum()),
                "label_mean_all": _mean(y[mask]),
                "rows": int(inside.sum()),
                "label_mean": _mean(y[test][inside]),
                "runs": {run: _run_stats(task, y[test][inside], p[inside]) for run, p in predictions.items()},
            }
        )
    return {"key": spec["key"], "column": spec["column"], "title": spec.get("title", spec["column"]), "groups": table}


def grid_table(
    task: tasks.Task,
    spec: dict[str, Any],
    dataset: Dataset,
    y: np.ndarray,
    test: np.ndarray,
    predictions: dict[str, np.ndarray],
) -> dict[str, Any]:
    """The label by two columns at once: every cell's rows, what happened there and what each run said."""
    down, across = groups(dataset.rows, spec["rows"]), groups(dataset.rows, spec["columns"])
    cells = []
    for _, row_mask in down:
        line = []
        for _, column_mask in across:
            mask = row_mask & column_mask
            inside = mask[test]
            line.append(
                {
                    "rows_all": int(mask.sum()),
                    "label_mean_all": _mean(y[mask]),
                    "rows": int(inside.sum()),
                    "label_mean": _mean(y[test][inside]),
                    "runs": {run: _mean(p[inside]) for run, p in predictions.items()},
                }
            )
        cells.append(line)
    return {
        "key": spec["key"],
        "rows": {"column": spec["rows"]["column"], "title": spec["rows"].get("title", spec["rows"]["column"]), "groups": [label for label, _ in down]},
        "columns": {"column": spec["columns"]["column"], "title": spec["columns"].get("title", spec["columns"]["column"]), "groups": [label for label, _ in across]},
        "cells": cells,
    }


def label_summary(task: tasks.Task, spec: dict[str, Any], dataset: Dataset, y: np.ndarray) -> dict[str, Any]:
    """What the label looks like over every row: a chance's rate by split, or a quantity's spread and histogram."""
    splits = {name: dataset.split(name) for name in ("train", "valid", "test")}
    if task.kind == "binary":
        return {
            "kind": "binary",
            "rows": int(len(y)),
            "rate": float(y.mean()),
            "by_split": {name: {"rows": int(len(rows)), "rate": _mean(y[rows])} for name, rows in splits.items()},
        }
    low = float(spec.get("low", np.percentile(y, 0.5)))
    high = float(spec.get("high", np.percentile(y, 99.5)))
    counts, edges = np.histogram(y, bins=int(spec.get("bins", 30)), range=(low, high))
    return {
        "kind": "regression",
        "rows": int(len(y)),
        "mean": float(y.mean()),
        "sd": float(y.std()),
        "min": float(y.min()),
        "max": float(y.max()),
        "quantiles": {str(q): float(np.percentile(y, q)) for q in QUANTILES},
        "by_split": {name: {"rows": int(len(rows)), "mean": _mean(y[rows])} for name, rows in splits.items()},
        "histogram": {
            "edges": [float(edge) for edge in edges],
            "counts": [int(count) for count in counts],
            "below": int((y < low).sum()),
            "above": int((y > high).sum()),
        },
    }


def reliability(kind: str, y: np.ndarray, p: np.ndarray) -> list[dict[str, float]]:
    """Test rows in equal groups by what the run said: what it said on average against what happened.

    For a quantity each group also gives the tenth and ninetieth percentile of what happened, so a figure
    can show how wide the truth is around a prediction.
    """
    order = np.argsort(p, kind="mergesort")
    table = []
    for part in np.array_split(order, 10 if kind == "binary" else 20):
        if not len(part):
            continue
        row = {"n": int(len(part)), "predicted": float(p[part].mean()), "observed": float(y[part].mean())}
        if kind == "regression":
            row["observed_low"], row["observed_high"] = (float(value) for value in np.percentile(y[part], [10, 90]))
        table.append(row)
    return table


def ranking(y: np.ndarray, p: np.ndarray) -> list[dict[str, float]]:
    """What a chance is worth as a flag: among the rows it ranks highest, how many were hits.

    For each share of the test rows, taken from the top of the ranking: the hit rate there (``precision``),
    the share of all hits that fall there (``recall``), and the hit rate against the base rate (``lift``).
    """
    order = np.argsort(-p, kind="mergesort")
    base = float(y.mean())
    table = []
    for share in SHARES:
        top = order[: max(1, int(round(share * len(y))))]
        hits = float(y[top].sum())
        precision = hits / len(top)
        table.append(
            {
                "share": share,
                "rows": int(len(top)),
                "precision": precision,
                "recall": hits / float(y.sum()) if y.sum() else float("nan"),
                "lift": precision / base if base else float("nan"),
            }
        )
    return table


def closeness(y: np.ndarray, p: np.ndarray, within: dict[str, float]) -> dict[str, Any]:
    """How close a quantity's predictions land: the middle and the tail of the error, and the share inside each named distance."""
    error = np.abs(p - y)
    return {
        "median_error": float(np.median(error)),
        "p90_error": float(np.percentile(error, 90)),
        "within": {
            str(name): {"distance": float(distance), "share": float((error <= float(distance)).mean())}
            for name, distance in within.items()
        },
    }


def _unit(key: str) -> int:
    return int.from_bytes(hashlib.sha256(key.encode("utf-8")).digest()[:8], "big")


def examples(
    task: tasks.Task,
    spec: dict[str, Any],
    dataset: Dataset,
    y: np.ndarray,
    test: np.ndarray,
    predictions: dict[str, np.ndarray],
    best: str,
) -> dict[str, list[dict[str, Any]]]:
    """Positions a paper can show, chosen by rule from the test rows and the best run's predictions.

    ``typical`` are the first few in the order of a hash of their key: ordinary rows, picked by nothing
    about them. ``highest`` and ``lowest`` are what the run is surest of. For a chance, ``surprised-no`` is
    where it said yes loudest and it did not happen, ``surprised-yes`` the reverse; for a quantity, ``over``
    and ``under`` are its largest misses each way.
    """
    count = int(spec.get("count", 3))
    rows = dataset.rows
    keys = rows["key"].to_numpy()[test]
    truth, said = y[test], predictions[best]
    by_key = np.argsort(keys, kind="mergesort")

    def ordered(score: np.ndarray, among: np.ndarray | None = None) -> list[int]:
        """Positions among the test rows with the largest ``score`` first, ties by key."""
        pool = by_key if among is None else by_key[among[by_key]]
        return pool[np.argsort(-score[pool], kind="mergesort")][:count].tolist()

    picks: dict[str, list[int]] = {
        "typical": sorted(range(len(keys)), key=lambda index: _unit(str(keys[index])))[:count],
        "highest": ordered(said),
        "lowest": ordered(-said),
    }
    if task.kind == "binary":
        picks["surprised-no"] = ordered(said, truth < 0.5)
        picks["surprised-yes"] = ordered(-said, truth > 0.5)
    else:
        picks["over"] = ordered(said - truth)
        picks["under"] = ordered(truth - said)

    shown = [name for name in spec.get("show", []) if name in rows.columns]
    moves = [name for name in spec.get("moves", []) if name in rows.columns]

    def example(position: int) -> dict[str, Any]:
        row = rows.row(int(test[position]), named=True)
        return {
            **({"id": row[spec["id"]]} if spec.get("id") else {}),
            "fen": row["fen"],
            "moves": {name: row[name] for name in moves},
            "label": float(truth[position]),
            "predicted": {run: float(p[position]) for run, p in predictions.items()},
            "show": {name: row[name] for name in shown},
        }

    return {name: [example(position) for position in positions] for name, positions in picks.items()}


def rounded(value: Any) -> Any:
    """Every fraction at six significant digits, and a missing number as ``null``."""
    if isinstance(value, dict):
        return {key: rounded(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [rounded(item) for item in value]
    if isinstance(value, (float, np.floating)):
        number = float(value)
        return None if math.isnan(number) or math.isinf(number) else float(f"{number:.6g}")
    if isinstance(value, np.integer):
        return int(value)
    return value


def analyse(model: str, *, smoke: bool = False) -> dict[str, Any]:
    task = tasks.get(model)
    spec = task.analysis
    runs = records(model, smoke=smoke)
    if not runs:
        raise FileNotFoundError(f"{model} has no run records yet: train a run first")
    dataset = read_dataset(recipe(task.dataset, smoke=smoke)["name"])
    y = dataset.rows[task.label].to_numpy().astype(np.float64)
    test = dataset.split("test")
    keys = dataset.rows["key"].to_numpy()[test]

    predictions: dict[str, np.ndarray] = {}
    skipped: dict[str, str] = {}
    order = [run["run"] for run in ranked(task, runs)]
    for run in ranked(task, runs):
        name = run["run"]
        path = paths.predictions(model, name, smoke=smoke)
        if run["dataset"].get("fingerprint") != dataset.manifest["fingerprint"]:
            skipped[name] = "its record names another build of the data than the one on this machine"
        elif not path.exists():
            skipped[name] = "its test predictions are not on this machine"
        else:
            frame = pl.read_parquet(path)
            if len(frame) != len(keys) or not bool((frame["key"].to_numpy() == keys).all()):
                skipped[name] = "its test predictions are not of this dataset's test rows"
                continue
            p = frame["p"].to_numpy().astype(np.float64)
            scored = METRICS[task.kind][task.primary](y[test], p)
            recorded = run["test"][task.primary]["value"]
            if abs(scored - recorded) > 1e-9 * max(1.0, abs(recorded)):
                skipped[name] = "its test predictions here are not the ones its record scored"
            else:
                predictions[name] = p
    if not predictions:
        raise FileNotFoundError(
            f"no run of {model} has its test predictions on this machine for this build of the data: "
            + "; ".join(f"{name}: {reason}" for name, reason in skipped.items())
        )
    best = next(name for name in order if name in predictions)

    result: dict[str, Any] = {
        "model": model,
        "written_by": f"lab analyse {model}",
        "written": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "code": code_commit(),
        "dataset": dataset.manifest,
        "task": {"label": task.label, "kind": task.kind, "primary": task.primary, "band": task.band},
        "runs": [name for name in order if name in predictions],
        "skipped": skipped,
        "best": best,
        "reference": task.reference,
        "test_rows": int(len(test)),
        "label": label_summary(task, spec.get("label", {}), dataset, y),
        "reliability": {run: reliability(task.kind, y[test], p) for run, p in predictions.items()},
        "slices": [slice_table(task, one, dataset, y, test, predictions) for one in spec.get("slices", [])],
        "grids": [grid_table(task, one, dataset, y, test, predictions) for one in spec.get("grids", [])],
        "examples": examples(task, spec.get("examples", {}), dataset, y, test, predictions, best),
    }
    if task.kind == "binary":
        result["ranking"] = {run: ranking(y[test], p) for run, p in predictions.items()}
    else:
        result["closeness"] = {
            run: closeness(y[test], p, spec.get("within", {})) for run, p in predictions.items()
        }
    result = rounded(result)
    directory = paths.results(model, smoke=smoke)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "analysis.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    return result
