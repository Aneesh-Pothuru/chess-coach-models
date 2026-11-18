#!/usr/bin/env python3
"""Keep rated 10-minute Lichess games between players at the player's level.

Streams one month of the Lichess database (CC0) and writes the first games it
keeps to private/review-writer/games-<month>.jsonl.gz, one JSON object a line,
in the shape think-time-rapid's stream.py writes, so that project's games.mjs
reads them: the game's id, both ratings, the time control, the result, the
termination and the movetext with its [%eval] and [%clk] comments.

A game is kept when it is a rated rapid game at 600+0 (the player's own time
control) whose movetext carries [%eval] and [%clk], it ended normally or on
time, it has at least 20 plies, and both ratings lie in the player's band. The
stream is read in order and stops after --games kept games, so the same month
and count always keep the same games.

    python3 projects/review-writer/stream.py --month 2026-10 --games 400
"""
from __future__ import annotations

import argparse
import gzip
import io
import json
import sys
import time
import urllib.request
from pathlib import Path

import zstandard

LAB = Path(__file__).resolve().parents[2]
URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"

# The player's level on Lichess is about 1350 by the app's conversion; both
# players sit within 150 points of it.
BAND = (1200, 1500)
TIME_CONTROL = "600+0"
MIN_PLIES = 20
TERMINATIONS = {"Normal", "Time forfeit"}


def plies_at_least(movetext: str, n: int) -> bool:
    return f" {n // 2 + 1}. " in movetext or f" {n // 2}... " in movetext


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--games", type=int, default=400, help="stop after keeping this many games")
    args = ap.parse_args()

    out_dir = LAB / "private" / "review-writer"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"games-{args.month}.jsonl.gz"
    tmp_path = out_path.with_suffix(".partial")
    read = rapid = with_evals = kept = 0
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
            movetext = line.strip()
            h, headers = headers, {}
            if "[%eval" not in movetext or "[%clk" not in movetext:
                continue
            with_evals += 1
            if h.get("TimeControl") != TIME_CONTROL or h.get("Termination") not in TERMINATIONS:
                continue
            if not plies_at_least(movetext, MIN_PLIES):
                continue
            try:
                we, be = int(h["WhiteElo"]), int(h["BlackElo"])
            except (KeyError, ValueError):
                continue
            if not (BAND[0] <= we <= BAND[1] and BAND[0] <= be <= BAND[1]):
                continue
            kept += 1
            out.write(json.dumps({
                "id": h.get("Site", "").rsplit("/", 1)[-1],
                "whiteElo": we,
                "blackElo": be,
                "tc": h.get("TimeControl", ""),
                "result": h.get("Result", ""),
                "termination": h.get("Termination", ""),
                "movetext": movetext,
            }, separators=(",", ":")) + "\n")
            if kept >= args.games:
                break

    tmp_path.rename(out_path)
    summary = {"month": args.month, "url": URL.format(month=args.month), "timeControl": TIME_CONTROL,
               "band": list(BAND), "games": args.games, "gamesRead": read, "rapidGames": rapid,
               "rapidWithEvalsAndClocks": with_evals, "kept": kept, "seconds": round(time.time() - started)}
    (out_dir / f"games-{args.month}.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
