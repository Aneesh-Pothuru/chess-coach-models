"""The tree baseline: gradient-boosted trees on numbers a person could count."""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from .base import Fitted, Prepared, features


# What a tree run uses unless its config says otherwise, and the three settings no config changes.
DEFAULTS = {"learning_rate": 0.05, "num_leaves": 127, "min_child_samples": 40, "rounds": 4000, "patience": 100}
FIXED = {"subsample": 0.8, "subsample_freq": 1, "colsample_bytree": 0.8, "lambda_l2": 1.0}


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """LightGBM on the context numbers, with the hand features when the run asks for them."""
    import lightgbm as lgb

    learner = config["learner"]
    task = prepared.task
    x, names = features(prepared, learner["features"])
    if task.kind == "binary":
        objective, metric = "binary", "binary_logloss"
    elif task.primary == "mae":
        objective, metric = "regression_l1", "l1"
    else:
        objective, metric = "regression", "rmse"
    params = {
        "objective": objective,
        "metric": metric,
        "learning_rate": float(learner.get("learning_rate", DEFAULTS["learning_rate"])),
        "num_leaves": int(learner.get("num_leaves", DEFAULTS["num_leaves"])),
        "min_child_samples": int(learner.get("min_child_samples", DEFAULTS["min_child_samples"])),
        **FIXED,
        "seed": int(config.get("seed", 0)),
        "verbosity": -1,
    }
    train = lgb.Dataset(x[prepared.train], prepared.y[prepared.train], feature_name=names)
    valid = lgb.Dataset(x[prepared.valid], prepared.y[prepared.valid], reference=train)
    started = time.time()
    booster = lgb.train(
        params,
        train,
        num_boost_round=int(learner.get("rounds", DEFAULTS["rounds"])),
        valid_sets=[valid],
        callbacks=[
            lgb.early_stopping(int(learner.get("patience", DEFAULTS["patience"])), verbose=False),
            lgb.log_evaluation(200),
        ],
    )
    gain = booster.feature_importance(importance_type="gain")
    order = np.argsort(-gain)[:10]
    return Fitted(
        valid=booster.predict(x[prepared.valid], num_iteration=booster.best_iteration),
        test=booster.predict(x[prepared.test], num_iteration=booster.best_iteration),
        details={
            "features": len(names),
            "trees": int(booster.best_iteration),
            "fit_seconds": round(time.time() - started, 1),
            "leans_on": [
                {"feature": names[index], "share_of_gain": round(float(gain[index] / gain.sum()), 4)}
                for index in order
            ],
        },
        save=lambda directory: booster.save_model(str(directory / "model.txt")) and None,
    )
