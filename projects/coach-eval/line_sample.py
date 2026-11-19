"""The test set for line-tactics.mjs: a seeded uniform sample of 20,000 puzzles from
the Lichess puzzle database (CC0), rated 400 to 1899 as the app's pool is, leaving out
every puzzle the app ships and every puzzle in coach-eval's own Lichess sample. The
seed, size and range are detector-themes' held-out set's, so the two sets are drawn
the same way. The database is streamed, not stored.

    CHESS_DIR=$(bridge/checkout.sh at <sha>) .venv/bin/python projects/coach-eval/line_sample.py

Writes private/coach-eval/line-tactics/heldout.json and prints aggregate counts only.
"""
import csv
import io
import json
import os
import random
import urllib.request
from pathlib import Path

import zstandard

ROOT = Path(__file__).resolve().parents[2]
URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
N = 20000
SEED = 20261014
LO, HI = 400, 1899
OUT = ROOT / "private" / "coach-eval" / "line-tactics" / "heldout.json"


def excluded():
    chess_dir = os.environ.get("CHESS_DIR")
    if not chess_dir:
        raise SystemExit("CHESS_DIR is not set")
    with open(Path(chess_dir) / "src" / "data" / "puzzles.json") as f:
        buckets = json.load(f)
    rows = buckets if isinstance(buckets, list) else [p for v in buckets.values() for p in v]
    skip = {p["id"] for p in rows}
    coach = ROOT / "private" / "coach-eval" / "lichess-puzzles" / "puzzles.json"
    if coach.exists():
        skip |= {p["id"].split(":", 1)[1] for p in json.loads(coach.read_text())}
    return skip


def main():
    skip = excluded()
    rnd = random.Random(SEED)
    reservoir = []
    seen = 0
    req = urllib.request.Request(URL, headers={"User-Agent": "chess-coach-models"})
    with urllib.request.urlopen(req) as resp:
        reader = zstandard.ZstdDecompressor().stream_reader(resp, read_size=1 << 20)
        for row in csv.DictReader(io.TextIOWrapper(reader, encoding="utf-8")):
            try:
                rating = int(row["Rating"])
            except (KeyError, ValueError):
                continue
            if not (LO <= rating <= HI) or row["PuzzleId"] in skip:
                continue
            item = {"id": row["PuzzleId"], "fen": row["FEN"], "moves": row["Moves"], "rating": rating, "themes": row["Themes"]}
            seen += 1
            if len(reservoir) < N:
                reservoir.append(item)
            else:
                j = rnd.randrange(seen)
                if j < N:
                    reservoir[j] = item
    reservoir.sort(key=lambda p: p["id"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text(json.dumps(reservoir))
    tmp.replace(OUT)
    print(json.dumps({"eligible": seen, "sampled": len(reservoir), "seed": SEED, "ratings": [LO, HI], "excluded": len(skip)}))


if __name__ == "__main__":
    main()
