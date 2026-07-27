#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

import chess
import chess.engine
import polars as pl

from chess_coach_models.config import load_config, project_path
from chess_coach_models.engine import open_stockfish, score_cp_white
from chess_coach_models.scorer import score_pgn


def gambit_sanity(config: dict) -> dict:
    frame = pl.read_parquet(
        project_path(config, config["data"]["opening_games_path"])
    ).filter(pl.col("opening").str.contains("Gambit"))
    results = {}
    with open_stockfish(config) as engine:
        for band in ("<1100", "1100-1400"):
            band_frame = frame.filter(pl.col("white_band") == band)
            overall = pl.read_parquet(
                project_path(config, config["data"]["opening_games_path"])
            ).filter(pl.col("white_band") == band)["white_score"].mean()
            grouped = (
                band_frame.group_by("opening")
                .agg(
                    pl.len().alias("n"),
                    pl.mean("white_score").alias("white_score"),
                    pl.col("moves_uci").mode().first().alias("main_line_uci"),
                )
                .filter(pl.col("n") >= 50)
                .with_columns(
                    (pl.col("white_score") - float(overall)).alias("score_lift")
                )
                .sort(["score_lift", "n"], descending=True)
                .head(5)
            )
            rows = []
            for row in grouped.iter_rows(named=True):
                board = chess.Board()
                legal = True
                for token in str(row["main_line_uci"]).split()[:8]:
                    move = chess.Move.from_uci(token)
                    if move not in board.legal_moves:
                        legal = False
                        break
                    board.push(move)
                engine_eval = None
                if legal and not board.is_game_over():
                    info = engine.analyse(board, chess.engine.Limit(time=0.05))
                    engine_eval = score_cp_white(
                        info["score"], int(config["thresholds"]["mate_cp"])
                    )
                rows.append(
                    {
                        "opening": row["opening"],
                        "n": int(row["n"]),
                        "white_score_pct": 100 * float(row["white_score"]),
                        "score_lift_pct": 100 * float(row["score_lift"]),
                        "main_line_uci": row["main_line_uci"],
                        "engine_eval_cp_white_after_8_plies": engine_eval,
                    }
                )
            results[band] = rows
    return results


def run_stage(label: str, *arguments: str) -> None:
    """Isolate LightGBM and Torch to avoid an Apple OpenMP/MPS barrier."""
    print(f"[eval] {label}", flush=True)
    subprocess.run(
        [sys.executable, *arguments],
        check=True,
        stdout=subprocess.DEVNULL,
    )


def maia_features_current(config: dict) -> bool:
    source = project_path(config, config["data"]["eval_positions_path"])
    features = project_path(config, "data/processed/eval_positions_maia.parquet")
    smoke = project_path(config, "reports/maia_smoke_metrics.json")
    if not features.exists() or not smoke.exists():
        return False
    if features.stat().st_mtime < source.stat().st_mtime:
        return False
    try:
        metadata = json.loads(smoke.read_text(encoding="utf-8"))
        return (
            int(metadata["positions"])
            == int(config["maia2"]["max_feature_positions"])
            and pl.scan_parquet(features).select(pl.len()).collect().item()
            == int(config["maia2"]["max_feature_positions"])
        )
    except (KeyError, ValueError, json.JSONDecodeError):
        return False


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--skip-maia", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)
    has_maia = not args.skip_maia and bool(config["maia2"]["enabled"])

    run_stage(
        "train hazard v0",
        "scripts/train_hazard.py",
        "--config",
        args.config,
    )
    if has_maia:
        if maia_features_current(config):
            print("[eval] reuse current Maia2 feature cache", flush=True)
        else:
            run_stage(
                "add Maia2 features and smoke eval",
                "scripts/add_maia_features.py",
                "--config",
                args.config,
            )
        run_stage(
            "train matched hand-feature model",
            "scripts/train_hazard.py",
            "--config",
            args.config,
            "--input",
            "data/processed/eval_positions_maia.parquet",
        )
        run_stage(
            "train Maia2-feature v1",
            "scripts/train_hazard.py",
            "--config",
            args.config,
            "--with-maia",
        )
    repertoire_arguments = [
        "scripts/build_repertoire.py",
        "--config",
        args.config,
    ]
    if not has_maia:
        repertoire_arguments.append("--no-maia")
    run_stage(
        "build repertoire tree and recommendations",
        *repertoire_arguments,
    )
    scorer = score_pgn(
        "tests/fixtures/sample_games.pgn",
        config,
        use_maia=has_maia,
    )
    scorer_path = project_path(config, "reports/scorer_samples.json")
    scorer_path.write_text(json.dumps(scorer, indent=2) + "\n")
    gambits = gambit_sanity(config)
    gambit_path = project_path(config, "reports/gambit_sanity.json")
    gambit_path.write_text(json.dumps(gambits, indent=2) + "\n")

    manifest = {
        "source_month": config["data"]["month"],
        "v0_metrics": "reports/hazard_metrics.json",
        "v1_metrics": (
            "reports/hazard_metrics_v1_maia.json"
            if has_maia
            else None
        ),
        "v0_matched_metrics": (
            "reports/hazard_metrics_v0_matched.json"
            if has_maia
            else None
        ),
        "scorer_samples": "reports/scorer_samples.json",
        "repertoire": "reports/repertoire.json",
        "gambit_sanity": "reports/gambit_sanity.json",
    }
    manifest_path = project_path(config, "reports/eval_manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
