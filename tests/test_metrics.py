import numpy as np
import pytest

from chess_coach_models.evals import metrics
from chess_coach_models.evals.bootstrap import Resampler, intervals, intervals_of_rows, paired, paired_of_rows


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


def test_a_row_of_a_set_is_scored_by_itself_and_ties_count_together():
    y = np.array([[1, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0], [1, 1, 0, 0]], dtype=np.float64)
    p = np.array([[0.9, 0.8, 0.7, 0.1], [0.5, 0.5, 0.1, 0.1], [0.3, 0.2, 0.1, 0.0], [0.2, 0.2, 0.2, 0.2]])
    precision = metrics.row_average_precision(y, p)
    assert precision[:2] == pytest.approx([(1 / 1 + 2 / 3) / 2, 1 / 2])
    assert np.isnan(precision[2]) and precision[3] == pytest.approx(0.5)
    first = metrics.row_first_right(y, p)
    assert first[:2] == pytest.approx([1.0, 0.5]) and np.isnan(first[2]) and first[3] == pytest.approx(0.5)
    assert metrics.row_log_loss(y, p)[2] == pytest.approx(-np.mean(np.log(1 - np.clip(p[2], 1e-7, 1 - 1e-7))))
    rng = np.random.default_rng(0)
    y = (rng.random((300, 9)) < 0.25).astype(np.float64)
    p = rng.random((300, 9)).round(1)
    for row, got in enumerate(metrics.row_average_precision(y, p)):
        wanted = metrics.pr_auc(y[row], p[row])
        assert (np.isnan(wanted) and np.isnan(got)) or got == pytest.approx(wanted)


def test_a_set_s_scores_are_means_over_the_rows_that_have_one():
    y = np.array([[1, 0, 0], [0, 0, 0], [0, 1, 1]], dtype=np.uint8)
    p = np.array([[0.2, 0.7, 0.1], [0.6, 0.3, 0.1], [0.1, 0.8, 0.6]])
    for kind in metrics.SETS:
        found = metrics.score(kind, y, p)
        assert list(found) == list(metrics.METRICS[kind]) == ["ap", "top1", "log_loss"]
        assert found["ap"] == pytest.approx((1 / 2 + 1.0) / 2) and found["top1"] == pytest.approx(0.5)
        assert found["log_loss"] == pytest.approx(float(np.mean(metrics.row_log_loss(y, p))))
        scores = metrics.row_scores(kind, y, p)
        assert scores.shape == (3, 3) and np.isnan(scores[1, :2]).all() and not np.isnan(scores[1, 2])
        assert metrics.mean_of_rows(scores) == pytest.approx(list(found.values()))
    assert np.isnan(metrics.mean_of_rows(np.array([np.nan, np.nan])))
    assert "log_loss" in metrics.LOWER_IS_BETTER and "ap" not in metrics.LOWER_IS_BETTER


def test_a_set_s_noise_draws_the_rows_scores_again():
    rng = np.random.default_rng(1)
    y = (rng.random((1500, 8)) < 0.2).astype(np.uint8)
    good = y * 0.3 + rng.random((1500, 8)) * 0.7
    poor = rng.random((1500, 8))
    groups = rng.integers(0, 400, size=1500)
    found = intervals("squares", y, good, groups, resamples=100)
    assert found["ap"]["low"] < found["ap"]["value"] < found["ap"]["high"]
    scores = metrics.row_scores("squares", y, good)
    assert intervals_of_rows(list(metrics.METRICS["squares"]), scores, groups, resamples=100) == found
    gain = paired("tags", "ap", y, good, poor, groups, resamples=100)
    assert gain["gain"] > 0 and gain["beyond_noise"]
    assert gain == paired_of_rows(
        scores[:, 0], metrics.row_scores("tags", y, poor)[:, 0], groups, lower_is_better=False, resamples=100
    )
    loss = paired("tags", "log_loss", y, good, poor, groups, resamples=50)
    assert loss["gain"] > 0 and loss["low"] > 0
    same = paired("squares", "top1", y, good, good, groups, resamples=20)
    assert same["gain"] == 0 and not same["beyond_noise"]


def test_a_row_whose_answer_is_a_move_is_scored_by_the_move_played():
    nan = np.nan
    p = np.array([[0.5, 0.3, 0.2, nan], [0.25, 0.25, 0.25, 0.25], [0.1, 0.6, 0.3, nan], [1.0, nan, nan, nan], [0.4, 0.4, 0.1, 0.1]])
    y = np.array([0, 2, 2, 0, 3])
    scores = metrics.row_scores("moves", y, p)
    assert list(metrics.METRICS["moves"]) == ["top1", "top3", "log_loss"] and scores.shape == (5, 3)
    # First right: the move played has the highest chance, or its share of a tie for it.
    assert scores[:, 0].tolist() == [1.0, 0.25, 0.0, 1.0, 0.0]
    # In the first three: with two given more and two tied for the place left, half.
    assert scores[:, 1].tolist() == [1.0, 0.75, 1.0, 1.0, 0.5]
    assert scores[:, 2] == pytest.approx([np.log(2), np.log(4), -np.log(0.3), 0.0, -np.log(0.1)])
    assert not np.signbit(scores[3, 2])
    found = metrics.score("moves", y, p)
    assert found == pytest.approx({"top1": 0.45, "top3": 0.85, "log_loss": float(scores[:, 2].mean())})
    assert metrics.mean_of_rows(scores) == pytest.approx(list(found.values()))
    # A move played that was given no chance at all is a large loss and not an endless one.
    assert metrics.row_scores("moves", np.array([1]), np.array([[1.0, 0.0]]))[0] == pytest.approx([0.0, 1.0, -np.log(1e-12)])
    # The same chance for every legal move scores one over their number, and the log of it.
    even = np.where(np.arange(8)[None, :] < np.array([[2], [5], [8]]), 1.0 / np.array([[2], [5], [8]]), nan)
    assert metrics.row_scores("moves", np.array([1, 4, 0]), even)[:, [0, 2]] == pytest.approx(
        np.array([[1 / 2, np.log(2)], [1 / 5, np.log(5)], [1 / 8, np.log(8)]])
    )
    assert "moves" in metrics.BY_ROW and set(metrics.SETS) < set(metrics.BY_ROW) and "moves" not in metrics.SETS


def moves_said(rng, rows: int, most: int, sharpness: float):
    """Rows of one to ``most`` candidates with chances drawn at a sharpness, and a move played by those chances."""
    counts = rng.integers(1, most + 1, size=rows)
    held = np.arange(most)[None, :] < counts[:, None]
    logits = np.where(held, rng.normal(size=(rows, most)) * sharpness, -np.inf)
    chances = np.exp(logits - logits.max(axis=1, keepdims=True))
    chances /= chances.sum(axis=1, keepdims=True)
    played = np.array([rng.choice(most, p=row) for row in chances])
    return np.where(held, chances, np.nan), played


def test_a_move_s_noise_draws_the_rows_scores_again():
    rng = np.random.default_rng(2)
    good, y = moves_said(rng, 1500, 9, 2.0)
    poor = np.where(np.isnan(good), np.nan, 1.0 / (~np.isnan(good)).sum(axis=1, keepdims=True))
    groups = rng.integers(0, 400, size=1500)
    found = intervals("moves", y, good, groups, resamples=100)
    assert list(found) == ["top1", "top3", "log_loss"]
    assert found["top1"]["low"] < found["top1"]["value"] < found["top1"]["high"]
    scores = metrics.row_scores("moves", y, good)
    assert intervals_of_rows(list(metrics.METRICS["moves"]), scores, groups, resamples=100) == found
    gain = paired("moves", "top1", y, good, poor, groups, resamples=100)
    assert gain["gain"] > 0 and gain["beyond_noise"]
    assert gain == paired_of_rows(scores[:, 0], metrics.row_scores("moves", y, poor)[:, 0], groups, lower_is_better=False, resamples=100)
    assert paired("moves", "log_loss", y, good, poor, groups, resamples=50)["low"] > 0
    assert not paired("moves", "top3", y, good, good, groups, resamples=20)["beyond_noise"]


def test_one_temperature_fits_a_run_s_confidence_and_moves_no_move_past_another():
    from chess_coach_models.evals.calibration import temper, temperature

    rng = np.random.default_rng(0)
    true, y = moves_said(rng, 4000, 12, 2.0)
    loss = metrics.METRICS["moves"]["log_loss"]
    for told in (0.4, 1.0, 2.5):
        said = temper(true, told)
        assert np.array_equal(np.isnan(said), np.isnan(true)) and np.nansum(said, axis=1) == pytest.approx(1.0)
        # Flattened or sharpened, the moves keep their order, so the first two scores are what they were.
        assert metrics.row_scores("moves", y, said)[:, :2] == pytest.approx(metrics.row_scores("moves", y, true)[:, :2])
        found = temperature(said, y)
        assert found == pytest.approx(1.0 / told, rel=0.05)
        back = temper(said, found)
        assert loss(y, back) <= loss(y, said) + 1e-12 and loss(y, back) == pytest.approx(loss(y, true), abs=2e-3)
    assert temper(true, 1.0) == pytest.approx(true, nan_ok=True)
    # Chances that are far too sure come back, and the answer stays between a twentieth and twenty.
    sure = temper(true, 0.02)
    assert 0.05 <= temperature(sure, y) <= 20.0
    assert loss(y, temper(sure, temperature(sure, y))) < loss(y, sure)
    # A move given no chance at all does not break it.
    with_nothing = np.array([[1.0, 0.0, np.nan], [0.5, 0.5, 0.0]])
    assert np.isfinite(temperature(with_nothing, np.array([1, 2])))
    assert np.nansum(temper(with_nothing, 2.0), axis=1) == pytest.approx(1.0)
