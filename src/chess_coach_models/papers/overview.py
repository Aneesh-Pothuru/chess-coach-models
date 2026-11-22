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

A model the lab has for its body (``purpose: body`` in its task) is trained
to be started from, and its answer is an engine's, not a statement about
people. It is listed, costed and given its leaderboard with the rest, and it
is counted in no statement of how the models compare: those are made of the
models set side by side. What the prose says of such a model stands inside
``\\ifbodies``.

A model with a task and no run yet is listed as waiting, and what the prose
says of waiting models stands inside ``\\ifwaiting``. What it says of one kind
of change stands inside that kind's switch (``\\ifchangeepochs``,
``\\ifchangestart``), on while a pair of that kind is measured in some model,
and what it says of a study inside ``\\ifgames`` and ``\\iffeatures``, on
while some model has a run of that study.

A network of another shape than the run it changes is a kind of change as
well: another body under the same head (``\\ifchangeconv``,
``\\ifchangehybrid``), the same body larger (``\\ifchangelarger``), or
attention told more or less of the board (``\\ifchangeattacks``,
``\\ifchangegeometry``). Those kinds have a table and a figure of their own
(``lab-shapes``), and what the prose says of them together stands inside
``\\ifshapes``, on while a pair of any of them is measured.
"""

from __future__ import annotations

import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .. import paths, tasks
from ..evals import leaderboard
from ..evals.metrics import SETS
from ..encode.hand import GROUPS as GROUP_FEATURES
from . import build, changes, charts, glossary, tex
from .results import day, method_values, trained_on
from .sources import METRIC_NAMES, STUDIES, Sources, run_head, run_tex


# One kind of change measured in model after model (``changes.kind``), as a table's block and a figure's
# group name it, in the order a table has the kinds.
TITLES = {
    "hand": "The hand features",
    "epochs": "More epochs",
    "start": "A body that learned an engine's evaluations first",
    "conv": "A convolutional tower for the transformer",
    "hybrid": "Convolutions under the transformer's layers",
    "larger": "A larger network of the same body",
    "attacks": "Attention told what each piece attacks",
    "geometry": "Attention without the offsets between squares",
}
# The kinds that change what a run reads or how it is trained have the table and the figure of changes,
# and the kinds that change a network's shape (``changes.SHAPES``) a table and a figure of their own.
CHANGES = tuple(key for key in TITLES if key not in changes.SHAPES)
# What a learner is called where a change is said to be made under it.
UNDER = {"gbm": "under the trees", "net": "under a network"}
# A share of the training games in a key, or a multiple of them for a run on a larger build of the dataset.
SHARE_KEYS = {4.0: "quadruple", 2.0: "double", 0.5: "half", 0.25: "quarter"}
# The ladder from its floor up: the order a table names the runs a change was made in.
LADDER = ("constant", "gbm-context", "gbm-hand", "conv-small", "transformer-small", "transformer-medium", "transformer-medium-hand")


@dataclass
class Lab:
    """Every model with a run: its sources and what its own paper can read. And the tasks still waiting for one.

    ``models`` are the ones the paper sets side by side: the lab has them for their answer. ``bodies`` are the
    ones it has for their body, which other models start from."""

    models: dict[str, Sources]
    made: dict[str, tex.Generated]
    waiting: dict[str, tasks.Task]
    bodies: dict[str, Sources] = field(default_factory=dict)

    @property
    def every(self) -> dict[str, Sources]:
        """Every model with a run: the ones set side by side, then the ones the lab has for their body."""
        return {**self.models, **self.bodies}


def read(*, smoke: bool = False) -> Lab:
    models: dict[str, Sources] = {}
    bodies: dict[str, Sources] = {}
    made: dict[str, tex.Generated] = {}
    waiting: dict[str, tasks.Task] = {}
    for name in tasks.names():
        task = tasks.get(name)
        if not any(run["config"].get("study") is None for run in leaderboard.records(name, smoke=smoke)):
            waiting[name] = task
            continue
        (models if task.purpose == "answer" else bodies)[name], made[name] = build.generate(name, smoke=smoke)
    if not models:
        raise FileNotFoundError("no model has a run record yet: the lab's paper is drawn from them")
    return Lab(models, made, waiting, bodies)


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


def paperless(lab: Lab) -> list[str]:
    """The models set side by side that have no paper of their own: the ones no prose is written for."""
    return [name for name in lab.models if not (paths.paper(name) / "paper.tex").exists()]


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


def _largest_board(src: Sources) -> dict[str, Any] | None:
    """The largest network of a model's ladder that reads the board and no hand feature."""
    plain = [run for run in src.ladder if run["config"]["learner"].get("features") != "hand"]
    return max(plain, key=lambda run: run["learner"]["parameters"], default=None)


def _kept(src: Sources, entry: dict[str, Any]) -> bool:
    """Whether a pair's first run is kept by the lab's rule for a change: better than the run it changed on the
    valid rows, and on the test rows beyond the noise."""
    known = changes.records(src)
    ahead = changes.valid_gain(src, known[entry["run"]], known[entry["over"]])
    return ahead is not None and changes.kept(entry, ahead)


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
    """A model's measured pairs, each with the kind of change it makes (``changes.kind``). A run of the games
    or the features study makes none of them, so its pair has no kind here, and a run that was tried as a
    candidate and then filed under a study of its own (more epochs, another start) keeps its kind.

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
        entry["kind"] = changes.kind(known[entry["run"]], known[entry["over"]])
        entry["learner"] = known[entry["run"]]["config"]["learner"]["kind"]
    return found


def kinds(lab: Lab) -> dict[tuple[str, str], list[tuple[str, dict[str, Any]]]]:
    """Every pair of a known kind, by ``(the kind, the learner it is made under)``, each with its model."""
    found: dict[tuple[str, str], list[tuple[str, dict[str, Any]]]] = {}
    for name, src in lab.models.items():
        for entry in pairs(src):
            if entry["kind"] is not None:
                found.setdefault((entry["kind"], entry["learner"]), []).append((name, entry))
    # One order whatever a model's files list first: the kinds as ``TITLES`` has them, the trees before a network.
    shorts, learners = list(TITLES), list(UNDER)
    place = lambda key: (shorts.index(key[0]), learners.index(key[1]) if key[1] in learners else len(learners), key[1])  # noqa: E731
    return {key: found[key] for key in sorted(found, key=place)}


def by_base(lab: Lab) -> dict[str, dict[str, dict[str, dict[str, Any]]]]:
    """The same pairs by the run the change was made in: a kind's key, then that run, then the model, to the pair.
    The runs are in the ladder's order, so a table of them reads from the trees to the largest network."""
    found: dict[str, dict[str, dict[str, dict[str, Any]]]] = {}
    for (key, _), entries in kinds(lab).items():
        for name, entry in entries:
            found.setdefault(key, {}).setdefault(entry["over"], {})[name] = entry
    return {key: {run: bases[run] for run in sorted(bases, key=_rung)} for key, bases in found.items()}


def _rung(run: str) -> tuple[int, str]:
    """A run's place on the ladder, for an order that reads from the trees to the largest network."""
    return (LADDER.index(run) if run in LADDER else len(LADDER), run)


def games(lab: Lab) -> dict[str, dict[float, dict[str, dict[str, Any]]]]:
    """The games study across the models: the run whose games were changed, then how many of them a run was
    given (a share, or a multiple from a larger build of the dataset), then the model, to the pair of that
    run over the run on all the games. The most games first."""
    found: dict[str, dict[float, dict[str, dict[str, Any]]]] = {}
    for name, src in lab.models.items():
        for base, runs in changes.games_runs(src).items():
            for share, run in runs:
                entry = changes.pair(src, run["run"], base)
                if entry is not None:
                    found.setdefault(base, {}).setdefault(share, {})[name] = entry
    return {base: {part: found[base][part] for part in sorted(found[base], reverse=True)} for base in sorted(found, key=_rung)}


def features(lab: Lab) -> dict[str, dict[str, dict[str, Any]]]:
    """The features study across the models, under each model's reference: a group of hand features, then
    the model, to the pair of the run without the group over the run that reads them all. The groups come
    in the order the hand features list them. A study on another run is read in its model's own paper."""
    found: dict[str, dict[str, dict[str, Any]]] = {}
    for name, src in lab.models.items():
        for run in src.studies:
            config = run["config"]
            left_out = config["learner"].get("without") or []
            if config["study"] != "features" or config.get("base") != src.task.reference or len(left_out) != 1:
                continue
            entry = changes.pair(src, run["run"], config["base"])
            if entry is not None:
                found.setdefault(left_out[0], {})[name] = entry
    order = list(GROUP_FEATURES)
    return {group: found[group] for group in sorted(found, key=lambda group: (order.index(group) if group in order else len(order), group))}


SIDES = ("test", "valid")


def split_apart(lab: Lab) -> tuple[tuple[Any, ...], dict[str, tuple[Any, ...]]]:
    """The shares of games that most models' datasets keep for the test and the valid side, and each model
    whose dataset keeps other shares, with its own."""
    splits = {name: tuple(made.values.get(f"recipe.split.{side}.percent") for side in SIDES) for name, made in lab.made.items()}
    counted: dict[tuple[Any, ...], int] = {}
    for split in splits.values():
        counted[split] = counted.get(split, 0) + 1
    usual = max(counted, key=lambda split: counted[split]) if counted else (None, None)
    return usual, {name: split for name, split in splits.items() if split != usual}


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
    return f"{TITLES[key]}, {UNDER.get(learner, 'under ' + learner)}"


def values(lab: Lab, out: tex.Generated) -> None:
    """What the lab as a whole says: how many models, and in how many of them a kind of run beats the trees."""
    every = list(lab.every.values())
    out.set("lab.models.count", tex.word(len(every)))
    out.set("lab.models.names", _listed([said(name) for name in lab.every]))
    # The models set side by side, which every count of how the models compare is made of, and the ones the
    # lab has for their body, which no such count holds.
    count = len(lab.models)
    out.set("lab.side.count", tex.word(count))
    out.set("lab.side.names", _listed([said(name) for name in lab.models]))
    out.set("lab.bodies.count", tex.word(len(lab.bodies)))
    out.set("lab.bodies.names", _listed([said(name) for name in lab.bodies]))
    out.set("lab.tasks.count", tex.word(len(every) + len(lab.waiting)))
    out.set("lab.waiting.count", tex.word(len(lab.waiting)))
    out.set("lab.waiting.names", _listed([said(name) for name in lab.waiting]))
    out.set("lab.paperless.names", _listed([said(name) for name in paperless(lab)]))
    out.set("lab.runs.count", tex.count(sum(len(src.runs) for src in every)))
    out.set("lab.networks.count", tex.count(sum(len(src.networks) for src in every)))
    out.set("lab.studies.count", tex.count(sum(len(src.studies) for src in every)))
    out.set("lab.cost.seconds", tex.duration(sum(run["seconds"] for src in every for run in src.runs)))
    out.set("lab.cost.seconds.networks", tex.duration(sum(run["seconds"] for src in every for run in src.networks)))
    out.set(
        "lab.cost.seconds.others",
        tex.duration(sum(run["seconds"] for src in every for run in src.runs if run not in src.networks)),
    )
    out.set("lab.cost.seconds.studies", tex.duration(sum(run["seconds"] for src in every for run in src.studies)))
    trained = sorted(run["trained"] for src in every for run in src.runs)
    out.set("lab.results.first", day(trained[0]))
    out.set("lab.results.date", day(trained[-1]))
    method_values(out)
    # A share of the split is said once for the lab, where the datasets agree. A model whose dataset is split
    # otherwise is named apart, and the lab's shares are those of the others. The shares of the models apart
    # are said once too where they agree among themselves. Where they do not, no value is set, and the build
    # stops at the sentence that says it of all of them.
    usual, apart = split_apart(lab)
    for side, percent in zip(SIDES, usual, strict=True):
        if percent is not None:
            out.set(f"lab.split.{side}.percent", percent)
    if apart:
        out.set("lab.split.apart.names", _listed([said(name) for name in apart]))
        theirs = {split for split in apart.values()}
        if len(theirs) == 1:
            for side, percent in zip(SIDES, theirs.pop(), strict=True):
                if percent is not None:
                    out.set(f"lab.split.apart.{side}.percent", percent)

    picks = {
        "network": lambda src: next(iter(src.networks), None),
        "board": lambda src: src.board_only,
        "small": lambda src: next((run for run in src.networks if run["config"].get("needs") != "cuda"), None),
        # The ladder's largest network that reads no hand feature: where the board alone stood before any
        # run changed a thing in it, so prose can say what a change to that network turned round.
        "ladder.board": _largest_board,
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
    ladder = [run for src in lab.models.values() for run in src.ladder]
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
    # A model that is read against one that is shown more (``shown`` in its plan) hides part of what its
    # data has from every learner. Its trees' step is small for that reason, and a gain counted in that
    # step is large for the same one. So each scale's ends are also given over the models that hide
    # nothing, under ``whole``, and prose can say which statement holds for which.
    hidden = [name for name, src in lab.models.items() if src.plan.get("shown")]
    out.set("lab.hidden.count", tex.word(len(hidden)))
    out.set("lab.hidden.names", _listed([said(name) for name in hidden]))
    out.set("lab.whole.count", tex.word(count - len(hidden)))
    for part, amounts in scales.items():
        amounts = {name: amount for name, amount in amounts.items() if amount is not None}
        for scope, kept in (("", amounts), (".whole", {name: amount for name, amount in amounts.items() if name not in hidden})):
            if not kept:
                continue
            for end, name in (("most", max(kept, key=kept.get)), ("least", min(kept, key=kept.get))):
                out.set(f"lab.{part}{scope}.{end}", tex.fixed(kept[name], 0))
                out.set(f"lab.{part}{scope}.{end}.model", said(name))

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
        # Better on the test rows is half of the rule for a change. How many pairs pass both halves, and in
        # which models every pair of the kind does: those changed runs are runs of their models now.
        passed = [name for name, entry in found if _kept(lab.models[name], entry)]
        whole = [name for name in dict.fromkeys(passed) if passed.count(name) == sum(1 for other, _ in found if other == name)]
        out.set(f"{prefix}.kept", tex.word(len(passed)))
        out.set(f"{prefix}.kept.of", _of(len(passed), len(found), "pair"))
        out.set(f"{prefix}.kept.models", _listed(list(dict.fromkeys(said(name) for name in passed))))
        out.set(f"{prefix}.kept.whole.models", _listed([said(name) for name in whole]))
    # The same by the run the change was made in, where a model has one pair: a clause prose can read whole.
    for key, bases in by_base(lab).items():
        for run, entries in bases.items():
            _across(lab, out, tex.key("lab", "change", key, "over", run), entries)
    # The two studies the same way: a share of the games under each run it was taken from, and a group of
    # hand features left out of the reference.
    for base, parts in games(lab).items():
        for part, entries in parts.items():
            _across(lab, out, tex.key("lab", "games", base, SHARE_KEYS.get(part, f"share-{round(100 * part)}")), entries)
    left_out = features(lab)
    for group, entries in left_out.items():
        _across(lab, out, tex.key("lab", "features", group), entries)
    for name, src in lab.models.items():
        mine = {group: entries[name] for group, entries in left_out.items() if name in entries}
        if not mine:
            continue
        prefix = tex.key("lab", "features", "in", name)
        costly = [group for group, entry in mine.items() if entry["beyond_noise"] and entry["gain"] < 0]
        out.set(f"{prefix}.groups", tex.word(len(mine)))
        out.set(f"{prefix}.worse.of", _of(len(costly), len(mine), "group"))
        most = min(mine, key=lambda group: mine[group]["gain"])
        out.set(f"{prefix}.most.group", glossary.group(most))
        amounts = on_step(src, mine[most])
        if amounts is not None:
            out.set(f"{prefix}.most.gain", tex.fixed(amounts[0], 1, sign=True))


def _across(lab: Lab, out: tex.Generated, prefix: str, entries: dict[str, dict[str, Any]]) -> None:
    """One pair measured in several models, under ``prefix``: in which of them the first run is better beyond
    the noise, inside it or worse, as a clause prose can read whole, and the two ends on the one scale."""
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
    """Every model with a run: what each predicts, from how many rows, and what its runs are ranked by."""
    rows = []
    for name, src in lab.every.items():
        data = src.best["dataset"]
        unit = tex.esc(src.task.unit)
        rows.append(
            [
                run_tex(name),
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
                run_tex(name),
                METRIC_NAMES[src.primary],
                tex.score(_score(src, src.floor)) if src.floor is not None else "",
                tex.score(_score(src, blind)) if blind is not None else "",
                tex.score(_score(src, src.reference)) if src.reference is not None else "",
                run_tex(network["run"]) if network is not None else "",
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
    """Each network on a model's leaderboard against the reference, model by model, on the one scale: the
    ladder's, and under each of them the runs that changed one thing in it and stand on the leaderboard."""
    groups = []
    for name, src in lab.models.items():
        rows = [
            (run["run"], *on_step(src, run["gain"]), charts.run_colour(run["run"]))
            for run in _in_order(src.networks)
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


def changes_figure(lab: Lab, keys: tuple[str, ...] = CHANGES) -> str | None:
    """One change in model after model: each pair's gain on the one scale, a group a kind of change. The
    kinds are the ones ``keys`` names: the changes to what a run reads or how it is trained, or the shapes."""
    groups = []
    for (key, learner), found in kinds(lab).items():
        if key not in keys:
            continue
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


def changes_table(lab: Lab, keys: tuple[str, ...] = CHANGES) -> str | None:
    """The same pairs as a table: a kind of change a block, a model a row, and a column for each run the
    change was made in. A cell is the changed run's paired gain over that run on the one scale with its
    interval, bold when the interval leaves zero out. The gain in a model's own units is in that model's paper."""
    blocks = {key: bases for key, bases in by_base(lab).items() if key in keys}
    if not blocks:
        return None
    widest = max(len(bases) for bases in blocks.values())
    rows: list[list[str]] = []
    for key, bases in blocks.items():
        if rows:
            rows.append(["\\addlinespace"])
        rows.append([f"\\multicolumn{{{1 + 2 * widest}}}{{l}}{{\\textbf{{{TITLES[key]}}}}}"])
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
            rows.append([run_tex(name), *cells, *[""] * (2 * (widest - len(bases)))])
    head = ["Model", *["Gain", "95\\% interval"] * widest]
    table = tex.tabular(f">{{\\raggedright\\arraybackslash}}p{{3.4cm}}{'rr' * widest}", head, rows)
    return table.replace("\\addlinespace \\\\", "\\addlinespace")


def _cell(lab: Lab, name: str, entry: dict[str, Any] | None) -> str:
    """A pair's gain on the one scale in a table's cell, bold when its interval leaves zero out, or nothing."""
    amounts = on_step(lab.models[name], entry) if entry is not None else None
    return "" if amounts is None else tex.bold(tex.fixed(amounts[0], 1, sign=True), entry["beyond_noise"])


def games_table(lab: Lab) -> str | None:
    """The games study across the models: a model a row, and for each run the study was made on, the gain of
    the run on a share of the training games, or on a multiple of them, over the run on all of them, on the
    one scale."""
    found = games(lab)
    if not found:
        return None
    columns = [(base, part) for base, parts in found.items() for part in parts]
    rows = [
        [run_tex(name), *[_cell(lab, name, found[base][part].get(name)) for base, part in columns]]
        for name in lab.models
        if any(name in found[base][part] for base, part in columns)
    ]
    head = ["Model", *[changes.share_words(part).capitalize() for _, part in columns]]
    table = tex.tabular(f">{{\\raggedright\\arraybackslash}}p{{3.4cm}}{'r' * len(columns)}", head, rows)
    top, spans, first = [""], [], 2
    for base, parts in found.items():
        top.append(f"\\multicolumn{{{len(parts)}}}{{c}}{{{run_tex(base)} on}}")
        spans.append((first, first + len(parts) - 1))
        first += len(parts)
    return tex.grouped(table, top, spans)


def games_figure(lab: Lab, *, more: bool = False) -> str | None:
    """The same pairs with their intervals: a group a run and a share of its training games, a row a model.
    The runs on fewer games than the run they change are one figure and the runs on more (``more``) another,
    since the two together are taller than a page."""
    groups = []
    for base, parts in games(lab).items():
        for part, entries in parts.items():
            if (part > 1) != more:
                continue
            rows = [
                (said(name), *amounts, charts.run_colour(base))
                for name, entry in entries.items()
                if (amounts := on_step(lab.models[name], entry)) is not None
            ]
            if rows:
                groups.append((f"{base} on {changes.games_words(part, 'the games')}", rows))
    if not groups:
        return None
    return charts.grouped_intervals(
        groups,
        xlabel="Gain over the run on all the games, in hundredths of the reference's step "
        + ("(right of the line is better)" if more else "(left of the line is worse)"),
        reference=0.0,
        code=False,
        width="0.5\\textwidth",
    )


def features_table(lab: Lab) -> str | None:
    """The features study across the models: a group of hand features a row, a model a column, and in a cell
    the gain of the reference without the group over the reference with it, on the one scale. A model whose
    hand features have no such group leaves its cell empty."""
    found = features(lab)
    if not found:
        return None
    models = [name for name in lab.models if any(name in entries for entries in found.values())]
    rows = []
    for group, entries in found.items():
        words = glossary.group(group)
        rows.append([words[:1].upper() + words[1:], str(len(GROUP_FEATURES[group])), *[_cell(lab, name, entries.get(name)) for name in models]])
    head = ["Left out", "Features", *[run_head(name, 1, "1.9cm") for name in models]]
    return tex.tabular(f">{{\\raggedright\\arraybackslash}}p{{4.3cm}}r{'r' * len(models)}", head, rows)


def cost_table(lab: Lab) -> str:
    """What the runs cost to train, by kind: how many and how long for the floor, the baselines and the trees,
    for the networks with what they were trained on, and for the study runs once a model has some, which no
    leaderboard ranks."""
    studied = any(src.studies for src in lab.every.values())

    def cost(runs: list[dict[str, Any]]) -> list[str]:
        return [tex.count(len(runs)), tex.duration(sum(run["seconds"] for run in runs)) if runs else ""]

    rows = []
    for name, src in lab.every.items():
        networks = src.networks
        devices = sorted({trained_on(run) for run in networks})
        row = [run_tex(name), *cost([run for run in src.runs if run not in networks]), *cost(networks), tex.esc(", ".join(devices))]
        rows.append([*row, *(cost(src.studies) if studied else [])])
    # The first title on two lines: on one it is wider than its two columns need, and takes room from the last.
    groups = ["\\parbox[b]{2.4cm}{\\centering Floor, baselines and trees}", "Networks", *(["Study runs"] if studied else [])]
    head = ["Model", "Runs", "Training", "Runs", "Training", "On", *(["Runs", "Training"] if studied else [])]
    spec = f">{{\\raggedright\\arraybackslash}}p{{2.6cm}}rrrrL{'rr' if studied else ''}"
    table = tex.tabular(spec, head, rows, width="\\textwidth")
    spans = [(2, 3), (4, 6), *([(7, 8)] if studied else [])]
    top = ["", *[f"\\multicolumn{{{last - first + 1}}}{{c}}{{{title}}}" for title, (first, last) in zip(groups, spans)]]
    return tex.grouped(table, top, spans)


def waiting_table(lab: Lab) -> str | None:
    """The models that have a task and no full run yet."""
    if not lab.waiting:
        return None
    rows = []
    for name, task in lab.waiting.items():
        unit = tex.esc(task.unit)
        rows.append([run_tex(name), tex.esc(question(name)), unit[:1].upper() + unit[1:], METRIC_NAMES[task.primary]])
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
        "lab-shapes": changes_table(lab, changes.SHAPES),
        "lab-shapes-figure": changes_figure(lab, changes.SHAPES),
        "lab-games": games_table(lab),
        "lab-games-figure": games_figure(lab),
        "lab-games-more-figure": games_figure(lab, more=True),
        "lab-features": features_table(lab),
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
    """What the lab's prose may ask before it reads: whether a model is still waiting for its runs, whether
    a kind of change has a pair measured in some model, whether any of the kinds that change a network's
    shape has (``shapes``), whether a model has runs of the games or the features study, whether any has a
    study run at all, whether any has a run on more games than the run it changes (``more``), whether some
    model's dataset is split by other shares than most (``splitapart``), and whether a model with a run is
    one the lab has for its body (``bodies``). And whether a model of another kind than one number for a
    row of one position has runs: an answer that is a set (``answersets``), which is a chance for each
    square (``answersquares``) or for each tag (``answertags``), an answer that is a move
    (``answermoves``), a row that is a sequence of positions (``rowsequences``). Each kind has its own
    switch, so the words for one stand when the models of another have no run yet. And whether a model
    set side by side has no paper of its own (``paperless``)."""
    measured = {key for key, _ in kinds(lab)}
    studied = {run["config"]["study"] for src in lab.every.values() for run in src.studies}
    answers = {src.task.kind for src in lab.models.values()}
    return {
        "waiting": bool(lab.waiting),
        "answersets": bool(answers & set(SETS)),
        "answersquares": "squares" in answers,
        "answertags": "tags" in answers,
        "answermoves": "moves" in answers,
        "rowsequences": any(src.sequence for src in lab.models.values()),
        "paperless": bool(paperless(lab)),
        **{f"change{short}": short in measured for short in TITLES},
        "shapes": any(short in measured for short in changes.SHAPES),
        **{study: study in studied for study in STUDIES},
        "studies": bool(studied),
        "more": any(changes.more(src) for src in lab.models.values()),
        "splitapart": bool(split_apart(lab)[1]),
        "bodies": bool(lab.bodies),
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
