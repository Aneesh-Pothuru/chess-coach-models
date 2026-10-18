#!/usr/bin/env python3
"""Keep rated 10-minute Lichess games with a player at one of the bands his games use.

Streams one month of the Lichess database (CC0) in file order and writes the
games it keeps to private/his-habits/lichess-<month>.jsonl.gz, one JSON object
a line: the game's id, both ratings, the result, the termination, the moves in
SAN and each move's clock in seconds. The chess, and the exact band of each
player, is done in the app's own code (lichess.mjs).

A game is kept when it is a rated rapid game at 10 minutes with no increment
(600+0) that ended normally or on time, and one of its players is rated in a
band that still needs player-games: 900 to 1699, in bands of 100 with 900 to
1099 as one. The stream stops once every band has its share, with a margin, so
the same month always keeps the same games.

    python3 projects/his-habits/stream.py
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
MONTH = "2026-09"
TIME_CONTROL = "600+0"
TERMINATIONS = {"Normal", "Time forfeit"}
BANDS = [1000, 1100, 1200, 1300, 1400, 1500, 1600]
FLOOR = 900
PER_BAND = 2000
MARGIN = 1.05

TOKEN = re.compile(r"\{([^}]*)\}|(\S+)")
CLOCK = re.compile(r"\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]")
RESULT = re.compile(r"^(1-0|0-1|1/2-1/2|\*)$")
NUMBER = re.compile(r"^\d+\.+$")


def band_of(rating: int) -> int | None:
    if rating < FLOOR or rating >= BANDS[-1] + 100:
        return None
    return 1000 if rating < 1100 else rating // 100 * 100


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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default=MONTH)
    args = ap.parse_args()

    out_dir = LAB / "private" / "his-habits"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"lichess-{args.month}.jsonl.gz"
    tmp_path = out_path.with_suffix(".partial")
    need = int(PER_BAND * MARGIN)
    counts = {b: 0 for b in BANDS}
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
            bands = [b for b in (band_of(we), band_of(be)) if b is not None and counts[b] < need]
            if not bands:
                continue
            for b in (band_of(we), band_of(be)):
                if b is not None:
                    counts[b] += 1
            sans, clocks = moves_of(line)
            kept += 1
            out.write(json.dumps({
                "id": h.get("Site", "").rsplit("/", 1)[-1],
                "whiteElo": we,
                "blackElo": be,
                "result": h.get("Result", ""),
                "termination": h.get("Termination", ""),
                "sans": sans,
                "clocks": clocks,
            }, separators=(",", ":")) + "\n")
            if all(c >= need for c in counts.values()):
                break

    tmp_path.rename(out_path)
    summary = {"month": args.month, "url": URL.format(month=args.month), "timeControl": TIME_CONTROL,
               "bands": BANDS, "floor": FLOOR, "perBand": PER_BAND, "margin": MARGIN,
               "gamesRead": read, "rapidGames": rapid, "kept": kept, "playerGames": counts,
               "seconds": round(time.time() - started)}
    (out_dir / f"lichess-{args.month}.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
