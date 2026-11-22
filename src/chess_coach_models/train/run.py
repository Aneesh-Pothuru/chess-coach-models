"""One run: a learner trained on a task's dataset, scored, and written down.

A run is ``models/<model>/configs/<run>.yaml``. Its record goes to
``models/<model>/results/<run>.json`` and is committed; its predictions and
its weights go under ``artifacts/runs/``, which git ignores. A smoke run
(``--smoke``) uses the small dataset and writes only under ``artifacts/smoke/``,
so a check that the code runs never lands among the results.

A record is complete in itself. It names the build of the data it read by its
fingerprint, and it carries the run's gain over the model's reference run,
measured on the same resampled test games against the reference trained on the
same machine. A leaderboard is then written from the records alone, on any
machine, from runs made on several.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any

import polars as pl
import yaml

from .. import paths, tasks
from ..data import recipe
from ..data.store import code_commit, read_dataset
from ..evals.bootstrap import intervals, paired
from ..evals.calibration import apply_platt, platt
from ..evals.metrics import METRICS, calibration_table, score
from . import learners
from .record import machine, saved_weights, software


def run_config(model: str, run: str, *, smoke: bool = False) -> dict[str, Any]:
    """A run's config; a smoke run takes its ``smoke`` overrides, block by block."""
    with (paths.configs(model) / f"{run}.yaml").open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle)
    overrides = config.pop("smoke", {})
    if smoke:
        for block, values in overrides.items():
            config.setdefault(block, {}).update(values)
    return config


def run_names(model: str) -> list[str]:
    return sorted(path.stem for path in paths.configs(model).glob("*.yaml"))


def gain_over_reference(
    model: str,
    name: str,
    frame: pl.DataFrame,
    fingerprint: str,
    *,
    smoke: bool = False,
    resamples: int = 1000,
) -> dict[str, Any] | None:
    """How much better a run is than its model's reference run on the same resampled test games.

    The reference has to have been trained on this machine on the same build of the data, since the comparison
    reads both runs' predictions row by row. Without it the answer is ``None``, and the leaderboard says the run
    was not compared. ``reference_value`` is the reference's own score, so a leaderboard can tell which build of
    the reference a gain was measured against.
    """
    task = tasks.get(model)
    if name == task.reference:
        return None
    record_path = paths.results(model, smoke=smoke) / f"{task.reference}.json"
    path = paths.predictions(model, task.reference, smoke=smoke)
    if not (record_path.exists() and path.exists()):
        return None
    record = json.loads(record_path.read_text(encoding="utf-8"))
    reference = pl.read_parquet(path)
    same_rows = len(reference) == len(frame) and bool((reference["key"] == frame["key"]).all())
    if record["dataset"].get("fingerprint") != fingerprint or not same_rows:
        return None
    y, p_reference = frame["y"].to_numpy(), reference["p"].to_numpy()
    value = float(METRICS[task.kind][task.primary](y, p_reference))
    if abs(value - record["test"][task.primary]["value"]) > 1e-9 * max(1.0, abs(value)):
        return None
    gain = paired(
        task.kind, task.primary, y, frame["p"].to_numpy(), p_reference, frame["group"].to_numpy(), resamples=resamples
    )
    return {**gain, "reference": task.reference, "reference_trained": record["trained"], "reference_value": value}


def run(
    model: str,
    name: str,
    *,
    smoke: bool = False,
    device: str | None = None,
    log=print,
) -> dict[str, Any]:
    task = tasks.get(model)
    config = run_config(model, name, smoke=smoke)
    dataset = read_dataset(recipe(task.dataset, smoke=smoke)["name"])
    if "fingerprint" not in dataset.manifest:
        raise ValueError(
            f"{dataset.name} was built before datasets carried a fingerprint: "
            f"build it again with `lab data {task.dataset} --rebuild`"
        )
    prepared = learners.prepare(task, dataset)
    log(
        f"{model}/{name}: {len(prepared.train):,} train, {len(prepared.valid):,} valid, "
        f"{len(prepared.test):,} test rows of {dataset.name}"
    )
    started = time.time()
    fitted = learners.fit(prepared, config, log=log, device=device)
    valid_p, test_p = fitted.valid, fitted.test
    y_valid, y_test = prepared.y[prepared.valid], prepared.y[prepared.test]
    calibration = None
    if task.kind == "binary":
        slope, intercept = platt(valid_p, y_valid)
        valid_p, test_p = apply_platt(valid_p, slope, intercept), apply_platt(test_p, slope, intercept)
        calibration = {"platt_slope": slope, "platt_intercept": intercept, "fitted_on": "valid"}

    rows = dataset.rows
    group = dataset.manifest["group"]
    groups_test = rows[group].to_numpy()[prepared.test]
    bands_test = rows[task.band].to_numpy()[prepared.test]
    by_band = {}
    for band in sorted(set(bands_test.tolist())):
        mask = bands_test == band
        by_band[band] = {"rows": int(mask.sum()), **score(task.kind, y_test[mask], test_p[mask])}
    record = {
        "model": model,
        "run": name,
        "task": {
            "label": task.label,
            "kind": task.kind,
            "unit": task.unit,
            "primary": task.primary,
            "lower_is_better": task.lower_is_better,
            "context": list(task.context),
        },
        "dataset": {
            key: dataset.manifest[key]
            for key in ("dataset", "source", "licence", "rows", "splits", "fingerprint", "built", "code")
        },
        "config": config,
        "learner": fitted.details,
        "calibration": calibration,
        "machine": machine(),
        "software": software(),
        "code": code_commit(),
        "trained": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "seconds": round(time.time() - started, 1),
        "valid": score(task.kind, y_valid, valid_p),
        "test": intervals(
            task.kind, y_test, test_p, groups_test, resamples=100 if smoke else 1000
        ),
        "test_rows": int(len(y_test)),
        "test_groups": int(len(set(groups_test.tolist()))),
        "test_by_band": by_band,
    }
    if task.kind == "binary":
        record["test_calibration"] = calibration_table(y_test, test_p)

    predictions = paths.predictions(model, name, smoke=smoke)
    predictions.parent.mkdir(parents=True, exist_ok=True)
    frame = pl.DataFrame(
        {
            "key": rows["key"].to_numpy()[prepared.test],
            "group": groups_test,
            "band": bands_test,
            "y": y_test,
            "p": test_p,
        }
    )
    frame.write_parquet(predictions)
    fitted.save(predictions.parent)
    record["weights"] = saved_weights(predictions.parent, predictions)
    record["gain"] = gain_over_reference(
        model, name, frame, dataset.manifest["fingerprint"], smoke=smoke, resamples=100 if smoke else 1000
    )
    out = paths.results(model, smoke=smoke)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{name}.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    primary = record["test"][task.primary]
    log(
        f"{model}/{name}: test {task.primary} {primary['value']:.4f} "
        f"[{primary['low']:.4f}, {primary['high']:.4f}] in {record['seconds']:.0f}s"
    )
    if name != task.reference and record["gain"] is None:
        log(
            f"{model}/{name}: not compared with {task.reference}, which has no predictions on this machine "
            f"for this build of the data; train it first, then this run again"
        )
    return record
