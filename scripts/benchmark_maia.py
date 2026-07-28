#!/usr/bin/env python3
"""Independent Maia2 move-match benchmark CLI (issue #1).

Stage ``sample`` filters a decompressed Lichess PGN stream into a per-band
reservoir of eligible moves. Stage ``infer`` runs Maia2 over the sampled moves
and writes the metrics report. The stages run in separate processes for the
same reason as scripts/run_evals.py: Torch inference stays isolated.
"""

from __future__ import annotations

import argparse
import copy
import io
import json
import sys
from pathlib import Path

import polars as pl

from chess_coach_models.config import load_config, project_path
from chess_coach_models.maia import MaiaPolicy
from chess_coach_models.maia_benchmark import (
    sample_stream,
    summarize_benchmark,
    write_metrics,
)


def run_sample(config: dict, input_path: str | None) -> None:
    if input_path:
        handle = Path(input_path).open("r", encoding="utf-8", errors="replace")
    else:
        handle = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
    with handle:
        sampled, stats = sample_stream(handle, config)
    cfg = config["maia_benchmark"]
    frame = pl.DataFrame(sampled, infer_schema_length=None)
    positions_path = project_path(config, cfg["positions_path"])
    positions_path.parent.mkdir(parents=True, exist_ok=True)
    frame.write_parquet(positions_path, compression="zstd")
    metadata = {
        "month": cfg["month"],
        "source_url": cfg["url"],
        "speed": cfg["speed"],
        "seed": int(config["seed"]),
        "games_seen": stats.games_seen,
        "games_parsed": stats.games_parsed,
        "games_used": stats.games_used,
        "parse_errors": stats.parse_errors,
        "frame_anomalies": stats.frame_anomalies,
        "eligible_by_band": stats.eligible_by_band,
        "sampled_by_band": stats.sampled_by_band,
    }
    metadata_path = project_path(config, cfg["metadata_path"])
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


def run_infer(config: dict) -> None:
    cfg = config["maia_benchmark"]
    positions_path = project_path(config, cfg["positions_path"])
    frame = pl.read_parquet(positions_path)
    rows = frame.to_dicts()
    inference_config = copy.deepcopy(config)
    if cfg.get("device"):
        inference_config["maia2"]["device"] = str(cfg["device"])
    if cfg.get("batch_size"):
        inference_config["maia2"]["batch_size"] = int(cfg["batch_size"])
    provider = MaiaPolicy(inference_config)
    policies = provider.batch_policy(
        [
            {
                "board": row["fen"],
                "move": row["move_uci"],
                "active_elo": int(row["mover_elo"]),
                "opponent_elo": int(row["opponent_elo"]),
            }
            for row in rows
        ]
    )
    for row, policy in zip(rows, policies, strict=True):
        top_move = max(policy, key=policy.get) if policy else None
        row["maia_top1_move"] = top_move
        row["maia_top1_probability"] = float(policy.get(top_move, 0.0)) if top_move else 0.0
        row["maia_played_probability"] = float(policy.get(row["move_uci"], 0.0))
    pl.DataFrame(rows, infer_schema_length=None).write_parquet(
        positions_path, compression="zstd"
    )

    metadata_path = project_path(config, cfg["metadata_path"])
    sampling = (
        json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata_path.exists()
        else {}
    )
    device = str(next(provider.model.parameters()).device)
    summary = summarize_benchmark(
        rows, config, device=device, sampling_metadata=sampling
    )
    write_metrics(config, summary)
    print(json.dumps({"overall": summary["overall"], "device": device}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--stage", choices=["sample", "infer"], required=True)
    parser.add_argument(
        "--input", help="Decompressed PGN path for --stage sample; defaults to stdin."
    )
    args = parser.parse_args()
    config = load_config(args.config)
    if args.stage == "sample":
        run_sample(config, args.input)
    else:
        run_infer(config)


if __name__ == "__main__":
    main()
