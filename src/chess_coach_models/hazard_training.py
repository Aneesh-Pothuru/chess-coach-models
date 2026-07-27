from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import polars as pl
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import calibration_curve

from .config import project_path
from .evaluation import metrics_by_band
from .features import feature_matrix
from .splitting import group_stratified_split


def _fit_lgbm(
    x_train: pd.DataFrame,
    y_train: np.ndarray,
    x_validation: pd.DataFrame,
    y_validation: np.ndarray,
    config: dict[str, Any],
) -> lgb.LGBMClassifier:
    cfg = config["hazard"]
    model = lgb.LGBMClassifier(
        objective="binary",
        n_estimators=int(cfg["num_boost_round"]),
        learning_rate=0.05,
        num_leaves=31,
        min_child_samples=40,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        class_weight=cfg.get("class_weight", "balanced"),
        random_state=int(config["seed"]),
        n_jobs=-1,
        verbosity=-1,
    )
    callbacks = [
        lgb.early_stopping(int(cfg["early_stopping_rounds"]), verbose=False)
    ]
    model.fit(
        x_train,
        y_train,
        eval_set=[(x_validation, y_validation)],
        eval_metric="average_precision",
        callbacks=callbacks,
    )
    return model


def train_hazard(
    config: dict[str, Any],
    *,
    include_maia: bool = False,
    input_path: str | Path | None = None,
    artifact_name: str | None = None,
) -> dict[str, Any]:
    default_path = config["data"]["eval_positions_path"]
    source_path = project_path(config, input_path or default_path)
    default_source_path = project_path(config, default_path)
    matched_subset = (
        not include_maia and source_path.resolve() != default_source_path.resolve()
    )
    frame = pl.read_parquet(source_path).to_pandas()
    required = {"game_id", "rating_band", "is_blunder", "fen", "mover_elo"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Hazard input missing columns: {sorted(missing)}")
    if include_maia:
        frame = frame.dropna(
            subset=[
                "maia_entropy",
                "maia_top1_probability",
                "maia_stockfish_best_probability",
            ]
        ).reset_index(drop=True)

    records = frame.to_dict(orient="records")
    features, feature_names = feature_matrix(
        records, config["rating_bands"], include_maia=include_maia
    )
    x = pd.DataFrame(features, columns=feature_names)
    y = frame["is_blunder"].to_numpy(dtype=int)
    split = group_stratified_split(
        frame,
        seed=int(config["seed"]),
        test_fraction=float(config["hazard"]["test_fraction"]),
        validation_fraction=float(config["hazard"]["validation_fraction"]),
    )
    if set(split.unique()) != {"train", "validation", "test"}:
        raise RuntimeError(f"Insufficient games for all data splits: {split.value_counts()}")
    train_mask = (split == "train").to_numpy()
    validation_mask = (split == "validation").to_numpy()
    test_mask = (split == "test").to_numpy()

    model = _fit_lgbm(
        x.loc[train_mask],
        y[train_mask],
        x.loc[validation_mask],
        y[validation_mask],
        config,
    )
    validation_raw = np.clip(
        model.predict_proba(x.loc[validation_mask])[:, 1], 1e-6, 1 - 1e-6
    )
    test_raw = np.clip(model.predict_proba(x.loc[test_mask])[:, 1], 1e-6, 1 - 1e-6)
    platt = LogisticRegression(random_state=int(config["seed"])).fit(
        np.log(validation_raw / (1.0 - validation_raw)).reshape(-1, 1),
        y[validation_mask],
    )
    model_probability = platt.predict_proba(
        np.log(test_raw / (1.0 - test_raw)).reshape(-1, 1)
    )[:, 1]
    base_rate = float(y[train_mask].mean())
    constant_probability = np.full(test_mask.sum(), base_rate)

    eval_train = x.loc[train_mask, ["abs_eval_cp"]].to_numpy()
    eval_test = x.loc[test_mask, ["abs_eval_cp"]].to_numpy()
    eval_calibrator = LogisticRegression(random_state=int(config["seed"])).fit(
        eval_train, y[train_mask]
    )
    eval_probability = eval_calibrator.predict_proba(eval_test)[:, 1]

    version = "v1_maia" if include_maia else ("v0_matched" if matched_subset else "v0")
    metrics = {
        "version": version,
        "source_path": str(
            source_path.relative_to(Path(config["_project_root"]))
            if source_path.is_relative_to(Path(config["_project_root"]))
            else source_path
        ),
        "features": feature_names,
        "positions": int(len(frame)),
        "games": int(frame["game_id"].nunique()),
        "split_positions": {
            name: int((split == name).sum())
            for name in ("train", "validation", "test")
        },
        "split_games": {
            name: int(frame.loc[split == name, "game_id"].nunique())
            for name in ("train", "validation", "test")
        },
        "metrics": metrics_by_band(
            y[test_mask],
            {
                "lightgbm": model_probability,
                "constant_base_rate": constant_probability,
                "abs_eval": eval_probability,
            },
            frame.loc[test_mask, "rating_band"].to_numpy(),
        ),
        "calibration": {},
    }
    for name, probabilities in {
        "lightgbm": model_probability,
        "constant_base_rate": constant_probability,
        "abs_eval": eval_probability,
    }.items():
        observed, predicted = calibration_curve(
            y[test_mask], probabilities, n_bins=10, strategy="quantile"
        )
        metrics["calibration"][name] = {
            "mean_predicted": predicted.tolist(),
            "observed_fraction": observed.tolist(),
        }

    artifact_path = project_path(
        config,
        artifact_name
        or (
            "artifacts/models/hazard_v1_maia.joblib"
            if include_maia
            else (
                "artifacts/models/hazard_v0_matched.joblib"
                if matched_subset
                else config["hazard"]["model_path"]
            )
        ),
    )
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(
        {
            "model": model,
            "probability_calibrator": platt,
            "feature_names": feature_names,
            "include_maia": include_maia,
            "rating_bands": config["rating_bands"],
            "version": version,
        },
        artifact_path,
    )

    metrics_path = project_path(
        config,
        (
            "reports/hazard_metrics_v1_maia.json"
            if include_maia
            else (
                "reports/hazard_metrics_v0_matched.json"
                if matched_subset
                else config["hazard"]["metrics_path"]
            )
        ),
    )
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2, allow_nan=True) + "\n")

    importance = (
        pd.DataFrame(
            {
                "feature": feature_names,
                "importance_gain": model.booster_.feature_importance(
                    importance_type="gain"
                ),
            }
        )
        .sort_values("importance_gain", ascending=False)
        .reset_index(drop=True)
    )
    importance_path = project_path(
        config,
        (
            "reports/hazard_feature_importance_v1_maia.csv"
            if include_maia
            else (
                "reports/hazard_feature_importance_v0_matched.csv"
                if matched_subset
                else config["hazard"]["feature_importance_path"]
            )
        ),
    )
    importance.to_csv(importance_path, index=False)
    return metrics
