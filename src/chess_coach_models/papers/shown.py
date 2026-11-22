"""A model read against the model that is shown more.

One model can ask another's question with something hidden: the same rows, the
same label, the same test rows, and less for a learner to read (``tasks.py``).
Its analysis plan names that other model as ``shown``. A run here and the run
of the same name there then differ in one thing, what the learner is shown,
and how much better the run there scores is what the thing shown is worth to
that learner.

The scores are the two leaderboards', so the table is drawn wherever the
records are (``\\ifshown``). The paired gain on the same resampled test rows,
and the same gain inside each slice of the plan, are the closer look's
(``evals/analysis.py``) and are printed where a look has measured them
(``\\ifshownpaired``).
"""

from __future__ import annotations

from typing import Any

from .. import tasks
from ..evals import leaderboard
from . import charts, tex
from .sources import METRIC_NAMES, METRIC_WORDS, Sources, run_cell, run_tex


def other(src: Sources) -> list[dict[str, Any]]:
    """The runs of the model this one is read against, best first: none where the plan names no model, or the
    model it names has no run yet."""
    name = src.plan.get("shown")
    if not name:
        return []
    task = tasks.get(name)
    runs = [
        run
        for run in leaderboard.ranked(task, leaderboard.records(name, smoke=src.smoke))
        if run["config"].get("study") is None
    ]
    builds = {run["dataset"].get("fingerprint") for run in [*runs, *src.runs]}
    if runs and len(builds) > 1:
        raise ValueError(
            f"{src.model} is read against {name}, and their records name different builds of the data: "
            "two models are set against each other only on the same rows"
        )
    return runs


def rows(src: Sources) -> list[tuple[dict[str, Any], dict[str, Any]]]:
    """Each run both models have, in this model's order: its record here and its record there. A run is the
    same run in both only when the two were trained from the same config, so that what its task shows is all
    that differs: a run whose two records were not is left out."""
    theirs = {run["run"]: run for run in other(src)}
    return [
        (run, theirs[run["run"]])
        for run in src.runs
        if run["run"] in theirs and run["config"] == theirs[run["run"]]["config"]
    ]


def measured(src: Sources) -> dict[tuple[str, str], dict[str, Any]]:
    """The closer look's paired gains, by this model's run and the other model's: the second over the first."""
    table = (src.look or {}).get("shown") or {}
    pairs = [*table.get("pairs", []), *([table["best"]] if table.get("best") else [])]
    return {(pair["run"], pair["there"]): pair for pair in pairs if pair.get("gain") is not None}


def worth(src: Sources, here: dict[str, Any], there: dict[str, Any]) -> float:
    """How much better the run that is shown more scores than the run here: what the thing shown is worth."""
    return src.better_by(there["test"][src.primary]["value"], here["test"][src.primary]["value"])


def kept(src: Sources, here: dict[str, Any], there: dict[str, Any]) -> float | None:
    """The share of the other run's step from the floor that the run here still makes, in percent. The floor
    says one number for every row, so it is the same floor for both."""
    floor = src.floor
    if floor is None:
        return None
    level = floor["test"][src.primary]["value"]
    whole = src.better_by(there["test"][src.primary]["value"], level)
    return None if whole <= 0 else 100.0 * src.better_by(here["test"][src.primary]["value"], level) / whole


def under(src: Sources, run: dict[str, Any]) -> float | None:
    """How far under the floor a run's score is, in percent of the floor's: the same floor for either model."""
    floor = src.floor
    if floor is None or not floor["test"][src.primary]["value"]:
        return None
    level = floor["test"][src.primary]["value"]
    return 100.0 * src.better_by(run["test"][src.primary]["value"], level) / abs(level)


def _verdict(entry: dict[str, Any]) -> str:
    if not entry["beyond_noise"]:
        return "inside the noise"
    return "better beyond the noise" if entry["gain"] > 0 else "worse beyond the noise"


def _pair_values(src: Sources, out: tex.Generated, prefix: str, here: dict[str, Any], there: dict[str, Any]) -> None:
    primary = src.primary
    out.set(f"{prefix}.here", tex.score(here["test"][primary]["value"]))
    out.set(f"{prefix}.there", tex.score(there["test"][primary]["value"]))
    out.set(f"{prefix}.worth", tex.sig(worth(src, here, there), 3))
    for side, run in (("here", here), ("there", there)):
        step = under(src, run)
        if step is not None:
            out.set(f"{prefix}.{side}.lift.percent", tex.sig(step, 2))
    share = kept(src, here, there)
    if share is not None:
        out.set(f"{prefix}.kept.percent", tex.fixed(share, 0))
        out.set(f"{prefix}.lost.percent", tex.fixed(100.0 - share, 0))
    entry = measured(src).get((here["run"], there["run"]))
    if entry is not None:
        value, low, high = tex.trio(entry["gain"], entry["low"], entry["high"], sign=False)
        out.set(f"{prefix}.gain", value)
        out.set(f"{prefix}.gain.low", low)
        out.set(f"{prefix}.gain.high", high)
        out.set(f"{prefix}.verdict", _verdict(entry))


def slices(src: Sources) -> dict[str, dict[str, Any]]:
    """The best pair's gain inside each slice of the plan, by the slice's key."""
    table = (src.look or {}).get("shown") or {}
    return {one["key"]: one for one in table.get("slices", [])}


def values(src: Sources, out: tex.Generated) -> None:
    """Every value the comparison gives: under ``shown.<run>`` for a run both models have, ``shown.best`` for
    the best run of each, ``shown.reference`` for the reference of each, ``shown.there.<run>`` for any run of
    the other model, whether this one has it or not, and ``shown.slice.<key>`` for where the thing shown is
    worth most and least."""
    theirs = other(src)
    if not theirs:
        return
    both = rows(src)
    out.set("shown.model", tex.esc(src.plan["shown"].replace("-", " ")))
    out.set("shown.runs", tex.word(len(both)))
    for run in theirs:
        prefix = tex.key("shown.there", run["run"])
        out.set(f"{prefix}.name", run_tex(run["run"]))
        out.set(f"{prefix}.score", tex.score(run["test"][src.primary]["value"]))
        step = under(src, run)
        if step is not None:
            out.set(f"{prefix}.lift.percent", tex.sig(step, 2))
        # Beside this model's best run and its reference: a difference of two scores, with no interval.
        for part, ours in (("best", src.best), ("reference", src.reference)):
            if ours is not None:
                ahead = src.better_by(run["test"][src.primary]["value"], ours["test"][src.primary]["value"])
                out.set(f"{prefix}.than-{part}", "ahead of" if ahead > 0 else "behind" if ahead < 0 else "level with")
                out.set(f"{prefix}.over-{part}", tex.sig(abs(ahead), 3))
    for here, there in both:
        _pair_values(src, out, tex.key("shown", here["run"]), here, there)
    out.set("shown.best.here.name", run_tex(src.best["run"]))
    out.set("shown.best.there.name", run_tex(theirs[0]["run"]))
    _pair_values(src, out, "shown.best", src.best, theirs[0])
    reference = next(((here, there) for here, there in both if here is src.reference), None)
    if reference is not None:
        _pair_values(src, out, "shown.reference", *reference)
    networks = [(here, there) for here, there in both if here in src.networks]
    if networks:
        ordered = sorted(networks, key=lambda pair: worth(src, *pair))
        for end, (here, there) in (("least", ordered[0]), ("most", ordered[-1])):
            out.set(f"shown.networks.{end}.name", run_tex(here["run"]))
            out.set(f"shown.networks.{end}.worth", tex.sig(worth(src, here, there), 3))
    for key, one in slices(src).items():
        compared = [group for group in one["groups"] if group.get("gain")]
        for group in one["groups"]:
            prefix = tex.key("shown.slice", key, group["group"])
            out.set(f"{prefix}.rows", tex.count(group["rows"]))
            if group.get("here") is not None and group.get("there") is not None:
                out.set(f"{prefix}.here", tex.score(group["here"]))
                out.set(f"{prefix}.there", tex.score(group["there"]))
            if group.get("gain"):
                out.set(f"{prefix}.gain", tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"], sign=False)[0])
        if compared:
            ordered = sorted(compared, key=lambda group: group["gain"]["gain"])
            for end, group in (("least", ordered[0]), ("most", ordered[-1])):
                prefix = tex.key("shown.slice", key, end)
                out.set(f"{prefix}.group", tex.esc(group["group"]))
                out.set(f"{prefix}.gain", tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"], sign=False)[0])


def table(src: Sources) -> str | None:
    """The runs both models have, side by side: each run's score here and there, how much the thing shown is
    worth to it, and the share of the shown run's step from the floor it keeps. Where the closer look measured
    the pairs there is one more column, the 95% interval of each gain. The floor reads nothing, so its row is
    the two scores alone."""
    both = rows(src)
    if not both:
        return None
    primary = src.primary
    paired = measured(src)
    lines = []
    for here, there in both:
        entry = paired.get((here["run"], there["run"]))
        cells = [run_cell(here["run"]), tex.score(here["test"][primary]["value"]), tex.score(there["test"][primary]["value"])]
        if here is src.floor:
            lines.append([*cells, *[""] * (3 if paired else 2)])
            continue
        if entry is None:
            cells += [tex.sig(worth(src, here, there), 3), *([""] if paired else [])]
        else:
            value, low, high = tex.trio(entry["gain"], entry["low"], entry["high"], sign=False)
            cells += [tex.bold(value, entry["beyond_noise"]), f"{low} to {high}"]
        share = kept(src, here, there)
        cells.append("" if share is None else tex.fixed(share, 0))
        lines.append(cells)
    head = ["Run", "Hidden", "Shown", "Worth", *(["95\\% interval"] if paired else []), "Kept (\\%)"]
    drawn = tex.tabular("l" + "r" * (len(head) - 1), head, lines)
    return tex.grouped(drawn, ["", f"\\multicolumn{{2}}{{c}}{{{METRIC_NAMES[primary]}}}", *[""] * (len(head) - 3)], [(2, 3)])


def slice_figure(src: Sources, key: str) -> str | None:
    """What the thing shown is worth to the best run inside each group of one slice, with its interval."""
    one = slices(src).get(key)
    compared = [group for group in (one or {}).get("groups", []) if group.get("gain")]
    if not compared:
        return None
    return charts.intervals(
        [(group["group"], group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"]) for group in compared],
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} from being shown more (right of the line is better)",
        reference=0.0,
        colours=[charts.ACCENT] * len(compared),
        code=False,
        width="0.5\\textwidth",
    )


def slice_table(src: Sources, key: str) -> str | None:
    """One slice of the best pair as a table: the group, its test rows, the two runs' scores there, and the gain."""
    one = slices(src).get(key)
    if one is None:
        return None
    lines = []
    for group in one["groups"]:
        cells = [tex.esc(group["group"]), tex.count(group["rows"]), tex.score(group.get("here")), tex.score(group.get("there"))]
        if group.get("gain"):
            value, low, high = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"], sign=False)
            cells += [tex.bold(value, group["gain"]["beyond_noise"]), f"{low} to {high}"]
        else:
            cells += ["", ""]
        lines.append(cells)
    head = [tex.esc(one["title"]), "Test rows", "Hidden", "Shown", "Worth", "95\\% interval"]
    return tex.tabular("lrrrrr", head, lines)


def blocks(src: Sources, out: tex.Generated) -> None:
    drawn = table(src)
    if drawn is None:
        return
    out.block("shown", drawn)
    for key in slices(src):
        for name, made in ((f"shown-{key}", slice_table(src, key)), (f"shown-{key}-figure", slice_figure(src, key))):
            if made is not None:
                out.block(name, made)
