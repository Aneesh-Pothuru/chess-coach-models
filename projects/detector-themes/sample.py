"""The held-out puzzles: a seeded uniform sample from the Lichess puzzle
database (CC0), rated in the range of the app's own pool, leaving out every
puzzle the app ships, so a change tuned on the app's pool is judged on puzzles
it never saw.

    CHESS_DIR=$(bridge/checkout.sh) nice -n 10 .venv/bin/python projects/detector-themes/sample.py --round2

Writes data/processed/detector-themes-heldout.json (git ignores data/processed;
the database is public, but bulk rows are rebuilt rather than committed) and
prints aggregate counts. Round 2 reads the compressed file itself and also
writes results/round2/sample.json with source and sample hashes. Neither mode
scores the sample or prints its positions or tags.
"""
import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
N = int(os.environ.get("HELDOUT_N", "20000"))
SEED = 20261014
LO, HI = 400, 1899


def app_ids(round2=False):
    chess_dir = os.environ.get("CHESS_DIR")
    if not chess_dir:
        raise SystemExit("CHESS_DIR is not set: run with CHESS_DIR=$(bridge/checkout.sh)")
    if round2:
        with open(os.path.join(ROOT, "bridge", "chess.json")) as f:
            pin = json.load(f)["commit"]
        commit = subprocess.check_output(
            ["git", "-C", chess_dir, "rev-parse", "HEAD"], text=True
        ).strip()
        if commit != pin:
            raise SystemExit("Round 2 must exclude puzzles from the pinned app, not a candidate")
    with open(os.path.join(chess_dir, "src", "data", "puzzles.json")) as f:
        buckets = json.load(f)
    rows = buckets if isinstance(buckets, list) else [p for v in buckets.values() for p in v]
    return {p["id"] for p in rows}


def sample(stream, skip, n):
    rnd = random.Random(SEED)
    reservoir = []
    seen = 0
    for row in csv.DictReader(stream):
        try:
            rating = int(row["Rating"])
        except (KeyError, ValueError):
            continue
        if not (LO <= rating <= HI) or row["PuzzleId"] in skip:
            continue
        item = {"id": row["PuzzleId"], "fen": row["FEN"], "moves": row["Moves"], "rating": rating, "themes": row["Themes"]}
        seen += 1
        if len(reservoir) < n:
            reservoir.append(item)
        else:
            j = rnd.randrange(seen)
            if j < n:
                reservoir[j] = item
    reservoir.sort(key=lambda p: p["id"])
    return reservoir, seen


def sha256(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def atomic_json(path, data, *, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=path.name + ".", suffix=".tmp", delete=False) as f:
        temporary = Path(f.name)
        try:
            json.dump(data, f, indent=indent)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--round2", action="store_true", help="Read the local zstandard database and write the frozen round-2 provenance")
    parser.add_argument("--source", type=Path, default=Path(ROOT) / "data/raw/lichess_db_puzzle.csv.zst")
    args = parser.parse_args()
    started = time.monotonic()
    skip = app_ids(args.round2)
    out = Path(ROOT) / "data/processed/detector-themes-heldout.json"
    if not args.round2:
        reservoir, seen = sample(sys.stdin, skip, N)
        atomic_json(out, reservoir)
        print(json.dumps({"eligible": seen, "sampled": len(reservoir), "seed": SEED, "ratings": [LO, HI], "excluded_app_ids": len(skip)}))
        return

    # The test set's size and range are fixed before any candidate is tested.
    if N != 20000:
        raise SystemExit("Round 2 fixes HELDOUT_N at 20000")
    import zstandard

    with open(Path(ROOT) / "bridge/chess.json") as f:
        pin = json.load(f)["commit"]
    app_pool_hash = sha256(Path(os.environ["CHESS_DIR"]) / "src/data/puzzles.json")
    source = args.source.resolve()
    try:
        source_name = str(source.relative_to(ROOT))
    except ValueError:
        raise SystemExit("The puzzle source must stay inside this clone")
    hashed = time.monotonic()
    source_hash = sha256(source)
    hash_seconds = time.monotonic() - hashed
    report_path = Path(ROOT) / "projects/detector-themes/results/round2/sample.json"
    if report_path.exists() and out.exists():
        with open(report_path) as f:
            previous = json.load(f)
        if (previous.get("app") == pin and previous.get("app_pool_sha256") == app_pool_hash
                and previous.get("source_sha256") == source_hash
                and previous.get("sampled") == N and previous.get("seed") == SEED
                and previous.get("ratings") == [LO, HI]
                and previous.get("data_sha256") == sha256(out)):
            print(json.dumps(previous))
            return
        raise SystemExit("An existing round-2 sample has different provenance; keep the frozen sample and investigate")

    sampled = time.monotonic()
    with open(source, "rb") as compressed:
        with zstandard.ZstdDecompressor().stream_reader(compressed) as decompressed:
            with io.TextIOWrapper(decompressed, encoding="utf-8", newline="") as stream:
                reservoir, seen = sample(stream, skip, N)
    sampling_seconds = time.monotonic() - sampled
    if len(reservoir) != N:
        raise SystemExit(f"The complete source has only {len(reservoir)} eligible puzzles; expected {N}")
    atomic_json(out, reservoir)
    report = {
        "app": pin,
        "app_pool_sha256": app_pool_hash,
        "source": source_name,
        "source_url": "https://database.lichess.org/lichess_db_puzzle.csv.zst",
        "source_bytes": source.stat().st_size,
        "source_sha256": source_hash,
        "data": str(out.relative_to(ROOT)),
        "data_sha256": sha256(out),
        "eligible": seen,
        "sampled": len(reservoir),
        "seed": SEED,
        "ratings": [LO, HI],
        "excluded_app_ids": len(skip),
        "source_hash_seconds": round(hash_seconds, 3),
        "sampling_seconds": round(sampling_seconds, 3),
        "total_seconds": round(time.monotonic() - started, 3),
        "restart": "A completed sample is reused only when its hashes match. An interrupted stream restarts deterministically; final files are replaced atomically.",
    }
    atomic_json(report_path, report, indent=2)
    print(json.dumps(report))


if __name__ == "__main__":
    main()
