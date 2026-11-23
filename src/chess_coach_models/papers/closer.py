"""What a paper says from the closer look: where a model is right and wrong, and positions that show it.

``lab analyse <model>`` wrote ``results/analysis.json`` on the machine that
has the dataset and every run's test predictions. This module turns that file
into values, tables, figures and boards. A paper drawn before the closer look
exists has none of them, and holds the sections that use them inside
``\\iflook``.

Where a slice compares two runs, they are the challenger (the best run that
is not the reference) and the reference, the pair the analysis measured the
gain of, group by group. Every other run can be set beside the reference by
its name: what it said in each group of a slice and in each cell of a grid is
a value, and a figure and a table of it beside the reference is a block
(``slice-<key>-said-<run>``, ``slice-<key>-bias-<run>``, ``slice-<key>-<run>``,
``grid-<key>-off-<run>``, ``reliability-<run>``). A paper whose point is a run
that fits nothing, such as an engine's number read as it stands, reads those.
"""

from __future__ import annotations

import math
from typing import Any

from ..evals import analysis
from . import boards, charts, glossary, tex
from .results import _flatten, day
from .sources import METRIC_NAMES, METRIC_WORDS, Sources, run_head, run_tex


# A grid cell with fewer test rows than this is left empty: its average would be noise.
SMALLEST_CELL = 30
# Where a logarithm of seconds gets its axis marks, in seconds.
SECONDS = (0, 1, 2, 5, 10, 20, 50, 100, 200)
# A unit longer than this is a sentence, and an axis is named by the label's short name in its place.
LONGEST_AXIS_UNIT = 30


def _plain_number(value: float | None) -> str:
    """A number of no particular unit: three significant digits, a count when it is large."""
    if not tex.known(value):
        return "n/a"
    if abs(value) >= 10000:
        return tex.count(value)
    return tex.fixed(value, 0) if float(value).is_integer() else tex.sig(value, 3)


def _pair(src: Sources) -> list[dict[str, Any]]:
    """The two runs a closer look sets side by side: the challenger and the reference."""
    return [run for run in (src.challenger, src.reference) if run is not None]


def _beside(src: Sources, name: str) -> list[dict[str, Any]]:
    """A run by its name and the reference, the two a block named for that run sets side by side."""
    named, reference = src.run(name), src.reference
    pair = [named] if named is not None else []
    if reference is not None and reference is not named:
        pair.append(reference)
    return pair


def _others(src: Sources) -> list[dict[str, Any]]:
    """The runs a closer look does not already set side by side: every run but the challenger and the reference."""
    pair = _pair(src)
    return [run for run in src.runs if all(run is not one for one in pair)]


def _gap_text(value: float) -> str:
    """A distance between what was said and what happened, in the label's plain units."""
    if value < 1:
        return tex.sig(value, 2)
    return _plain_number(round(value, 1 if value < 100 else 0))


def _said(src: Sources, value: float | None) -> str:
    """What a run said on average, in the label's printed form but without a unit."""
    if not tex.known(value):
        return "n/a"
    if src.task.kind == "binary":
        return tex.percent(value)
    if src.task.scale == "log1p":
        return tex.fixed(src.plain(value), 1)
    return tex.score(value)


def _difference(src: Sources, said: float | None, happened: float | None) -> float | None:
    """What a run said on average less what happened: percentage points for a chance, plain units for a quantity."""
    if not (tex.known(said) and tex.known(happened)):
        return None
    if src.task.kind == "binary":
        return 100.0 * (said - happened)
    return src.plain(said) - src.plain(happened)


def _off_text(src: Sources, difference: float | None, *, sign: bool = True) -> str:
    if difference is None:
        return "n/a"
    if src.task.kind == "binary" or src.task.scale == "log1p":
        return tex.fixed(difference, 1, sign=sign)
    return tex.fixed(difference, 0, sign=sign) if abs(difference) >= 10 else tex.sig(difference, 2, sign=sign)


def _off(src: Sources, said: float | None, happened: float | None) -> str:
    """How far what a run said on average lies from what happened, signed."""
    return _off_text(src, _difference(src, said, happened))


def _seconds_axis(axis: str, low: float, high: float) -> list[str]:
    """An axis of log(1 + seconds) marked in seconds."""
    shown = [second for second in SECONDS if low - 1e-9 <= math.log1p(second) <= high + 1e-9]
    positions = ",".join(f"{math.log1p(second):.5f}" for second in shown)
    return [f"{axis}tick={{{positions}}}", f"{axis}ticklabels={{{','.join(str(second) for second in shown)}}}"]


def _slice(src: Sources, key: str) -> dict[str, Any] | None:
    return next((one for one in src.look["slices"] if one["key"] == key), None)


def values(src: Sources, out: tex.Generated) -> None:
    """Every value the closer look gives."""
    look, task = src.look, src.task
    binary = task.kind == "binary"
    label = look["label"]
    out.set("look.runs.count", tex.word(len(look["runs"])))
    out.set("look.code", f"\\texttt{{{look['code'][:7]}}}")
    out.set("look.test-rows", tex.count(look["test_rows"]))
    out.set("look.date", day(look["written"]))
    out.set("look.resamples", tex.count(analysis.GROUP_RESAMPLES))
    out.set("look.smallest-compared", tex.count(analysis.SMALLEST_COMPARED))
    if binary:
        out.set("label.rate", tex.percent(label["rate"]))
        for split, entry in label["by_split"].items():
            out.set(f"label.rate.{split}", tex.percent(entry["rate"]))
    else:
        out.set("label.mean", src.label_text(label["mean"]))
        out.set("label.sd", tex.score(label["sd"]))
        out.set("label.min", src.label_text(label["min"]))
        out.set("label.max", src.label_text(label["max"]))
        for quantile, value in label["quantiles"].items():
            out.set(f"label.q{quantile}", src.label_text(value))
        out.set("label.below", tex.count(label["histogram"]["below"]))
        out.set("label.above", tex.count(label["histogram"]["above"]))
        for split, entry in label["by_split"].items():
            out.set(f"label.mean.{split}", src.label_text(entry["mean"]))
    manifest = {
        key: value
        for key, value in look["dataset"].items()
        if key not in ("recipe", "marks", "hand", "dataset", "builder", "source", "licence", "group", "fingerprint", "built", "code", "rows", "splits")
    }
    _flatten("manifest", manifest, out)
    if "source_rows_read" in manifest:
        out.set("manifest.kept.percent", tex.percent(look["dataset"]["rows"] / manifest["source_rows_read"], 0))
    for column, stats in look["describe"].items():
        prefix = tex.key("describe", column)
        out.set(f"{prefix}.mean", _plain_number(stats["mean"]))
        out.set(f"{prefix}.min", _plain_number(stats["min"]))
        out.set(f"{prefix}.max", _plain_number(stats["max"]))
        for quantile, value in stats["quantiles"].items():
            out.set(f"{prefix}.q{quantile}", _plain_number(value))

    parts = {"best": src.best, "reference": src.reference, "challenger": src.challenger}
    for part, run in parts.items():
        if run is None:
            continue
        name = run["run"]
        close = look.get("closeness", {}).get(name)
        if close:
            log = task.scale == "log1p"
            out.set(f"{part}.close.median", tex.fixed(math.exp(close["median_error"]), 2) if log else tex.score(close["median_error"]))
            out.set(f"{part}.close.p90", tex.fixed(math.exp(close["p90_error"]), 2) if log else tex.score(close["p90_error"]))
            for distance, entry in close["within"].items():
                out.set(tex.key(part, "close", "within", distance), tex.percent(entry["share"], 0))
        ranked = look.get("ranking", {}).get(name)
        if ranked:
            for end in ("top", "bottom"):
                for row in ranked[end]:
                    prefix = tex.key(part, end, f"{100 * row['share']:g}")
                    out.set(f"{prefix}.rate", tex.percent(row["precision"]))
                    out.set(f"{prefix}.recall", tex.percent(row["recall"]))
                    out.set(f"{prefix}.lift", tex.fixed(row["lift"], 1))
                    out.set(f"{prefix}.rows", tex.count(row["rows"]))
        table = look.get("reliability", {}).get(name)
        if table and not binary:
            gaps = [abs(src.plain(row["predicted"]) - src.plain(row["observed"])) for row in table]
            widths = sorted(src.plain(row["observed_high"]) - src.plain(row["observed_low"]) for row in table)
            out.set(f"{part}.reliability.groups", tex.word(len(table)))
            out.set(f"{part}.reliability.widest-gap", _gap_text(max(gaps)))
            out.set(f"{part}.reliability.spread", _gap_text(widths[len(widths) // 2]))
            for end, row in (("lowest", table[0]), ("highest", table[-1])):
                out.set(f"{part}.reliability.{end}.said", src.example_text(row["predicted"]))
                out.set(f"{part}.reliability.{end}.happened", src.example_text(row["observed"]))
        beside = look.get("against_reference", {}).get(name)
        if beside:
            out.set(f"{part}.beside.correlation", tex.fixed(beside["correlation"], 2) if tex.known(beside["correlation"]) else "n/a")
            out.set(f"{part}.beside.closer", tex.percent(beside["closer_share"], 0))

    _overall_values(src, out)
    for run in src.runs:
        name = run["run"]
        table = look.get("reliability", {}).get(name)
        if table and not binary:
            prefix = tex.key("run", name, "reliability")
            widest = max(table, key=lambda row: abs(src.plain(row["predicted"]) - src.plain(row["observed"])))
            out.set(f"{prefix}.widest-gap", _gap_text(abs(src.plain(widest["predicted"]) - src.plain(widest["observed"]))))
            for end, row in (("lowest", table[0]), ("highest", table[-1]), ("widest-gap", widest)):
                out.set(f"{prefix}.{end}.said", src.example_text(row["predicted"]))
                out.set(f"{prefix}.{end}.happened", src.example_text(row["observed"]))
        beside = look.get("against_reference", {}).get(name)
        if beside:
            prefix = tex.key("run", name, "beside")
            out.set(f"{prefix}.correlation", tex.fixed(beside["correlation"], 2) if tex.known(beside["correlation"]) else "n/a")
            out.set(f"{prefix}.closer", tex.percent(beside["closer_share"], 0))

    pair = _pair(src)
    for one in look["slices"]:
        gains = [group for group in one["groups"] if group["gain"]]
        ahead = [group for group in gains if group["gain"]["beyond_noise"] and group["gain"]["gain"] > 0]
        behind = [group for group in gains if group["gain"]["beyond_noise"] and group["gain"]["gain"] < 0]
        prefix = tex.key("slice", one["key"])
        out.set(f"{prefix}.title", tex.esc(one["title"]))
        out.set(f"{prefix}.groups", tex.word(len(one["groups"])))
        out.set(f"{prefix}.compared", tex.word(len(gains)))
        out.set(f"{prefix}.ahead", tex.word(len(ahead)))
        out.set(f"{prefix}.behind", tex.word(len(behind)))
        out.set(f"{prefix}.ahead.of", tex.of(len(ahead), len(gains), "group" if len(gains) == 1 else "groups"))
        out.set(f"{prefix}.behind.of", tex.of(len(behind), len(gains), "group" if len(gains) == 1 else "groups"))
        out.set(f"{prefix}.ahead.groups", _named(ahead))
        out.set(f"{prefix}.behind.groups", _named(behind))
        for group in one["groups"]:
            inner = tex.key(prefix, group["group"])
            out.set(f"{inner}.rows", tex.count(group["rows"]))
            out.set(f"{inner}.share", tex.percent(group["rows"] / look["test_rows"], 0))
            out.set(f"{inner}.happened", src.example_text(group["label_mean"]))
            for part, run in zip(("challenger", "reference"), pair):
                stats = group["runs"].get(run["run"])
                if stats:
                    out.set(f"{inner}.{part}", tex.score(stats[task.primary]))
                    out.set(f"{inner}.{part}.said", src.example_text(stats["mean"]))
                    out.set(f"{inner}.{part}.off", _off(src, stats["mean"], group["label_mean"]))
            if group["gain"]:
                value, low, high = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"])
                out.set(f"{inner}.gain", value)
                out.set(f"{inner}.gain.low", low)
                out.set(f"{inner}.gain.high", high)
            for run in src.runs:
                stats = group["runs"].get(run["run"])
                if not stats:
                    continue
                named = tex.key(inner, run["run"])
                out.set(named, tex.score(stats.get(task.primary)))
                out.set(f"{named}.said", src.example_text(stats["mean"]))
                out.set(f"{named}.off", _off(src, stats["mean"], group["label_mean"]))
                lead = _lead(src, group, run["run"])
                if lead is not None:
                    out.set(f"{named}.behind", tex.sig(lead, 3, sign=True))
        for run in src.runs:
            _named_run_values(src, one, run["run"], prefix, out)
        # How far each of the two runs strays, at its furthest, from what happened in a group.
        for part, run in zip(("challenger", "reference"), pair):
            strays = [
                (abs(difference), group["group"])
                for group in one["groups"]
                if run["run"] in group["runs"]
                and (difference := _difference(src, group["runs"][run["run"]]["mean"], group["label_mean"])) is not None
            ]
            if strays:
                furthest, group_name = max(strays)
                out.set(f"{prefix}.{part}.widest-off", _off_text(src, furthest, sign=False))
                out.set(f"{prefix}.{part}.widest-off.group", tex.esc(group_name))
        # The groups at each end of a slice: where the challenger gains most and least on the reference, and
        # where the label is highest and lowest, so prose can name them without knowing which they are.
        ends = [("gain", gains, lambda group: group["gain"]["gain"])]
        ends.append(("happened", [group for group in one["groups"] if tex.known(group["label_mean"])], lambda group: group["label_mean"]))
        for name, among, amount in ends:
            if not among:
                continue
            for end, group in (("most", max(among, key=amount)), ("least", min(among, key=amount))):
                out.set(f"{prefix}.{name}.{end}.group", tex.esc(group["group"]))
                shown = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"])[0] if name == "gain" else src.example_text(group["label_mean"])
                out.set(f"{prefix}.{name}.{end}", shown)
    compared = [group["gain"] for one in look["slices"] for group in one["groups"] if group["gain"]]
    beyond = [gain for gain in compared if gain["beyond_noise"]]
    out.set("slices.count", tex.word(len(look["slices"])))
    out.set("slices.compared", tex.word(len(compared)))
    out.set("slices.ahead", tex.word(sum(gain["gain"] > 0 for gain in beyond)))
    out.set("slices.behind", tex.word(sum(gain["gain"] < 0 for gain in beyond)))
    for one in look.get("grids", []):
        _grid_values(src, one, out)
    out.set("grid.smallest-cell", tex.word(SMALLEST_CELL))
    out.set("examples.count", tex.word(int(src.plan.get("examples", {}).get("count", 3))))


def _lead(src: Sources, group: dict[str, Any], name: str) -> float | None:
    """How much better the reference scores than a run on a group's rows: the two scores' difference, with no
    interval, since only the challenger's gain was resampled group by group."""
    reference = group["runs"].get(src.task.reference, {}).get(src.primary)
    score = group["runs"].get(name, {}).get(src.primary)
    if name == src.task.reference or not (tex.known(reference) and tex.known(score)):
        return None
    return src.better_by(reference, score)


def _named_run_values(src: Sources, one: dict[str, Any], name: str, prefix: str, out: tex.Generated) -> None:
    """One run over a slice: the group where what it said lies furthest from what happened, and the groups
    where the reference leads it by most and by least."""
    strays = [
        (abs(difference), group["group"])
        for group in one["groups"]
        if name in group["runs"]
        and (difference := _difference(src, group["runs"][name]["mean"], group["label_mean"])) is not None
    ]
    inner = tex.key(prefix, name)
    if strays:
        furthest, group_name = max(strays)
        out.set(f"{inner}.widest-off", _off_text(src, furthest, sign=False))
        out.set(f"{inner}.widest-off.group", tex.esc(group_name))
    leads = [(lead, group["group"]) for group in one["groups"] if (lead := _lead(src, group, name)) is not None]
    if leads:
        for end, (lead, group_name) in (("most", max(leads)), ("least", min(leads))):
            out.set(f"{inner}.behind.{end}", tex.sig(lead, 3, sign=True))
            out.set(f"{inner}.behind.{end}.group", tex.esc(group_name))


def _overall_values(src: Sources, out: tex.Generated) -> None:
    """What happened and what each run said, averaged over every test row: read from a slice that leaves no
    row out, which the rating bands are."""
    look = src.look
    rows = look["test_rows"]
    filled = [[group for group in one["groups"] if group["rows"]] for one in look["slices"]]
    whole = next(
        (
            groups
            for groups in filled
            if sum(group["rows"] for group in groups) == rows and all(tex.known(group["label_mean"]) for group in groups)
        ),
        None,
    )
    if not whole:
        return
    happened = sum(group["rows"] * group["label_mean"] for group in whole) / rows
    out.set("overall.happened", src.example_text(happened))
    for run in src.runs:
        name = run["run"]
        if not all(name in group["runs"] and tex.known(group["runs"][name]["mean"]) for group in whole):
            continue
        said = sum(group["rows"] * group["runs"][name]["mean"] for group in whole) / rows
        out.set(tex.key("overall", name, "said"), src.example_text(said))
        out.set(tex.key("overall", name, "off"), _off(src, said, happened))


def _named(groups: list[dict[str, Any]]) -> str:
    """The groups of a slice by name, as a sentence lists them, or ``none``."""
    names = [tex.esc(group["group"]) for group in groups]
    if not names:
        return "none"
    return names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"


def _grid_values(src: Sources, one: dict[str, Any], out: tex.Generated) -> None:
    """A grid's cells by name, and the cells where the label is highest and lowest: what happened on the test rows
    and what the challenger said there. A cell too small to draw has no value."""
    prefix = tex.key("grid", one["key"])
    challenger = src.challenger["run"] if src.challenger is not None else None
    drawn = []
    strays: dict[str, list[tuple[float, str, str]]] = {}
    for row, line in zip(one["rows"]["groups"], one["cells"]):
        for column, cell in zip(one["columns"]["groups"], line):
            if cell["rows"] < SMALLEST_CELL or not tex.known(cell["label_mean"]):
                continue
            inner = tex.key(prefix, row, column)
            out.set(f"{inner}.rows", tex.count(cell["rows"]))
            out.set(f"{inner}.happened", src.example_text(cell["label_mean"]))
            if tex.known(cell["runs"].get(challenger)):
                out.set(f"{inner}.said", src.example_text(cell["runs"][challenger]))
            for name, said in cell["runs"].items():
                if tex.known(said):
                    out.set(tex.key(inner, name, "said"), src.example_text(said))
                    out.set(tex.key(inner, name, "off"), _off(src, said, cell["label_mean"]))
                    strays.setdefault(name, []).append((abs(_difference(src, said, cell["label_mean"])), row, column))
            drawn.append((cell["label_mean"], row, column))
    if not drawn:
        return
    for name, among in strays.items():
        furthest, row, column = max(among)
        named = tex.key(prefix, name, "widest-off")
        out.set(named, _off_text(src, furthest, sign=False))
        out.set(f"{named}.row", tex.esc(row))
        out.set(f"{named}.column", tex.esc(column))
    for end, (amount, row, column) in (("most", max(drawn)), ("least", min(drawn))):
        out.set(f"{prefix}.happened.{end}", src.example_text(amount))
        out.set(f"{prefix}.happened.{end}.row", tex.esc(row))
        out.set(f"{prefix}.happened.{end}.column", tex.esc(column))


def slice_table(src: Sources, one: dict[str, Any], named: str | None = None) -> str:
    """One slice as a table: each group's rows, what happened, what the two runs said and scored, and the gain.

    The two runs are the challenger and the reference, whose gain was resampled group by group. With
    ``named`` they are that run and the reference, and the last column is the reference's lead on the
    group's rows: the two scores' difference, which has no interval."""
    pair = _pair(src) if named is None else _beside(src, named)
    binary = src.task.kind == "binary"
    metric = METRIC_NAMES[src.primary]
    rows = []
    for group in one["groups"]:
        cells = [tex.esc(group["group"]), tex.count(group["rows"]), _said(src, group["label_mean"])]
        for run in pair:
            stats = group["runs"].get(run["run"], {})
            cells += [_said(src, stats.get("mean")), tex.score(stats.get(src.primary))]
        if named is not None:
            lead = _lead(src, group, named)
            cells += [tex.score(lead, sign=True) if lead is not None else ""]
        elif group["gain"]:
            value, low, high = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"])
            cells += [tex.bold(value, group["gain"]["beyond_noise"]), f"{low} to {high}"]
        else:
            cells += ["", ""]
        rows.append(cells)
    happened = "Observed (\\%)" if binary else "Observed"
    head = ["Group", "Test examples", happened]
    top = ["", "", ""]
    for run in pair:
        head += ["Predicted", metric]
        top += [run_head(run["run"], 2, "2.2cm")]
    last = ["Baseline's lead"] if named is not None else ["Gain", "95\\% CI"]
    head += last
    top += [""] * len(last)
    spec = "lrr" + "rr" * len(pair) + "r" * len(last)
    return tex.grouped(tex.tabular(spec, head, rows), top, [(4 + 2 * index, 5 + 2 * index) for index in range(len(pair))])


def slice_gain_figure(src: Sources, one: dict[str, Any]) -> str | None:
    """The challenger's paired gain over the reference in each group of a slice, with its interval."""
    challenger = src.challenger
    if challenger is None or not any(group["gain"] for group in one["groups"]):
        return None
    rows = []
    for group in one["groups"]:
        gain = group["gain"]
        rows.append((group["group"], gain["gain"], gain["low"], gain["high"]) if gain else (group["group"], None, None, None))
    return charts.intervals(
        rows,
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} of {run_tex(challenger['run'])} over the baseline",
        reference=0.0,
        reference_label=run_tex(src.task.reference),
        colours=[charts.run_colour(challenger["run"])] * len(rows),
        code=False,
        row_height=0.44,
    )


def slice_said_figure(src: Sources, one: dict[str, Any], named: str | None = None) -> str:
    """What happened in each group of a slice beside what the two runs said there on average: the challenger
    and the reference, or with ``named`` that run and the reference."""
    binary = src.task.kind == "binary"
    scale = 100.0 if binary else 1.0

    def shown(value: float | None) -> float | None:
        if not tex.known(value):
            return None
        return scale * (src.plain(value) if not binary else value)

    names = [group["group"] for group in one["groups"]]
    series = [
        charts.Series(
            "observed",
            [(index, shown(group["label_mean"])) for index, group in enumerate(one["groups"])],
            colour=charts.INK,
            mark="o",
        )
    ]
    for run in _pair(src) if named is None else _beside(src, named):
        series.append(
            charts.run_series(
                run["run"],
                [(index, shown(group["runs"].get(run["run"], {}).get("mean"))) for index, group in enumerate(one["groups"])],
            )
        )
    if binary:
        ylabel = "Share (percent)"
    elif src.task.scale == "log1p":
        ylabel = "Seconds"
    else:
        ylabel = _axis(src)
    return charts.lines(series, xlabel=tex.esc(one["title"]), ylabel=ylabel, tick_labels=names, width="0.66\\textwidth")


def slice_bias_figure(src: Sources, one: dict[str, Any], named: str | None = None) -> str | None:
    """How far what the two runs said in each group of a slice lies from what happened there: zero is a run
    that is right on average in the group, and a line that slopes is a run pulling the groups together.
    The two are the challenger and the reference, or with ``named`` that run and the reference."""
    binary = src.task.kind == "binary"
    scale = 100.0 if binary else 1.0

    def shown(value: float | None) -> float | None:
        if not tex.known(value):
            return None
        return scale * (src.plain(value) if not binary else value)

    def off(group: dict[str, Any], run: dict[str, Any]) -> float | None:
        said, happened = shown(group["runs"].get(run["run"], {}).get("mean")), shown(group["label_mean"])
        return None if said is None or happened is None else said - happened

    pair = _pair(src) if named is None else _beside(src, named)
    if not pair:
        return None
    series = [
        charts.run_series(run["run"], [(index, off(group, run)) for index, group in enumerate(one["groups"])]) for run in pair
    ]
    if binary:
        unit = "\\\\(percentage points)"
    elif src.task.scale == "log1p":
        unit = "\\\\(seconds)"
    else:
        unit = f"\\\\({tex.esc(src.task.unit)})" if len(src.task.unit) <= LONGEST_AXIS_UNIT else ""
    return charts.lines(
        series,
        xlabel=tex.esc(one["title"]),
        ylabel=f"Predicted minus observed{unit}",
        tick_labels=[group["group"] for group in one["groups"]],
        level=(0.0, "unbiased", charts.QUIET),
        width="0.66\\textwidth",
        extra=["ylabel style={align=center}"],
    )


def tex_free(text: str) -> str:
    """A unit as an axis label: its first letter raised."""
    return text[:1].upper() + text[1:]


def _axis(src: Sources) -> str:
    """The label's scale as an axis names it: its unit, or the label's short name where the unit is a sentence."""
    unit = src.task.unit
    return tex.esc(tex_free(unit if len(unit) <= LONGEST_AXIS_UNIT else glossary.label(src.task.label)))


def grid_figures(src: Sources, one: dict[str, Any]) -> dict[str, str]:
    """A grid twice on one scale of colour: what happened in each cell, and what the challenger said there."""
    challenger = src.challenger
    binary = src.task.kind == "binary"

    def number(value: float | None) -> float | None:
        if not tex.known(value):
            return None
        return 100.0 * value if binary else src.plain(value)

    def text(value: float | None) -> str:
        if value is None:
            return ""
        return tex.fixed(value, 1) if binary or src.task.scale == "log1p" else tex.fixed(value, 0)

    happened = [
        [number(cell["label_mean"]) if cell["rows"] >= SMALLEST_CELL else None for cell in line] for line in one["cells"]
    ]
    said = [
        [
            number(cell["runs"].get(challenger["run"])) if challenger is not None and cell["rows"] >= SMALLEST_CELL else None
            for cell in line
        ]
        for line in one["cells"]
    ]
    known = [value for table in (happened, said) for line in table for value in line if value is not None]
    if not known:
        return {}
    low, high = min(known), max(known)
    made = {}
    for name, table in (("", happened), ("-said", said)):
        made[f"grid-{one['key']}{name}"] = charts.grid(
            one["rows"]["groups"],
            one["columns"]["groups"],
            [[(value, text(value)) for value in line] for line in table],
            row_title=tex.esc(one["rows"]["title"]),
            column_title=tex.esc(one["columns"]["title"]),
            low=low,
            high=high,
        )
    return made


def grid_off_figure(src: Sources, one: dict[str, Any], named: str) -> str | None:
    """A grid of how far a run's average lies from what happened in each cell, above the same grid for the
    reference, on one scale of two colours that meet at no difference."""
    binary = src.task.kind == "binary"

    def off(cell: dict[str, Any], name: str) -> float | None:
        if cell["rows"] < SMALLEST_CELL:
            return None
        return _difference(src, cell["runs"].get(name), cell["label_mean"])

    def text(value: float | None) -> str:
        if value is None:
            return ""
        return tex.fixed(value, 1, sign=True) if binary or src.task.scale == "log1p" else tex.fixed(value, 2 if abs(value) < 10 else 0, sign=True)

    tables = [(run["run"], [[off(cell, run["run"]) for cell in line] for line in one["cells"]]) for run in _beside(src, named)]
    known = [abs(value) for _, table in tables for line in table for value in line if value is not None]
    if not known or max(known) == 0:
        return None
    bound = max(known)
    parts = []
    for name, table in tables:
        drawn = charts.grid(
            one["rows"]["groups"],
            one["columns"]["groups"],
            [[(value, text(value)) for value in line] for line in table],
            row_title=tex.esc(one["rows"]["title"]),
            column_title=tex.esc(one["columns"]["title"]),
            low=-bound,
            high=bound,
            centre=0.0,
        )
        parts.append(f"{{\\sffamily\\footnotesize {run_tex(name)}}}\\par\\smallskip\n{drawn}")
    return "\n\n\\medskip\n".join(parts)


def ranking_table(src: Sources, end: str) -> str | None:
    """What a chance is worth as a flag from one end of its ranking, for the challenger and the reference. From
    the bottom the three columns are about the examples that were not hits, so the head says which end it is."""
    pair = [run for run in _pair(src) if run["run"] in src.look.get("ranking", {})]
    if not pair:
        return None
    tables = [src.look["ranking"][run["run"]][end] for run in pair]
    rows = []
    for index, first in enumerate(tables[0]):
        cells = [f"{100 * first['share']:g}\\%", tex.count(first["rows"])]
        for table in tables:
            row = table[index]
            cells += [tex.percent(row["precision"]) + "\\%", tex.percent(row["recall"]) + "\\%", tex.fixed(row["lift"], 2)]
        rows.append(cells)
    head = [f"{'Top' if end == 'top' else 'Bottom'} share of test set", "Examples"]
    top = ["", ""]
    for run in pair:
        head += ["precision", "recall", "lift"]
        top += [run_head(run["run"], 3, "3.9cm")]
    table = tex.tabular("rr" + "rrr" * len(pair), head, rows)
    return tex.grouped(table, top, [(3 + 3 * index, 5 + 3 * index) for index in range(len(pair))])


def closeness_table(src: Sources) -> str | None:
    """How close each run's predictions land: the middle and the tail of its error, and the share inside each named distance."""
    close = src.look.get("closeness")
    if not close:
        return None
    log = src.task.scale == "log1p"
    names = list(next(iter(close.values()))["within"])

    def error(value: float) -> str:
        return "$\\times$" + tex.fixed(math.exp(value), 2) if log else tex.score(value)

    rows = [
        [
            run_tex(name),
            error(close[name]["median_error"]),
            error(close[name]["p90_error"]),
            *(tex.percent(close[name]["within"][distance]["share"]) + "\\%" for distance in names),
        ]
        for name in src.names
        if name in close
    ]
    if log:
        # On a logarithmic target an error is a factor, so the head names the factor that the cells print.
        head = ["Model", "Median error factor", "90th pct. error factor", *(f"Within $\\times${tex.esc(name)}" for name in names)]
    else:
        head = ["Model", "Median abs. error", "90th pct. abs. error", *(f"Within {tex.esc(name)}" for name in names)]
    return tex.tabular("lrr" + "r" * len(names), head, rows)


def beside_table(src: Sources) -> str | None:
    """Each run's predictions beside the reference's, row by row."""
    beside = src.look.get("against_reference")
    if not beside:
        return None
    rows = [
        [
            run_tex(name),
            tex.fixed(beside[name]["correlation"], 3) if tex.known(beside[name]["correlation"]) else "n/a",
            tex.percent(beside[name]["closer_share"]) + "\\%",
            tex.percent(beside[name]["tied_share"]) + "\\%",
        ]
        for name in src.names
        if name in beside
    ]
    head = ["Model", "Correlation with baseline", "Closer than baseline", "Tied"]
    return tex.tabular("lrrr", head, rows)


def describe_table(src: Sources) -> str:
    """The spread of a few columns over every row of the dataset."""
    rows = []
    for column, stats in src.look["describe"].items():
        quantiles = stats["quantiles"]
        rows.append(
            [
                tex.esc(glossary.title(column)),
                _plain_number(stats["mean"]),
                *(_plain_number(quantiles[q]) for q in ("5", "25", "50", "75", "95")),
                _plain_number(stats["min"]),
                _plain_number(stats["max"]),
            ]
        )
    head = ["", "Mean", "5\\%", "25\\%", "Median", "75\\%", "95\\%", "Min", "Max"]
    return tex.tabular("lrrrrrrrr", head, rows)


def label_figure(src: Sources) -> str | None:
    """A quantity's label over every row, as counts in bins."""
    histogram = src.look["label"].get("histogram")
    if not histogram:
        return None
    log = src.task.scale == "log1p"
    edges = histogram["edges"]
    return charts.columns(
        edges,
        histogram["counts"],
        xlabel="Seconds spent on the move" if log else _axis(src),
        ylabel="Examples",
        extra=_seconds_axis("x", edges[0], edges[-1]) if log else (),
    )


def reliability_figure(src: Sources, named: str | None = None) -> str | None:
    """What a quantity's run said against what happened, in equal groups by what it said, with the middle
    four fifths of what happened as a wash. A chance has its figure from the records.

    The runs are the challenger and the reference, or with ``named`` that run and the reference. The wash is
    left out where it would say nothing: a label of a few values, whose middle four fifths are the whole scale."""
    if src.task.kind == "binary":
        return None
    tables = src.look["reliability"]
    pair = [run for run in (_pair(src) if named is None else _beside(src, named)) if run["run"] in tables]
    if not pair:
        return None
    label = src.look["label"]
    series = []
    for index, run in enumerate(pair):
        table = tables[run["run"]]
        widths = sorted(row["observed_high"] - row["observed_low"] for row in table)
        telling = widths[len(widths) // 2] < 0.8 * (label["max"] - label["min"])
        wash = {"low": [row["observed_low"] for row in table], "high": [row["observed_high"] for row in table]} if index == 0 and telling else {}
        series.append(charts.run_series(run["run"], [(row["predicted"], row["observed"]) for row in table], **wash))
    extra: list[str] = []
    if src.task.scale == "log1p":
        every = [value for run in pair for row in tables[run["run"]] for value in (row["predicted"], row["observed_low"], row["observed_high"])]
        extra = _seconds_axis("x", min(every), max(every)) + _seconds_axis("y", min(every), max(every))
    unit = "seconds" if src.task.scale == "log1p" else tex.esc(src.task.unit)
    unit = f" ({unit})" if len(unit) <= LONGEST_AXIS_UNIT else ""
    return charts.lines(
        series,
        xlabel=f"Predicted{unit}",
        ylabel=f"Observed{unit}",
        diagonal=True,
        width="0.55\\textwidth",
        height="6.6cm",
        extra=extra,
    )


def _squares(uci: str) -> str:
    return f"{uci[0:2]}--{uci[2:4]}" + (f"={uci[4].upper()}" if len(uci) > 4 else "")


def _shown(column: str, value: Any) -> str:
    """One of an example's columns as words: its label and its value."""
    if isinstance(value, str):
        text = ", ".join(tex.esc(part) for part in value.split())
    elif isinstance(value, float) and not value.is_integer():
        text = tex.sig(value, 3)
    else:
        text = str(int(value)) if value is not None else "n/a"
    unit = glossary.UNITS.get(column, "")
    return f"{tex.esc(glossary.label(column))} {text}" + (f"\\,{unit}" if unit else "")


# The move a row is about, by the column an example holds it under, and what the example calls it. Of a
# row that is one position it is the move that was played there. Of a row that is a game the board is the
# position before the player's costliest move, and that move is the one shown.
SUBJECT_MOVES = {"move": "Played", "worst_move": "The player's most costly move"}
# The moves among them that a network is told the squares of, as it is told the opponent's last move: a
# game's network reads each of the player's moves with its position.
READ_MOVES = ("worst_move",)


def _subject(moves: dict[str, str]) -> tuple[str, str] | None:
    """The move a row is about where an example holds one, as what the example calls it and the move."""
    return next(((words, moves[name]) for name, words in SUBJECT_MOVES.items() if moves.get(name)), None)


def _arrows(moves: dict[str, str]) -> list[tuple[str, str]]:
    """The moves an example's board shows: what led to the position in grey, the move the row is about in
    blue, and in orange the move played where it was another."""
    arrows = []
    context = moves.get("setup") or moves.get("last_move")
    if context:
        arrows.append((context, boards.CONTEXT))
    named = _subject(moves)
    subject = moves["line"].split()[0] if moves.get("line") else named and named[1]
    played = moves.get("played")
    if played and played != subject:
        arrows.append((played, boards.OTHER))
    if subject:
        arrows.append((subject, boards.SUBJECT))
    return arrows


def example_block(src: Sources, name: str, number: int, example: dict[str, Any]) -> str:
    """One example: its board, its moves, what happened, what the runs said, and what the row was."""
    spec = src.plan.get("examples", {})
    fen, moves = example["fen"], example["moves"]
    binary = src.task.kind == "binary"
    lines = []
    title = f"\\textbf{{{number}.}} {boards.mover(fen)} to move."
    if "id" in example:
        title += f" Puzzle \\texttt{{{tex.esc(example['id'])}}}."
    lines.append(title)
    told = []
    context = moves.get("setup") or moves.get("last_move")
    if context:
        told.append(f"Opponent's last move: {_squares(context)}.")
    if moves.get("line"):
        told.append(f"Solution: {boards.moves(fen, moves['line'].split())}.")
    named = ("Played", moves["played"]) if moves.get("played") else _subject(moves)
    if named:
        told.append(f"{named[0]}: {boards.moves(fen, [named[1]])}.")
    lines.append(" ".join(told))
    truth = tex.esc(spec.get("truth", "Observed"))
    if binary:
        outcomes = spec.get("outcomes", ["no", "yes"])
        happened = f"{truth}: {tex.esc(outcomes[int(example['label'] > 0.5)])}."
    else:
        happened = f"{truth}: {src.example_text(example['label'])}{_unit(spec)}."
    runs = [src.best] + [run for run in _pair(src) if run is not src.best]
    said = "; ".join(
        f"{run_tex(run['run'])} predicted {src.example_text(example['predicted'][run['run']])}{'' if binary else _unit(spec)}"
        for run in runs
        if run["run"] in example["predicted"]
    )
    lines.append(f"{happened} {said}.")
    if example["show"]:
        facts = "; ".join(_shown(column, value) for column, value in example["show"].items()) + "."
        lines.append(facts[:1].upper() + facts[1:])
    lines.append(boards.fen_line(fen))
    return boards.beside(boards.board(fen, arrows=_arrows(moves), size="10pt"), lines, board_width=0.26)


def _unit(spec: dict[str, Any]) -> str:
    unit = spec.get("unit", "")
    return f"\\,{tex.esc(unit)}" if unit else ""


def examples_block(src: Sources, name: str) -> str:
    examples = src.look["examples"][name]
    return "\n\n\\medskip\n".join(
        example_block(src, name, index, example) for index, example in enumerate(examples, start=1)
    )


# The marks on squares that stand for each move an example holds. The board "as encoded" shades a move's
# squares only where the task lets a network read one of them: a task that hides the solution shades none of it.
CONTEXT_MARKS = ("setup_from", "setup_to", "last_from", "last_to")
LINE_MARKS = ("solver1_from", "solver1_to", "later")
READ_MARKS = ("move_from", "move_to")


def encoding_figure(src: Sources) -> str | None:
    """One of the dataset's positions twice: as it was played, and as the networks read it, with the marks
    the task lets them read."""
    examples = src.look["examples"].get("typical")
    if not examples:
        return None
    example = next((one for one in examples if boards.mover(one["fen"]) == "Black"), examples[0])
    fen, moves = example["fen"], example["moves"]
    black = boards.mover(fen) == "Black"

    def squares(uci: str) -> list[str]:
        pair = [uci[0:2], uci[2:4]]
        return [boards.mirror_square(square) for square in pair] if black else pair

    def read(names: tuple[str, ...]) -> bool:
        return any(name in src.marks for name in names)

    fields = []
    context = moves.get("setup") or moves.get("last_move")
    if context and read(CONTEXT_MARKS):
        fields.append((squares(context), boards.CONTEXT))
    if read(LINE_MARKS):
        for index, uci in enumerate(moves.get("line", "").split()):
            fields.append((squares(uci), boards.SUBJECT if index % 2 == 0 else boards.OTHER))
    if read(READ_MARKS):
        fields += [(squares(moves[name]), boards.SUBJECT) for name in READ_MOVES if moves.get(name)]
    played = boards.board(fen, arrows=_arrows(moves), from_mover=False, size="11pt")
    encoded = boards.board(boards.mirrored(fen), fields=fields, from_mover=False, size="11pt")
    return (
        "\\begin{minipage}[t]{0.46\\textwidth}\\centering\n"
        f"{played}\\par\\smallskip\n{{\\small As it was played: {boards.mover(fen)} to move.}}\n"
        "\\end{minipage}\\hfill\n"
        "\\begin{minipage}[t]{0.46\\textwidth}\\centering\n"
        f"{encoded}\\par\\smallskip\n{{\\small As encoded: the side to move plays up the board.}}\n"
        "\\end{minipage}"
    )


def appendix(src: Sources, named: str | None = None) -> str:
    """Every slice as a table of its own, one after another, for the appendix: the challenger beside the
    reference, or with ``named`` that run beside it, each table then labelled ``tab:slice-<key>-<run>``."""
    parts = []
    for one in src.look["slices"]:
        label = f"tab:slice-{one['key']}" + (f"-{named}" if named else "")
        parts.append(
            "\\begin{table}[htbp]\\centering\\footnotesize\n"
            + tex.fit(slice_table(src, one, named))
            + f"\n\\caption{{Test-set results by {tex.esc(one['title'][:1].lower() + one['title'][1:])}.}}\n"
            + f"\\label{{{label}}}\n\\end{{table}}"
        )
    return "\n\n".join(parts)


def blocks(src: Sources, out: tex.Generated) -> None:
    """Every table, figure and board the closer look gives."""
    look = src.look
    made: dict[str, str | None] = {
        "describe": describe_table(src),
        "label": label_figure(src),
        "reliability": reliability_figure(src),
        "ranking-top": ranking_table(src, "top") if look.get("ranking") else None,
        "ranking-bottom": ranking_table(src, "bottom") if look.get("ranking") else None,
        "closeness": closeness_table(src),
        "beside": beside_table(src),
        "encoding": encoding_figure(src),
        "slices": appendix(src),
    }
    others = [run["run"] for run in _others(src)]
    for one in look["slices"]:
        made[f"slice-{one['key']}"] = slice_table(src, one)
        made[f"slice-{one['key']}-gain"] = slice_gain_figure(src, one)
        made[f"slice-{one['key']}-said"] = slice_said_figure(src, one)
        made[f"slice-{one['key']}-bias"] = slice_bias_figure(src, one)
        for name in others:
            made[f"slice-{one['key']}-{name}"] = slice_table(src, one, name)
            made[f"slice-{one['key']}-said-{name}"] = slice_said_figure(src, one, name)
            made[f"slice-{one['key']}-bias-{name}"] = slice_bias_figure(src, one, name)
    for one in look["grids"]:
        made.update(grid_figures(src, one))
        for run in src.runs:
            made[f"grid-{one['key']}-off-{run['run']}"] = grid_off_figure(src, one, run["run"])
    for name in others:
        made[f"reliability-{name}"] = reliability_figure(src, name)
        made[f"slices-{name}"] = appendix(src, name)
    for name in look["examples"]:
        made[f"examples-{name}"] = examples_block(src, name)
    for name, latex in made.items():
        if latex is not None:
            out.block(name, latex)
