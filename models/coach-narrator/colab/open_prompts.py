#!/usr/bin/env python3
"""Copies a version's narration prompts for a Colab run, keeping only the set-ups from open data.

The prompts are built on the owner's machine, under private/coach-eval/coach-sheets/.
Some of their set-ups come from puzzles of a paid course, and those never leave
the machine. This writes the five files retrain.sh reads into a folder to
upload, with every set-up that is not from Lichess left out, and refuses to
write anything when it meets an id whose source it cannot tell.

    python models/coach-narrator/colab/open_prompts.py n6 --out private/coach-narrator/upload-n6

It prints, for each file, how many set-ups it read and kept and where they came
from. A set-up's id says its source: a Lichess puzzle is `lichess:<puzzle>:<n>`,
a moment of a Lichess game is `<game>:<n>`, a course puzzle is `course:...`.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
from pathlib import Path

LAB = Path(__file__).resolve().parents[3]
SHEETS = LAB / "private" / "coach-eval" / "coach-sheets"
FILES = ("games-train", "puzzles-train", "themed-train", "games-heldout", "puzzles-heldout")
SOURCES = (
    ("Lichess puzzle", re.compile(r"lichess:[A-Za-z0-9]{4,6}:\d+"), True),
    ("Lichess game", re.compile(r"[A-Za-z0-9]{8}:\d+"), True),
    ("course puzzle", re.compile(r"course:.+"), False),
)


def source_of(moment_id: str) -> tuple[str, bool]:
    """Where a set-up comes from and whether it may leave the machine."""
    for name, shape, is_open in SOURCES:
        if shape.fullmatch(moment_id):
            return name, is_open
    raise ValueError(f"cannot tell where the set-up {moment_id!r} comes from, so nothing was written")


def open_rows(lines: list[str]) -> tuple[list[str], dict[str, int]]:
    """The lines whose set-up is from open data, and how many lines each source gave."""
    kept, counts = [], collections.Counter()
    for line in lines:
        if not line.strip():
            continue
        name, is_open = source_of(str(json.loads(line)["id"]))
        counts[name] += 1
        if is_open:
            kept.append(line if line.endswith("\n") else line + "\n")
    return kept, dict(counts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("version", help="the prompt version, such as n6")
    parser.add_argument("--sheets", type=Path, default=SHEETS)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    written, report = {}, {}
    for stem in FILES:
        name = f"narrate-prompts-{stem}-{args.version}.jsonl"
        lines = (args.sheets / name).read_text(encoding="utf-8").splitlines(keepends=True)
        kept, counts = open_rows(lines)
        written[name] = kept
        report[name] = {"read": sum(counts.values()), "kept": len(kept), "from": counts}
    args.out.mkdir(parents=True, exist_ok=True)
    for name, kept in written.items():
        (args.out / name).write_text("".join(kept), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
