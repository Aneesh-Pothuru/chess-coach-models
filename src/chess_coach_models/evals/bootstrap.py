"""The noise around a score, and whether one model beats another beyond it.

Rows of one game are not independent, so every resample draws whole groups
(games) with replacement. A comparison is paired: both models are scored on
the same resampled rows, and the interval is of the difference.
"""

from __future__ import annotations

import numpy as np

from .metrics import LOWER_IS_BETTER, METRICS


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
    resamples: int = 1000,
    seed: int = 0,
) -> dict[str, dict[str, float]]:
    """Each metric with its 95% interval over resampled groups."""
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
    resamples: int = 1000,
    seed: int = 0,
) -> dict[str, float | bool]:
    """How much better ``p`` is than ``p_reference`` on one metric, as a gain where positive means better.

    ``beyond_noise`` is true when the 95% interval of the gain leaves zero out.
    """
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
