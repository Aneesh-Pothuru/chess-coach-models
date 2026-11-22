"""The noise around a score, and whether one model beats another beyond it.

Rows of one game are not independent, so every resample draws whole groups
(games) with replacement. A comparison is paired: both models are scored on
the same resampled rows, and the interval is of the difference.
"""

from __future__ import annotations

import numpy as np

from .metrics import LOWER_IS_BETTER, METRICS, SETS, mean_of_rows, row_scores


# How many times the games are drawn again for a full run's intervals, and for a smoke run's.
RESAMPLES = 1000
SMOKE_RESAMPLES = 100


class Resampler:
    """Draws rows by whole groups."""

    def __init__(self, groups: np.ndarray, seed: int = 0):
        _, codes = np.unique(np.asarray(groups), return_inverse=True)
        self.order = np.argsort(codes, kind="mergesort")
        self.sizes = np.bincount(codes)
        self.starts = np.r_[0, np.cumsum(self.sizes)[:-1]]
        self.rng = np.random.default_rng(seed)

    def draw(self) -> np.ndarray:
        picked = self.rng.integers(0, len(self.sizes), size=len(self.sizes))
        sizes = self.sizes[picked]
        total = int(sizes.sum())
        offsets = np.arange(total) - np.repeat(np.cumsum(sizes) - sizes, sizes)
        return self.order[np.repeat(self.starts[picked], sizes) + offsets]


def intervals(
    kind: str,
    y: np.ndarray,
    p: np.ndarray,
    groups: np.ndarray,
    *,
    resamples: int = RESAMPLES,
    seed: int = 0,
) -> dict[str, dict[str, float]]:
    """Each metric with its 95% interval over resampled groups."""
    if kind in SETS:
        return intervals_of_rows(list(METRICS[kind]), row_scores(kind, y, p), groups, resamples=resamples, seed=seed)
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    resampler = Resampler(groups, seed)
    draws: dict[str, list[float]] = {name: [] for name in METRICS[kind]}
    for _ in range(resamples):
        rows = resampler.draw()
        for name, metric in METRICS[kind].items():
            draws[name].append(metric(y[rows], p[rows]))
    result = {}
    for name, metric in METRICS[kind].items():
        low, high = _span(draws[name])
        result[name] = {"value": metric(y, p), "low": low, "high": high}
    return result


def intervals_of_rows(
    names: list[str],
    scores: np.ndarray,
    groups: np.ndarray,
    *,
    resamples: int = RESAMPLES,
    seed: int = 0,
) -> dict[str, dict[str, float]]:
    """Each metric that is a mean of the rows' scores (one column of ``scores`` a metric), with its 95%
    interval over resampled groups. The rows are scored once and only their scores are drawn again."""
    resampler = Resampler(groups, seed)
    draws = np.stack([mean_of_rows(scores[resampler.draw()]) for _ in range(resamples)])
    values = mean_of_rows(scores)
    result = {}
    for column, name in enumerate(names):
        low, high = _span(draws[:, column])
        result[name] = {"value": float(values[column]), "low": low, "high": high}
    return result


def paired_of_rows(
    scores: np.ndarray,
    reference: np.ndarray,
    groups: np.ndarray,
    *,
    lower_is_better: bool,
    resamples: int = RESAMPLES,
    seed: int = 0,
) -> dict[str, float | bool]:
    """``paired`` for a metric that is a mean of the rows' scores, given each run's score row by row."""
    sign = -1.0 if lower_is_better else 1.0
    resampler = Resampler(groups, seed)
    gains = []
    for _ in range(resamples):
        rows = resampler.draw()
        gains.append(sign * (mean_of_rows(scores[rows]) - mean_of_rows(reference[rows])))
    low, high = _span(gains)
    return {
        "gain": sign * (mean_of_rows(scores) - mean_of_rows(reference)),
        "low": low,
        "high": high,
        "beyond_noise": bool(low > 0 or high < 0),
    }


def _span(draws: list[float]) -> tuple[float, float]:
    """The middle 95% of the draws that have a value; a metric a constant prediction cannot have has none."""
    known = np.asarray(draws, dtype=np.float64)
    known = known[~np.isnan(known)]
    if not len(known):
        return float("nan"), float("nan")
    low, high = np.percentile(known, [2.5, 97.5])
    return float(low), float(high)


def paired(
    kind: str,
    metric: str,
    y: np.ndarray,
    p: np.ndarray,
    p_reference: np.ndarray,
    groups: np.ndarray,
    *,
    resamples: int = RESAMPLES,
    seed: int = 0,
) -> dict[str, float | bool]:
    """How much better ``p`` is than ``p_reference`` on one metric, as a gain where positive means better.

    ``beyond_noise`` is true when the 95% interval of the gain leaves zero out.
    """
    if kind in SETS:
        column = list(METRICS[kind]).index(metric)
        return paired_of_rows(
            row_scores(kind, y, p)[:, column],
            row_scores(kind, y, p_reference)[:, column],
            groups,
            lower_is_better=metric in LOWER_IS_BETTER,
            resamples=resamples,
            seed=seed,
        )
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    p_reference = np.asarray(p_reference, dtype=np.float64)
    function = METRICS[kind][metric]
    sign = -1.0 if metric in LOWER_IS_BETTER else 1.0
    resampler = Resampler(groups, seed)
    gains = []
    for _ in range(resamples):
        rows = resampler.draw()
        gains.append(sign * (function(y[rows], p[rows]) - function(y[rows], p_reference[rows])))
    low, high = _span(gains)
    return {
        "gain": sign * (function(y, p) - function(y, p_reference)),
        "low": low,
        "high": high,
        "beyond_noise": bool(low > 0 or high < 0),
    }
