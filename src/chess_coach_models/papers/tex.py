"""LaTeX as a paper's generator writes it: text, numbers, and the files a paper reads.

A paper types no number. ``lab paper <model>`` writes ``generated/values.tex``,
whose ``\\setvalue{key}{value}`` lines the prose reads back with ``\\V{key}``
(a key nobody set stops the build), and one file for each table, figure and
board, which the prose places with ``\\block{<name>}``, or for a set of example
boards with ``\\examples{<name>}{caption}{label}``. Only what the prose reads
is written, so the generated folder is as small as the paper.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Sequence
from pathlib import Path


_ESCAPES = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "^": r"\^{}",
    "_": r"\_",
    "%": r"\%",
    "~": r"\~{}",
    "<": r"\textless{}",
    ">": r"\textgreater{}",
}
_ESCAPE_RE = re.compile("|".join(re.escape(char) for char in _ESCAPES))
_KEY_RE = re.compile(r"[^A-Za-z0-9.+-]")
WORDS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve")


def esc(text: object) -> str:
    """Text as LaTeX prints it."""
    return _ESCAPE_RE.sub(lambda match: _ESCAPES[match.group()], str(text))


def known(value: float | None) -> bool:
    return value is not None and not (isinstance(value, float) and math.isnan(value))


def count(value: int | float | None) -> str:
    """A whole number with its thousands marked: 1,127,915."""
    return "n/a" if not known(value) else f"{int(round(value)):,}".replace(",", "{,}")


def fixed(value: float | None, digits: int = 1, *, sign: bool = False) -> str:
    """A fixed number of decimals with a real minus sign, and a plus when ``sign`` asks for one."""
    if not known(value):
        return "n/a"
    text = f"{value:+.{digits}f}" if sign else f"{value:.{digits}f}"
    if float(text) == 0:
        text = text.replace("-", "+" if sign else "")
    return text.replace("-", "$-$")


def score(value: float | None, *, sign: bool = False) -> str:
    """A score at the precision the leaderboards print: one decimal from a hundred up, four below one."""
    if not known(value):
        return "n/a"
    digits = 1 if abs(value) >= 100 else 3 if abs(value) >= 1 else 4
    return fixed(value, digits, sign=sign)


def sig(value: float | None, digits: int = 4, *, sign: bool = False) -> str:
    """A number to a count of significant digits, never with an exponent: 24.68, 0.004443."""
    if not known(value):
        return "n/a"
    if value == 0:
        return "0"
    decimals = max(0, digits - 1 - math.floor(math.log10(abs(value))))
    return fixed(round(value, decimals), decimals, sign=sign)


def plain(value: float | int) -> str:
    """A setting as it was written: 0.0006, 0.05, 1024, with no digits added and no exponent."""
    if isinstance(value, int):
        return count(value)
    text = f"{value:.10f}".rstrip("0").rstrip(".")
    return text.replace("-", "$-$") or "0"


def trio(value: float, low: float, high: float, *, sign: bool = True) -> tuple[str, str, str]:
    """A value and its interval's two ends at one precision: four significant digits of the largest of the three."""
    if not (known(value) and known(low) and known(high)):
        return "n/a", "n/a", "n/a"
    largest = max(abs(value), abs(low), abs(high))
    decimals = 0 if largest == 0 else max(0, 3 - math.floor(math.log10(largest)))
    return tuple(fixed(part, decimals, sign=sign) for part in (value, low, high))


def percent(share: float | None, digits: int = 1) -> str:
    """A share as a percentage, without its sign: 0.1234 is 12.3."""
    return "n/a" if not known(share) else fixed(100.0 * share, digits)


def word(number: int) -> str:
    """A count as prose writes it: a word up to twelve, digits past it."""
    return WORDS[number] if 0 <= number < len(WORDS) else count(number)


def of(part: int, whole: int, things: str) -> str:
    """A part of a counted whole as prose says it: all four networks, two of the four networks, none of the four networks."""
    if whole == 1:
        return f"the one {things}" if part else f"not the one {things}"
    if part == whole:
        return f"both {things}" if whole == 2 else f"all {word(whole)} {things}"
    if part == 0:
        return f"neither of the two {things}" if whole == 2 else f"none of the {word(whole)} {things}"
    return f"{word(part)} of the {word(whole)} {things}"


def duration(seconds: float) -> str:
    """A time as a reader wants it: seconds under a minute and a half, minutes under two hours, then hours."""
    if seconds < 90:
        return f"{seconds:.0f} s"
    if seconds < 7200:
        return f"{seconds / 60:.0f} min"
    return f"{seconds / 3600:.1f} h"


def code(markdown: str) -> str:
    """A line with Markdown's backticks, as the leaderboards write a learner, with its code set as code."""
    parts = markdown.split("`")
    return "".join(esc(part) if index % 2 == 0 else f"\\texttt{{{esc(part)}}}" for index, part in enumerate(parts))


def bold(text: str, on: bool = True) -> str:
    return f"\\textbf{{{text}}}" if on else text


def tabular(
    spec: str,
    head: Sequence[str],
    rows: Iterable[Sequence[str]],
    *,
    foot: Iterable[Sequence[str]] = (),
    width: str | None = None,
) -> str:
    """A table in the lab's one style: a rule above, under the head and below, and ``foot`` rows under their own rule.

    With ``width`` the table is a ``tabularx`` of that width, whose ``L`` and ``R`` columns share what is left.
    """
    name = "tabularx" if width else "tabular"
    lines = [f"\\begin{{{name}}}" + (f"{{{width}}}" if width else "") + f"{{{spec}}}", "\\toprule"]
    lines.append(" & ".join(head) + " \\\\")
    lines.append("\\midrule")
    lines += [" & ".join(row) + " \\\\" for row in rows]
    feet = [" & ".join(row) + " \\\\" for row in foot]
    if feet:
        lines += ["\\midrule", *feet]
    lines += ["\\bottomrule", f"\\end{{{name}}}"]
    return "\n".join(lines)


def key(*parts: object) -> str:
    """A value's key from its parts, joined by dots: ``key("run", "gbm-hand", "rmse")`` is ``run.gbm-hand.rmse``."""
    return ".".join(_KEY_RE.sub("-", str(part)) for part in parts)


def grouped(table: str, top: Sequence[str], spans: Sequence[tuple[int, int]]) -> str:
    """A table with a line of group names over its head, and a short rule under each group's columns."""
    rules = " ".join(f"\\cmidrule(lr){{{first}-{last}}}" for first, last in spans)
    return table.replace("\\toprule\n", "\\toprule\n" + " & ".join(top) + " \\\\\n" + rules + "\n", 1)


class Generated:
    """What one paper's generator writes: its values, and a file a block."""

    def __init__(self, source: str):
        self.source = source
        self.values: dict[str, str] = {}
        self.files: dict[str, str] = {}

    def set(self, name: str, value: object) -> None:
        """``\\V{name}`` prints ``value``, which is already LaTeX."""
        if _KEY_RE.search(name):
            raise ValueError(f"not a value key: {name!r}")
        if name in self.values and self.values[name] != str(value):
            raise ValueError(f"the value {name!r} is set twice, to {self.values[name]!r} and {value!r}")
        self.values[name] = str(value)

    def block(self, name: str, latex: str) -> None:
        """``\\input{generated/name}`` places ``latex``: a table, a figure, a board."""
        if not re.fullmatch(r"[a-z0-9-]+", name):
            raise ValueError(f"not a plain file name: {name!r}")
        if name in self.files:
            raise ValueError(f"the block {name!r} is written twice")
        self.files[name] = latex

    def write(
        self,
        directory: Path,
        *,
        keys: Iterable[str] | None = None,
        blocks: Iterable[str] | None = None,
        flags: Sequence[str] = (),
    ) -> None:
        """Writes ``values.tex`` and the blocks into ``directory``, and removes what an earlier run left there.

        With ``keys`` and ``blocks``, only those are written: what a paper reads. ``flags`` are lines for the top
        of ``values.tex``, such as the switch that says a closer look was there to draw from.
        """
        directory.mkdir(parents=True, exist_ok=True)
        head = f"% Written by {self.source}; do not edit by hand.\n"
        values = self.values if keys is None else {name: self.values[name] for name in keys if name in self.values}
        files = self.files if blocks is None else {name: self.files[name] for name in blocks if name in self.files}
        wanted = {"values.tex", *(f"{name}.tex" for name in files)}
        for stale in directory.glob("*.tex"):
            if stale.name not in wanted:
                stale.unlink()
        lines = [*flags, *(f"\\setvalue{{{name}}}{{{value}}}" for name, value in sorted(values.items()))]
        (directory / "values.tex").write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
        for name, latex in files.items():
            (directory / f"{name}.tex").write_text(head + latex.rstrip("\n") + "\n", encoding="utf-8")


def used_keys(latex: str) -> set[str]:
    """The value keys a paper's prose reads."""
    return set(re.findall(r"\\V\{([^{}]+)\}", latex))


def used_blocks(latex: str) -> set[str]:
    """The generated blocks a paper's prose places: with ``\\block``, or as a set of example boards with ``\\examples``."""
    return set(re.findall(r"\\(?:block|examples)\{([a-z0-9-]+)\}", latex))
