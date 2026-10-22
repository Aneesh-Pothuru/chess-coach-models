#!/usr/bin/env python3
"""Check that writing the answer changed nothing the freeze covers but prose.

The answer was written after the run, so this README no longer matches the
freeze's digests. `frozen-readme.md` keeps the README as it stood when frozen,
byte for byte: it must match the freeze, and the README must equal it before
`## Files` everywhere but the answer. Every other frozen source, the app's
code, its lockfile, its assets and the input manifest must be unchanged. The
installed packages are a tree on the machine that ran the study; they are
compared only where that tree is the one the freeze names, and elsewhere the
lockfile stands for them.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import shutil
import tempfile

import freeze

PROJECT = Path(__file__).resolve().parent
ANSWER = b"**The answer.**"
NEXT = b"If a rule breaks the tie, a lesson"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def rule_prefix(raw):
    require(raw.count(b"## Files\n") == 1, "README Files boundary is ambiguous")
    return raw.split(b"## Files\n", 1)[0]


def without_answer(raw):
    prefix = rule_prefix(raw)
    require(prefix.count(ANSWER) == 1 and prefix.count(NEXT) == 1, "README answer boundaries are ambiguous")
    start, end = prefix.index(ANSWER), prefix.index(NEXT)
    require(start < end, "README answer is not before the paragraph that follows it")
    return prefix[:start] + prefix[end:]


def frozen_snapshot(project):
    """The freeze's snapshot of the project with frozen-readme.md in the README's place."""
    view = Path(tempfile.mkdtemp(prefix="tiebreak-frozen-"))
    try:
        for name in {*freeze.FILES, "app-pin.json", "input-manifest.json"}:
            (view / name).parent.mkdir(parents=True, exist_ok=True)
            (view / name).symlink_to(project / name)
        (view / "README.md").symlink_to(project / "frozen-readme.md")
        return freeze.snapshot(project=view)
    finally:
        shutil.rmtree(view)


def verify(project=PROJECT):
    saved = freeze.read_json(project / "manifest.json")
    frozen = (project / "frozen-readme.md").read_bytes()
    require(hashlib.sha256(frozen).hexdigest() == saved["readmeSha256"], "frozen-readme.md is not the README the run froze")
    require(hashlib.sha256(rule_prefix(frozen)).hexdigest() == saved["rule"]["sha256"], "frozen-readme.md is not the frozen rule")
    require(without_answer((project / "README.md").read_bytes()) == without_answer(frozen),
            "the README changed outside its answer")
    live = frozen_snapshot(project)
    same_tree = live["appCode"]["dependencies"]["resolvedPath"] == saved["appCode"]["dependencies"]["resolvedPath"]
    if not same_tree:
        live["appCode"]["dependencies"] = saved["appCode"]["dependencies"]
    require(live == saved, "a frozen source, app, asset or input manifest changed")
    return same_tree


if __name__ == "__main__":
    same_tree = verify()
    tree = ("and the installed packages are the frozen tree" if same_tree
            else "and the lockfile stands for the installed packages, which are compared only on the machine that ran the study")
    print(f"The README differs from the frozen rule only in its answer; every other frozen source matches, {tree}.")
