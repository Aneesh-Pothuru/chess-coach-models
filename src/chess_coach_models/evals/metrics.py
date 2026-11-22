"""The scores a prediction gets, by the kind of label. Numpy only, so the light tests can check them."""

from __future__ import annotations

from collections.abc import Callable

import numpy as np


Metric = Callable[[np.ndarray, np.ndarray], float]


def rmse(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.sqrt(np.mean((y - p) ** 2)))


def mae(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean(np.abs(y - p)))


def r2(y: np.ndarray, p: np.ndarray) -> float:
    spread = float(np.sum((y - y.mean()) ** 2))
    return float("nan") if spread == 0 else 1.0 - float(np.sum((y - p) ** 2)) / spread


def _ranks(values: np.ndarray) -> np.ndarray:
    """Average ranks, ties sharing their mean rank."""
    order = np.argsort(values, kind="mergesort")
    ordered = values[order]
    starts = np.flatnonzero(np.r_[True, ordered[1:] != ordered[:-1]])
    ends = np.r_[starts[1:], len(values)]
    ranks = np.empty(len(values), dtype=np.float64)
    ranks[order] = np.repeat((starts + ends - 1) / 2.0, ends - starts)
    return ranks


def spearman(y: np.ndarray, p: np.ndarray) -> float:
    a, b = _ranks(y), _ranks(p)
    a, b = a - a.mean(), b - b.mean()
    scale = float(np.sqrt(np.sum(a * a) * np.sum(b * b)))
    return float("nan") if scale == 0 else float(np.sum(a * b)) / scale


def roc_auc(y: np.ndarray, p: np.ndarray) -> float:
    positives = float(np.sum(y))
    negatives = len(y) - positives
    if positives == 0 or negatives == 0:
        return float("nan")
    ranks = _ranks(p)
    return float((np.sum(ranks[y > 0.5]) - positives * (positives - 1) / 2.0) / (positives * negatives))


def pr_auc(y: np.ndarray, p: np.ndarray) -> float:
    """Average precision: the mean of the precision at each positive, ranked by score, ties scored together."""
    positives = float(np.sum(y))
    if positives == 0:
        return float("nan")
    order = np.argsort(-p, kind="mergesort")
    hits = np.cumsum(y[order])
    scores = p[order]
    last = np.r_[np.flatnonzero(scores[1:] != scores[:-1]), len(scores) - 1]
    hits_at = hits[last]
    gained = np.diff(np.r_[0.0, hits_at])
    return float(np.sum(gained * hits_at / (last + 1.0)) / positives)


def brier(y: np.ndarray, p: np.ndarray) -> float:
    return float(np.mean((p - y) ** 2))


def log_loss(y: np.ndarray, p: np.ndarray) -> float:
    q = np.clip(p, 1e-7, 1 - 1e-7)
    return float(-np.mean(y * np.log(q) + (1 - y) * np.log(1 - q)))


def calibration_error(y: np.ndarray, p: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error over equal-count bins: how far the stated chance sits from the observed rate."""
    order = np.argsort(p, kind="mergesort")
    total = 0.0
    for part in np.array_split(order, bins):
        if len(part):
            total += len(part) * abs(float(np.mean(p[part])) - float(np.mean(y[part])))
    return total / len(y)


def calibration_table(y: np.ndarray, p: np.ndarray, bins: int = 10) -> list[dict[str, float]]:
    order = np.argsort(p, kind="mergesort")
    return [
        {"n": int(len(part)), "predicted": float(np.mean(p[part])), "observed": float(np.mean(y[part]))}
        for part in np.array_split(order, bins)
        if len(part)
    ]


METRICS: dict[str, dict[str, Metric]] = {
    "regression": {"rmse": rmse, "mae": mae, "r2": r2, "spearman": spearman},
    "binary": {
        "pr_auc": pr_auc,
        "roc_auc": roc_auc,
        "brier": brier,
        "log_loss": log_loss,
        "calibration_error": calibration_error,
    },
}
LOWER_IS_BETTER = {"rmse", "mae", "brier", "log_loss", "calibration_error"}


def score(kind: str, y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    return {name: metric(y, p) for name, metric in METRICS[kind].items()}
