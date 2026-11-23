"""The figures a paper shows, as pgfplots: one look for every chart of every paper.

An axis label, a legend name set as code and a grid's titles are LaTeX as
given, so whoever calls escapes what came from a file; the names of groups on
an axis are plain text and are escaped here.

A chart is picked by what its reader has to do. Scores of several runs are dots
with their intervals on one axis; a quantity over an ordered scale is a line; a
count per bin is a column; shares of one thing ranked are bars in one colour; a
table of two scales is a grid in one colour, light to dark, with its numbers
printed. A run keeps its colour wherever it appears (``RUN_COLOURS``), and a
run that changes one thing in another (more epochs, another start, another
body) is drawn as that run with a broken line, so a figure never needs a ninth
colour. Text is never coloured, and every figure has a table beside it in the
paper or in the generated leaderboard, so nothing is read from colour alone.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .tex import esc, known


# Colour follows the run. The floor is context, so it is grey, and so is what an engine or a rating says
# with nothing fitted: the lines a learner has to beat.
RUN_COLOURS = {
    "transformer-medium-hand": "labBlue",
    "gbm-hand": "labOrange",
    "transformer-medium": "labAqua",
    "transformer-small": "labYellow",
    "conv-small": "labMagenta",
    "gbm-context": "labGreen",
    "puzzle-rating": "labViolet",
    "elo-gap": "labViolet",
    "maia2": "labViolet",
    "engine-curve": "labSecondary",
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
    "elo-gap": "triangle*",
    "maia2": "triangle*",
    "engine-curve": "diamond*",
    "constant": "*",
}
# A run that changes one thing in another is drawn as that run, in its colour and with its mark, and its
# line is broken the way its change is: what was added to the name says which.
VARIANT_DASHES = {
    "long": "on 5pt off 2pt",
    "pretrained": "on 1pt off 2pt",
    "attacks": "on 5pt off 2pt on 1pt off 2pt on 1pt off 2pt",
    "no-geometry": "on 3pt off 2pt on 1pt off 2pt on 1pt off 2pt on 1pt off 2pt",
    "tower": "on 9pt off 3pt",
    "hybrid": "on 9pt off 2pt on 1pt off 2pt",
    "large": "on 2.5pt off 2.5pt",
    "double": "on 7pt off 2pt on 3pt off 2pt",
    "quadruple": "on 3pt off 1.5pt",
}
# A run that changes the body of another, or its size, is named for what it is and not for the run it
# changes. It is drawn as that run all the same: the run it changes, and the word for its change.
CHANGED = {
    "conv-medium-hand": ("transformer-medium-hand", "tower"),
    "hybrid-medium-hand": ("transformer-medium-hand", "hybrid"),
    "transformer-large-hand": ("transformer-medium-hand", "large"),
    "conv-medium": ("transformer-medium", "tower"),
    "hybrid-medium": ("transformer-medium", "hybrid"),
    "transformer-large": ("transformer-medium", "large"),
}
OTHER_DASH = "on 5pt off 2pt on 1pt off 2pt"
ACCENT = "labBlue"
QUIET = "labGray"
INK = "labInk"
# A grid of differences: the colour below its centre and the colour above it, which meet in a neutral grey.
DIVERGING = ("labBlue", "labOrange")


def family(run: str) -> str:
    """The run a run's name starts from: itself, or the run it changed one thing in.

    ``transformer-medium-hand-long`` is ``transformer-medium-hand`` trained longer, and ``gbm-hand-no-line``
    is ``gbm-hand`` without a group of features. The longest known name a run's name starts with is its family.
    A run of another body or size has the run it changes as its family (``CHANGED``).
    """
    if run in CHANGED:
        return CHANGED[run][0]
    known = [name for name in RUN_COLOURS if run == name or run.startswith(name + "-")]
    return max(known, key=len) if known else run


def variant(run: str) -> str:
    """What a run changes in its family: what its name adds (``long``, ``pretrained``, ``no-line``), the word
    for another body or size (``tower``, ``hybrid``, ``large``), or nothing."""
    return CHANGED[run][1] if run in CHANGED else run[len(family(run)) + 1 :]


def run_colour(run: str) -> str:
    return RUN_COLOURS.get(family(run), QUIET)


def run_mark(run: str) -> str:
    return RUN_MARKS.get(family(run), "*")


def run_dash(run: str) -> str | None:
    """How a run's line is broken: not at all for a run of the ladder, and by its change for a run that changes one."""
    added = variant(run)
    return VARIANT_DASHES.get(added, OTHER_DASH) if added else None


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
    dash: str | None = None


def run_series(run: str, points: Sequence[tuple[float, float]], **more) -> Series:
    """A run's series in the run's own colour and mark, its line broken when it changes another run, its name set as code."""
    return Series(run, points, colour=run_colour(run), mark=run_mark(run), code=True, dash=run_dash(run), **more)


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


def grouped_intervals(
    groups: Sequence[tuple[str, Sequence[tuple[str, float | None, float | None, float | None, str]]]],
    *,
    xlabel: str,
    reference: float | None = None,
    reference_label: str = "",
    code: bool = True,
    width: str = "0.62\\textwidth",
    row_height: float = 0.42,
) -> str:
    """Named values with their intervals on one axis, in named groups, each group's name over its rows.

    ``groups`` are ``(title, rows)`` and a row is ``(name, value, low, high, colour)``. For one kind of row
    measured in several places: one change's gain in each model. ``reference`` is the line every row is
    read against, as in ``intervals``. Rows that would run off the page are set closer (``_pitch``).
    """
    labels, body, shown = [], [], []
    slot = 0
    for title, rows in groups:
        labels.append(f"{{\\sffamily\\bfseries\\color{{labInk}}{esc(title)}}}")
        slot += 1
        for name, value, low, high, colour in rows:
            labels.append(f"{{{_name(name, code)}}}")
            if known(low) and known(high):
                body.append(
                    f"\\draw[{colour}, line width=1pt, line cap=round] (axis cs:{_number(low)},{slot}) -- (axis cs:{_number(high)},{slot});"
                )
            if known(value):
                body.append(
                    f"\\addplot[only marks, mark=*, mark size=2.1pt, color={colour}, mark options={{draw=white, line width=0.6pt}}] coordinates {{({_number(value)},{slot})}};"
                )
            shown += [part for part in (value, low, high) if known(part)]
            slot += 1
    if reference is not None:
        shown.append(reference)
        line = f"\\draw[labAxis, line width=0.6pt] (axis cs:{_number(reference)},-0.6) -- (axis cs:{_number(reference)},{slot - 0.4});"
        named = (
            f"\\node[anchor=south, font=\\sffamily\\scriptsize, text=labSecondary, inner sep=1.5pt] at (axis cs:{_number(reference)},-0.6) {{{reference_label}}};"
        )
        body = [line, *([named] if reference_label else []), *body]
    span = (max(shown) - min(shown)) or 1.0
    options = [
        f"width={width}",
        f"height={_pitch(row_height, [slot], 1.7) * slot + 1.7:.2f}cm",
        "y dir=reverse",
        f"ymin=-0.6, ymax={slot - 0.4}",
        f"ytick={{{','.join(str(index) for index in range(slot))}}}",
        f"yticklabels={{{','.join(labels)}}}",
        "ytick style={draw=none}",
        "y axis line style={draw=none}",
        "xmajorgrids",
        f"xlabel={{{xlabel}}}",
        f"xmin={_number(min(shown) - 0.08 * span)}, xmax={_number(max(shown) + 0.08 * span)}",
    ]
    return _picture(options, body)


# What a page holds of one figure under its caption, and the closest two rows of names can stand, in centimetres.
TALLEST = 19.5
CLOSEST = 0.3
# The width of a page's text in points (``papers/preamble.tex`` sets an inch of margin on a letter page), and
# the narrowest a panel's scale may be drawn, in points.
TEXT_WIDTH = 469.75
NARROWEST = 57.0


def _pitch(row_height: float, slots: Sequence[int], around: float, closest: float = CLOSEST) -> float:
    """The height of a row in a figure of rows: ``row_height``, or less when the figure would not fit its page.

    ``slots`` are the rows of each picture that stands in the one column, and ``around`` is what each picture
    needs beside its rows. A column taller than ``TALLEST`` runs off the page and takes its caption with it,
    so its rows are set closer until it fits. Rows closer than ``closest`` run into each other, and no figure
    is drawn that way: the caller has to split it.
    """
    room = TALLEST - around * len(slots)
    pitch = min(row_height, room / max(1, sum(slots)))
    if pitch < closest:
        raise ValueError(f"{sum(slots)} rows are more than one column of a figure holds on a page: split the figure")
    return pitch


def _columns(heights: Sequence[float], columns: int) -> list[list[int]]:
    """Pictures in their order, dealt into columns without splitting one, so that the tallest column is as
    short as it can be: the indexes of the pictures in each column."""
    if columns <= 1 or len(heights) <= 1:
        return [list(range(len(heights)))]
    best: list[list[int]] | None = None
    for cut in range(1, len(heights)):
        rest = [[cut + index for index in column] for column in _columns(heights[cut:], columns - 1)]
        dealt = [list(range(cut)), *rest]
        if best is None or max(sum(heights[i] for i in column) for column in dealt) < max(
            sum(heights[i] for i in column) for column in best
        ):
            best = dealt
    return best or [list(range(len(heights)))]


def interval_panels(
    groups: Sequence[tuple[str, Sequence[tuple[str, float | None, float | None, float | None, str]]]],
    *,
    xlabel: str,
    reference: float | None = None,
    code: bool = True,
    columns: int = 2,
    row_height: float = 0.34,
) -> str:
    """Named values with their intervals, a panel a group, each panel on its own scale, the panels in columns.

    ``groups`` are as in ``grouped_intervals``. For rows that are read inside their group: each network's
    gain inside its model. One scale for every group is as wide as the widest group needs and leaves the
    others a few points of it, so here a panel has the scale its own rows span. The panels keep their order,
    down one column and then the next, and none is split, so more rows than one column holds still share a
    page. ``reference`` is the line every row is read against, and ``xlabel`` names every panel's scale, once,
    under the panels. A column gives the longest name its room and the scale the rest, with the names set
    smaller when that leaves the scale too little, and a figure whose names leave it too little even then
    is refused.
    """
    groups = [(title, rows) for title, rows in groups if rows]
    slots = [len(rows) + 1 for _, rows in groups]
    # Beside its rows a panel has its scale's numbers under it and the gap to the next panel.
    around = 0.75
    dealt = _columns([count + around / row_height for count in slots], columns)
    pitch = min(_pitch(row_height, [slots[index] for index in column], around, closest=0.28) for column in dealt)
    # A name set as code is this wide at most for each letter, as a share of its size, and a group's name
    # in bold a little narrower at its own size. Twelve points stand between a name and the scale.
    share = 0.98 / len(dealt)
    longest = max((len(name) for _, rows in groups for name, *_ in rows), default=0)
    titles = 12.0 + 0.52 * 9.0 * max((len(title) for title, _ in groups), default=0)
    size, room = 7, 0.0
    for size in (7, 6):
        room = share * TEXT_WIDTH - 3.0 - max(12.0 + 0.55 * size * longest, titles)
        if room >= 74.0:
            break
    if room < NARROWEST:
        raise ValueError(f"names of {longest} letters leave a panel's scale {room:.0f} points in {len(dealt)} columns: split the figure")
    # A scale wider than five centimetres says no more, and a lone column would be given most of the page.
    plot_width = f"{min(room, 142.0):.1f}pt"
    pictures = []
    for (title, rows), count in zip(groups, slots):
        labels = [f"{{\\sffamily\\footnotesize\\bfseries\\color{{labInk}}{esc(title)}}}"]
        body, shown = [], []
        for slot, (name, value, low, high, colour) in enumerate(rows, start=1):
            labels.append(f"{{{_name(name, code)}}}")
            if known(low) and known(high):
                body.append(
                    f"\\draw[{colour}, line width=1pt, line cap=round] (axis cs:{_number(low)},{slot}) -- (axis cs:{_number(high)},{slot});"
                )
            if known(value):
                body.append(
                    f"\\addplot[only marks, mark=*, mark size=1.8pt, color={colour}, mark options={{draw=white, line width=0.5pt}}] coordinates {{({_number(value)},{slot})}};"
                )
            shown += [part for part in (value, low, high) if known(part)]
        if reference is not None:
            shown.append(reference)
            body.insert(
                0,
                f"\\draw[labAxis, line width=0.6pt] (axis cs:{_number(reference)},0.4) -- (axis cs:{_number(reference)},{count - 0.4});",
            )
        span = (max(shown) - min(shown)) or 1.0
        options = [
            "scale only axis",
            f"width={plot_width}",
            f"height={pitch * count:.2f}cm",
            "y dir=reverse",
            f"ymin=-0.6, ymax={count - 0.4}",
            f"ytick={{{','.join(str(index) for index in range(count))}}}",
            f"yticklabels={{{','.join(labels)}}}",
            f"tick label style={{font=\\sansmath\\sffamily\\fontsize{{{size}}}{{{size + 1}}}\\selectfont}}",
            "ytick style={draw=none}",
            "y axis line style={draw=none}",
            "xmajorgrids",
            f"xmin={_number(min(shown) - 0.1 * span)}, xmax={_number(max(shown) + 0.1 * span)}",
        ]
        # pgfplots: with this the picture ends at the axis's right edge, so pictures set flush right in a
        # column have their scales under one another whatever the widths of their rows' names.
        pictures.append(_picture(options, body).replace("\\begin{tikzpicture}", "\\begin{tikzpicture}[trim axis right]", 1))
    width = f"{share:.3f}\\textwidth"
    # One column stands in the middle of the page. Two or more are set flush right, scale under scale.
    side = "\\raggedleft" if len(dealt) > 1 else "\\centering"
    stacks = [
        f"\\begin{{minipage}}[t]{{{width}}}\\vspace{{0pt}}{side}\n"
        + "\\par\\vspace{0.1cm}\n".join(f"{pictures[index]}\\hspace*{{3pt}}" for index in column)
        + "\n\\end{minipage}"
        for column in dealt
    ]
    return "\\hfill\n".join(stacks) + f"\n\n\\smallskip\n{{\\sffamily\\footnotesize\\color{{labSecondary}}{xlabel}}}"


def strips(
    rows: Sequence[tuple[str, Sequence[tuple[str, float]]]],
    *,
    xlabel: str,
    marks: Sequence[tuple[float, str]] = (),
    order: Sequence[str] | None = None,
    width: str = "0.78\\textwidth",
    lane: float = 0.2,
) -> str:
    """Runs along one scale, a strip a row: where each run of each row stands, each in its own colour and mark.

    ``rows`` are ``(name, points)`` and a point is ``(run, x)``. Inside a strip each run keeps a lane of its
    own, in ``order`` or else in the order the runs first appear, so two runs at one place do not hide each
    other, and a legend names the runs once. ``marks`` are ``(x, label)``: upright lines the strips are
    read against.
    """
    order = list(order) if order is not None else list(dict.fromkeys(run for _, points in rows for run, _ in points))
    lanes = len(order)
    height = lanes * lane + 0.5
    every = [x for _, points in rows for _, x in points] + [x for x, _ in marks]
    span = (max(every) - min(every)) or 1.0
    top = -0.5 * height
    bottom = (len(rows) - 0.5) * height
    body = []
    for x, label in marks:
        body.append(f"\\draw[labAxis, line width=0.6pt] (axis cs:{_number(x)},{_number(top)}) -- (axis cs:{_number(x)},{_number(bottom)});")
        body.append(
            f"\\node[anchor=south, font=\\sffamily\\scriptsize, text=labSecondary, inner sep=1.5pt] at (axis cs:{_number(x)},{_number(top)}) {{{label}}};"
        )
    left, right = min(every) - 0.06 * span, max(every) + 0.06 * span
    for index in range(1, len(rows)):
        y = (index - 0.5) * height
        body.append(f"\\draw[labGrid, line width=0.3pt] (axis cs:{_number(left)},{_number(y)}) -- (axis cs:{_number(right)},{_number(y)});")
    for run in order:
        coordinates = " ".join(
            f"({_number(x)},{_number(index * height + (order.index(run) - (lanes - 1) / 2) * lane)})"
            for index, (_, points) in enumerate(rows)
            for name, x in points
            if name == run
        )
        body.append(
            f"\\addplot[only marks, mark={run_mark(run)}, mark size=2.4pt, color={run_colour(run)}, mark options={{draw=white, line width=0.5pt, fill={run_colour(run)}}}] coordinates {{{coordinates}}};"
        )
        body.append(f"\\addlegendentry{{{_name(run, True)}}}")
    options = [
        f"width={width}",
        f"height={len(rows) * height + 1.9:.2f}cm",
        "y dir=reverse",
        f"ymin={_number(top)}, ymax={_number(bottom)}",
        f"ytick={{{','.join(_number(index * height) for index in range(len(rows)))}}}",
        f"yticklabels={{{','.join(f'{{{_name(name, True)}}}' for name, _ in rows)}}}",
        "ytick style={draw=none}",
        "y axis line style={draw=none}",
        "xmajorgrids",
        f"xlabel={{{xlabel}}}",
        f"xmin={_number(left)}, xmax={_number(right)}",
        "legend columns=3",
        "legend style={at={(0,1.08)}, anchor=south west}",
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
        # pgfplots sets an axis's limits from its plots alone. The level is drawn, not plotted, so a plot of
        # nothing holds its place: a level far from every series is then inside the axis, not metres off it.
        body.append(f"\\addplot[draw=none, mark=none, forget plot] coordinates {{({_number(min(xs))},{_number(value)})}};")
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
        elif one.dash:
            style.append(f"dash pattern={one.dash}")
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


def panels(
    groups: Sequence[Sequence[Series]],
    *,
    xlabel: str,
    ylabel: str,
    level: tuple[float, str, str] | None = None,
    width: str = "0.5\\textwidth",
    height: str = "5.4cm",
    columns: int | None = None,
) -> str:
    """Line charts side by side on one upright scale, one a group of series, each with its own legend.

    For runs that are read in families: a run and the runs that changed one thing in it share a panel, and
    the panels share their scale, so a family is compared inside its panel and families across them.
    ``level`` is as in ``lines`` and is drawn in every panel, named in the last. With ``columns`` the
    panels fill rows of that many, each row under the legends of its own panels.
    """
    every = [y for group in groups for one in group for _, y in one.points if known(y)]
    if level is not None:
        every.append(level[0])
    span = (max(every) - min(every)) or 1.0
    low, high = min(every) - 0.06 * span, max(every) + 0.06 * span
    body = []
    for index, group in enumerate(groups):
        xs = [x for one in group for x, y in one.points if known(y)]
        left, right = min(xs) - 0.5, max(xs) + 0.5
        body.append(
            f"\\nextgroupplot[xmin={_number(left)}, xmax={_number(right)}, "
            f"xtick distance={max(1, round((right - left) / 6))}, legend columns=1]"
        )
        if level is not None:
            value, label, colour = level
            named = f" node[anchor=west, font=\\sffamily\\scriptsize, text=labSecondary, inner sep=2pt] {{{label}}}"
            body.append(
                f"\\draw[{colour}, line width=0.9pt, dash pattern=on 3pt off 2pt] (axis cs:{_number(left)},{_number(value)}) -- "
                f"(axis cs:{_number(right)},{_number(value)}){named if index == len(groups) - 1 else ''};"
            )
        for one in group:
            style = [f"color={one.colour}"]
            if one.dash:
                style.append(f"dash pattern={one.dash}")
            if one.mark:
                style.append(f"mark={one.mark}, mark size=1.5pt, mark options={{solid, draw=white, line width=0.4pt, fill={one.colour}}}")
            else:
                style.append("mark=none")
            coordinates = " ".join(f"({_number(x)},{_number(y)})" for x, y in one.points if known(y))
            body.append(f"\\addplot[{', '.join(style)}] coordinates {{{coordinates}}};")
            body.append(f"\\addlegendentry{{{_name(one.name, one.code)}}}")
    across = min(columns or len(groups), len(groups))
    down = -(-len(groups) // across)
    # A row below another leaves room for its panels' legends, and only the last row names the level axis.
    rows = ", vertical sep=1.9cm, xlabels at=edge bottom" if down > 1 else ""
    options = [
        "lab",
        f"group style={{group size={across} by {down}, horizontal sep=0.5cm{rows}, ylabels at=edge left, yticklabels at=edge left}}",
        f"width={width}",
        f"height={height}",
        "ymajorgrids",
        f"ymin={_number(low)}, ymax={_number(high)}",
        f"xlabel={{{xlabel}}}",
        f"ylabel={{{ylabel}}}",
    ]
    return (
        "\\begin{tikzpicture}\n\\begin{groupplot}[\n  "
        + _options(options)
        + ",\n]\n"
        + "\n".join(body)
        + "\n\\end{groupplot}\n\\end{tikzpicture}"
    )


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
    centre: float | None = None,
) -> str:
    """A table of two ordered scales as a grid in one colour, light to dark, each cell's number printed in it.

    ``cells[row][column]`` is ``(value, text)``; a cell with no value is left empty. The titles are LaTeX.
    With ``centre`` the grid is of differences: two colours that meet in a neutral grey at ``centre``, blue
    below it and orange above, as deep as the value is far from it, with dark ink throughout.
    """
    cell_width = max(1.3, 0.17 * max(map(len, column_labels)) + 0.25)
    span = (high - low) or 1.0
    reach = max(high - centre, centre - low) if centre is not None else 0.0
    body = ["\\begin{tikzpicture}[font=\\sffamily\\footnotesize]"]
    for r, row in enumerate(cells):
        y = -r * cell_height
        body.append(f"\\node[anchor=east, text=labSecondary] at (-0.12,{y - cell_height / 2:.3f}) {{{esc(row_labels[r])}}};")
        for c, (value, text) in enumerate(row):
            x = c * cell_width
            if value is None or not known(value):
                fill, ink = "white", "labSecondary"
            elif centre is not None:
                share = min(1.0, abs(value - centre) / reach) if reach else 0.0
                fill, ink = f"{DIVERGING[value > centre]}!{round(70 * share)}!labGrid", "labInk"
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
