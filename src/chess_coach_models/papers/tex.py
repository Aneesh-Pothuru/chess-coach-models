"""LaTeX as a paper's generator writes it: text, numbers, and the files a paper reads.

A paper types no number. ``lab paper <model>`` writes ``generated/values.tex``,
whose ``\\setvalue{key}{value}`` lines the prose reads back with ``\\V{key}``
(a key nobody set stops the build), and one file for each table, figure and
board, which the prose places with ``\\input{generated/<name>}``.
"""

from __future__ import annotations

import math
import re
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


def percent(share: float | None, digits: int = 1) -> str:
    """A share as a percentage, without its sign: 0.1234 is 12.3."""
    return "n/a" if not known(share) else fixed(100.0 * share, digits)


def word(number: int) -> str:
    """A count as prose writes it: a word up to twelve, digits past it."""
    return WORDS[number] if 0 <= number < len(WORDS) else count(number)


def duration(seconds: float) -> str:
    """A time as a reader wants it: seconds under a minute and a half, minutes under two hours, then hours."""
    if seconds < 90:
        return f"{seconds:.0f} s"
    if seconds < 7200:
        return f"{seconds / 60:.0f} min"
    return f"{seconds / 3600:.1f} h"


def key(*parts: object) -> str:
    """A value's key from its parts, joined by dots: ``key("run", "gbm-hand", "rmse")`` is ``run.gbm-hand.rmse``."""
    return ".".join(_KEY_RE.sub("-", str(part)) for part in parts)


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

    def write(self, directory: Path) -> None:
        """Writes ``values.tex`` and every block into ``directory``, and removes what an earlier run left there."""
        directory.mkdir(parents=True, exist_ok=True)
        head = f"% Written by {self.source}; do not edit by hand.\n"
        wanted = {"values.tex", *(f"{name}.tex" for name in self.files)}
        for stale in directory.glob("*.tex"):
            if stale.name not in wanted:
                stale.unlink()
        lines = [f"\\setvalue{{{name}}}{{{value}}}" for name, value in sorted(self.values.items())]
        (directory / "values.tex").write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
        for name, latex in self.files.items():
            (directory / f"{name}.tex").write_text(head + latex.rstrip("\n") + "\n", encoding="utf-8")


def used_keys(latex: str) -> set[str]:
    """The value keys a paper's prose reads."""
    return set(re.findall(r"\\V\{([^{}]+)\}", latex))


def used_blocks(latex: str) -> set[str]:
    """The generated blocks a paper's prose places."""
    return set(re.findall(r"\\input\{generated/([a-z0-9-]+)\}", latex))
