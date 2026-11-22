import numpy as np
import pytest

from chess_coach_models.evals import metrics
from chess_coach_models.evals.bootstrap import Resampler, intervals, paired


def test_regression_scores():
    y = np.array([1.0, 2.0, 3.0, 4.0])
    p = np.array([1.0, 2.0, 3.0, 6.0])
    assert metrics.rmse(y, p) == pytest.approx(1.0)
    assert metrics.mae(y, p) == pytest.approx(0.5)
    assert metrics.r2(y, y) == pytest.approx(1.0)
    assert metrics.r2(y, np.full(4, y.mean())) == pytest.approx(0.0)
    assert metrics.spearman(y, p) == pytest.approx(1.0)
    assert metrics.spearman(y, -p) == pytest.approx(-1.0)
    assert np.isnan(metrics.spearman(y, np.ones(4)))


def test_ranking_scores_count_ties_together():
    y = np.array([1.0, 0.0, 1.0, 0.0, 0.0])
    p = np.array([0.9, 0.8, 0.7, 0.2, 0.1])
    assert metrics.pr_auc(y, p) == pytest.approx((1 / 1 + 2 / 3) / 2)
    assert metrics.roc_auc(y, p) == pytest.approx(5 / 6)
    tied = np.array([0.5, 0.5, 0.5, 0.5, 0.5])
    assert metrics.pr_auc(y, tied) == pytest.approx(0.4)
    assert metrics.roc_auc(y, tied) == pytest.approx(0.5)


def test_chance_scores():
    y = np.array([1.0, 0.0, 1.0, 0.0])
    assert metrics.brier(y, y) == 0.0
    assert metrics.brier(y, np.full(4, 0.5)) == pytest.approx(0.25)
    assert metrics.log_loss(y, np.full(4, 0.5)) == pytest.approx(np.log(2))
    assert metrics.calibration_error(y, np.full(4, 0.5), bins=2) == pytest.approx(0.0)
    assert metrics.calibration_error(y, np.full(4, 0.9), bins=2) == pytest.approx(0.4)
    assert set(metrics.score("binary", y, np.full(4, 0.5))) == set(metrics.METRICS["binary"])


def test_resampling_draws_whole_groups():
    groups = np.array(["a", "a", "b", "c", "c", "c"])
    resampler = Resampler(groups, seed=1)
    for _ in range(20):
        rows = resampler.draw()
        counts = {name: int(np.sum(groups[rows] == name)) for name in "abc"}
        assert counts["a"] % 2 == 0 and counts["c"] % 3 == 0


def test_intervals_and_paired_gains():
    rng = np.random.default_rng(0)
    y = rng.normal(size=2000)
    good = y + rng.normal(scale=0.5, size=2000)
    poor = y + rng.normal(scale=1.5, size=2000)
    groups = rng.integers(0, 500, size=2000)
    found = intervals("regression", y, good, groups, resamples=200)
    assert found["rmse"]["low"] < found["rmse"]["value"] < found["rmse"]["high"]
    gain = paired("regression", "rmse", y, good, poor, groups, resamples=200)
    assert gain["gain"] > 0 and gain["low"] > 0 and gain["beyond_noise"]
    same = paired("regression", "rmse", y, good, good, groups, resamples=50)
    assert same["gain"] == 0 and not same["beyond_noise"]
    ranked = paired("regression", "spearman", y, good, poor, groups, resamples=50)
    assert ranked["gain"] > 0
    flat = intervals("regression", y, np.zeros(2000), groups, resamples=20)
    assert np.isnan(flat["spearman"]["low"])
