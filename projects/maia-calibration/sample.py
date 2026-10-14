"""The benchmark sampler's moves as the rows the scorer reads.

Reads the parquet ``scripts/stream_benchmark.sh`` writes (``positions_path``
in configs/config.yaml) and writes private/maia-calibration/lichess-sample.jsonl:
one row per move with its game, the position before it, the move in UCI, both
players' Lichess ratings, and the half its game falls in (the games ordered by
id, alternating between fitting and held-out).

    .venv/bin/python projects/maia-calibration/sample.py
"""

from __future__ import annotations

import json
from pathlib import Path

import polars as pl

from chess_coach_models.config import load_config, project_path

LAB = Path(__file__).resolve().parents[2]


def main() -> None:
    config = load_config()
    cfg = config["maia_benchmark"]
    frame = pl.read_parquet(project_path(config, cfg["positions_path"]))
    games = sorted(frame["game_id"].unique().to_list())
    half = {game: ("fit" if i % 2 == 0 else "held") for i, game in enumerate(games)}
    out_dir = LAB / "private" / "maia-calibration"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows = frame.sort(["game_id", "ply"]).iter_rows(named=True)
    with (out_dir / "lichess-sample.jsonl").open("w", encoding="utf-8") as out:
        for k, row in enumerate(rows):
            out.write(
                json.dumps(
                    {
                        "k": k,
                        "game": row["game_id"],
                        "half": half[row["game_id"]],
                        "ply": row["ply"],
                        "fen": row["fen"],
                        "uci": row["move_uci"],
                        "r": row["mover_elo"],
                        "ro": row["opponent_elo"],
                    }
                )
                + "\n"
            )
    counts = {h: sum(1 for g in games if half[g] == h) for h in ("fit", "held")}
    print(json.dumps({"month": cfg["month"], "moves": frame.height, "games": len(games), "gamesByHalf": counts}))


if __name__ == "__main__":
    main()
