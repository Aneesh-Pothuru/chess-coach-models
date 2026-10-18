#!/usr/bin/env python3
"""Keep rated Lichess games between two players rated 2200 or more.

Streams one month of the Lichess database (CC0) in file order and writes the
games it keeps to private/positions-like-this/strong-<month>.jsonl.gz, one JSON
object a line: the game's id, both ratings, the speed, the time control, the
result, the moves in SAN and each move's clock in seconds. The chess is done in
the app's own code (index.mjs).

A game is kept when it is a rated blitz, rapid or classical game, both players
are rated 2200 or more, it ended normally or on time, and it has at least 30
plies. The stream stops at the cap, so the same month always keeps the same
games.

    python3 projects/positions-like-this/stream.py
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

import zstandard

LAB = Path(__file__).resolve().parents[2]
PROJECT = "positions-like-this"
URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"
MONTH = "2026-09"
SPEEDS = {"Blitz", "Rapid", "Classical"}
FLOOR = 2200
TERMINATIONS = {"Normal", "Time forfeit"}
MIN_PLIES = 30
CAP = 400_000

TOKEN = re.compile(r"\{([^}]*)\}|(\S+)")
CLOCK = re.compile(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]")
RESULT = re.compile(r"^(1-0|0-1|1/2-1/2|\*)$")
NUMBER = re.compile(r"^\d+\.+$")


def moves_of(movetext: str) -> tuple[list[str], list[float | None]]:
    sans: list[str] = []
    clocks: list[float | None] = []
    for m in TOKEN.finditer(movetext):
        comment, tok = m.group(1), m.group(2)
        if comment is not None:
            c = CLOCK.search(comment)
            if c and sans and clocks[-1] is None:
                clocks[-1] = int(c.group(1)) * 3600 + int(c.group(2)) * 60 + float(c.group(3))
            continue
        tok = re.sub(r"^\d+\.+", "", tok)
        if not tok or NUMBER.match(tok) or RESULT.match(tok) or tok.startswith("$"):
            continue
        sans.append(re.sub(r"[?!]+$", "", tok))
        clocks.append(None)
    return sans, clocks


def speed_of(event: str) -> str | None:
    if not event.startswith("Rated "):
        return None
    word = event[len("Rated "):].split(" ", 1)[0]
    return word if word in SPEEDS else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default=MONTH)
    ap.add_argument("--cap", type=int, default=CAP)
    args = ap.parse_args()

    out_dir = LAB / "private" / PROJECT
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"strong-{args.month}.jsonl.gz"
    tmp_path = out_path.with_suffix(".partial")
    read = kept = 0
    speeds: dict[str, int] = {}
    started = time.time()

    req = urllib.request.Request(URL.format(month=args.month), headers={"User-Agent": "chess-coach-models"})
    with urllib.request.urlopen(req) as resp, gzip.open(tmp_path, "wt", encoding="utf-8") as out:
        reader = zstandard.ZstdDecompressor(max_window_size=2**31).stream_reader(resp, read_size=1 << 20)
        text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")
        headers: dict[str, str] = {}
        skip = False
        for line in text:
            if line.startswith("["):
                if line.startswith("[Event "):
                    read += 1
                    headers = {}
                    skip = speed_of(line[len("[Event "):].rstrip().rstrip("]").strip('"')) is None
                if skip:
                    continue
                key, _, rest = line[1:].partition(" ")
                headers[key] = rest.rstrip().rstrip("]").strip('"')
                continue
            if skip or not line.strip() or not headers:
                continue
            h, headers = headers, {}
            if h.get("Termination") not in TERMINATIONS:
                continue
            try:
                we, be = int(h["WhiteElo"]), int(h["BlackElo"])
            except (KeyError, ValueError):
                continue
            if min(we, be) < FLOOR:
                continue
            sans, clocks = moves_of(line)
            if len(sans) < MIN_PLIES:
                continue
            speed = speed_of(h.get("Event", ""))
            speeds[speed] = speeds.get(speed, 0) + 1
            kept += 1
            out.write(json.dumps({
                "id": h.get("Site", "").rsplit("/", 1)[-1],
                "whiteElo": we,
                "blackElo": be,
                "speed": speed,
                "timeControl": h.get("TimeControl", ""),
                "result": h.get("Result", ""),
                "termination": h.get("Termination", ""),
                "sans": sans,
                "clocks": clocks,
            }, separators=(",", ":")) + "\n")
            if kept >= args.cap:
                break

    tmp_path.rename(out_path)
    summary = {"month": args.month, "url": URL.format(month=args.month), "speeds": sorted(SPEEDS),
               "floor": FLOOR, "terminations": sorted(TERMINATIONS), "minPlies": MIN_PLIES, "cap": args.cap,
               "gamesRead": read, "kept": kept, "keptBySpeed": speeds, "seconds": round(time.time() - started)}
    (out_dir / f"strong-{args.month}.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
