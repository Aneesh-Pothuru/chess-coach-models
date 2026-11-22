"""What a paper says from the closer look: where a model is right and wrong, and positions that show it.

``lab analyse <model>`` wrote ``results/analysis.json`` on the machine that
has the dataset and every run's test predictions. This module turns that file
into values, tables, figures and boards. A paper drawn before the closer look
exists has none of them, and holds the sections that use them inside
``\\iflook``.

Where a slice compares two runs, they are the challenger (the best run that
is not the reference) and the reference, the pair the analysis measured the
gain of, group by group.
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


def _plain_number(value: float | None) -> str:
    """A number of no particular unit: three significant digits, a count when it is large."""
    if not tex.known(value):
        return "n/a"
    if abs(value) >= 10000:
        return tex.count(value)
    return str(int(value)) if float(value).is_integer() else tex.sig(value, 3)


def _pair(src: Sources) -> list[dict[str, Any]]:
    """The two runs a closer look sets side by side: the challenger and the reference."""
    return [run for run in (src.challenger, src.reference) if run is not None]


def _said(src: Sources, value: float | None) -> str:
    """What a run said on average, in the label's printed form but without a unit."""
    if not tex.known(value):
        return "n/a"
    if src.task.kind == "binary":
        return tex.percent(value)
    if src.task.scale == "log1p":
        return tex.fixed(src.plain(value), 1)
    return tex.score(value)


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
        beside = look.get("against_reference", {}).get(name)
        if beside:
            out.set(f"{part}.beside.correlation", tex.fixed(beside["correlation"], 2) if tex.known(beside["correlation"]) else "n/a")
            out.set(f"{part}.beside.closer", tex.percent(beside["closer_share"], 0))

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
        out.set(f"{prefix}.ahead.of", tex.of(len(ahead), len(gains), "groups"))
        out.set(f"{prefix}.behind.of", tex.of(len(behind), len(gains), "groups"))
        for group in one["groups"]:
            inner = tex.key(prefix, group["group"])
            out.set(f"{inner}.rows", tex.count(group["rows"]))
            out.set(f"{inner}.share", tex.percent(group["rows"] / look["test_rows"], 0))
            out.set(f"{inner}.happened", src.label_text(group["label_mean"]))
            for part, run in zip(("challenger", "reference"), pair):
                stats = group["runs"].get(run["run"])
                if stats:
                    out.set(f"{inner}.{part}", tex.score(stats[task.primary]))
                    out.set(f"{inner}.{part}.said", src.label_text(stats["mean"]))
            if group["gain"]:
                value, low, high = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"])
                out.set(f"{inner}.gain", value)
                out.set(f"{inner}.gain.low", low)
                out.set(f"{inner}.gain.high", high)
    out.set("grid.smallest-cell", tex.word(SMALLEST_CELL))
    out.set("examples.count", tex.word(int(src.plan.get("examples", {}).get("count", 3))))


def slice_table(src: Sources, one: dict[str, Any]) -> str:
    """One slice as a table: each group's rows, what happened, what the two runs said and scored, and the gain."""
    pair = _pair(src)
    binary = src.task.kind == "binary"
    metric = METRIC_NAMES[src.primary]
    rows = []
    for group in one["groups"]:
        cells = [tex.esc(group["group"]), tex.count(group["rows"]), _said(src, group["label_mean"])]
        for run in pair:
            stats = group["runs"].get(run["run"], {})
            cells += [_said(src, stats.get("mean")), tex.score(stats.get(src.primary))]
        if group["gain"]:
            value, low, high = tex.trio(group["gain"]["gain"], group["gain"]["low"], group["gain"]["high"])
            cells += [tex.bold(value, group["gain"]["beyond_noise"]), f"{low} to {high}"]
        else:
            cells += ["", ""]
        rows.append(cells)
    happened = "Happened (\\%)" if binary else "Happened"
    head = ["Group", "Test rows", happened]
    top = ["", "", ""]
    for run in pair:
        head += ["said", metric]
        top += [run_head(run["run"], 2, "2.2cm")]
    head += ["Gain", "95\\% interval"]
    top += ["", ""]
    spec = "lrr" + "rr" * len(pair) + "rr"
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
        xlabel=f"Gain in {METRIC_WORDS[src.primary]} of {run_tex(challenger['run'])} over the reference",
        reference=0.0,
        reference_label=run_tex(src.task.reference),
        colours=[charts.run_colour(challenger["run"])] * len(rows),
        code=False,
        row_height=0.44,
    )


def slice_said_figure(src: Sources, one: dict[str, Any]) -> str:
    """What happened in each group of a slice beside what the two runs said there on average."""
    binary = src.task.kind == "binary"
    scale = 100.0 if binary else 1.0

    def shown(value: float | None) -> float | None:
        if not tex.known(value):
            return None
        return scale * (src.plain(value) if not binary else value)

    names = [group["group"] for group in one["groups"]]
    series = [
        charts.Series(
            "what happened",
            [(index, shown(group["label_mean"])) for index, group in enumerate(one["groups"])],
            colour=charts.INK,
            mark="o",
        )
    ]
    for run in _pair(src):
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
        ylabel = tex.esc(tex_free(src.task.unit))
    return charts.lines(series, xlabel=tex.esc(one["title"]), ylabel=ylabel, tick_labels=names, width="0.66\\textwidth")


def tex_free(text: str) -> str:
    """A unit as an axis label: its first letter raised."""
    return text[:1].upper() + text[1:]


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


def ranking_table(src: Sources, end: str) -> str | None:
    """What a chance is worth as a flag from one end of its ranking, for the challenger and the reference."""
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
    head = ["Share of test rows", "Rows"]
    top = ["", ""]
    for run in pair:
        head += ["rate", "of all", "lift"]
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
    head = ["Run", "Median miss", "Nine in ten within", *(f"Within {tex.esc(name)}" for name in names)]
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
    head = ["Run", "Correlation with the reference", "Closer than the reference", "Tied"]
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
    head = ["", "Mean", "5\\%", "25\\%", "Median", "75\\%", "95\\%", "Least", "Most"]
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
        xlabel="Seconds spent on the move" if log else tex.esc(tex_free(src.task.unit)),
        ylabel="Rows",
        extra=_seconds_axis("x", edges[0], edges[-1]) if log else (),
    )


def reliability_figure(src: Sources) -> str | None:
    """What a quantity's run said against what happened, in equal groups by what it said, with the middle
    four fifths of what happened as a wash. A chance has its figure from the records."""
    if src.task.kind == "binary":
        return None
    tables = src.look["reliability"]
    pair = [run for run in _pair(src) if run["run"] in tables]
    if not pair:
        return None
    series = []
    for index, run in enumerate(pair):
        table = tables[run["run"]]
        wash = {"low": [row["observed_low"] for row in table], "high": [row["observed_high"] for row in table]} if index == 0 else {}
        series.append(charts.run_series(run["run"], [(row["predicted"], row["observed"]) for row in table], **wash))
    extra: list[str] = []
    if src.task.scale == "log1p":
        every = [value for run in pair for row in tables[run["run"]] for value in (row["predicted"], row["observed_low"], row["observed_high"])]
        extra = _seconds_axis("x", min(every), max(every)) + _seconds_axis("y", min(every), max(every))
    unit = "seconds" if src.task.scale == "log1p" else tex.esc(src.task.unit)
    return charts.lines(
        series,
        xlabel=f"What the run said ({unit})",
        ylabel=f"What happened ({unit})",
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


def _arrows(moves: dict[str, str]) -> list[tuple[str, str]]:
    """The moves an example's board shows: what led to the position in grey, the move the row is about in
    blue, and in orange the move played where it was another."""
    arrows = []
    context = moves.get("setup") or moves.get("last_move")
    if context:
        arrows.append((context, boards.CONTEXT))
    subject = moves["line"].split()[0] if moves.get("line") else moves.get("move")
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
        told.append(f"The opponent's move: {_squares(context)}.")
    if moves.get("line"):
        told.append(f"The line: {boards.moves(fen, moves['line'].split())}.")
    played = moves.get("played") or moves.get("move")
    if played:
        told.append(f"Played: {boards.moves(fen, [played])}.")
    lines.append(" ".join(told))
    truth = tex.esc(spec.get("truth", "What happened"))
    if binary:
        outcomes = spec.get("outcomes", ["no", "yes"])
        happened = f"{truth}: {tex.esc(outcomes[int(example['label'] > 0.5)])}."
    else:
        happened = f"{truth}: {src.example_text(example['label'])}{_unit(spec)}."
    runs = [src.best] + [run for run in _pair(src) if run is not src.best]
    said = "; ".join(
        f"{run_tex(run['run'])} said {src.example_text(example['predicted'][run['run']])}{'' if binary else _unit(spec)}"
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


def encoding_figure(src: Sources) -> str | None:
    """One of the dataset's positions twice: as it was played, and as the networks read it, with its marks."""
    examples = src.look["examples"].get("typical")
    if not examples:
        return None
    example = next((one for one in examples if boards.mover(one["fen"]) == "Black"), examples[0])
    fen, moves = example["fen"], example["moves"]
    black = boards.mover(fen) == "Black"

    def squares(uci: str) -> list[str]:
        pair = [uci[0:2], uci[2:4]]
        return [boards.mirror_square(square) for square in pair] if black else pair

    fields = []
    context = moves.get("setup") or moves.get("last_move")
    if context:
        fields.append((squares(context), boards.CONTEXT))
    for index, uci in enumerate(moves.get("line", "").split()):
        fields.append((squares(uci), boards.SUBJECT if index % 2 == 0 else boards.OTHER))
    played = boards.board(fen, arrows=_arrows(moves), from_mover=False, size="11pt")
    read = boards.board(boards.mirrored(fen), fields=fields, from_mover=False, size="11pt")
    return (
        "\\begin{minipage}[t]{0.46\\textwidth}\\centering\n"
        f"{played}\\par\\smallskip\n{{\\small As it was played: {boards.mover(fen)} to move.}}\n"
        "\\end{minipage}\\hfill\n"
        "\\begin{minipage}[t]{0.46\\textwidth}\\centering\n"
        f"{read}\\par\\smallskip\n{{\\small As the networks read it: the mover plays up the board.}}\n"
        "\\end{minipage}"
    )


def appendix(src: Sources) -> str:
    """Every slice as a table of its own, one after another, for the appendix."""
    parts = []
    for one in src.look["slices"]:
        parts.append(
            "\\begin{table}[htbp]\\centering\\footnotesize\n"
            + slice_table(src, one)
            + f"\n\\caption{{The test rows by: {tex.esc(one['title'][:1].lower() + one['title'][1:])}.}}\n"
            + f"\\label{{tab:slice-{one['key']}}}\n\\end{{table}}"
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
    for one in look["slices"]:
        made[f"slice-{one['key']}"] = slice_table(src, one)
        made[f"slice-{one['key']}-gain"] = slice_gain_figure(src, one)
        made[f"slice-{one['key']}-said"] = slice_said_figure(src, one)
    for one in look["grids"]:
        made.update(grid_figures(src, one))
    for name in look["examples"]:
        made[f"examples-{name}"] = examples_block(src, name)
    for name, latex in made.items():
        if latex is not None:
            out.block(name, latex)
