#!/usr/bin/env python3
"""Keep rated 10-minute Lichess games that carry engine evals and clocks.

Streams one month of the Lichess database (CC0) and writes the games it keeps
to private/think-time-rapid/games-<month>.jsonl.gz, one JSON object a line:
the game's id, both ratings, the 200-point bin of their mean, the result,
termination and the movetext with its [%eval] and [%clk] comments. Nothing
else is read: the chess is done in the app's own code (facts.mjs).

A game is kept when it is a rated rapid game at 10 minutes with no increment
(600+0, the player's own time control), the movetext carries [%eval] and
[%clk], it ended normally or on time, it has at least 20 plies, the two
ratings are within 300 points, and the bin of their mean still has room. The
stream is read in order and stops once every bin is full, so the same month
and quotas always keep the same games.

    python3 projects/think-time-rapid/stream.py --month 2026-09
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

# Bins of the two ratings' mean, and how many games each keeps by default:
# most where the player's level sits (his chess.com rapid by the app's
# conversion, about 1350 on Lichess), fewer elsewhere for the trend by rating.
BINS = [(800, 999), (1000, 1199), (1200, 1399), (1400, 1599), (1600, 1799), (1800, 1999), (2000, 2199)]
QUOTAS = "6000,8000,20000,20000,8000,6000,6000"
TIME_CONTROL = "600+0"
MAX_RATING_GAP = 300
MIN_PLIES = 20
TERMINATIONS = {"Normal", "Time forfeit"}


def bin_of(rating: float) -> str | None:
    for lo, hi in BINS:
        if lo <= rating <= hi:
            return f"{lo}-{hi}"
    return None


def plies_at_least(movetext: str, n: int) -> bool:
    # Black's move n/2 is written "k... " after a comment; White's "k. ".
    return f" {n // 2 + 1}. " in movetext or f" {n // 2}... " in movetext


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--quotas", default=QUOTAS, help="games kept per bin, lowest bin first")
    ap.add_argument("--max-games", type=int, default=0, help="stop after reading this many games (0: no cap)")
    args = ap.parse_args()

    out_dir = LAB / "private" / "think-time-rapid"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"games-{args.month}.jsonl.gz"
    tmp_path = out_path.with_suffix(".partial")
    quota = {f"{lo}-{hi}": int(q) for (lo, hi), q in zip(BINS, args.quotas.split(","), strict=True)}
    kept = {name: 0 for name in quota}
    read = rapid = with_evals = 0
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
                    if args.max_games and read > args.max_games:
                        break
                if skip:
                    continue
                key, _, rest = line[1:].partition(" ")
                headers[key] = rest.rstrip().rstrip("]").strip('"')
                continue
            if skip or not line.strip() or not headers:
                continue
            # The movetext line of a rated rapid game.
            rapid += 1
            if rapid % 200000 == 0:
                rate = read / max(1e-9, time.time() - started)
                print(f"read {read:,} games ({rate:,.0f}/s), rapid {rapid:,}, with evals {with_evals:,}, kept {kept}",
                      file=sys.stderr, flush=True)
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
            if abs(we - be) > MAX_RATING_GAP:
                continue
            bin_ = bin_of((we + be) / 2)
            if bin_ is None or kept[bin_] >= quota[bin_]:
                continue
            kept[bin_] += 1
            out.write(json.dumps({
                "id": h.get("Site", "").rsplit("/", 1)[-1],
                "bin": bin_,
                "whiteElo": we,
                "blackElo": be,
                "tc": h.get("TimeControl", ""),
                "result": h.get("Result", ""),
                "termination": h.get("Termination", ""),
                "movetext": movetext,
            }, separators=(",", ":")) + "\n")
            if all(kept[k] >= quota[k] for k in quota):
                break

    tmp_path.rename(out_path)
    summary = {"month": args.month, "url": URL.format(month=args.month), "timeControl": TIME_CONTROL, "quotas": quota,
               "gamesRead": read, "rapidGames": rapid, "rapidWithEvalsAndClocks": with_evals, "kept": kept,
               "seconds": round(time.time() - started)}
    (out_dir / f"games-{args.month}.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
