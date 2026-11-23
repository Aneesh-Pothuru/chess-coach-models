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

A run whose config names a ``study`` changes one thing in another run to say
what that thing is worth. It is no candidate, so it is not ranked: the
leaderboard lists it under its study, beside the run it changes.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .. import bands, paths, tasks
from .metrics import LOWER_IS_BETTER, METRICS, SETS


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
    "ap": "Average precision",
    "top1": "First right",
    "top3": "In the first three",
}
# What a set's candidates are called, by the kind of task.
CANDIDATES = {"squares": "square", "tags": "tag"}


def _number(value: float) -> str:
    if value != value:
        return "n/a"
    return f"{value:.1f}" if abs(value) >= 100 else f"{value:.3f}" if abs(value) >= 1 else f"{value:.4f}"


def _span(entry: dict[str, float]) -> str:
    return f"{_number(entry['value'])} ({_number(entry['low'])} to {_number(entry['high'])})"


def learner_words(record: dict[str, Any]) -> str:
    """A run's learner in a few words, from its record's config, and the larger build it trained on where it
    did not train on the dataset's own rows."""
    more = record.get("train_dataset")
    if more is None:
        return _learner_words(record)
    return f"{_learner_words(record)}; trained on {record['train_rows']:,} rows of the larger build `{more['dataset']}`"


def _learner_words(record: dict[str, Any]) -> str:
    learner = record["config"]["learner"]
    if learner["kind"] == "constant":
        if record["task"]["kind"] in SETS:
            return f"each {CANDIDATES[record['task']['kind']]}'s share of the training rows, for every row"
        if record["task"]["kind"] == "moves":
            return "the same chance for every legal move"
        return "one number for every row"
    if learner["kind"] == "maia2":
        told = [learner["player"], learner["against"]]
        # A run reads each rating from a column of the dataset, or is told one number for every row.
        rated = (
            ""
            if all(isinstance(one, str) for one in told)
            else f", told both players are rated {told[0]}"
            if told[0] == told[1]
            else f", told the ratings `{told[0]}` and `{told[1]}`"
        )
        return f"Maia-2 as published, its {learner.get('type', 'rapid')} model{rated}: nothing is fitted here"
    if learner["kind"] == "column":
        scale = float(learner.get("scale", 1.0))
        return f"the column `{learner['column']}`" + ("" if scale == 1.0 else f", times {scale:g}")
    if learner["kind"] == "rating-formula":
        return f"the rating formula on `{learner['player']}` against `{learner['against']}`"
    without = f", without the {' and '.join(learner['without'])} group" if learner.get("without") else ""
    if learner["kind"] == "gbm":
        reads = "context and hand features" if learner["features"] == "hand" else "context numbers only"
        if record["task"]["kind"] == "squares":
            counted = " and what a person would count on the square" if learner["features"] == "hand" else ""
            return f"LightGBM on a row a square: the piece on it, {reads}{counted}{without}"
        if record["task"]["kind"] == "tags":
            return f"a LightGBM booster a tag, {reads}{without}"
        if record["task"]["kind"] == "moves":
            counted = " and what a person would count of the move" if learner["features"] == "hand" else ""
            return f"LightGBM on a row a legal move: what moves and where, {reads}{counted}{without}"
        return f"LightGBM, {reads}{without}"
    reads = ", with hand features" if learner.get("features") == "hand" else ""
    start = f", started from `{learner['init']['model']}/{learner['init']['run']}`" if learner.get("init") else ""
    body = learner["body"]
    shape = f"{body}, {learner['depth']} layers of width {learner['dim']}"
    if body == "hybrid":
        shape = f"hybrid, {learner['convs']} conv blocks then {learner['depth']} transformer layers of width {learner['dim']}"
    elif body == "transformer":
        # What a run changes in the transformer's attention: what it is told of this board, what it is not told of any.
        shape += ", attention told what each piece attacks" if learner.get("attacks") else ""
        shape += "" if learner.get("geometry", True) else ", without the offsets between squares"
    elif learner.get("squeeze"):
        shape += ", each block weighing its channels by the whole board"
    over = learner.get("over")
    if over:
        # A row that is a sequence: the body reads each of its positions, and these layers the positions in order.
        layers = "transformer layers" if "depth" not in over else f"{over['depth']} transformer layer{'' if int(over['depth']) == 1 else 's'}"
        shape += f" for each position, then {layers} over the positions in order"
    return f"{shape}{reads}{without}{start}"


# What a config holds that is no setting of the run: which run it changes, why, and where it can train.
NOT_SETTINGS = ("base", "study", "needs")


def _setting(value: Any) -> str:
    if isinstance(value, dict):
        return "/".join(str(item) for item in value.values())
    return ", ".join(str(item) for item in value) if isinstance(value, list) else str(value)


def changes(config: dict[str, Any], base: dict[str, Any]) -> list[str]:
    """What a run's config changes in its base's, a setting at a time, with the base's value where it has one."""
    found = []
    for block in sorted(set(config) | set(base)):
        if block in NOT_SETTINGS:
            continue
        ours, theirs = config.get(block), base.get(block)
        if not isinstance(ours, dict) and not isinstance(theirs, dict):
            ours, theirs, prefix = {block: ours}, {block: theirs}, ""
        else:
            ours, theirs, prefix = ours or {}, theirs or {}, f"{block}."
        for key in sorted(set(ours) | set(theirs)):
            new, old = ours.get(key), theirs.get(key)
            if new == old:
                continue
            said = "not set" if new is None else _setting(new)
            found.append(f"`{prefix}{key}` {said}" + ("" if old is None else f" (the base has {_setting(old)})"))
    return found


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
    by_name = {run["run"]: run for run in runs}
    reference = by_name.get(task.reference)
    entries, studied = [], {}
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
        entry = {
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
        study = run["config"].get("study")
        if study is None:
            entries.append(entry)
            continue
        base = by_name.get(run["config"].get("base"))
        studied.setdefault(study, []).append(
            {
                **entry,
                "base": run["config"].get("base"),
                "base_test": None if base is None else base["test"][task.primary],
                "changes": None if base is None else changes(run["config"], base["config"]),
                "train_rows": run.get("train_rows"),
            }
        )
    if not entries:
        raise FileNotFoundError(f"{model} has records of study runs only: train a run of its own first")
    main = [run for run in runs if run["config"].get("study") is None]
    board = {
        "model": model,
        "task": main[0]["task"],
        "dataset": main[0]["dataset"],
        "test_rows": main[0]["test_rows"],
        "test_groups": main[0]["test_groups"],
        "reference": task.reference,
        "runs": entries,
    }
    best = main[0]
    if "test_calibration" in best:
        board["calibration"] = {"run": best["run"], "bins": best["test_calibration"]}
    if "test_by_candidate" in best:
        board["candidates"] = {"run": best["run"], "each": best["test_by_candidate"]}
    if studied:
        board["studies"] = {study: studied[study] for study in sorted(studied)}
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
        *(
            [
                "- **A learner may read**, of what the dataset has: the marks on squares "
                + ", ".join(f"`{name}`" for name in task.get("marks", []))
                + "; the hand features "
                + ", ".join(f"`{name}`" for name in task.get("hand", []))
                + ". The task hides the rest."
            ]
            if "marks" in task and "hand" in task
            else []
        ),
        f"- **Data:** `{data['dataset']}`, {data['rows']:,} rows ({splits}) from {data['source']} "
        f"({data['licence']}), built {data['built']} at lab commit `{_commit(data['code'])}`.",
        f"- **Test set:** {board['test_rows']:,} rows from {board['test_groups']:,} games, never seen in training "
        "or in choosing an epoch.",
        f"- **Ranked by:** {NAMES[primary]} ({direction} is better), with its 95% interval over resampled games.",
        *(
            [
                f"- **A row's answer is a set:** which of {len(task['candidates'])} {CANDIDATES[task['kind']]}s are right, "
                f"and a run gives each a chance. Average precision is the mean, over a row's right "
                f"{CANDIDATES[task['kind']]}s, of the share of right ones among those ranked at least as high; first "
                f"right is how often the one given the highest chance is right. Both are means over the rows that "
                f"have a right {CANDIDATES[task['kind']]}. Log loss reads every chance as a yes or no of its own."
            ]
            if task["kind"] in SETS
            else []
        ),
        *(
            [
                "- **A row's answer is a move:** which of the position's legal moves was played, and a run gives "
                "each a chance that add up to one. First right is how often the move given the highest chance is "
                "the one played, in the first three how often it is among the three highest, and log loss is the "
                "mean of minus the log of the chance given to the move played. A promotion to any piece is one "
                "move."
            ]
            if task["kind"] == "moves"
            else []
        ),
        f"- **Gain:** how much better than `{board['reference']}` on the same resampled test games, measured "
        "when the run was trained; **bold** when the interval leaves zero out.",
        "",
        f"| Run | Learner | {NAMES[primary]} | "
        + " | ".join(NAMES[name] for name in others)
        + f" | Gain over `{board['reference']}` | Parameters | Trained on | Time |",
        "|---|---|---|" + "---|" * len(others) + "---|---|---|---|",
    ]
    for run in board["runs"]:
        device = run["device"] if run["device"] != "cpu" else run["processor"]
        parameters = f"{run['parameters']:,}" if run["parameters"] else ""
        lines.append(
            f"| `{run['run']}` | {run['learner']} | {_span(run['test'][primary])} | "
            + " | ".join(_number(run["test"][name]["value"]) for name in others)
            + f" | {_gain(run, board['reference'])} | {parameters} | {device} | {_duration(run['seconds'])} |"
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
            (
                f"Every {CANDIDATES[task['kind']]} of every test row, in ten equal groups by its predicted chance: "
                "what the model said against how often it was right."
                if task["kind"] in SETS
                else "Every legal move of every test row, in ten equal groups by its predicted chance: what the model "
                "said against how often the move was the one played."
                if task["kind"] == "moves"
                else "Test rows in ten equal groups by predicted chance: what the model said against what happened."
            ),
            "",
            "| Predicted | Happened | Rows |",
            "|---|---|---|",
        ]
        for row in board["calibration"]["bins"]:
            lines.append(f"| {row['predicted']:.1%} | {row['observed']:.1%} | {row['n']:,} |")
    if "candidates" in board:
        kind = CANDIDATES[task["kind"]]
        lines += [
            "",
            f"## Each {kind} by itself, for `{board['candidates']['run']}`",
            "",
            f"A {kind} as one yes or no over the test rows: how many rows carry it, and how well its chance tells "
            "those rows from the rest. The most common first.",
            "",
            f"| {kind.capitalize()} | Rows | Share | PR-AUC | ROC-AUC |",
            "|---|---|---|---|---|",
        ]
        each = board["candidates"]["each"]
        for name in sorted(each, key=lambda name: (-each[name]["rows"], name)):
            row = each[name]
            lines.append(
                f"| `{name}` | {row['rows']:,} | {row['share']:.1%} | {_number(row['pr_auc'])} | {_number(row['roc_auc'])} |"
            )
    if "studies" in board:
        lines += [
            "",
            "## Studies",
            "",
            "A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so "
            "it is not ranked with the runs above. Its paired difference from the run it changes, on the same "
            "resampled test games, is in the closer look (`analysis.json`, under `pairs`).",
        ]
        for study, runs in board["studies"].items():
            lines += [
                "",
                f"### `{study}`",
                "",
                f"| Run | The run it changes | What it changes | Trained on | {NAMES[primary]} | "
                f"That run's {NAMES[primary]} | Gain over `{board['reference']}` | Time |",
                "|---|---|---|---|---|---|---|---|",
            ]
            for run in runs:
                changed = "its base has no record here" if run["changes"] is None else "; ".join(run["changes"])
                rows = f"{run['train_rows']:,} rows" if run["train_rows"] else ""
                base = "" if run["base_test"] is None else _number(run["base_test"]["value"])
                lines.append(
                    f"| `{run['run']}` | `{run['base']}` | {changed} | {rows} | {_span(run['test'][primary])} | "
                    f"{base} | {_gain(run, board['reference'])} | {_duration(run['seconds'])} |"
                )
    return "\n".join(lines) + "\n"


def _gain(run: dict[str, Any], reference: str) -> str:
    """A run's gain over the reference as a leaderboard shows it: bold when its interval leaves zero out."""
    gain = run["gain"]
    if run["run"] == reference:
        return "reference"
    if gain is None:
        return "not compared"
    text = f"{gain['gain']:+.4g} ({gain['low']:+.4g} to {gain['high']:+.4g})"
    return f"**{text}**" if gain["beyond_noise"] else text


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
