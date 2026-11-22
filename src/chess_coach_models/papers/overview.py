"""The lab's own paper: every model's results side by side.

``lab paper`` with no model reads every model's committed files, as each
model's own paper does, and writes ``papers/lab/generated/``. A model's
values are there under its name (``puzzle-difficulty.best.score``) and its
blocks under its name (``puzzle-difficulty-leaderboard``), so the lab's prose can
read anything a model's paper can. Beside them, under ``lab``, is what only
the lab as a whole can say: the models in one table, where every run stands
between the floor and the trees, what each network of the ladder adds to the
trees, and what one change is worth from model to model.

Models are scored in different units, so one scale sets them side by side:
the reference's step, how much better the trees with hand features are than
the floor on a model's own metric. A run's share of the step is 0 for the
floor and 100 for the reference, and a gain is a number of hundredths of it.
An interval on that scale is the paired gain's interval divided by the step.
The step is a measured number too and its own noise is left out, so the
scale is for setting models side by side, and each model's paper has the
gain in the model's own units.

A model with a task and no run yet is listed as waiting, and what the prose
says of waiting models stands inside ``\\ifwaiting``. What it says of one kind
of change stands inside that kind's switch (``\\ifchangeepochs``,
``\\ifchangestart``), on while a pair of that kind is measured in some model,
and what it says of a study inside ``\\ifgames`` and ``\\iffeatures``, on
while some model has a run of that study.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import paths, tasks
from ..evals import leaderboard
from . import build, changes, charts, tex
from .results import day, method_values, trained_on
from .sources import METRIC_NAMES, STUDIES, Sources, run_cell, run_tex


# One change measured in model after model, by the one setting it changes: its name in a key, and in words.
KINDS = {
    ("learner", "features"): ("hand", "The hand features"),
    ("train", "epochs"): ("epochs", "More epochs"),
    ("learner", "init"): ("start", "A body that learned an engine's evaluations first"),
}
# What a learner is called where a change is said to be made under it.
UNDER = {"gbm": "under the trees", "net": "under a network"}
# The ladder from its floor up: the order a table names the runs a change was made in.
LADDER = ("constant", "gbm-context", "gbm-hand", "conv-small", "transformer-small", "transformer-medium", "transformer-medium-hand")


@dataclass
class Lab:
    """Every model with a run: its sources and what its own paper can read. And the tasks still waiting for one."""

    models: dict[str, Sources]
    made: dict[str, tex.Generated]
    waiting: dict[str, tasks.Task]


def read(*, smoke: bool = False) -> Lab:
    models: dict[str, Sources] = {}
    made: dict[str, tex.Generated] = {}
    waiting: dict[str, tasks.Task] = {}
    for name in tasks.names():
        if not any(run["config"].get("study") is None for run in leaderboard.records(name, smoke=smoke)):
            waiting[name] = tasks.get(name)
            continue
        models[name], made[name] = build.generate(name, smoke=smoke)
    if not models:
        raise FileNotFoundError("no model has a run record yet: the lab's paper is drawn from them")
    return Lab(models, made, waiting)


def said(model: str) -> str:
    """A model's name as a sentence says it: its folder's, with spaces."""
    return model.replace("-", " ")


QUESTION = re.compile(r"\*\*The question\.\*\*\s+(.*?\?)", re.DOTALL)
LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")


def question(model: str) -> str:
    """The question a model's card opens with, up to its question mark, or nothing where a card has none."""
    card = paths.model(model) / "README.md"
    found = QUESTION.search(card.read_text(encoding="utf-8")) if card.exists() else None
    return " ".join(LINK.sub(r"\1", found.group(1)).split()) if found else ""


def _listed(names: list[str]) -> str:
    if not names:
        return "none"
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _of(part: int, whole: int, thing: str) -> str:
    """``tex.of`` for a thing named in the singular: one pair, five pairs."""
    return tex.of(part, whole, thing if whole == 1 else thing + "s")


def _score(src: Sources, run: dict[str, Any]) -> float:
    return run["test"][src.primary]["value"]


def step(src: Sources) -> float | None:
    """The reference's step from the floor on the model's own metric, or nothing where it is not a step up."""
    reference, floor = src.reference, src.floor
    if reference is None or floor is None:
        return None
    lift = src.better_by(_score(src, reference), _score(src, floor))
    return lift if lift > 0 else None


def share(src: Sources, run: dict[str, Any]) -> float | None:
    """The share of the reference's step a run makes, in percent: 0 for the floor, 100 for the reference."""
    lift = step(src)
    return None if lift is None else 100.0 * src.better_by(_score(src, run), _score(src, src.floor)) / lift


def on_step(src: Sources, gain: dict[str, Any] | None) -> tuple[float, float, float] | None:
    """A paired gain and its interval in hundredths of the reference's step."""
    lift = step(src)
    if lift is None or gain is None:
        return None
    return (100.0 * gain["gain"] / lift, 100.0 * gain["low"] / lift, 100.0 * gain["high"] / lift)


def _in_order(runs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Runs in the one order every figure of the lab names them, so a run keeps its place from model to model."""
    order = list(charts.RUN_COLOURS)
    return sorted(runs, key=lambda run: (order.index(charts.family(run["run"])) if charts.family(run["run"]) in order else len(order), run["run"]))


def context_run(src: Sources) -> dict[str, Any] | None:
    """The trees that read the context numbers and no hand feature."""
    learners = ((run, run["config"]["learner"]) for run in src.runs)
    return next((run for run, learner in learners if learner["kind"] == "gbm" and learner.get("features") == "context"), None)


def _verdicts(lab: Lab, pick) -> tuple[list[str], list[str], list[str]]:
    """The models where the run ``pick`` names is ahead of the reference beyond the noise, level with it, and behind."""
    ahead, level, behind = [], [], []
    for name, src in lab.models.items():
        run = pick(src)
        gain = run.get("gain") if run is not None else None
        if gain is None:
            continue
        (ahead if gain["beyond_noise"] and gain["gain"] > 0 else behind if gain["beyond_noise"] and gain["gain"] < 0 else level).append(name)
    return ahead, level, behind


def pairs(src: Sources) -> list[dict[str, Any]]:
    """A model's measured pairs, each with the one setting it changes when it changes one of ``KINDS``. A run
    of the games or the features study changes none of them, so its pair has no kind here, and a run that was
    tried as a candidate and then filed under a study of its own (more epochs, another start) keeps its kind.

    The reference set against the trees that read no hand feature is among the pairs of every model: where
    the closer look did not measure that pair, the trees' record holds it from the other side, and the gain
    and its interval change sign."""
    known = changes.records(src)
    found = [dict(entry) for entry in changes.pairs(src) if entry["run"] in known and entry["over"] in known]
    blind, reference = context_run(src), src.reference
    if blind is not None and reference is not None and blind.get("gain"):
        if not any((entry["run"], entry["over"]) == (reference["run"], blind["run"]) for entry in found):
            gain = blind["gain"]
            found.append(
                {"run": reference["run"], "over": blind["run"], "gain": -gain["gain"], "low": -gain["high"], "high": -gain["low"], "beyond_noise": gain["beyond_noise"]}
            )
    for entry in found:
        settings = changes.changed(known[entry["run"]], known[entry["over"]])
        entry["kind"] = KINDS.get(settings[0]) if settings is not None and len(settings) == 1 else None
        entry["learner"] = known[entry["run"]]["config"]["learner"]["kind"]
    return found


def kinds(lab: Lab) -> dict[tuple[str, str], list[tuple[str, dict[str, Any]]]]:
    """Every pair that changes one known setting, by ``(the kind's key, the learner it is made under)``, each with its model."""
    found: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = {}
    for name, src in lab.models.items():
        for entry in pairs(src):
            if entry["kind"] is not None:
                found.setdefault((entry["kind"][0], entry["learner"]), []).append((name, entry))
    # One order whatever a model's files list first: the kinds as ``KINDS`` has them, the trees before a network.
    shorts, learners = [short for short, _ in KINDS.values()], list(UNDER)
    place = lambda key: (shorts.index(key[0]), learners.index(key[1]) if key[1] in learners else len(learners), key[1])  # noqa: E731
    return {key: found[key] for key in sorted(found, key=place)}


def by_base(lab: Lab) -> dict[str, dict[str, dict[str, dict[str, Any]]]]:
    """The same pairs by the run the change was made in: a kind's key, then that run, then the model, to the pair.
    The runs are in the ladder's order, so a table of them reads from the trees to the largest network."""
    found: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    for (key, _), entries in kinds(lab).items():
        for name, entry in entries:
            found.setdefault(key, {}).setdefault(entry["over"], {})[name] = entry
    place = lambda run: (LADDER.index(run) if run in LADDER else len(LADDER), run)  # noqa: E731
    return {key: {run: bases[run] for run in sorted(bases, key=place)} for key, bases in found.items()}


def _tally(better: list[str], level: list[str], worse: list[str]) -> str:
    """Where a change is better, inside the noise and worse, as one clause: each part with its models by
    name, and a part with no model left out."""
    whole = len(better) + len(level) + len(worse)
    parts = [
        f"{words} in {_of(len(group), whole, 'model')} ({_listed([said(name) for name in group])})"
        for words, group in (("better beyond the noise", better), ("inside the noise", level), ("worse beyond the noise", worse))
        if group
    ]
    return _listed(parts)


def _kind_title(key: str, learner: str) -> str:
    words = next(title for short, title in KINDS.values() if short == key)
    return f"{words}, {UNDER.get(learner, 'under ' + learner)}"


def values(lab: Lab, out: tex.Generated) -> None:
    """What the lab as a whole says: how many models, and in how many of them a kind of run beats the trees."""
    every = list(lab.models.values())
    count = len(every)
    out.set("lab.models.count", tex.word(count))
    out.set("lab.models.names", _listed([said(name) for name in lab.models]))
    out.set("lab.tasks.count", tex.word(count + len(lab.waiting)))
    out.set("lab.waiting.count", tex.word(len(lab.waiting)))
    out.set("lab.waiting.names", _listed([said(name) for name in lab.waiting]))
    out.set("lab.runs.count", tex.count(sum(len(src.runs) for src in every)))
    out.set("lab.networks.count", tex.count(sum(len(src.networks) for src in every)))
    out.set("lab.studies.count", tex.count(sum(len(src.studies) for src in every)))
    out.set("lab.cost.seconds", tex.duration(sum(run["seconds"] for src in every for run in src.runs)))
    out.set("lab.cost.seconds.networks", tex.duration(sum(run["seconds"] for src in every for run in src.networks)))
    out.set(
        "lab.cost.seconds.others",
        tex.duration(sum(run["seconds"] for src in every for run in src.runs if run not in src.networks)),
    )
    trained = sorted(run["trained"] for src in every for run in src.runs)
    out.set("lab.results.first", day(trained[0]))
    out.set("lab.results.date", day(trained[-1]))
    method_values(out)
    # A share of the split is said once for the lab only where every model's dataset has it. Where they
    # differ no value is set, and the build stops at the sentence that says it of all of them.
    for side in ("test", "valid"):
        shares = {made.values.get(f"recipe.split.{side}.percent") for made in lab.made.values()}
        if len(shares) == 1 and None not in shares:
            out.set(f"lab.split.{side}.percent", shares.pop())

    picks = {
        "network": lambda src: next(iter(src.networks), None),
        "board": lambda src: src.board_only,
        "small": lambda src: next((run for run in src.networks if run["config"].get("needs") != "cuda"), None),
    }
    for part, pick in picks.items():
        ahead, level, behind = _verdicts(lab, pick)
        compared = len(ahead) + len(level) + len(behind)
        for word, group in (("ahead", ahead), ("level", level), ("behind", behind)):
            out.set(f"lab.{part}.{word}", tex.word(len(group)))
            out.set(f"lab.{part}.{word}.of", _of(len(group), compared, "model"))
            out.set(f"lab.{part}.{word}.names", _listed([said(name) for name in group]))
            # Which runs they are, so prose can say what kind of network is ahead without naming one.
            runs = list(dict.fromkeys(pick(lab.models[name])["run"] for name in group))
            out.set(f"lab.{part}.{word}.runs", _listed([run_tex(run) for run in runs]))
    ladder = [run for src in every for run in src.ladder]
    last = [run for run in ladder if run["learner"]["best_epoch"] == run["config"]["train"]["epochs"]]
    out.set("lab.ladder.count", tex.count(len(ladder)))
    out.set("lab.ladder.at-last-epoch", tex.word(len(last)))
    out.set("lab.ladder.at-last-epoch.of", _of(len(last), len(ladder), "network"))
    top = [name for name, src in lab.models.items() if src.best in src.networks]
    out.set("lab.best.network.of", _of(len(top), count, "model"))
    out.set("lab.best.network.names", _listed([said(name) for name in top]))

    # The ends of each scale, so prose can name the model at each without knowing which it is.
    scales = {
        "context.share": {name: share(src, context_run(src)) for name, src in lab.models.items() if context_run(src) is not None},
        "network.gain": {
            name: on_step(src, src.networks[0].get("gain"))[0]
            for name, src in lab.models.items()
            if src.networks and on_step(src, src.networks[0].get("gain")) is not None
        },
    }
    for part, amounts in scales.items():
        amounts = {name: amount for name, amount in amounts.items() if amount is not None}
        if not amounts:
            continue
        for end, name in (("most", max(amounts, key=amounts.get)), ("least", min(amounts, key=amounts.get))):
            out.set(f"lab.{part}.{end}", tex.fixed(amounts[name], 0))
            out.set(f"lab.{part}.{end}.model", said(name))

    for (key, learner), found in kinds(lab).items():
        prefix = tex.key("lab", "change", key, learner)
        better = [name for name, entry in found if entry["beyond_noise"] and entry["gain"] > 0]
        worse = [name for name, entry in found if entry["beyond_noise"] and entry["gain"] < 0]
        out.set(f"{prefix}.count", tex.word(len(found)))
        out.set(f"{prefix}.better", tex.word(len(better)))
        out.set(f"{prefix}.better.of", _of(len(better), len(found), "pair"))
        out.set(f"{prefix}.worse", tex.word(len(worse)))
        out.set(f"{prefix}.worse.of", _of(len(worse), len(found), "pair"))
        out.set(f"{prefix}.level", tex.word(len(found) - len(better) - len(worse)))
        out.set(f"{prefix}.better.models", _listed(list(dict.fromkeys(said(name) for name in better))))
        out.set(f"{prefix}.worse.models", _listed(list(dict.fromkeys(said(name) for name in worse))))
    # The same by the run the change was made in, where a model has one pair: a clause prose can read whole.
    for key, bases in by_base(lab).items():
        for run, entries in bases.items():
            prefix = tex.key("lab", "change", key, "over", run)
            better = [name for name, entry in entries.items() if entry["beyond_noise"] and entry["gain"] > 0]
            worse = [name for name, entry in entries.items() if entry["beyond_noise"] and entry["gain"] < 0]
            level = [name for name in entries if name not in better and name not in worse]
            out.set(f"{prefix}.count", tex.word(len(entries)))
            out.set(f"{prefix}.models", _listed([said(name) for name in entries]))
            out.set(f"{prefix}.said", _tally(better, level, worse))
            for word, group in (("better", better), ("level", level), ("worse", worse)):
                out.set(f"{prefix}.{word}.of", _of(len(group), len(entries), "model"))
                out.set(f"{prefix}.{word}.models", _listed([said(name) for name in group]))
            amounts = {name: on_step(lab.models[name], entry) for name, entry in entries.items()}
            amounts = {name: amount[0] for name, amount in amounts.items() if amount is not None}
            if amounts:
                for end, name in (("most", max(amounts, key=amounts.get)), ("least", min(amounts, key=amounts.get))):
                    out.set(f"{prefix}.gain.{end}", tex.fixed(amounts[name], 1, sign=True))
                    out.set(f"{prefix}.gain.{end}.model", said(name))


def models_table(lab: Lab) -> str:
    """The models side by side: what each predicts, from how many rows, and what its runs are ranked by."""
    rows = []
    for name, src in lab.models.items():
        data = src.best["dataset"]
        unit = tex.esc(src.task.unit)
        rows.append(
            [
                run_cell(name),
                unit[:1].upper() + unit[1:],
                tex.count(data["rows"]),
                tex.count(data["splits"]["test"]),
                tex.count(src.best["test_groups"]),
                f"{METRIC_NAMES[src.primary]}, {'lower' if src.task.lower_is_better else 'higher'} is better",
            ]
        )
    head = ["Model", "Predicts", "Rows", "Test rows", "Test games", "Ranked by"]
    name = ">{\\raggedright\\arraybackslash}p{2.3cm}"
    return tex.tabular(f"{name}Lrrr>{{\\raggedright\\arraybackslash}}p{{2.4cm}}", head, rows, width="\\textwidth")


def scores_table(lab: Lab) -> str:
    """Each model's rungs in its own units: the floor, the trees without and with the hand features, and the
    best network with its paired gain over the reference, in those units and on the one scale."""
    rows = []
    for name, src in lab.models.items():
        blind, network = context_run(src), next(iter(src.networks), None)
        gain = network.get("gain") if network is not None else None
        amounts = on_step(src, gain)
        rows.append(
            [
                run_cell(name),
                METRIC_NAMES[src.primary],
                tex.score(_score(src, src.floor)) if src.floor is not None else "",
                tex.score(_score(src, blind)) if blind is not None else "",
                tex.score(_score(src, src.reference)) if src.reference is not None else "",
                run_cell(network["run"]) if network is not None else "",
                tex.score(_score(src, network)) if network is not None else "",
                tex.bold(tex.sig(gain["gain"], 4, sign=True), gain["beyond_noise"]) if gain else "",
                tex.fixed(amounts[0], 1, sign=True) if amounts is not None else "",
            ]
        )
    head = ["Model", "Metric", "Floor", "Context", "Reference", "Best network", "Score", "Gain", "Of the step"]
    name = ">{\\raggedright\\arraybackslash}p{2.2cm}"
    return tex.tabular(f"{name}lrrr>{{\\raggedright\\arraybackslash}}p{{2.5cm}}rrr", head, rows)


def shares_figure(lab: Lab) -> str | None:
    """Where every run of the ladder and every run that fits nothing stands between the floor and the reference."""
    rows = []
    for name, src in lab.models.items():
        if step(src) is None:
            continue
        shown = [run for run in src.runs if run is not src.floor and run is not src.reference and not charts.variant(run["run"])]
        rows.append((name, [(run["run"], share(src, run)) for run in _in_order(shown)]))
    if not rows:
        return None
    # A run keeps its lane from strip to strip, and a run a model lacks leaves its lane empty.
    order = [run for run in charts.RUN_COLOURS if any(run == name for _, points in rows for name, _ in points)]
    return charts.strips(
        rows,
        xlabel="Share of the step from the floor to the reference (\\%)",
        marks=[(0.0, "floor"), (100.0, "reference")],
        order=order,
    )


def networks_figure(lab: Lab) -> str | None:
    """Each network of the ladder against the reference, model by model, on the one scale."""
    groups = []
    for name, src in lab.models.items():
        rows = [
            (run["run"], *on_step(src, run["gain"]), charts.run_colour(run["run"]))
            for run in _in_order(src.ladder)
            if run.get("gain") and step(src) is not None
        ]
        if rows:
            groups.append((said(name), rows))
    if not groups:
        return None
    return charts.grouped_intervals(
        groups,
        xlabel="Gain over the reference, in hundredths of its step from the floor (right of the line is better)",
        reference=0.0,
        reference_label="reference",
    )


def changes_figure(lab: Lab) -> str | None:
    """One change in model after model: each pair's gain on the one scale, a group a kind of change."""
    groups = []
    for (key, learner), found in kinds(lab).items():
        rows = []
        for name, entry in found:
            amounts = on_step(lab.models[name], entry)
            if amounts is not None:
                rows.append((f"{said(name)}: {entry['run']}", *amounts, charts.run_colour(entry["run"])))
        if rows:
            groups.append((_kind_title(key, learner), rows))
    if not groups:
        return None
    return charts.grouped_intervals(
        groups,
        xlabel="Gain of the run over the run it changes, in hundredths of the reference's step (right of the line is better)",
        reference=0.0,
        code=False,
        width="0.5\\textwidth",
    )


def changes_table(lab: Lab) -> str | None:
    """The same pairs as a table: a kind of change a block, a model a row, and a column for each run the
    change was made in. A cell is the changed run's paired gain over that run on the one scale with its
    interval, bold when the interval leaves zero out. The gain in a model's own units is in that model's paper."""
    blocks = by_base(lab)
    if not blocks:
        return None
    widest = max(len(bases) for bases in blocks.values())
    rows: list[list[str]] = []
    for key, bases in blocks.items():
        if rows:
            rows.append(["\\addlinespace"])
        title = next(words for short, words in KINDS.values() if short == key)
        rows.append([f"\\multicolumn{{{1 + 2 * widest}}}{{l}}{{\\textbf{{{title}}}}}"])
        heads = [f"\\multicolumn{{2}}{{c}}{{over {run_tex(run)}}}" for run in bases]
        rows.append(["", *heads, *["\\multicolumn{2}{c}{}"] * (widest - len(bases))])
        for name in lab.models:
            if not any(name in entries for entries in bases.values()):
                continue
            cells: list[str] = []
            for entries in bases.values():
                entry = entries.get(name)
                amounts = on_step(lab.models[name], entry) if entry is not None else None
                if amounts is None:
                    cells += ["", ""]
                    continue
                cells += [
                    tex.bold(tex.fixed(amounts[0], 1, sign=True), entry["beyond_noise"]),
                    f"{tex.fixed(amounts[1], 1, sign=True)} to {tex.fixed(amounts[2], 1, sign=True)}",
                ]
            rows.append([run_cell(name), *cells, *[""] * (2 * (widest - len(bases)))])
    head = ["Model", *["Gain", "95\\% interval"] * widest]
    table = tex.tabular(f">{{\\raggedright\\arraybackslash}}p{{3.4cm}}{'rr' * widest}", head, rows)
    return table.replace("\\addlinespace \\\\", "\\addlinespace")


def cost_table(lab: Lab) -> str:
    """What the runs cost to train: how many, how long, and on what."""
    rows = []
    for name, src in lab.models.items():
        networks = src.networks
        others = [run for run in src.runs if run not in networks]
        devices = sorted({trained_on(run) for run in networks})
        rows.append(
            [
                run_cell(name),
                tex.count(len(src.runs)),
                tex.duration(sum(run["seconds"] for run in others)),
                tex.count(len(networks)),
                tex.duration(sum(run["seconds"] for run in networks)) if networks else "",
                tex.esc(", ".join(devices)),
            ]
        )
    head = ["Model", "Runs", "Trees and baselines", "Networks", "Their training", "On"]
    return tex.tabular(">{\\raggedright\\arraybackslash}p{2.6cm}rrrrl", head, rows)


def waiting_table(lab: Lab) -> str | None:
    """The models that have a task and no full run yet."""
    if not lab.waiting:
        return None
    rows = []
    for name, task in lab.waiting.items():
        unit = tex.esc(task.unit)
        rows.append([run_cell(name), tex.esc(question(name)), unit[:1].upper() + unit[1:], METRIC_NAMES[task.primary]])
    head = ["Model", "The question on its card", "Predicts", "Ranked by"]
    return tex.tabular(">{\\raggedright\\arraybackslash}p{3.2cm}LLl", head, rows, width="\\textwidth")


def blocks(lab: Lab, out: tex.Generated) -> None:
    made = {
        "lab-models": models_table(lab),
        "lab-scores": scores_table(lab),
        "lab-shares": shares_figure(lab),
        "lab-networks": networks_figure(lab),
        "lab-changes": changes_table(lab),
        "lab-changes-figure": changes_figure(lab),
        "lab-cost": cost_table(lab),
        "lab-waiting": waiting_table(lab),
    }
    for name, latex in made.items():
        if latex is not None:
            out.block(name, latex)


def generate(*, smoke: bool = False) -> tuple[Lab, tex.Generated]:
    """Everything the lab's paper can read: every model's values and blocks under its name, and the lab's own."""
    lab = read(smoke=smoke)
    out = tex.Generated(f"`lab paper{' --smoke' if smoke else ''}`")
    for name, made in lab.made.items():
        for key, value in made.values.items():
            out.set(f"{name}.{key}", value)
        for block, latex in made.files.items():
            out.block(f"{name}-{block}", latex)
    values(lab, out)
    blocks(lab, out)
    return lab, out


def switches(lab: Lab) -> dict[str, bool]:
    """What the lab's prose may ask before it reads: whether a model is still waiting for its runs, and
    whether a kind of change has a pair measured in some model."""
    measured = {key for key, _ in kinds(lab)}
    studied = {run["config"]["study"] for src in lab.models.values() for run in src.studies}
    return {
        "waiting": bool(lab.waiting),
        **{f"change{short}": short in measured for short, _ in KINDS.values()},
        **{study: study in studied for study in STUDIES},
    }


def prose() -> str:
    """The lab paper's typed words, without their comments."""
    path = paths.lab_paper() / "paper.tex"
    if not path.exists():
        raise FileNotFoundError(f"{path} is not written yet: `lab paper --list` shows the values and blocks it can read")
    return build.COMMENT.sub("", path.read_text(encoding="utf-8"))


def write(*, smoke: bool = False) -> Path:
    """Writes the generated folder of the lab's paper, and for a smoke build the prose beside it. Returns the paper's folder."""
    lab, out = generate(smoke=smoke)
    text = prose()
    flags = switches(lab)
    if not smoke:
        missing = build.missing(build.firm(text, flags), out)
        if missing:
            raise KeyError(
                f"the lab's paper reads what the models' files do not give: {', '.join(missing)}. `lab paper --list` shows what there is"
            )
    folder = paths.lab_paper(smoke=smoke)
    lines = [f"\\{name}{'true' if on else 'false'}" for name, on in flags.items()] + (["\\lablenienttrue"] if smoke else [])
    out.write(folder / "generated", keys=tex.used_keys(text), blocks=tex.used_blocks(text), flags=lines)
    if smoke:
        shutil.copy(paths.lab_paper() / "paper.tex", folder / "paper.tex")
        for part in [*paths.papers().glob("*.tex"), *paths.papers().glob("*.bib")]:
            shutil.copy(part, folder.parent / part.name)
    return folder


def listing(*, smoke: bool = False) -> str:
    """Every value and block the lab's paper can read, for whoever writes its prose."""
    _, out = generate(smoke=smoke)
    width = max(map(len, out.values), default=0)
    lines = [f"{name:<{width}}  {value}" for name, value in sorted(out.values.items())]
    return "\n".join([*lines, "", "blocks: " + " ".join(sorted(out.files))])
