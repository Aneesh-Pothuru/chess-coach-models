#!/usr/bin/env python3
"""Check that writing the answer changed nothing the two freezes cover.

The answer was written after both runs, so the README's rule digests no
longer match the manifests. `frozen-readme.md` keeps the README as it stood
before the answer, byte for byte: it must match both frozen digests, and the
README must equal it everywhere before `## Files` except the answer.
"""
from __future__ import annotations

import json
from pathlib import Path

import freeze_null

PROJECT = Path(__file__).resolve().parent
ANSWER = b"**The answer.**"
NEXT = b"A rule that holds, with the cases where it fails,"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def without_answer(raw):
    prefix = raw.split(b"## Files\n", 1)[0]
    require(prefix.count(ANSWER) == 1 and prefix.count(NEXT) == 1, "README answer boundaries are ambiguous")
    start, end = prefix.index(ANSWER), prefix.index(NEXT)
    require(start < end, "README answer is not before the paragraph that follows it")
    return prefix[:start] + prefix[end:]


def verify(project=PROJECT):
    frozen = (project / "frozen-readme.md").read_bytes()
    phase2 = json.loads((project / "phase2-manifest.json").read_text())
    null = json.loads((project / "null-manifest.json").read_text())
    rule = freeze_null.rule_parts(frozen)
    require(rule["originalRuleSha256"] == phase2["rule"]["sha256"], "the frozen README is not phase two's rule")
    require(rule == null["rule"], "the frozen README is not the addition's rule")
    require(without_answer((project / "README.md").read_bytes()) == without_answer(frozen),
            "the README changed outside its answer")


if __name__ == "__main__":
    verify()
    print("The README differs from both frozen rules only in its answer.")
