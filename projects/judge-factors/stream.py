#!/usr/bin/env python3
"""Keep rated 10-minute Lichess games between players at his band and the band above.

Streams one month of the Lichess database (CC0) in file order and writes the
games it keeps to private/judge-factors/games-<month>.jsonl.gz, one JSON object
a line: the game's id, both ratings, the result, the termination and the moves
in SAN. The chess is done in the app's own code (scan.mjs).

A game is kept when it is a rated rapid game at 10 minutes with no increment
(600+0), it ended normally or on time, it has at least 30 plies, and both
ratings are in 1250 to 1649. The stream stops at the cap, so the same month
and cap always keep the same games.

    python3 projects/judge-factors/stream.py --month 2026-08
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
URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"
TIME_CONTROL = "600+0"
TERMINATIONS = {"Normal", "Time forfeit"}
LOW, HIGH = 1250, 1649
MIN_PLIES = 30
GAMES = 8000

COMMENT = re.compile(r"\{[^}]*\}")
RESULT = re.compile(r"^(1-0|0-1|1/2-1/2|\*)$")


def sans_of(movetext: str) -> list[str]:
    out = []
    for tok in COMMENT.sub(" ", movetext).split():
        tok = re.sub(r"^\d+\.+", "", tok)
        if not tok or RESULT.match(tok) or tok.startswith("$"):
            continue
        out.append(re.sub(r"[?!]+$", "", tok))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--games", type=int, default=GAMES, help="games to keep")
    args = ap.parse_args()

    out_dir = LAB / "private" / "judge-factors"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"games-{args.month}.jsonl.gz"
    tmp_path = out_path.with_suffix(".partial")
    read = rapid = kept = 0
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
                    skip = not line.startswith('[Event "Rated Rapid')
                if skip:
                    continue
                key, _, rest = line[1:].partition(" ")
                headers[key] = rest.rstrip().rstrip("]").strip('"')
                continue
            if skip or not line.strip() or not headers:
                continue
            rapid += 1
            h, headers = headers, {}
            if h.get("TimeControl") != TIME_CONTROL or h.get("Termination") not in TERMINATIONS:
                continue
            try:
                we, be = int(h["WhiteElo"]), int(h["BlackElo"])
            except (KeyError, ValueError):
                continue
            if not (LOW <= we <= HIGH and LOW <= be <= HIGH):
                continue
            sans = sans_of(line)
            if len(sans) < MIN_PLIES:
                continue
            kept += 1
            out.write(json.dumps({
                "id": h.get("Site", "").rsplit("/", 1)[-1],
                "whiteElo": we,
                "blackElo": be,
                "result": h.get("Result", ""),
                "termination": h.get("Termination", ""),
                "sans": sans,
            }, separators=(",", ":")) + "\n")
            if kept >= args.games:
                break

    tmp_path.rename(out_path)
    summary = {"month": args.month, "url": URL.format(month=args.month), "timeControl": TIME_CONTROL,
               "ratings": [LOW, HIGH], "minPlies": MIN_PLIES, "cap": args.games,
               "gamesRead": read, "rapidGames": rapid, "kept": kept, "seconds": round(time.time() - started)}
    (out_dir / f"games-{args.month}.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
