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
from .hazard_training import group_stratified_split
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
    seed = int(config["seed"])
    split = group_stratified_split(
        frame,
        seed=seed,
        test_fraction=float(config["hazard"]["test_fraction"]),
        validation_fraction=float(config["hazard"]["validation_fraction"]),
    )
    frame["_split"] = split
    smoke_per_band = int(config["maia2"]["smoke_moves_per_band"])
    held_out_parts = [
        group.sample(min(len(group), smoke_per_band), random_state=seed)
        for _, group in frame.loc[frame["_split"] == "test"].groupby(
            "rating_band", sort=False
        )
    ]
    held_out = pd.concat(held_out_parts)
    cap = int(config["maia2"]["max_feature_positions"])
    remainder_cap = max(0, cap - len(held_out))
    remainder = _balanced_sample(
        frame.loc[frame["_split"] != "test"],
        remainder_cap,
        seed,
    )
    frame = (
        pd.concat([held_out, remainder])
        .sample(frac=1, random_state=seed)
        .reset_index(drop=True)
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
    smoke_frame = frame.loc[frame["_split"] == "test"]
    for band, group in smoke_frame.groupby("rating_band"):
        smoke[str(band)] = {
            "n": int(len(group)),
            "top1_move_match_accuracy": float(
                (group["maia_top1_move"] == group["move_uci"]).mean()
            ),
        }
    overall_accuracy = float(
        (smoke_frame["maia_top1_move"] == smoke_frame["move_uci"]).mean()
    )
    metadata = {
        "source": str(source.relative_to(Path(config["_project_root"]))),
        "output": str(target.relative_to(Path(config["_project_root"]))),
        "positions": int(len(frame)),
        "smoke_positions": int(len(smoke_frame)),
        "device": str(next(provider.model.parameters()).device),
        "move_match_by_band": smoke,
        "overall_top1_move_match_accuracy": overall_accuracy,
    }
    report_path = project_path(config, "reports/maia_smoke_metrics.json")
    report_path.write_text(json.dumps(metadata, indent=2) + "\n")
    return metadata
