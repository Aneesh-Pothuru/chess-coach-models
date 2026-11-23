"""The scores a prediction gets, by the kind of label. Numpy only, so the light tests can check them.

A label is one number a row (a quantity, or whether something happened) or a set a row: which of a fixed
list of candidates are right, the squares of a board or the tags a task names. For a set a prediction is
a chance for every candidate, and each score is a mean over the rows of a score every row gets by itself
(``row_scores``), so its noise is measured by drawing the rows' scores again and never the ranking.

A label can also be one choice among a row's own candidates: the move played, of the moves the position
allows. A row then has as many candidates as it has legal moves, its label is which of them was played,
and a prediction is a chance for each that add up to one, with no number (NaN) where a row with fewer
moves has no candidate. Its scores are means over the rows too.
"""

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


def row_average_precision(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, the mean of the precision at each right candidate when the candidates are ranked by their
    chance, ties scored together. With one right candidate it is one over its rank. A row with no right
    candidate has none."""
    order = np.argsort(-p, axis=1, kind="stable")
    hits = np.cumsum(np.take_along_axis(y, order, axis=1), axis=1, dtype=np.float64)
    ranked = np.take_along_axis(p, order, axis=1)
    last = np.ones(ranked.shape, dtype=bool)
    last[:, :-1] = ranked[:, 1:] != ranked[:, :-1]
    at_last = np.where(last, hits, 0.0)
    before = np.zeros_like(hits)
    before[:, 1:] = np.maximum.accumulate(at_last, axis=1)[:, :-1]
    total = hits[:, -1]
    summed = np.sum(np.where(last, (hits - before) * hits / np.arange(1, y.shape[1] + 1), 0.0), axis=1)
    return np.where(total > 0, summed / np.maximum(total, 1.0), np.nan)


def row_first_right(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, whether the candidate given the highest chance is right: the share of right ones among
    those tied for it. A row with no right candidate has none."""
    tied = p == p.max(axis=1, keepdims=True)
    share = np.sum(tied & (y > 0), axis=1) / np.sum(tied, axis=1)
    return np.where(np.sum(y, axis=1) > 0, share, np.nan)


def row_log_loss(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, the log loss of the chances as one yes or no a candidate, averaged over the candidates."""
    q = np.clip(p, 1e-7, 1 - 1e-7)
    return -np.mean(y * np.log(q) + (1 - y) * np.log(1 - q), axis=1)


def _played(y: np.ndarray, p: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """For each row, the chance given to the candidate that was played, how many candidates were given
    more, and how many the same (the played one among them). A place with no candidate holds no number,
    and no number is more than or the same as another, so it counts as neither."""
    chance = p[np.arange(len(p)), np.asarray(y).astype(np.int64)][:, None]
    return chance[:, 0], np.sum(p > chance, axis=1), np.sum(p == chance, axis=1)


def row_played_first(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, whether the move played is the one given the highest chance. Among several tied for it,
    its share: what picking one of them at random would get. So the same chance for every move scores one
    over the number of moves."""
    _, above, tied = _played(y, p)
    return np.where(above == 0, 1.0 / tied, 0.0)


def row_played_in_three(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, whether the move played is among the three given the highest chances, ties broken at
    random: with fewer than three given more, its share of the places left."""
    _, above, tied = _played(y, p)
    return np.clip((3.0 - above) / tied, 0.0, 1.0)


def row_played_log_loss(y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Row by row, minus the log of the chance given to the move played: nothing for a certain right answer,
    log 2 for a coin's chance, and the log of the number of moves for the same chance each."""
    chance, _, _ = _played(y, p)
    return 0.0 - np.log(np.clip(chance, 1e-12, 1.0))


# The kinds whose label is a set of right candidates a row.
SETS = ("squares", "tags")
# The score every row gets by itself, by the metric that is its mean over the rows: for a set, and for
# a choice among a row's own candidates.
_SET_SCORES: dict[str, Metric] = {"ap": row_average_precision, "top1": row_first_right, "log_loss": row_log_loss}
ROW_SCORES: dict[str, dict[str, Metric]] = {
    **{kind: _SET_SCORES for kind in SETS},
    "moves": {"top1": row_played_first, "top3": row_played_in_three, "log_loss": row_played_log_loss},
}
# The kinds scored row by row: a run's predictions keep what each row scored, and noise is measured
# by drawing those again.
BY_ROW = tuple(ROW_SCORES)


def _over_rows(by_row: Metric) -> Metric:
    def metric(y: np.ndarray, p: np.ndarray) -> float:
        return mean_of_rows(by_row(np.asarray(y, dtype=np.float64), np.asarray(p, dtype=np.float64)))

    return metric


def mean_of_rows(scores: np.ndarray) -> float | np.ndarray:
    """The mean of the rows' scores, over the rows that have one: of one column as a number, of several as
    one number a column."""
    known = ~np.isnan(scores)
    counts = known.sum(axis=0)
    means = np.where(counts > 0, np.where(known, scores, 0.0).sum(axis=0) / np.maximum(counts, 1), np.nan)
    return float(means) if scores.ndim == 1 else means


_SET_METRICS = {name: _over_rows(by_row) for name, by_row in _SET_SCORES.items()}
METRICS: dict[str, dict[str, Metric]] = {
    "regression": {"rmse": rmse, "mae": mae, "r2": r2, "spearman": spearman},
    "binary": {
        "pr_auc": pr_auc,
        "roc_auc": roc_auc,
        "brier": brier,
        "log_loss": log_loss,
        "calibration_error": calibration_error,
    },
    **{kind: _SET_METRICS for kind in SETS},
    "moves": {name: _over_rows(by_row) for name, by_row in ROW_SCORES["moves"].items()},
}
LOWER_IS_BETTER = {"rmse", "mae", "brier", "log_loss", "calibration_error"}


def row_scores(kind: str, y: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Every row's score on each metric of a kind that is scored row by row, one column a metric in the
    order ``METRICS`` names them."""
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    return np.stack([by_row(y, p) for by_row in ROW_SCORES[kind].values()], axis=1)


def score(kind: str, y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    y = np.asarray(y, dtype=np.float64)
    p = np.asarray(p, dtype=np.float64)
    return {name: metric(y, p) for name, metric in METRICS[kind].items()}
