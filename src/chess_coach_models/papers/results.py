"""What a paper says from the run records alone: its numbers, its tables and its figures of the runs.

Every value has a key the prose reads with ``\\V{key}``. A run's values sit
under ``run.<name>``, and the same values under the part the run plays, so
prose can speak of the best run or the reference without naming one:
``best``, ``reference``, ``floor``, ``network`` (the best network), ``board``
(the best network that reads no hand feature) and ``challenger`` (the best run
that is not the reference). ``<part>.score`` is the metric the model's runs
are ranked by.

One scale holds for every model, whatever its metric: the reference's step,
how much better the reference is than the floor. ``<part>.lift.share`` is the
share of that step a run makes, 0 for the floor and 100 for the reference,
and ``<part>.gain.of-lift`` its gain over the reference as a share of it.
"""

from __future__ import annotations

import math
from typing import Any

from .. import bands
from ..data import games
from ..evals import bootstrap
from ..train.learners import gbm
from . import charts, glossary, tex
from .sources import METRIC_NAMES, METRIC_WORDS, Sources, describe, run_head, run_tex


def _flatten(prefix: str, value: Any, out: tex.Generated) -> None:
    """A recipe's settings as values: a count, a share with its percent beside it, a word, a list."""
    if isinstance(value, dict):
        for name, inner in value.items():
            _flatten(tex.key(prefix, name), inner, out)
    elif isinstance(value, bool):
        out.set(prefix, "yes" if value else "no")
    elif isinstance(value, int):
        out.set(prefix, tex.count(value))
    elif isinstance(value, float):
        out.set(prefix, tex.plain(value))
        if 0.0 <= value <= 1.0:
            out.set(prefix + ".percent", tex.plain(round(100.0 * value, 6)))
    elif isinstance(value, (list, tuple)):
        out.set(prefix, ", ".join(tex.esc(item) for item in value))
        out.set(prefix + ".count", tex.word(len(value)))
    elif value is not None:
        out.set(prefix, tex.esc(value))


def _weights(run: dict[str, Any]) -> dict[str, Any] | None:
    """The file a record names as its run's weights, when it names one."""
    return next((file for file in run.get("weights", []) if file["file"].startswith("model.")), None)


# The scores that are a share of the test rows: how often the candidate a run puts first is right, or the move
# played is among its first three.
SHARES_OF_ROWS = ("top1", "top3")


def run_values(src: Sources, out: tex.Generated, prefix: str, run: dict[str, Any]) -> None:
    """One run's values under ``prefix``."""
    task = src.task
    learner, details = run["config"]["learner"], run["learner"]
    out.set(f"{prefix}.name", run_tex(run["run"]))
    out.set(f"{prefix}.learner", describe(run))
    for metric, entry in run["test"].items():
        for part, text in zip(("", ".low", ".high"), (entry["value"], entry["low"], entry["high"])):
            out.set(tex.key(prefix, metric) + part, tex.score(text))
        if task.scale == "log1p" and metric in ("mae", "rmse"):
            out.set(tex.key(prefix, metric) + ".factor", tex.fixed(math.exp(entry["value"]), 2))
        if metric in SHARES_OF_ROWS:
            # A share of the rows, which prose says as a percentage.
            for part, text in zip(("", ".low", ".high"), (entry["value"], entry["low"], entry["high"])):
                out.set(tex.key(prefix, metric) + ".percent" + part, tex.percent(text))
    for metric, value in run["valid"].items():
        out.set(tex.key(prefix, "valid", metric), tex.score(value))
    primary = run["test"][task.primary]
    for part, text in zip(("", ".low", ".high"), (primary["value"], primary["low"], primary["high"])):
        out.set(f"{prefix}.score{part}", tex.score(text))
    out.set(f"{prefix}.valid.score", tex.score(run["valid"][task.primary]))
    gain = run.get("gain")
    if gain:
        value, low, high = tex.trio(gain["gain"], gain["low"], gain["high"])
        out.set(f"{prefix}.gain", value)
        out.set(f"{prefix}.gain.low", low)
        out.set(f"{prefix}.gain.high", high)
        out.set(f"{prefix}.gain.percent", tex.sig(100.0 * abs(gain["gain"]) / abs(gain["reference_value"]), 2))
    out.set(f"{prefix}.seconds", tex.duration(run["seconds"]))
    out.set(f"{prefix}.device", tex.esc(trained_on(run)))
    if run.get("train_rows"):
        out.set(f"{prefix}.train-rows", tex.count(run["train_rows"]))
    if details.get("parameters"):
        out.set(f"{prefix}.parameters", tex.count(details["parameters"]))
        out.set(f"{prefix}.parameters.millions", tex.fixed(details["parameters"] / 1e6, 1))
    if "trees" in details:
        out.set(f"{prefix}.trees", tex.count(details["trees"]))
        out.set(f"{prefix}.features", tex.count(details["features"]))
    if "history" in details:
        out.set(f"{prefix}.best-epoch", tex.count(details["best_epoch"]))
        out.set(f"{prefix}.epochs", tex.count(run["config"]["train"]["epochs"]))
        out.set(f"{prefix}.epochs.run", tex.count(len(details["history"])))
        speeds = sorted(epoch["rows_a_second"] for epoch in details["history"])
        out.set(f"{prefix}.rows-a-second", tex.count(round(speeds[len(speeds) // 2], -2)))
    if "constant" in details:
        out.set(f"{prefix}.constant", src.label_text(details["constant"]))
    for index, lean in enumerate(details.get("leans_on", []), start=1):
        out.set(f"{prefix}.leans.{index}.feature", tex.esc(glossary.label(lean["feature"])))
        out.set(f"{prefix}.leans.{index}.share", tex.percent(lean["share_of_gain"], 0))
    # A chance is rescaled on the valid rows: a slope and an intercept where a row has one chance or a set
    # of them, and one temperature where a row's chances are shared out among its legal moves.
    calibration = run.get("calibration") or {}
    if "platt_slope" in calibration:
        out.set(f"{prefix}.platt.slope", tex.fixed(calibration["platt_slope"], 2))
        out.set(f"{prefix}.platt.intercept", tex.fixed(calibration["platt_intercept"], 2, sign=True))
    if "temperature" in calibration:
        out.set(f"{prefix}.temperature", tex.fixed(calibration["temperature"], 2))
        if calibration.get("log_loss_before"):
            out.set(f"{prefix}.log-loss.before", tex.score(calibration["log_loss_before"]["test"]))
    for name in ("dim", "depth", "heads", "dropout", "convs"):
        if name in learner:
            out.set(f"{prefix}.{name}", tex.plain(learner[name]))
    schedule = run["config"].get("train", {})
    for name in ("batch", "lr", "weight_decay", "patience"):
        if name in schedule:
            out.set(tex.key(prefix, name), tex.plain(schedule[name]))
    if "warmup" in schedule:
        out.set(f"{prefix}.warmup.percent", tex.plain(round(100.0 * schedule["warmup"], 6)))
    weights = _weights(run)
    if weights:
        out.set(f"{prefix}.weights.file", f"\\texttt{{{tex.esc(weights['file'])}}}")
        out.set(f"{prefix}.weights.bytes", tex.count(weights["bytes"]))
        out.set(f"{prefix}.weights.megabytes", tex.fixed(weights["bytes"] / 1e6, 1))
        out.set(f"{prefix}.weights.sha256", f"\\texttt{{{weights['sha256'][:16]}}}")
    twin = src.twin(run)
    if twin is not None:
        out.set(f"{prefix}.twin.name", run_tex(twin["run"]))
        own, other = run["test"][task.primary]["value"], twin["test"][task.primary]["value"]
        out.set(f"{prefix}.over-twin", tex.sig(src.better_by(own, other), 3, sign=True))


MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)  # fmt: skip


def day(stamp: str) -> str:
    """A record's timestamp as a paper prints a day: 22 November 2026."""
    year, month, date = stamp[:10].split("-")
    return f"{int(date)} {MONTHS[int(month) - 1]} {year}"


def method_values(out: tex.Generated) -> None:
    """The settings the harness gives every model: how noise is measured and how the trees are grown."""
    out.set("method.resamples", tex.count(bootstrap.RESAMPLES))
    out.set("method.blunder-bar", tex.plain(round(games.BLUNDER_LOSS, 6)))
    out.set("method.gbm.rounds", tex.count(gbm.DEFAULTS["rounds"]))
    out.set("method.gbm.leaves", tex.count(gbm.DEFAULTS["num_leaves"]))
    out.set("method.gbm.rate", tex.plain(gbm.DEFAULTS["learning_rate"]))
    out.set("method.gbm.patience", tex.count(gbm.DEFAULTS["patience"]))
    out.set("method.gbm.smallest-leaf", tex.count(gbm.DEFAULTS["min_child_samples"]))
    out.set("method.gbm.rows.percent", tex.plain(round(100.0 * gbm.FIXED["subsample"], 6)))
    out.set("method.gbm.features.percent", tex.plain(round(100.0 * gbm.FIXED["colsample_bytree"], 6)))


def band_names(src: Sources) -> list[str]:
    return sorted({band for run in src.runs for band in run["test_by_band"]}, key=bands.order)


def band_digits(src: Sources) -> int:
    """The decimals every band's score is printed with: those of the largest of them. An error in rating points
    can be under a hundred in one band and over it in the next, and the small one is not known to a thousandth."""
    scores = [entry[src.primary] for run in src.runs for entry in run["test_by_band"].values()]
    return min((tex.score_digits(value) for value in scores if tex.known(value)), default=4)


def values(src: Sources, out: tex.Generated) -> None:
    """Every value the records give."""
    task = src.task
    out.set("model", tex.esc(src.model))
    out.set("task.unit", tex.esc(task.unit))
    labels = [task.label] if isinstance(task.label, str) else list(task.label)
    out.set("task.label", ", ".join(f"\\texttt{{{tex.esc(name)}}}" for name in labels))
    out.set("task.metric", METRIC_NAMES[task.primary])
    out.set("task.better", "lower" if task.lower_is_better else "higher")
    out.set("task.reference", run_tex(task.reference))
    out.set("task.context.count", tex.word(len(task.context)))
    out.set("task.hand.count", tex.count(len(src.extra)))
    out.set("task.marks.count", tex.word(len(src.marks)))
    if src.sequence:
        out.set("task.steps.count", tex.word(len(src.steps)))
    if task.candidates:
        # Where the answer is a set: how many candidates every row is given a chance for.
        out.set("task.candidates.count", tex.count(len(task.candidates)))
    data = src.best["dataset"]
    out.set("data.name", f"\\texttt{{{tex.esc(data['dataset'])}}}")
    out.set("data.rows", tex.count(data["rows"]))
    for split, rows in data["splits"].items():
        out.set(f"data.rows.{split}", tex.count(rows))
        out.set(f"data.share.{split}", tex.percent(rows / data["rows"], 0))
    out.set("data.rows.test.thousands", tex.count(round(data["splits"]["test"] / 1000)))
    out.set("data.games.test", tex.count(src.best["test_groups"]))
    if "positions" in data:
        # Where a row is a sequence: the positions of every row, and how many a row holds on average.
        out.set("data.positions", tex.count(data["positions"]))
        out.set("data.positions.a-row", tex.fixed(data["positions"] / data["rows"], 1))
    out.set("data.fingerprint", f"\\texttt{{{data['fingerprint'][:12]}}}")
    out.set("data.built", data["built"][:10])
    out.set("data.source", f"\\url{{{data['source']}}}")
    out.set("data.licence", tex.esc(data["licence"].split(",")[0]))
    out.set("data.code", f"\\texttt{{{data['code'][:7]}}}")
    _flatten("recipe", {key: value for key, value in src.recipe.items() if key not in ("name", "builder", "source")}, out)
    if "month" in src.recipe:
        year, month = str(src.recipe["month"]).split("-")
        out.set("data.month", f"{MONTHS[int(month) - 1]} {year}")

    for run in [*src.runs, *src.studies]:
        run_values(src, out, tex.key("run", run["run"]), run)
    parts = {
        "best": src.best,
        "reference": src.reference,
        "floor": src.floor,
        "network": next(iter(src.networks), None),
        "board": src.board_only,
        "challenger": src.challenger,
    }
    for part, run in parts.items():
        if run is not None:
            run_values(src, out, part, run)

    networks = src.networks
    out.set("runs.count", tex.word(len(src.runs)))
    # Every network on the leaderboard, and the ladder's alone: the ones that change nothing in another run.
    for part, group in (("networks", networks), ("ladder", src.ladder)):
        out.set(f"{part}.count", tex.word(len(group)))
        ahead = [run for run in group if run.get("gain") and run["gain"]["beyond_noise"] and run["gain"]["gain"] > 0]
        behind = [run for run in group if run.get("gain") and run["gain"]["beyond_noise"] and run["gain"]["gain"] < 0]
        out.set(f"{part}.ahead", tex.word(len(ahead)))
        out.set(f"{part}.behind", tex.word(len(behind)))
        out.set(f"{part}.level", tex.word(len(group) - len(ahead) - len(behind)))
        out.set(f"{part}.ahead.of", tex.of(len(ahead), len(group), "networks"))
        out.set(f"{part}.behind.of", tex.of(len(behind), len(group), "networks"))
        last = [run for run in group if run["learner"]["best_epoch"] == run["config"]["train"]["epochs"]]
        out.set(f"{part}.at-last-epoch", tex.word(len(last)))
        out.set(f"{part}.at-last-epoch.of", tex.of(len(last), len(group), "networks"))
    # A setting every network shares is one value; where they differ, the settings table says so. A run on a
    # larger build of the dataset is left out: it is given fewer epochs, and a patience cut with them.
    for name, shown in (("warmup", "networks.warmup.percent"), ("patience", "networks.patience")):
        asked = {run["config"]["train"].get(name) for run in networks if "train_dataset" not in run}
        if len(asked) == 1 and None not in asked:
            (value,) = asked
            out.set(shown, tex.plain(round(100.0 * value, 6)) if name == "warmup" else tex.word(int(value)))
    out.set("cost.seconds", tex.duration(sum(run["seconds"] for run in src.runs)))
    out.set("cost.seconds.networks", tex.duration(sum(run["seconds"] for run in networks)))
    out.set("cost.seconds.others", tex.duration(sum(run["seconds"] for run in src.runs if run not in networks)))
    out.set("code.commit", f"\\texttt{{{src.best['code'][:7]}}}")
    trained = sorted(run["trained"] for run in src.runs)
    out.set("results.first", day(trained[0]))
    out.set("results.date", day(trained[-1]))
    method_values(out)

    reference, floor = src.reference, src.floor
    primary = task.primary
    if reference is not None and floor is not None:
        lift = src.better_by(reference["test"][primary]["value"], floor["test"][primary]["value"])
        out.set("reference.lift", tex.sig(lift, 3))
        out.set("reference.lift.percent", tex.sig(100.0 * lift / abs(floor["test"][primary]["value"]), 2))
        blind = next((run for run in src.runs if run["config"]["learner"] == {"kind": "gbm", "features": "context"}), None)
        if blind is not None:
            blind_lift = src.better_by(blind["test"][primary]["value"], floor["test"][primary]["value"])
            out.set("context.lift", tex.sig(blind_lift, 3))
            out.set("context.lift.share", tex.percent(blind_lift / lift, 0))
        # How much of the reference's step from the floor each run makes: over 100 for a run ahead of it.
        # A run's gain over the reference is on the same scale, with its interval.
        if lift:
            named = [(tex.key("run", run["run"]), run) for run in src.runs]
            for prefix, run in [*named, *((part, run) for part, run in parts.items() if run is not None)]:
                step = src.better_by(run["test"][primary]["value"], floor["test"][primary]["value"])
                out.set(f"{prefix}.lift.share", tex.percent(step / lift, 0))
                gain = run.get("gain")
                if gain:
                    for part, amount in (("", gain["gain"]), (".low", gain["low"]), (".high", gain["high"])):
                        out.set(f"{prefix}.gain.of-lift{part}", tex.percent(amount / lift, 0))

    names = band_names(src)
    out.set("bands.count", tex.word(len(names)))
    for index, name in enumerate(names, start=1):
        out.set(f"band.{index}.name", tex.esc(name))
        out.set(f"band.{index}.rows", tex.count(src.best["test_by_band"][name]["rows"]))
        for part, run in parts.items():
            if run is not None and name in run["test_by_band"]:
                out.set(f"band.{index}.{part}", tex.score(run["test_by_band"][name][primary], digits=band_digits(src)))
        # By its own name too, so that prose about one run reads that run wherever it stands on the leaderboard.
        # A study's run is on no table by band but the one of the studies.
        for run in [*src.runs, *src.studies]:
            if name in run.get("test_by_band", {}):
                out.set(tex.key("run", run["run"], "band", index), tex.score(run["test_by_band"][name][primary], digits=band_digits(src)))
    if reference is not None and src.best is not reference:
        leads = {
            name: src.better_by(src.best["test_by_band"][name][primary], reference["test_by_band"][name][primary])
            for name in names
        }
        widest, narrowest = max(leads, key=leads.get), min(leads, key=leads.get)
        out.set("bands.lead.widest.name", tex.esc(widest))
        out.set("bands.lead.widest", tex.sig(leads[widest], 3, sign=True))
        out.set("bands.lead.narrowest.name", tex.esc(narrowest))
        out.set("bands.lead.narrowest", tex.sig(leads[narrowest], 3, sign=True))
        out.set("bands.best-ahead", tex.word(sum(lead > 0 for lead in leads.values())))
        out.set("bands.best-ahead.of", tex.of(sum(lead > 0 for lead in leads.values()), len(names), "bands"))
    candidate_values(src, out)
    for run_part, run in (("best", src.best), ("reference", reference)):
        table = run.get("test_calibration") if run is not None else None
        if table:
            gaps = [abs(row["predicted"] - row["observed"]) for row in table]
            out.set(f"{run_part}.calibration.widest-gap", tex.fixed(100.0 * max(gaps), 1))
            out.set(f"{run_part}.calibration.lowest", tex.percent(table[0]["predicted"]))
            out.set(f"{run_part}.calibration.highest", tex.percent(table[-1]["predicted"]))
            out.set(f"{run_part}.calibration.groups", tex.word(len(table)))


# How many of the tags a run tells worst are named together in prose.
WEAKEST_TAGS = 3


def _tag(name: str) -> str:
    return f"\\texttt{{{tex.esc(name)}}}"


def candidate_values(src: Sources, out: tex.Generated) -> None:
    """What the best run's record says of a row's candidates. Where they are a position's legal moves: how many
    a test row has. Where they are tags: each tag by itself, as one yes or no over the test rows, so prose can
    name the commonest and the rarest, the tag whose chance tells its rows from the rest best and worst by each
    of the table's two areas, the few it tells worst by the stricter one, and the tags where the best run is
    furthest ahead of the reference and nearest to it."""
    moves = src.best.get("test_candidates")
    if moves:
        out.set("candidates.mean", tex.fixed(moves["mean"], 1))
        out.set("candidates.most", tex.count(moves["most"]))
    each = src.best.get("test_by_candidate")
    if not each:
        return
    out.set("candidates.run", run_tex(src.best["run"]))
    by_rows = sorted(each, key=lambda name: (-each[name]["rows"], name))
    for part, name in (("common", by_rows[0]), ("rare", by_rows[-1])):
        out.set(f"candidates.{part}.name", _tag(name))
        out.set(f"candidates.{part}.rows", tex.count(each[name]["rows"]))
        out.set(f"candidates.{part}.share", tex.percent(each[name]["share"]))
    for column, area in (("roc", "roc_auc"), ("pr", "pr_auc")):
        told = {name: row[area] for name, row in each.items() if tex.known(row[area])}
        if not told:
            continue
        for part, name in (("most", max(told, key=told.get)), ("least", min(told, key=told.get))):
            out.set(f"candidates.{column}.{part}.name", _tag(name))
            out.set(f"candidates.{column}.{part}", tex.fixed(told[name], 2))
            out.set(f"candidates.{column}.{part}.share", tex.percent(each[name]["share"]))
    held = {name: row["pr_auc"] for name, row in each.items() if tex.known(row["pr_auc"])}
    weakest = sorted(held, key=lambda name: (held[name], name))[:WEAKEST_TAGS]
    if len(weakest) == WEAKEST_TAGS:
        out.set("candidates.pr.weakest.count", tex.word(len(weakest)))
        out.set("candidates.pr.weakest.names", tex.listed([_tag(name) for name in weakest]))
        out.set("candidates.pr.weakest.highest", tex.fixed(held[weakest[-1]], 2))
    reference = src.reference
    under = reference.get("test_by_candidate") if reference is not None and reference is not src.best else None
    leads = {name: area - under[name]["pr_auc"] for name, area in held.items() if under and tex.known(under.get(name, {}).get("pr_auc"))}
    if leads:
        for part, name in (("most", max(leads, key=leads.get)), ("least", min(leads, key=leads.get))):
            out.set(f"candidates.pr.lead.{part}.name", _tag(name))
            out.set(f"candidates.pr.lead.{part}.best", tex.fixed(held[name], 2))
            out.set(f"candidates.pr.lead.{part}.reference", tex.fixed(under[name]["pr_auc"], 2))


def candidates_table(src: Sources) -> str | None:
    """Each tag by itself, for the best run and for the reference beside it: how many test rows carry it, and
    how well a run's chance for it tells those rows from the rest. The most common first."""
    best, reference = src.best, src.reference
    each = best.get("test_by_candidate")
    if not each:
        return None
    other = reference if reference is not None and reference is not best and "test_by_candidate" in reference else None
    shown = [best] + ([other] if other is not None else [])
    rows = []
    for name in sorted(each, key=lambda name: (-each[name]["rows"], name)):
        cells = [f"\\texttt{{{tex.esc(name)}}}", tex.count(each[name]["rows"]), tex.percent(each[name]["share"]) + "\\%"]
        for run in shown:
            entry = run["test_by_candidate"][name]
            cells += [tex.fixed(entry["pr_auc"], 3), tex.fixed(entry["roc_auc"], 3)]
        rows.append(cells)
    head = ["Tag", "Test examples", "Share"] + ["PR-AUC", "ROC-AUC"] * len(shown)
    top = ["", "", ""] + [run_head(run["run"], 2, "2.9cm") for run in shown]
    table = tex.tabular("lrr" + "rr" * len(shown), head, rows)
    return tex.grouped(table, top, [(4 + 2 * index, 5 + 2 * index) for index in range(len(shown))])


def _gain_cells(src: Sources, run: dict[str, Any]) -> list[str]:
    gain = run.get("gain")
    if run["run"] == src.task.reference:
        return ["baseline", ""]
    if gain is None:
        return ["not compared", ""]
    value, low, high = tex.trio(gain["gain"], gain["low"], gain["high"])
    return [tex.bold(value, gain["beyond_noise"]), f"{low} to {high}"]


def leaderboard_table(src: Sources) -> str:
    """The runs, best first: the score they are ranked by and the paired gain over the reference, each with its interval."""
    rows = []
    for run in src.runs:
        entry = run["test"][src.primary]
        rows.append(
            [
                run_tex(run["run"]),
                tex.score(entry["value"]),
                f"{tex.score(entry['low'])} to {tex.score(entry['high'])}",
                *_gain_cells(src, run),
            ]
        )
    head = ["Model", METRIC_NAMES[src.primary], "95\\% CI", f"Gain over {run_tex(src.task.reference)}", "95\\% CI"]
    return tex.tabular("lrrrr", head, rows)


def metrics_table(src: Sources) -> str:
    """Every metric of every run."""
    rows = [
        [run_tex(run["run"]), *(tex.score(run["test"][metric]["value"]) for metric in src.metrics)] for run in src.runs
    ]
    return tex.tabular("l" + "r" * len(src.metrics), ["Model", *(METRIC_NAMES[metric] for metric in src.metrics)], rows)


def trained_on(run: dict[str, Any]) -> str:
    """The processor a run trained on, as its record names it, without the trademark signs."""
    device = run["learner"].get("device", "cpu")
    name = device if device != "cpu" else run["machine"]["processor"]
    return " ".join(name.replace("(R)", "").replace("(TM)", "").split())


def _fitted(run: dict[str, Any]) -> str:
    details = run["learner"]
    if "trees" in details:
        return f"{tex.count(details['trees'])} trees"
    if "history" in details:
        return f"epoch {details['best_epoch']} of {run['config']['train']['epochs']}"
    return ""


def runs_table(src: Sources) -> str:
    """What each run is and what it cost."""
    rows = []
    for run in src.runs:
        rows.append(
            [
                run_tex(run["run"]),
                describe(run),
                _fitted(run),
                tex.esc(trained_on(run)),
                tex.duration(run["seconds"]),
            ]
        )
    head = ["Model", "Description", "Selected", "Hardware", "Time"]
    return tex.tabular("l>{\\raggedright\\arraybackslash}p{5.1cm}l>{\\raggedright\\arraybackslash}p{3.9cm}r", head, rows)


def _over(run: dict[str, Any], setting: str) -> str:
    """A setting of the layers that read a row's positions in order, as the run's config names it: nothing
    for a network of one position."""
    return str(run["config"]["learner"].get("over", {}).get(setting, ""))


# An encoder as the settings table names it.
ENCODERS = {"transformer": "Transformer", "conv": "ResNet", "hybrid": "Hybrid"}

# A network's settings as the settings table heads them, and how each is read from a run's config.
SETTINGS = (
    ("Encoder", "l", lambda run: ENCODERS.get(run["config"]["learner"]["body"], tex.esc(run["config"]["learner"]["body"]))),
    ("Width", "r", lambda run: str(run["config"]["learner"]["dim"])),
    ("Layers", "r", lambda run: str(run["config"]["learner"]["depth"])),
    ("Heads", "r", lambda run: str(run["config"]["learner"].get("heads", ""))),
    ("Dropout", "r", lambda run: tex.plain(float(run["config"]["learner"].get("dropout", 0.0)))),
    # Of a network that reads a row's positions in order: the layers that do, over the body that reads a board.
    ("Seq. layers", "r", lambda run: _over(run, "depth")),
    ("Seq. heads", "r", lambda run: _over(run, "heads")),
    ("Epochs", "r", lambda run: str(run["config"]["train"]["epochs"])),
    ("Batch", "r", lambda run: tex.count(run["config"]["train"]["batch"])),
    ("LR", "r", lambda run: tex.plain(float(run["config"]["train"]["lr"]))),
    ("Weight decay", "r", lambda run: tex.plain(float(run["config"]["train"].get("weight_decay", 0.05)))),
    ("Patience", "r", lambda run: str(run["config"]["train"].get("patience", ""))),
)


def settings_table(src: Sources) -> str | None:
    """The ladder networks' sizes and schedules, from their configs. A setting is a column where the networks
    differ in it, and a line under the table where they all share it, so the table is as wide as what it has
    to say. A run that changes one thing in one of them is not a row: the table of pairs says what it changes."""
    networks = src.ladder
    if not networks:
        return None
    columns, shared = [], []
    for name, align, read in SETTINGS:
        cells = [read(run) for run in networks]
        if len(set(cells)) > 1:
            columns.append((name, align, cells))
        elif cells[0]:
            shared.append(f"{name.lower()} {cells[0]}")
    sizes = [tex.count(run["learner"]["parameters"]) if run["learner"].get("parameters") else "" for run in networks]
    columns.append(("Parameters", "r", sizes))
    rows = [[run_tex(run["run"]), *(cells[index] for _, _, cells in columns)] for index, run in enumerate(networks)]
    spec = "l" + "".join(align for _, align, _ in columns)
    table = "{\\setlength{\\tabcolsep}{4.5pt}%\n" + tex.tabular(spec, ["Model", *(name for name, _, _ in columns)], rows) + "}"
    if shared:
        table += f"\n\n\\smallskip\n{{\\footnotesize Shared by all of them: {', '.join(shared)}.}}"
    return table


def data_table(src: Sources) -> str:
    """The dataset's rows by split, with what happened in each when the closer look is there to say."""
    data = src.best["dataset"]
    by_split = (src.look or {}).get("label", {}).get("by_split", {})
    binary = src.task.kind == "binary"
    rows = []
    for split in ("train", "valid", "test"):
        row = [split, tex.count(data["splits"][split]), tex.percent(data["splits"][split] / data["rows"], 0) + "\\%"]
        if by_split:
            row.append(src.label_text(by_split[split]["rate" if binary else "mean"]))
        rows.append(row)
    foot = ["all", tex.count(data["rows"]), ""]
    head = ["Split", "Examples", "Share"]
    if by_split:
        look = src.look["label"]
        foot.append(src.label_text(look["rate" if binary else "mean"]))
        head.append("Positive rate" if binary else "Mean target")
    return tex.tabular("lrr" + ("r" if by_split else ""), head, rows, foot=[foot])


def bands_table(src: Sources) -> str:
    """The primary metric of every run in every band, with the band's test rows underneath."""
    names, digits = band_names(src), band_digits(src)
    rows = [
        [
            run_tex(run["run"]),
            *(tex.score(run["test_by_band"][name][src.primary], digits=digits) if name in run["test_by_band"] else "n/a" for name in names),
        ]
        for run in src.runs
    ]
    foot = ["test examples", *(tex.count(src.best["test_by_band"][name]["rows"]) for name in names)]
    return tex.tabular("l" + "r" * len(names), ["Model", *(tex.esc(name) for name in names)], rows, foot=[foot])


def studies_bands_table(src: Sources) -> str | None:
    """The primary metric in every band for each run a study changes, with the study's runs under it: what a
    change is worth band by band. A run that is on the leaderboard and its changed runs are one group, the
    groups in the leaderboard's order. None where no study run is scored by band."""
    names, digits = band_names(src), band_digits(src)

    def cells(run: dict[str, Any]) -> list[str]:
        by_band = run["test_by_band"]
        return [tex.score(by_band[name][src.primary], digits=digits) if name in by_band else "n/a" for name in names]

    rows = []
    for base in src.runs:
        under = [run for run in src.studies if run["config"].get("base") == base["run"] and run.get("test_by_band")]
        if not under:
            continue
        gap = "\\addlinespace\n" if rows else ""
        rows.append([gap + run_tex(base["run"]), *cells(base)])
        rows += [[f"\\quad {run_tex(run['run'])}", *cells(run)] for run in under]
    if not rows:
        return None
    foot = ["test examples", *(tex.count(src.best["test_by_band"][name]["rows"]) for name in names)]
    return tex.tabular("l" + "r" * len(names), ["Model", *(tex.esc(name) for name in names)], rows, foot=[foot])


def band_title(src: Sources) -> str:
    return src.plan.get("band", {}).get("title", "Band")


def bands_figure(src: Sources) -> str | None:
    """Each ladder network's lead over the reference band by band: the differences of the scores in the bands
    table. The best run is drawn too when it is a network that changed one of them."""
    reference = src.reference
    networks = [run for run in src.networks if run is not reference and (run in src.ladder or run is src.best)]
    if reference is None or not networks:
        return None
    names = band_names(src)
    series = [
        charts.run_series(
            run["run"],
            [
                (index, src.better_by(run["test_by_band"][name][src.primary], reference["test_by_band"][name][src.primary]))
                for index, name in enumerate(names)
                if name in run["test_by_band"] and name in reference["test_by_band"]
            ],
        )
        for run in networks
    ]
    return charts.lines(
        series,
        xlabel=tex.esc(band_title(src)),
        ylabel=f"Difference in {METRIC_WORDS[src.primary]}",
        tick_labels=names,
        level=(0.0, run_tex(reference["run"]), charts.run_colour(reference["run"])),
        legend_columns=2,
        width="0.66\\textwidth",
    )


def scores_figure(src: Sources) -> str:
    """Every run's score with its interval on one axis, the reference's score as the line to read against."""
    reference = src.reference
    rows = [
        (run["run"], run["test"][src.primary]["value"], run["test"][src.primary]["low"], run["test"][src.primary]["high"])
        for run in src.runs
    ]
    better = "lower" if src.task.lower_is_better else "higher"
    return charts.intervals(
        rows,
        xlabel=f"{METRIC_NAMES[src.primary]} on the test set ({better} is better)",
        reference=reference["test"][src.primary]["value"] if reference is not None else None,
        reference_label=run_tex(reference["run"]) if reference is not None else "",
        colours=[charts.run_colour(run["run"]) for run in src.runs],
    )


def gains_figure(src: Sources) -> str | None:
    """Each network's paired gain over the reference with its interval, zero as the line to read against."""
    compared = [run for run in src.networks if run.get("gain")]
    if not compared:
        return None
    rows = [(run["run"], run["gain"]["gain"], run["gain"]["low"], run["gain"]["high"]) for run in compared]
    return charts.intervals(
        rows,
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} over the baseline (right of the line is better)",
        reference=0.0,
        reference_label=run_tex(src.task.reference),
        colours=[charts.run_colour(run["run"]) for run in compared],
    )


def valid_curve(src: Sources, run: dict[str, Any]) -> charts.Series:
    key = f"valid_{src.primary}"
    return charts.run_series(run["run"], [(epoch["epoch"], epoch[key]) for epoch in run["learner"]["history"]])


def reference_level(src: Sources) -> tuple[float, str, str] | None:
    reference = src.reference
    if reference is None:
        return None
    return (reference["valid"][src.primary], run_tex(reference["run"]), charts.run_colour(reference["run"]))


def curves_figure(src: Sources) -> str | None:
    """Each ladder network's score on the valid rows epoch by epoch, the reference's valid score as the level to reach."""
    networks = [run for run in src.ladder if run["learner"].get("history")]
    if not networks:
        return None
    series = [valid_curve(src, run) for run in networks]
    longest = max(len(one.points) for one in series)
    return charts.lines(
        series,
        xlabel="Epoch",
        ylabel=f"{METRIC_NAMES[src.primary]} on the validation set",
        level=reference_level(src),
        legend_columns=2,
        width="0.66\\textwidth",
        extra=[
            "xtick distance=1" if longest <= 12 else "xtick distance=2",
            f"xmin=0.5, xmax={longest + 0.5}",
        ],
    )


def leans_figure(src: Sources, run: dict[str, Any] | None) -> str | None:
    """What a tree run leaned on: each feature's share of the gain its splits made, largest first."""
    leans = (run or {}).get("learner", {}).get("leans_on")
    if not leans:
        return None
    return charts.ranked(
        [(glossary.title(lean["feature"]), 100.0 * lean["share_of_gain"]) for lean in leans],
        xlabel="Share of total split gain (percent)",
        labels=[tex.percent(lean["share_of_gain"]) for lean in leans],
        colour=charts.run_colour(run["run"]),
    )


def calibration_table(src: Sources) -> str | None:
    """A chance in ten equal groups by what the best run said, against what happened, with the reference beside it."""
    best, reference = src.best, src.reference
    if "test_calibration" not in best:
        return None
    other = reference if reference is not None and reference is not best and "test_calibration" in reference else None
    shown = [best] + ([other] if other is not None else [])
    rows = []
    for index, row in enumerate(best["test_calibration"]):
        cells = [str(index + 1), tex.count(row["n"])]
        for run in shown:
            entry = run["test_calibration"][index]
            cells += [tex.percent(entry["predicted"]) + "\\%", tex.percent(entry["observed"]) + "\\%"]
        rows.append(cells)
    head = ["Bin", "Examples"] + ["predicted", "observed"] * len(shown)
    top = ["", ""] + [run_head(run["run"], 2, "2.9cm") for run in shown]
    table = tex.tabular("rr" + "rr" * len(shown), head, rows)
    return tex.grouped(table, top, [(3 + 2 * index, 4 + 2 * index) for index in range(len(shown))])


def calibration_figure(src: Sources) -> str | None:
    """What was said against what happened for a chance, from the records' ten groups: the best run and the reference."""
    best, reference = src.best, src.reference
    if "test_calibration" not in best:
        return None
    runs = [best] + ([reference] if reference is not None and reference is not best and "test_calibration" in reference else [])
    series = [
        charts.run_series(run["run"], [(100.0 * row["predicted"], 100.0 * row["observed"]) for row in run["test_calibration"]])
        for run in runs
    ]
    return charts.lines(
        series,
        xlabel="Predicted probability (percent)",
        ylabel="Observed frequency (percent)",
        diagonal=True,
        width="0.5\\textwidth",
        height="6.2cm",
    )


def reads_table(src: Sources) -> str:
    """The context numbers every learner reads beside the board."""
    rows = [[f"\\texttt{{{tex.esc(name)}}}", glossary.says(name)] for name in src.task.context]
    return tex.tabular("lL", ["Feature", "Description"], rows, width="\\textwidth")


def steps_table(src: Sources) -> str | None:
    """The numbers of each position of a row, where a row is a sequence: what a network reads beside each board."""
    if not src.sequence:
        return None
    rows = [[f"\\texttt{{{tex.esc(name)}}}", glossary.says(name)] for name in src.steps]
    return tex.tabular("lL", ["Feature", "Description"], rows, width="\\textwidth")


def hand_table(src: Sources) -> str:
    """The hand features the tree baseline reads, and a network when its run asks for them."""
    rows = [[f"\\texttt{{{tex.esc(name)}}}", glossary.says(name)] for name in src.extra]
    return tex.tabular("lL", ["Feature", "Description"], rows, width="\\textwidth")


def marks_table(src: Sources) -> str:
    """The mark channels: what the task tells a network about squares."""
    rows = [[f"\\texttt{{{tex.esc(name)}}}", glossary.MARKS[name]] for name in src.marks]
    return tex.tabular("lL", ["Plane", "Squares set"], rows, width="\\textwidth")


def blocks(src: Sources, out: tex.Generated) -> None:
    """Every table and figure the records give."""
    made = {
        "leaderboard": leaderboard_table(src),
        "metrics": metrics_table(src),
        "runs": runs_table(src),
        "settings": settings_table(src),
        "data": data_table(src),
        "bands-table": bands_table(src),
        "studies-bands": studies_bands_table(src),
        "bands": bands_figure(src),
        "scores": scores_figure(src),
        "gains": gains_figure(src),
        "curves": curves_figure(src),
        "leans": leans_figure(src, src.reference),
        "calibration-table": calibration_table(src),
        "calibration": calibration_figure(src),
        "candidates": candidates_table(src),
        "reads": reads_table(src),
        "steps": steps_table(src),
        "hand": hand_table(src),
        "marks": marks_table(src),
    }
    for name, latex in made.items():
        if latex is not None:
            out.block(name, latex)
