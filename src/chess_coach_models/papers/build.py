"""A model's paper, drawn and compiled.

``lab paper <model>`` reads the model's committed files (``sources.py``),
writes ``models/<model>/paper/generated/`` from them, and compiles
``paper.tex`` beside it into ``paper.pdf``. The prose is typed and says what
the numbers mean; every number, table, figure and board is generated, and
only the ones the prose reads are written.

A paper is strict: a value or a block its prose reads and the model's files
cannot give stops the build, before LaTeX runs. Two things are let through.
What stands inside a switch that is off waits: ``\\iflook ... \\fi`` for the
closer look, so a paper can be drawn before ``lab analyse`` has run where the
predictions are, and ``\\ifpairs``, ``\\ifvariants``, ``\\ifshapes``,
``\\ifgames`` and ``\\iffeatures`` for runs a model may not have yet, with
``\\ifchanges`` for any of the five, ``\\ifmore`` for a run on more games
than the run it changes, and ``\\ifshown`` and ``\\ifshownpaired`` for a
model read against the one that is shown more (``switches``). And a smoke
build (``--smoke``) draws the same prose from the small check's records under
``artifacts/smoke-papers/``, printing a mark where the check has no such run:
it proves the paper compiles, and is never a result.
"""

from __future__ import annotations

import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path

from .. import paths
from . import changes, closer, results, shown, tex
from .sources import Sources, read


SHARED = re.compile(r"\\input\{\.\./\.\./\.\./papers/([a-z0-9-]+)\}")
CONDITIONAL = re.compile(r"\\(if[A-Za-z]*|else|fi)(?![A-Za-z])")
COMMENT = re.compile(r"(?<!\\)%.*")


def generate(model: str, *, smoke: bool = False) -> tuple[Sources, tex.Generated]:
    """Everything a model's files give a paper: every value and every block."""
    src = read(model, smoke=smoke)
    out = tex.Generated(f"`lab paper {model}{' --smoke' if smoke else ''}`")
    results.values(src, out)
    results.blocks(src, out)
    changes.values(src, out)
    changes.blocks(src, out)
    shown.values(src, out)
    shown.blocks(src, out)
    if src.closer:
        closer.values(src, out)
        closer.blocks(src, out)
    return src, out


def switches(src: Sources, out: tex.Generated) -> dict[str, bool]:
    """What a paper may ask before it reads: each is ``\\if<name>`` in its prose, on when the model's files give
    what the name stands for."""
    found = {
        "pairs": "pairs" in out.files,
        "variants": "variants" in out.files,
        "shapes": "shapes" in out.files,
        "games": "study-games" in out.files,
        "features": "study-features" in out.files,
    }
    beside = {"shown": "shown" in out.files, "shownpaired": bool(shown.measured(src))}
    return {
        "look": src.closer,
        "chance": src.task.kind == "binary",
        "sequence": src.sequence,
        **found,
        "changes": any(found.values()),
        "more": bool(changes.more(src)),
        **beside,
    }


def firm(text: str, flags: dict[str, bool]) -> str:
    """A paper's prose as this build prints it: without the side of each switch in ``flags`` that is off.
    A conditional that is no switch of the lab's keeps both its sides."""
    kept, stack, last = [], [], 0
    for match in CONDITIONAL.finditer(text):
        if all(frame is not False for frame in stack):
            kept.append(text[last : match.start()])
        word = match.group(1)
        if word.startswith("if"):
            stack.append(flags.get(word[2:]))
        elif word == "else":
            if stack and stack[-1] is not None:
                stack[-1] = not stack[-1]
        elif stack:
            stack.pop()
        last = match.end()
    if all(frame is not False for frame in stack):
        kept.append(text[last:])
    return "".join(kept)


def missing(printed: str, out: tex.Generated) -> list[str]:
    """What a paper's printed prose reads and its generator did not make."""
    return sorted(
        [f"the value {key}" for key in tex.used_keys(printed) if key not in out.values]
        + [f"the block {name}" for name in tex.used_blocks(printed) if name not in out.files]
    )


def prose(model: str) -> str:
    """A paper's typed words, without their comments: its ``paper.tex`` and the shared sections it reads from ``papers/``."""
    path = paths.paper(model) / "paper.tex"
    if not path.exists():
        raise FileNotFoundError(
            f"{path} is not written yet: `lab paper {model} --list` shows the values and blocks it can read"
        )
    text = COMMENT.sub("", path.read_text(encoding="utf-8"))
    shared = [paths.papers() / f"{name}.tex" for name in SHARED.findall(text) if name != "preamble"]
    return text + "".join(COMMENT.sub("", part.read_text(encoding="utf-8")) for part in shared)


def write(model: str, *, smoke: bool = False) -> Path:
    """Writes the generated folder of a model's paper, and for a smoke build the prose beside it. Returns the paper's folder."""
    src, out = generate(model, smoke=smoke)
    text = prose(model)
    asked_keys, asked_blocks = tex.used_keys(text), tex.used_blocks(text)
    flags = switches(src, out)
    if not smoke:
        lacking = missing(firm(text, flags), out)
        if lacking:
            raise KeyError(
                f"{model}'s paper reads what its files do not give: {', '.join(lacking)}. "
                f"`lab paper {model} --list` shows what there is"
            )
    folder = paths.paper(model, smoke=smoke)
    lines = [f"\\{name}{'true' if on else 'false'}" for name, on in flags.items()] + (["\\lablenienttrue"] if smoke else [])
    out.write(folder / "generated", keys=asked_keys, blocks=asked_blocks, flags=lines)
    if smoke:
        shutil.copy(paths.paper(model) / "paper.tex", folder / "paper.tex")
        shared = folder.parents[2] / "papers"
        shared.mkdir(parents=True, exist_ok=True)
        for part in [*paths.papers().glob("*.tex"), *paths.papers().glob("*.bib")]:
            shutil.copy(part, shared / part.name)
    return folder


def compile_paper(folder: Path, *, log: Callable[[str], None] = print) -> Path | None:
    """``paper.tex`` in ``folder`` as ``paper.pdf``, or nothing on a machine without LaTeX."""
    latexmk = shutil.which("latexmk")
    if latexmk is None:
        log("latexmk is not installed here: the generated files are written, and the PDF waits for a machine with LaTeX")
        return None
    done = subprocess.run(
        [latexmk, "-pdf", "-bibtex", "-interaction=nonstopmode", "-halt-on-error", "paper.tex"],
        cwd=folder,
        capture_output=True,
        text=True,
        errors="replace",
    )
    if done.returncode != 0:
        # LaTeX's own log has the error and the line it stopped at; latexmk's output only says that it failed.
        log_file = folder / "paper.log"
        lines = (log_file.read_text(errors="replace") if log_file.exists() else done.stdout).splitlines()
        first = next((index for index, line in enumerate(lines) if line.startswith("!")), max(0, len(lines) - 30))
        # What a failed build leaves behind makes latexmk take the next one for done, so it is cleared.
        subprocess.run([latexmk, "-C", "-bibtex", "paper.tex"], cwd=folder, capture_output=True, text=True, errors="replace")
        raise RuntimeError(f"{folder / 'paper.tex'} did not compile:\n" + "\n".join(lines[first : first + 12]))
    subprocess.run([latexmk, "-c", "-bibtex", "paper.tex"], cwd=folder, capture_output=True, text=True, errors="replace")
    return folder / "paper.pdf"


def listing(model: str, *, smoke: bool = False) -> str:
    """Every value and block a model's files give, for whoever writes its prose."""
    _, out = generate(model, smoke=smoke)
    width = max(map(len, out.values), default=0)
    lines = [f"{name:<{width}}  {value}" for name, value in sorted(out.values.items())]
    return "\n".join([*lines, "", "blocks: " + " ".join(sorted(out.files))])
