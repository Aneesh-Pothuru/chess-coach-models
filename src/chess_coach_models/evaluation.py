from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    roc_auc_score,
)


def binary_metrics(y_true: np.ndarray, y_probability: np.ndarray) -> dict[str, float]:
    y = np.asarray(y_true, dtype=int)
    p = np.clip(np.asarray(y_probability, dtype=float), 0.0, 1.0)
    base_rate = float(y.mean()) if len(y) else float("nan")
    if len(y) == 0 or len(np.unique(y)) < 2:
        roc_auc = float("nan")
        pr_auc = float("nan")
    else:
        roc_auc = float(roc_auc_score(y, p))
        pr_auc = float(average_precision_score(y, p))
    return {
        "n": int(len(y)),
        "positives": int(y.sum()),
        "base_rate": base_rate,
        "roc_auc": roc_auc,
        "pr_auc": pr_auc,
        "brier_score": float(brier_score_loss(y, p)) if len(y) else float("nan"),
    }


def metrics_by_band(
    y_true: np.ndarray,
    predictions: dict[str, np.ndarray],
    bands: np.ndarray,
) -> dict[str, Any]:
    result: dict[str, Any] = {"overall": {}}
    for model_name, probability in predictions.items():
        result["overall"][model_name] = binary_metrics(y_true, probability)
    for band in sorted(set(str(value) for value in bands)):
        mask = np.asarray(bands) == band
        result[band] = {
            model_name: binary_metrics(y_true[mask], probability[mask])
            for model_name, probability in predictions.items()
        }
    return result

