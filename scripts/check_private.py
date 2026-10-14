#!/usr/bin/env python3
"""Fails if a tracked file carries the player's own data.

This repository is public, and the coaching app it serves is one player's.
That player's games, notes, calibration answers and profile stay in the app's
private repository, or here under private/, which git ignores. This checks
every tracked file for the shapes that data takes. PRIVATE_PATTERNS (one
regular expression per line, kept as a CI secret) adds patterns that would
themselves be private if written here, such as an account name.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PATTERNS = [
    # A link to one chess.com game names the player and the game.
    ("chess.com game link", re.compile(r"chess\.com/(?:game|live|daily|analysis/game)/", re.I)),
    # A PGN exported from chess.com is the player's game, never Lichess data.
    ("chess.com PGN", re.compile(r'\[Site\s+"Chess\.com"\]', re.I)),
]


def tracked_files() -> list[str]:
    out = subprocess.run(
        ["git", "-C", str(ROOT), "ls-files", "-z"],
        check=True,
        stdout=subprocess.PIPE,
    )
    return [name for name in out.stdout.decode().split("\0") if name]


def main() -> int:
    patterns = list(PATTERNS)
    for line in os.environ.get("PRIVATE_PATTERNS", "").splitlines():
        if line.strip():
            patterns.append(("private pattern", re.compile(line.strip(), re.I)))

    names = tracked_files()
    problems = []
    for name in names:
        if name.split("/", 1)[0] == "private":
            problems.append(f"{name}: tracked under private/")
            continue
        path = ROOT / name
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for label, pattern in patterns:
            match = pattern.search(text)
            if match:
                line = text.count("\n", 0, match.start()) + 1
                # Say where, never what: a private pattern's match is private.
                problems.append(f"{name}:{line}: {label}")
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"{len(problems)} private item(s) in tracked files", file=sys.stderr)
        return 1
    print(f"no private data in {len(names)} tracked files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
