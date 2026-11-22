#!/usr/bin/env python3
"""Sample the coaching task's training puzzles: Lichess puzzles (CC0) on every theme a
coaching text names, around the player's level, none of them in coach-eval's own
sample (its held-out moments) or in line-tactics.mjs's held-out set.

Streams the Lichess puzzle database and keeps, for each theme below, the first --per
puzzles in a seeded order of their ids rated 900 to 1900 with at least 500 plays and a
popularity of 80 or more. A puzzle's position is the one after its first move (the
opponent's move that sets it up) and its answer key is the rest of its moves, in SAN,
in the shape lichess_puzzles.py writes. Written to
private/coach-eval/train-puzzles/puzzles.json with aggregate counts beside it.

    .venv/bin/python models/coach-narrator/coach-eval/train_puzzles.py --per 100
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
import urllib.request
from pathlib import Path

import chess
import zstandard

LAB = Path(__file__).resolve().parents[3]
URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst"
THEMES = [
    "fork", "pin", "skewer", "discoveredAttack", "doubleCheck", "deflection", "attraction",
    "capturingDefender", "hangingPiece", "trappedPiece", "xRayAttack", "clearance", "interference",
    "intermezzo", "sacrifice", "quietMove", "defensiveMove", "kingsideAttack", "exposedKing",
    "backRankMate", "smotheredMate", "mateIn1", "mateIn2", "mateIn3", "advancedPawn", "promotion",
    "zugzwang", "attackingF2F7", "hookMate", "anastasiaMate", "arabianMate", "dovetailMate",
]
RATING = (900, 1900)
MIN_PLAYS = 500
MIN_POPULARITY = 80


def order(puzzle_id: str) -> int:
    return int(hashlib.sha256(f"coach-eval:train-puzzles:{puzzle_id}".encode()).hexdigest()[:15], 16)


def excluded() -> set[str]:
    skip: set[str] = set()
    coach = LAB / "private" / "coach-eval" / "lichess-puzzles" / "puzzles.json"
    if coach.exists():
        skip |= {p["id"].split(":", 1)[1] for p in json.loads(coach.read_text())}
    heldout = LAB / "private" / "coach-eval" / "line-tactics" / "heldout.json"
    if heldout.exists():
        skip |= {p["id"] for p in json.loads(heldout.read_text())}
    return skip


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=100, help="puzzles kept per theme")
    args = ap.parse_args()
    out_dir = LAB / "private" / "coach-eval" / "train-puzzles"
    out_dir.mkdir(parents=True, exist_ok=True)
    skip = excluded()
    keep = args.per * 3
    pools: dict[str, list[tuple[int, dict]]] = {t: [] for t in THEMES}
    read = 0
    req = urllib.request.Request(URL, headers={"User-Agent": "chess-coach-models"})
    with urllib.request.urlopen(req) as resp:
        reader = zstandard.ZstdDecompressor().stream_reader(resp, read_size=1 << 20)
        for row in csv.DictReader(io.TextIOWrapper(reader, encoding="utf-8")):
            read += 1
            try:
                rating, plays, popularity = int(row["Rating"]), int(row["NbPlays"]), int(row["Popularity"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (RATING[0] <= rating <= RATING[1]) or plays < MIN_PLAYS or popularity < MIN_POPULARITY or row["PuzzleId"] in skip:
                continue
            key = order(row["PuzzleId"])
            slim = None
            for t in row["Themes"].split():
                pool = pools.get(t)
                if pool is None:
                    continue
                if len(pool) >= keep and key >= pool[-1][0]:
                    continue
                slim = slim or {k: row[k] for k in ("PuzzleId", "FEN", "Moves", "Rating", "Themes")}
                pool.append((key, slim))
                pool.sort(key=lambda x: x[0])
                del pool[keep:]
    kept: dict[str, dict] = {}
    for theme in THEMES:
        taken = 0
        for _, row in pools[theme]:
            if taken >= args.per:
                break
            if row["PuzzleId"] in kept:
                continue
            board = chess.Board(row["FEN"])
            moves = row["Moves"].split()
            try:
                board.push_uci(moves[0])
                start = board.fen()
                sans = []
                for uci in moves[1:]:
                    move = chess.Move.from_uci(uci)
                    sans.append(board.san(move))
                    board.push(move)
            except ValueError:
                continue
            kept[row["PuzzleId"]] = {
                "course": "lichess", "chapter": theme, "id": f"lichess:{row['PuzzleId']}",
                "title": f"{theme} ({row['Rating']})", "start": start, "main": sans, "ok": True,
                "themes": row["Themes"].split(), "rating": int(row["Rating"]),
            }
            taken += 1
    puzzles = list(kept.values())
    (out_dir / "puzzles.json").write_text(json.dumps(puzzles) + "\n")
    summary = {"url": URL, "read": read, "kept": len(puzzles), "per": args.per, "rating": list(RATING), "excluded": len(skip),
               "byTheme": {t: sum(1 for p in puzzles if p["chapter"] == t) for t in THEMES}}
    (out_dir / "puzzles-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
