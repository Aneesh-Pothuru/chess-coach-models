"""A model's leaderboard, written from its run records.

Every run of a model is scored on the same test rows, and each record carries
the run's gain over the model's reference run: the difference on the same
resampled games, which counts only when its interval leaves zero out
(``train/run.py`` measures it when the run is trained). So a leaderboard needs
the records and nothing else, and runs made on several machines share one, as
long as they read the same build of the data and were compared with the same
reference. ``lab eval <model>`` writes ``results/leaderboard.json`` and
``results/leaderboard.md``; ``lab report`` writes the README's table from the
leaderboards. Nothing here is typed by hand.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .. import bands, paths, tasks
from .metrics import LOWER_IS_BETTER, METRICS


START = "<!-- LEADERBOARDS_START -->"
END = "<!-- LEADERBOARDS_END -->"
REFERENCE_TOLERANCE = 0.01
# What sits among a model's results without being a run's record.
NOT_RECORDS = ("leaderboard.json", "analysis.json")
NAMES = {
    "rmse": "RMSE",
    "mae": "MAE",
    "r2": "R²",
    "spearman": "Spearman",
    "pr_auc": "PR-AUC",
    "roc_auc": "ROC-AUC",
    "brier": "Brier",
    "log_loss": "Log loss",
    "calibration_error": "Calibration error",
}


def _number(value: float) -> str:
    if value != value:
        return "n/a"
    return f"{value:.1f}" if abs(value) >= 100 else f"{value:.3f}" if abs(value) >= 1 else f"{value:.4f}"


def _span(entry: dict[str, float]) -> str:
    return f"{_number(entry['value'])} ({_number(entry['low'])} to {_number(entry['high'])})"


def learner_words(record: dict[str, Any]) -> str:
    """A run's learner in a few words, from its record's config."""
    learner = record["config"]["learner"]
    if learner["kind"] == "constant":
        return "one number for every row"
    if learner["kind"] == "column":
        scale = float(learner.get("scale", 1.0))
        return f"the column `{learner['column']}`" + ("" if scale == 1.0 else f", times {scale:g}")
    if learner["kind"] == "rating-formula":
        return f"the rating formula on `{learner['player']}` against `{learner['against']}`"
    if learner["kind"] == "gbm":
        reads = "context and hand features" if learner["features"] == "hand" else "context numbers only"
        return f"LightGBM, {reads}"
    reads = ", with hand features" if learner.get("features") == "hand" else ""
    return f"{learner['body']}, {learner['depth']} layers of width {learner['dim']}{reads}"


def _commit(code: str) -> str:
    """A commit as its first seven characters, still marked when the tree had changes."""
    return code[:7] + ("+changes" if code.endswith("+changes") else "")


def _duration(seconds: float) -> str:
    return f"{seconds / 60:.0f} min" if seconds >= 90 else f"{seconds:.0f} s"


def records(model: str, *, smoke: bool = False) -> list[dict[str, Any]]:
    """Every run record of a model, by run name."""
    directory = paths.results(model, smoke=smoke)
    return [
        json.loads(path.read_text(encoding="utf-8"))
        for path in sorted(directory.glob("*.json"))
        if path.name not in NOT_RECORDS
    ]


def ranked(task: tasks.Task, runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Records with the best first on the task's primary metric."""
    sign = 1.0 if task.lower_is_better else -1.0
    return sorted(runs, key=lambda run: sign * run["test"][task.primary]["value"])


def build(model: str, *, smoke: bool = False) -> dict[str, Any]:
    task = tasks.get(model)
    runs = records(model, smoke=smoke)
    if not runs:
        raise FileNotFoundError(f"{model} has no run records yet: train a run first")
    builds = {run["dataset"].get("fingerprint", "built " + run["dataset"]["built"]) for run in runs}
    if len(builds) > 1:
        stale = sorted(f"{run['run']} ({run['dataset']['built']})" for run in runs)
        raise ValueError(
            f"{model}'s runs read different builds of the data: {', '.join(stale)}. "
            "Train the stale ones again so every row of the leaderboard reads the same test rows"
        )
    runs = ranked(task, runs)
    reference = next((run for run in runs if run["run"] == task.reference), None)
    entries = []
    for run in runs:
        gain = run.get("gain")
        if gain is not None and reference is not None:
            recorded = reference["test"][task.primary]["value"]
            if abs(gain["reference_value"] - recorded) > REFERENCE_TOLERANCE * abs(recorded):
                raise ValueError(
                    f"{model}/{run['run']} was compared with a {task.reference} that scored "
                    f"{gain['reference_value']:.6g}, and the one recorded here scores {recorded:.6g}: "
                    f"train {task.reference} and then {run['run']} again on one machine"
                )
        entries.append(
            {
                "run": run["run"],
                "learner": learner_words(run),
                "test": run["test"],
                "test_by_band": run["test_by_band"],
                "parameters": run["learner"].get("parameters"),
                "device": run["learner"].get("device", "cpu"),
                "processor": run["machine"]["processor"],
                "seconds": run["seconds"],
                "code": run["code"],
                "trained": run["trained"],
                "gain": gain,
            }
        )
    board = {
        "model": model,
        "task": runs[0]["task"],
        "dataset": runs[0]["dataset"],
        "test_rows": runs[0]["test_rows"],
        "test_groups": runs[0]["test_groups"],
        "reference": task.reference,
        "runs": entries,
    }
    best = runs[0]
    if "test_calibration" in best:
        board["calibration"] = {"run": best["run"], "bins": best["test_calibration"]}
    directory = paths.results(model, smoke=smoke)
    (directory / "leaderboard.json").write_text(json.dumps(board, indent=2) + "\n", encoding="utf-8")
    (directory / "leaderboard.md").write_text(markdown(board), encoding="utf-8")
    return board


def markdown(board: dict[str, Any]) -> str:
    task, data = board["task"], board["dataset"]
    primary = task["primary"]
    others = [name for name in METRICS[task["kind"]] if name != primary]
    direction = "lower" if primary in LOWER_IS_BETTER else "higher"
    splits = ", ".join(f"{name} {count:,}" for name, count in sorted(data["splits"].items()))
    lines = [
        f"# {board['model']}: leaderboard",
        "",
        f"Written by `lab eval {board['model']}` from the run records in this folder.",
        "",
        f"- **Predicts:** {task['unit']}.",
        f"- **Data:** `{data['dataset']}`, {data['rows']:,} rows ({splits}) from {data['source']} "
        f"({data['licence']}), built {data['built']} at lab commit `{_commit(data['code'])}`.",
        f"- **Test set:** {board['test_rows']:,} rows from {board['test_groups']:,} games, never seen in training "
        "or in choosing an epoch.",
        f"- **Ranked by:** {NAMES[primary]} ({direction} is better), with its 95% interval over resampled games.",
        f"- **Gain:** how much better than `{board['reference']}` on the same resampled test games, measured "
        "when the run was trained; **bold** when the interval leaves zero out.",
        "",
        f"| Run | Learner | {NAMES[primary]} | "
        + " | ".join(NAMES[name] for name in others)
        + f" | Gain over `{board['reference']}` | Parameters | Trained on | Time |",
        "|---|---|---|" + "---|" * len(others) + "---|---|---|---|",
    ]
    for run in board["runs"]:
        gain = run["gain"]
        if run["run"] == board["reference"]:
            shown = "reference"
        elif gain is None:
            shown = "not compared"
        else:
            text = f"{gain['gain']:+.4g} ({gain['low']:+.4g} to {gain['high']:+.4g})"
            shown = f"**{text}**" if gain["beyond_noise"] else text
        device = run["device"] if run["device"] != "cpu" else run["processor"]
        parameters = f"{run['parameters']:,}" if run["parameters"] else ""
        lines.append(
            f"| `{run['run']}` | {run['learner']} | {_span(run['test'][primary])} | "
            + " | ".join(_number(run["test"][name]["value"]) for name in others)
            + f" | {shown} | {parameters} | {device} | {_duration(run['seconds'])} |"
        )
    names = sorted({band for run in board["runs"] for band in run["test_by_band"]}, key=bands.order)
    lines += [
        "",
        f"## {NAMES[primary]} by band",
        "",
        "| Run | " + " | ".join(names) + " |",
        "|---|" + "---|" * len(names),
    ]
    for run in board["runs"]:
        cells = [
            _number(run["test_by_band"][band][primary]) if band in run["test_by_band"] else "n/a"
            for band in names
        ]
        lines.append(f"| `{run['run']}` | " + " | ".join(cells) + " |")
    first = board["runs"][0]["test_by_band"]
    lines.append("| rows | " + " | ".join(f"{first[band]['rows']:,}" if band in first else "0" for band in names) + " |")
    if "calibration" in board:
        lines += [
            "",
            f"## Calibration of `{board['calibration']['run']}`",
            "",
            "Test rows in ten equal groups by predicted chance: what the model said against what happened.",
            "",
            "| Predicted | Happened | Rows |",
            "|---|---|---|",
        ]
        for row in board["calibration"]["bins"]:
            lines.append(f"| {row['predicted']:.1%} | {row['observed']:.1%} | {row['n']:,} |")
    return "\n".join(lines) + "\n"


def readme_table() -> str:
    """One row a model with results: its best run beside its reference."""
    lines = [
        "| Model | Predicts | Best run | Score | Reference | Its score | Gain | Test rows |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for model in tasks.names():
        path = paths.results(model) / "leaderboard.json"
        if not path.exists():
            continue
        board = json.loads(path.read_text(encoding="utf-8"))
        primary = board["task"]["primary"]
        best = board["runs"][0]
        reference = next((run for run in board["runs"] if run["run"] == board["reference"]), None)
        gain = best["gain"]
        if best["run"] == board["reference"]:
            shown = "the reference is the best run"
        elif gain is None:
            shown = "not compared"
        else:
            shown = f"{gain['gain']:+.4g}" + ("" if gain["beyond_noise"] else " (within noise)")
        its_score = _number(reference["test"][primary]["value"]) if reference else "not run"
        lines.append(
            f"| [`{model}`](models/{model}/) | {board['task']['unit']} | `{best['run']}` | "
            f"{NAMES[primary]} {_span(best['test'][primary])} | `{board['reference']}` | "
            f"{its_score} | {shown} | {board['test_rows']:,} |"
        )
    if len(lines) == 2:
        return "No full run has been recorded yet."
    return "\n".join(lines)


def write_readme(path: Path | None = None) -> None:
    path = path or paths.ROOT / "README.md"
    text = path.read_text(encoding="utf-8")
    if START not in text or END not in text:
        raise ValueError(f"{path} has no {START} ... {END} block to write the leaderboards into")
    head, rest = text.split(START, 1)
    _, tail = rest.split(END, 1)
    path.write_text(f"{head}{START}\n{readme_table()}\n{END}{tail}", encoding="utf-8")
