#!/usr/bin/env python3
"""Advance equal source prefixes until the registered paired-player count.

Two nice-10 stream processes at most; no outcomes are read. Each source stops
at the first complete frame beyond the next million-game boundary. The two
initial months are mandatory; any further months need a new explicit call.
"""
from __future__ import annotations

import argparse
import json
import signal
import subprocess
import sys
from pathlib import Path

from cohort import PRIVATE, TARGET_PLAYERS, run

HERE = Path(__file__).resolve().parent
STEP = 1_000_000


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", nargs="+", default=["2026-09", "2026-08"])
    ap.add_argument("--max-checkpoints", type=int, default=0, help="optional count-only stopping checkpoint; later calls resume")
    args = ap.parse_args()
    if len(args.months) < 2 or len(args.months) > 4 or len(set(args.months)) != len(args.months):
        ap.error("two to four distinct cumulative months are required")
    PRIVATE.mkdir(parents=True, exist_ok=True)
    checked = 0
    stopping = False
    children = []

    def request_stop(_signum, _frame):
        nonlocal stopping
        stopping = True
        for child, _log in children:
            if child.poll() is None:
                child.send_signal(signal.SIGTERM)

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    while True:
        states = {}
        for month in args.months:
            path = PRIVATE / f"games-{month}.json"
            states[month] = json.loads(path.read_text()) if path.exists() else None
        if len(args.months) > 2 and any(not state or not state["complete"]
                                       for month, state in states.items() if month != args.months[-1]):
            ap.error("finish the earlier months before adding another month")
        if all(states.values()):
            result = run(args.months, "auto", False)
            count = result["byK"]["2"]["primaryPlayers"]
            print(json.dumps({"primaryK2": count,
                              "read": {m: s["counts"]["gamesRead"] for m, s in states.items()}}), flush=True)
            if count >= TARGET_PLAYERS or all(s["complete"] for s in states.values()):
                run(args.months, "auto", True)
                return 0
        if stopping:
            return 0
        incomplete = [s for s in states.values() if s is None or not s["complete"]]
        minimum = min(s["counts"]["gamesRead"] if s else 0 for s in incomplete)
        next_count = (minimum // STEP + 1) * STEP
        children = []
        for month, state in states.items():
            if state and (state["complete"] or state["counts"]["gamesRead"] >= next_count):
                continue
            log = (PRIVATE / f"stream-{month}.log").open("a")
            command = ["nice", "-n", "10", sys.executable, str(HERE / "stream.py"),
                       "--month", month, "--max-games", str(next_count)]
            children.append((subprocess.Popen(command, stdout=log, stderr=log), log))
        codes = []
        for child, log in children:
            codes.append(child.wait())
            log.close()
        if any(codes) and not stopping:
            raise SystemExit(f"stream exit codes {codes}; durable checkpoints are retained")
        checked += 1
        if stopping or (args.max_checkpoints and checked >= args.max_checkpoints):
            run(args.months, "auto", False)
            return 0


if __name__ == "__main__":
    sys.exit(main())
