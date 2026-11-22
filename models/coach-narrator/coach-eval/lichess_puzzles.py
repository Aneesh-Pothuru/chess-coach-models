#!/usr/bin/env python3
"""Sample Lichess puzzles on the themes of calculation and attack, at the player's level.

Streams the Lichess puzzle database (CC0) and keeps, for each theme below, the
first --per puzzles (in a seeded order of their ids) rated 1100 to 1700 with
at least 1,000 plays and a popularity of 80 or more. A puzzle's position is the
one after its first move (the opponent's move that sets it up), and its
solution is the rest of its moves, written in SAN, in the shape the courses'
puzzles take in private/coach-eval/course-puzzles/puzzles.json, so
puzzle-facts.mjs reads both. Written to
private/coach-eval/lichess-puzzles/puzzles.json.

    python3 models/coach-narrator/coach-eval/lichess_puzzles.py --per 60
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import heapq
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
    "fork", "pin", "skewer", "discoveredAttack", "deflection", "attraction", "capturingDefender",
    "hangingPiece", "trappedPiece", "xRayAttack", "clearance", "intermezzo", "sacrifice",
    "kingsideAttack", "queensideAttack", "defensiveMove", "quietMove", "backRankMate",
    "smotheredMate", "exposedKing",
]
RATING = (1100, 1700)
MIN_PLAYS = 1000
MIN_POPULARITY = 80


def order(puzzle_id: str) -> int:
    return int(hashlib.sha256(f"coach-eval:lichess:{puzzle_id}".encode()).hexdigest()[:15], 16)


def _neg(key: int) -> int:
    return -key


def _unneg(key: int) -> int:
    return -key


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per", type=int, default=60, help="puzzles kept per theme")
    args = ap.parse_args()
    out_dir = LAB / "private" / "coach-eval" / "lichess-puzzles"
    out_dir.mkdir(parents=True, exist_ok=True)

    # Each theme keeps only the puzzles with the smallest seeded keys, three times as
    # many as it needs, so a puzzle taken by an earlier theme leaves enough behind.
    keep = args.per * 3
    pools: dict[str, list[tuple[str, dict]]] = {t: [] for t in THEMES}
    read = 0
    req = urllib.request.Request(URL, headers={"User-Agent": "chess-coach-models"})
    with urllib.request.urlopen(req) as resp:
        reader = zstandard.ZstdDecompressor().stream_reader(resp, read_size=1 << 20)
        rows = csv.DictReader(io.TextIOWrapper(reader, encoding="utf-8"))
        for row in rows:
            read += 1
            try:
                rating, plays, popularity = int(row["Rating"]), int(row["NbPlays"]), int(row["Popularity"])
            except (KeyError, ValueError, TypeError):
                continue
            if not (RATING[0] <= rating <= RATING[1]) or plays < MIN_PLAYS or popularity < MIN_POPULARITY:
                continue
            themes = row["Themes"].split()
            slim = None
            for t in themes:
                if t not in pools:
                    continue
                key = order(row["PuzzleId"])
                heap = pools[t]
                if len(heap) >= keep and key >= -heap[0][0]:
                    continue
                slim = slim or {k: row[k] for k in ("PuzzleId", "FEN", "Moves", "Rating", "Themes")}
                heapq.heappush(heap, (_neg(key), slim))
                if len(heap) > keep:
                    heapq.heappop(heap)
            if read % 500000 == 0:
                print(f"read {read:,} puzzles", file=sys.stderr, flush=True)

    kept: dict[str, dict] = {}
    for theme, heap in pools.items():
        pool = sorted(((_unneg(k), row) for k, row in heap), key=lambda x: x[0])
        taken = 0
        for _, row in pool:
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
    summary = {"url": URL, "read": read, "kept": len(puzzles), "per": args.per, "rating": list(RATING),
               "byTheme": {t: sum(1 for p in puzzles if p["chapter"] == t) for t in THEMES}}
    (out_dir / "puzzles-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
