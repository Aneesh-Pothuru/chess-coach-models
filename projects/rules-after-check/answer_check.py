#!/usr/bin/env python3
"""Check that writing the answer changed nothing the freeze covers but prose.

The answer was written after the run, so this README no longer matches the
freeze's digests, and rules-of-thumb's README answer was brought up to date
with the app after this run read it. `frozen-readme.md` keeps this README as
it stood when frozen, byte for byte: it must match the freeze, and the README
must equal it before `## Files` everywhere but the answer. Every other frozen
source, the predecessor's included, must be unchanged, and the predecessor's
README may differ only in its answer, which its own answer check confirms.
Like `freeze.py --sources-only`, it needs the two cached app checkouts.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import freeze

PROJECT = Path(__file__).resolve().parent
ANSWER = b"**The answer.**"
NEXT = b"If a rule holds after the check, a lesson"
PROSE = {"README.md"}


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


def verify(project=PROJECT):
    saved = freeze.read_json(project / "manifest.json")
    frozen = (project / "frozen-readme.md").read_bytes()
    require(hashlib.sha256(frozen).hexdigest() == saved["readmeSha256"], "frozen-readme.md is not the README the run froze")
    require(hashlib.sha256(rule_prefix(frozen)).hexdigest() == saved["rule"]["sha256"], "frozen-readme.md is not the frozen rule")
    require(without_answer((project / "README.md").read_bytes()) == without_answer(frozen),
            "the README changed outside its answer")
    live = freeze.snapshot()
    changed = {name for name, expected in saved["predecessorFiles"].items()
               if live["predecessorFiles"].get(name) != expected}
    require(set(live["predecessorFiles"]) == set(saved["predecessorFiles"]) and changed <= PROSE,
            "a predecessor source or result changed")
    live["rule"], live["readmeSha256"] = saved["rule"], saved["readmeSha256"]
    live["predecessorFiles"] = saved["predecessorFiles"]
    require(live == saved, "a frozen source, app, asset or input manifest changed")
    return sorted(changed)


if __name__ == "__main__":
    changed = verify()
    note = f" The predecessor's {', '.join(changed)} changed only in its answer." if changed else ""
    print(f"The README differs from the frozen rule only in its answer.{note}")
