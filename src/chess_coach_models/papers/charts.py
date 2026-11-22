"""The figures a paper shows, as pgfplots: one look for every chart of every paper.

An axis label, a legend name set as code and a grid's titles are LaTeX as
given, so whoever calls escapes what came from a file; the names of groups on
an axis are plain text and are escaped here.

A chart is picked by what its reader has to do. Scores of several runs are dots
with their intervals on one axis; a quantity over an ordered scale is a line; a
count per bin is a column; shares of one thing ranked are bars in one colour; a
table of two scales is a grid in one colour, light to dark, with its numbers
printed. A run keeps its colour wherever it appears (``RUN_COLOURS``), text is
never coloured, and every figure has a table beside it in the paper or in the
generated leaderboard, so nothing is read from colour alone.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .tex import esc, known


# Colour follows the run. The floor is context, so it is grey.
RUN_COLOURS = {
    "transformer-medium-hand": "labBlue",
    "gbm-hand": "labOrange",
    "transformer-medium": "labAqua",
    "transformer-small": "labYellow",
    "conv-small": "labMagenta",
    "gbm-context": "labGreen",
    "puzzle-rating": "labViolet",
    "constant": "labGray",
}
# Four network lines sit close on a page, so each run also keeps a mark.
RUN_MARKS = {
    "transformer-medium-hand": "*",
    "gbm-hand": "square*",
    "transformer-medium": "triangle*",
    "transformer-small": "diamond*",
    "conv-small": "pentagon*",
    "gbm-context": "square*",
    "puzzle-rating": "triangle*",
    "constant": "*",
}
ACCENT = "labBlue"
QUIET = "labGray"
INK = "labInk"


def run_colour(run: str) -> str:
    return RUN_COLOURS.get(run, QUIET)


def run_mark(run: str) -> str:
    return RUN_MARKS.get(run, "*")


@dataclass
class Series:
    name: str
    points: Sequence[tuple[float, float]]
    colour: str = ACCENT
    mark: str | None = "*"
    line: bool = True
    low: Sequence[float] = field(default_factory=tuple)
    high: Sequence[float] = field(default_factory=tuple)
    code: bool = False


def run_series(run: str, points: Sequence[tuple[float, float]], **more) -> Series:
    """A run's series in the run's own colour and mark, its name set as code."""
    return Series(run, points, colour=run_colour(run), mark=run_mark(run), code=True, **more)


def _number(value: float) -> str:
    return f"{value:.6g}"


def _options(options: Sequence[str]) -> str:
    return ",\n  ".join(option for option in options if option)


def _picture(axis_options: Sequence[str], body: Sequence[str]) -> str:
    return (
        "\\begin{tikzpicture}\n\\begin{axis}[\n  lab,\n  "
        + _options(axis_options)
        + ",\n]\n"
        + "\n".join(body)
        + "\n\\end{axis}\n\\end{tikzpicture}"
    )


def _name(text: str, code: bool) -> str:
    return f"\\texttt{{{esc(text)}}}" if code else esc(text)


def _ticks(labels: Sequence[str]) -> list[str]:
    positions = ",".join(str(index) for index in range(len(labels)))
    turned = sum(map(len, labels)) > 46
    return [
        f"xtick={{{positions}}}",
        "xticklabels={" + ",".join(f"{{{esc(label)}}}" for label in labels) + "}",
        f"xmin=-0.5, xmax={len(labels) - 0.5}",
        *(["x tick label style={labSecondary, rotate=30, anchor=north east}"] if turned else []),
    ]


def intervals(
    rows: Sequence[tuple[str, float | None, float | None, float | None]],
    *,
    xlabel: str,
    reference: float | None = None,
    reference_label: str = "",
    colours: Sequence[str] | None = None,
    code: bool = True,
    width: str = "0.6\\textwidth",
    row_height: float = 0.5,
) -> str:
    """Each row a named value with its interval, on one axis, the first row on top.

    ``reference`` draws a line every row is read against (zero for a gain, the reference run's score for a
    score). ``colours`` gives each row's colour, a run's own when the rows are runs; without it every row is
    ink. A row with no value keeps its place and shows nothing.
    """
    count = len(rows)
    labels = ",".join(f"{{{_name(name, code)}}}" for name, *_ in rows)
    body = []
    if reference is not None:
        body.append(
            f"\\draw[labAxis, line width=0.6pt] (axis cs:{_number(reference)},-0.6) -- (axis cs:{_number(reference)},{count - 0.4});"
        )
        if reference_label:
            body.append(
                f"\\node[anchor=south, font=\\sffamily\\scriptsize, text=labSecondary, inner sep=1.5pt] at (axis cs:{_number(reference)},-0.6) {{{reference_label}}};"
            )
    for index, (_, value, low, high) in enumerate(rows):
        colour = colours[index] if colours else INK
        if known(low) and known(high):
            body.append(
                f"\\draw[{colour}, line width=1pt, line cap=round] (axis cs:{_number(low)},{index}) -- (axis cs:{_number(high)},{index});"
            )
        if known(value):
            body.append(
                f"\\addplot[only marks, mark=*, mark size=2.1pt, color={colour}, mark options={{draw=white, line width=0.6pt}}] coordinates {{({_number(value)},{index})}};"
            )
    shown = [part for _, value, low, high in rows for part in (value, low, high) if known(part)]
    if reference is not None:
        shown.append(reference)
    span = (max(shown) - min(shown)) or 1.0
    options = [
        f"width={width}",
        f"height={row_height * count + 1.7:.2f}cm",
        "y dir=reverse",
        f"ymin=-0.6, ymax={count - 0.4}",
        f"ytick={{{','.join(str(index) for index in range(count))}}}",
        f"yticklabels={{{labels}}}",
        "ytick style={draw=none}",
        "y axis line style={draw=none}",
        "xmajorgrids",
        f"xlabel={{{xlabel}}}",
        f"xmin={_number(min(shown) - 0.08 * span)}, xmax={_number(max(shown) + 0.08 * span)}",
    ]
    return _picture(options, body)


def lines(
    series: Sequence[Series],
    *,
    xlabel: str,
    ylabel: str,
    tick_labels: Sequence[str] | None = None,
    width: str = "0.62\\textwidth",
    height: str = "5.2cm",
    diagonal: bool = False,
    level: tuple[float, str, str] | None = None,
    legend_columns: int = -1,
    extra: Sequence[str] = (),
) -> str:
    """Quantities over an ordered scale: one line a series, a legend when there are two or more.

    ``tick_labels`` names the positions 0, 1, 2 and so on, for a scale of bands or bins. ``diagonal`` draws
    the line where the two axes agree, for what was said against what happened. ``level`` is
    ``(value, label, colour)``: a dashed line across the plot that every series is read against, named at its
    right end. A series with ``low`` and ``high`` gets a wash between them.
    """
    body = []
    xs = [x for one in series for x, y in one.points if known(y)]
    if diagonal:
        every = [value for one in series for point in one.points for value in point if known(value)]
        low, high = min(every), max(every)
        body.append(
            f"\\addplot[labAxis, line width=0.6pt, mark=none, forget plot] coordinates {{({_number(low)},{_number(low)}) ({_number(high)},{_number(high)})}};"
        )
    if level is not None and xs:
        value, label, colour = level
        left, right = (-0.5, len(tick_labels) - 0.5) if tick_labels is not None else (min(xs), max(xs))
        body.append(
            f"\\draw[{colour}, line width=0.9pt, dash pattern=on 3pt off 2pt] (axis cs:{_number(left)},{_number(value)}) -- "
            f"(axis cs:{_number(right)},{_number(value)}) node[anchor=west, font=\\sffamily\\scriptsize, text=labSecondary, inner sep=2pt] {{{label}}};"
        )
    for one in series:
        points = [(x, y) for x, y in one.points if known(y)]
        if one.low and one.high:
            lower = " ".join(f"({_number(x)},{_number(low)})" for (x, _), low in zip(one.points, one.low) if known(low))
            upper = " ".join(
                f"({_number(x)},{_number(high)})" for (x, _), high in reversed(list(zip(one.points, one.high))) if known(high)
            )
            body.append(
                f"\\addplot[draw=none, mark=none, fill={one.colour}, fill opacity=0.14, forget plot] coordinates {{{lower} {upper}}} -- cycle;"
            )
        style = [f"color={one.colour}"]
        if not one.line:
            style.append("only marks")
        if one.mark:
            style.append(f"mark={one.mark}, mark size=1.9pt, mark options={{solid, draw=white, line width=0.5pt, fill={one.colour}}}")
        else:
            style.append("mark=none")
        coordinates = " ".join(f"({_number(x)},{_number(y)})" for x, y in points)
        body.append(f"\\addplot[{', '.join(style)}] coordinates {{{coordinates}}};")
        if len(series) > 1:
            body.append(f"\\addlegendentry{{{_name(one.name, one.code)}}}")
    options = [
        f"width={width}",
        f"height={height}",
        "ymajorgrids",
        f"xlabel={{{xlabel}}}",
        f"ylabel={{{ylabel}}}",
        f"legend columns={legend_columns}",
        *(_ticks(tick_labels) if tick_labels is not None else []),
        *extra,
    ]
    return _picture(options, body)


def columns(
    edges: Sequence[float],
    counts: Sequence[float],
    *,
    xlabel: str,
    ylabel: str,
    width: str = "0.62\\textwidth",
    height: str = "4.6cm",
    colour: str = ACCENT,
    extra: Sequence[str] = (),
) -> str:
    """Counts in bins on a continuous scale: one column a bin, in one colour, since it is one series."""
    coordinates = " ".join(f"({_number(edge)},{_number(value)})" for edge, value in zip(edges, [*counts, counts[-1]]))
    options = [
        f"width={width}",
        f"height={height}",
        "ymajorgrids",
        "ymin=0",
        f"xlabel={{{xlabel}}}",
        f"ylabel={{{ylabel}}}",
        "enlarge x limits=0.02",
        "lab counts",
        *extra,
    ]
    body = [f"\\addplot[ybar interval=0.9, fill={colour}, draw=none] coordinates {{{coordinates}}};"]
    return _picture(options, body)


def bars(
    labels: Sequence[str],
    series: Sequence[tuple[str, str, Sequence[float | None]]],
    *,
    xlabel: str,
    ylabel: str,
    width: str = "0.62\\textwidth",
    height: str = "4.8cm",
    ymin: float | None = 0.0,
    code: bool = False,
    extra: Sequence[str] = (),
) -> str:
    """Named groups in a fixed order, one column a series in each: ``series`` are ``(name, colour, values)``."""
    bar = max(2.5, min(9.0, 150.0 / (len(labels) * len(series) + len(labels))))
    body = []
    for name, colour, values in series:
        coordinates = " ".join(f"({index},{_number(value)})" for index, value in enumerate(values) if known(value))
        body.append(f"\\addplot[ybar, fill={colour}, draw=white, line width=0.5pt] coordinates {{{coordinates}}};")
        if len(series) > 1:
            body.append(f"\\addlegendentry{{{_name(name, code)}}}")
    options = [
        f"width={width}",
        f"height={height}",
        "ybar",
        f"bar width={bar:.1f}pt",
        "ymajorgrids",
        *([f"ymin={_number(ymin)}"] if ymin is not None else []),
        f"xlabel={{{xlabel}}}",
        f"ylabel={{{ylabel}}}",
        *_ticks(labels),
        "xtick style={draw=none}",
        "area legend",
        *extra,
    ]
    return _picture(options, body)


def ranked(
    rows: Sequence[tuple[str, float]],
    *,
    xlabel: str,
    labels: Sequence[str] | None = None,
    colour: str = ACCENT,
    width: str = "0.5\\textwidth",
    row_height: float = 0.42,
    code: bool = False,
) -> str:
    """Named amounts, largest first as given, as bars in one colour with each amount at its bar's end."""
    count = len(rows)
    names = ",".join(f"{{{_name(name, code)}}}" for name, _ in rows)
    shown = labels if labels is not None else [f"{value:.3g}" for _, value in rows]
    coordinates = " ".join(f"({_number(value)},{index})" for index, (_, value) in enumerate(rows))
    body = [f"\\addplot[xbar, fill={colour}, draw=none, bar width=5.5pt] coordinates {{{coordinates}}};"]
    for index, ((_, value), label) in enumerate(zip(rows, shown)):
        anchor = "west" if value >= 0 else "east"
        body.append(
            f"\\node[anchor={anchor}, font=\\sffamily\\scriptsize, text=labSecondary] at (axis cs:{_number(value)},{index}) {{{label}}};"
        )
    low = min(0.0, min(value for _, value in rows))
    options = [
        f"width={width}",
        f"height={row_height * count + 1.5:.2f}cm",
        "y dir=reverse",
        f"ymin=-0.6, ymax={count - 0.4}",
        f"ytick={{{','.join(str(index) for index in range(count))}}}",
        f"yticklabels={{{names}}}",
        "ytick style={draw=none}",
        "y axis line style={draw=none}",
        "xmajorgrids",
        f"xmin={_number(low)}",
        "enlarge x limits={upper, value=0.16}",
        f"xlabel={{{xlabel}}}",
    ]
    return _picture(options, body)


def grid(
    row_labels: Sequence[str],
    column_labels: Sequence[str],
    cells: Sequence[Sequence[tuple[float | None, str]]],
    *,
    row_title: str,
    column_title: str,
    low: float,
    high: float,
    cell_height: float = 0.6,
) -> str:
    """A table of two ordered scales as a grid in one colour, light to dark, each cell's number printed in it.

    ``cells[row][column]`` is ``(value, text)``; a cell with no value is left empty. The titles are LaTeX.
    """
    cell_width = max(1.3, 0.17 * max(map(len, column_labels)) + 0.25)
    span = (high - low) or 1.0
    body = ["\\begin{tikzpicture}[font=\\sffamily\\footnotesize]"]
    for r, row in enumerate(cells):
        y = -r * cell_height
        body.append(f"\\node[anchor=east, text=labSecondary] at (-0.12,{y - cell_height / 2:.3f}) {{{esc(row_labels[r])}}};")
        for c, (value, text) in enumerate(row):
            x = c * cell_width
            if value is None or not known(value):
                fill, ink = "white", "labSecondary"
            else:
                share = max(0.0, min(1.0, (value - low) / span))
                fill = f"labBlue!{round(8 + 82 * share)}!white"
                ink = "white" if share > 0.55 else "labInk"
            body.append(
                f"\\node[minimum width={cell_width - 0.05:.2f}cm, minimum height={cell_height - 0.05:.2f}cm, inner sep=0pt, "
                f"fill={fill}, text={ink}, anchor=north west] at ({x:.3f},{y:.3f}) {{{text}}};"
            )
    for c, label in enumerate(column_labels):
        body.append(
            f"\\node[anchor=base, text=labSecondary] at ({c * cell_width + cell_width / 2:.3f},0.14) {{{esc(label)}}};"
        )
    total = len(column_labels) * cell_width
    body.append(f"\\node[anchor=south, text=labSecondary] at ({total / 2:.3f},0.5) {{{column_title}}};")
    body.append(
        f"\\node[anchor=south, text=labSecondary, rotate=90] at ({-0.3 - 0.17 * max(map(len, row_labels)):.3f},{-len(row_labels) * cell_height / 2:.3f}) {{{row_title}}};"
    )
    body.append("\\end{tikzpicture}")
    return "\n".join(body)
