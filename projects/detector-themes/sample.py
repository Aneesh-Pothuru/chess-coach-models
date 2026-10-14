"""The held-out puzzles: a seeded uniform sample from the Lichess puzzle
database (CC0), rated in the range of the app's own pool, leaving out every
puzzle the app ships, so a change tuned on the app's pool is judged on puzzles
it never saw.

    zstdcat data/raw/lichess_db_puzzle.csv.zst | python3 projects/detector-themes/sample.py

Writes data/processed/detector-themes-heldout.json (git ignores data/processed;
the database is public, but bulk rows are rebuilt rather than committed) and
prints the counts that results/sample.json keeps.
"""
import csv
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
N = int(os.environ.get("HELDOUT_N", "20000"))
SEED = 20261014
LO, HI = 400, 1899


def app_ids():
    chess_dir = os.environ.get("CHESS_DIR")
    if not chess_dir:
        raise SystemExit("CHESS_DIR is not set: run with CHESS_DIR=$(bridge/checkout.sh)")
    with open(os.path.join(chess_dir, "src", "data", "puzzles.json")) as f:
        buckets = json.load(f)
    rows = buckets if isinstance(buckets, list) else [p for v in buckets.values() for p in v]
    return {p["id"] for p in rows}


def main():
    skip = app_ids()
    rnd = random.Random(SEED)
    reservoir = []
    seen = 0
    for row in csv.DictReader(sys.stdin):
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
    out = os.path.join(ROOT, "data", "processed", "detector-themes-heldout.json")
    with open(out, "w") as f:
        json.dump(reservoir, f)
    print(json.dumps({"eligible": seen, "sampled": len(reservoir), "seed": SEED, "ratings": [LO, HI], "excluded_app_ids": len(skip)}))


if __name__ == "__main__":
    main()
