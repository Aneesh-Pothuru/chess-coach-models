from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import chess
import chess.engine
import pandas as pd
import polars as pl

from .config import project_path
from .engine import open_stockfish
from .maia import MaiaPolicy, policy_summary


def _balanced_sample(frame: pd.DataFrame, cap: int, seed: int) -> pd.DataFrame:
    if len(frame) <= cap:
        return frame.reset_index(drop=True)
    bands = max(1, frame["rating_band"].nunique())
    per_band = max(1, cap // bands)
    parts = [
        group.sample(min(len(group), per_band), random_state=seed)
        for _, group in frame.groupby("rating_band", sort=False)
    ]
    sampled = pd.concat(parts)
    if len(sampled) < cap:
        remainder = frame.drop(sampled.index)
        sampled = pd.concat(
            [
                sampled,
                remainder.sample(
                    min(len(remainder), cap - len(sampled)), random_state=seed
                ),
            ]
        )
    return sampled.sample(frac=1, random_state=seed).reset_index(drop=True)


def add_maia_features(
    config: dict[str, Any],
    *,
    output_path: str | Path = "data/processed/eval_positions_maia.parquet",
) -> dict[str, Any]:
    source = project_path(config, config["data"]["eval_positions_path"])
    frame = pl.read_parquet(source).to_pandas()
    frame = _balanced_sample(
        frame,
        int(config["maia2"]["max_feature_positions"]),
        int(config["seed"]),
    )
    best_moves: list[str | None] = []
    time_limit = float(config["maia2"]["stockfish_time_seconds"])
    with open_stockfish(config) as engine:
        for fen in frame["fen"]:
            board = chess.Board(fen)
            info = engine.analyse(board, chess.engine.Limit(time=time_limit))
            pv = info.get("pv", [])
            best_moves.append(pv[0].uci() if pv else None)
    frame["stockfish_best_move"] = best_moves

    provider = MaiaPolicy(config)
    inference_rows = [
        {
            "board": row.fen,
            "move": row.move_uci,
            "active_elo": int(row.mover_elo),
            "opponent_elo": int(row.opponent_elo),
        }
        for row in frame.itertuples()
    ]
    policies = provider.batch_policy(inference_rows)
    summaries = [
        policy_summary(
            policy,
            played_move=row.move_uci,
            best_move=row.stockfish_best_move,
        )
        for policy, row in zip(policies, frame.itertuples(), strict=True)
    ]
    summary_frame = pd.DataFrame(summaries)
    for column in summary_frame.columns:
        frame[column] = summary_frame[column]

    target = project_path(config, output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    pl.from_pandas(frame).write_parquet(target, compression="zstd")

    smoke = {}
    for band, group in frame.groupby("rating_band"):
        smoke[str(band)] = {
            "n": int(len(group)),
            "top1_move_match_accuracy": float(
                (group["maia_top1_move"] == group["move_uci"]).mean()
            ),
        }
    metadata = {
        "source": str(source),
        "output": str(target),
        "positions": int(len(frame)),
        "device": str(next(provider.model.parameters()).device),
        "move_match_by_band": smoke,
    }
    report_path = project_path(config, "reports/maia_smoke_metrics.json")
    report_path.write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata

