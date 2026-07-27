#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import chess.engine
import polars as pl

from chess_coach_models.config import load_config, project_path
from chess_coach_models.engine import open_stockfish, score_cp_white
from chess_coach_models.hazard_training import train_hazard
from chess_coach_models.maia_features import add_maia_features
from chess_coach_models.repertoire import build_repertoire
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--skip-maia", action="store_true")
    args = parser.parse_args()
    config = load_config(args.config)

    summary = {"hazard_v0": train_hazard(config)}
    if not args.skip_maia and config["maia2"]["enabled"]:
        summary["maia_smoke"] = add_maia_features(config)
        summary["hazard_v0_matched"] = train_hazard(
            config,
            include_maia=False,
            input_path="data/processed/eval_positions_maia.parquet",
        )
        summary["hazard_v1_maia"] = train_hazard(
            config,
            include_maia=True,
            input_path="data/processed/eval_positions_maia.parquet",
        )
    summary["repertoire"] = build_repertoire(
        config, use_maia=not args.skip_maia
    )
    scorer = score_pgn(
        "tests/fixtures/sample_games.pgn",
        config,
        use_maia=not args.skip_maia,
    )
    scorer_path = project_path(config, "reports/scorer_samples.json")
    scorer_path.write_text(json.dumps(scorer, indent=2) + "\n")
    summary["gambit_sanity"] = gambit_sanity(config)
    gambit_path = project_path(config, "reports/gambit_sanity.json")
    gambit_path.write_text(json.dumps(summary["gambit_sanity"], indent=2) + "\n")

    manifest = {
        "source_month": config["data"]["month"],
        "v0_metrics": "reports/hazard_metrics.json",
        "v1_metrics": (
            "reports/hazard_metrics_v1_maia.json"
            if "hazard_v1_maia" in summary
            else None
        ),
        "v0_matched_metrics": (
            "reports/hazard_metrics_v0_matched.json"
            if "hazard_v0_matched" in summary
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
