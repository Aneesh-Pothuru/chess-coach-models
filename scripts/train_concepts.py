#!/usr/bin/env python3
"""Train and evaluate the concept tagger (model #6).

Reads the sampled puzzle dataset, extracts (or reuses) frozen Maia2
embeddings, trains the multi-label head with a game-grouped split, and writes
the held-out evaluation to reports/concept_metrics.json.
"""

from __future__ import annotations

import argparse
import json

import numpy as np
import pandas as pd
import torch

from chess_coach_models.config import load_config, project_path
from chess_coach_models.concepts import (
    MaiaEmbedder,
    evaluate_concept_head,
    labels_matrix,
    train_concept_head,
)
from chess_coach_models.splitting import group_stratified_split


def load_embeddings(config: dict, frame: pd.DataFrame) -> np.ndarray:
    cfg = config["concepts"]
    cache_path = project_path(config, cfg["embeddings_path"])
    if cache_path.exists():
        cached = np.load(cache_path)
        if len(cached) == len(frame):
            print(f"[concepts] reuse embedding cache {cache_path.name}")
            return cached
    print(f"[concepts] extracting {len(frame):,} Maia2 embeddings")
    embedder = MaiaEmbedder(config)
    embeddings = embedder.embed(
        frame["fen"].tolist(), frame["solution_uci"].tolist()
    )
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache_path, embeddings)
    return embeddings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/config.yaml")
    args = parser.parse_args()
    config = load_config(args.config)
    cfg = config["concepts"]

    frame = pd.read_parquet(project_path(config, cfg["dataset_path"]))
    sampling = json.loads(
        project_path(config, cfg["sampling_metadata_path"]).read_text(
            encoding="utf-8"
        )
    )
    vocabulary = sampling["vocabulary"]
    labels = labels_matrix(frame["themes"], vocabulary)
    embeddings = load_embeddings(config, frame)

    splits = group_stratified_split(
        frame,
        seed=int(config["seed"]),
        test_fraction=float(cfg["test_fraction"]),
        validation_fraction=float(cfg["validation_fraction"]),
    )
    head, training_info = train_concept_head(embeddings, labels, splits, config)

    test_mask = (splits == "test").to_numpy()
    evaluation = evaluate_concept_head(
        head, embeddings[test_mask], labels[test_mask], vocabulary
    )

    model_path = project_path(config, cfg["model_path"])
    model_path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "state_dict": head.state_dict(),
            "vocabulary": vocabulary,
            "input_dim": int(embeddings.shape[1]),
            "hidden_dim": int(cfg["hidden_dim"]),
            "conditioning_elo": int(cfg["conditioning_elo"]),
        },
        model_path,
    )

    metrics = {
        "protocol": {
            "encoder": f"maia2-{config['maia2']['model_type']} last_ln (frozen)",
            "embedding_dim": int(embeddings.shape[1]),
            "hidden_dim": int(cfg["hidden_dim"]),
            "conditioning_elo": int(cfg["conditioning_elo"]),
            "min_plays": int(cfg["min_plays"]),
            "min_theme_count": int(cfg["min_theme_count"]),
            "excluded_themes": list(cfg["exclude_themes"]),
            "seed": int(config["seed"]),
        },
        "sampling": sampling,
        "split_sizes": {
            name: int((splits == name).sum())
            for name in ("train", "validation", "test")
        },
        "test_games": int(frame.loc[test_mask, "game_id"].nunique()),
        "training": training_info,
        "test": evaluation,
    }
    metrics_path = project_path(config, cfg["metrics_path"])
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "macro_ap": evaluation["macro_average_precision"],
                "macro_prevalence": evaluation["macro_prevalence_baseline"],
                "micro_ap": evaluation["micro_average_precision"],
                "themes": evaluation["n_themes"],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
