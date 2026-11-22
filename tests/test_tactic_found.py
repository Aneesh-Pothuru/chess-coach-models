"""The tactic-found model end to end on real rows: its dataset, the rating formula, trees and a network, ranked."""

import json
from pathlib import Path

import numpy as np
import polars as pl
import pytest

pytest.importorskip("torch")
pytest.importorskip("lightgbm")

from chess_coach_models import tasks  # noqa: E402
from chess_coach_models.data import store, tactics  # noqa: E402
from chess_coach_models.evals import leaderboard  # noqa: E402
from chess_coach_models.train import learners  # noqa: E402
from chess_coach_models.train import run as runs  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "puzzles_with_games_sample.parquet"
RECIPE = {
    "name": "tactics-test",
    "builder": "tactics",
    "source": "https://huggingface.co/datasets/Lichess/chess-puzzles-with-games",
    "revision": "test",
    "files": 1,
    "filters": {"max_rating_deviation": 500, "min_plays": 0, "speeds": ["blitz", "rapid", "classical"]},
    "sample": 1.0,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}
CONFIGS = {
    "gbm-hand": {"learner": {"kind": "gbm", "features": "hand", "rounds": 20, "min_child_samples": 5}},
    "constant": {"learner": {"kind": "constant"}},
    "puzzle-rating": {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "rating"}},
    "transformer-small": {
        "learner": {"kind": "net", "body": "transformer", "dim": 16, "depth": 1, "heads": 2},
        "train": {"epochs": 2, "batch": 32, "lr": 0.01},
    },
}


@pytest.fixture()
def lab(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "PROCESSED", tmp_path / "processed")
    monkeypatch.setattr(runs, "ARTIFACTS", tmp_path / "artifacts")
    monkeypatch.setattr(runs, "MODELS", tmp_path / "models")
    monkeypatch.setattr(runs, "recipe", lambda dataset, smoke=False: dict(RECIPE))
    monkeypatch.setattr(runs, "run_config", lambda model, name, smoke=False: json.loads(json.dumps(CONFIGS[name])))
    rows, tokens, marks, manifest = tactics.build(RECIPE, source=str(FIXTURE), workers=2, log=lambda _: None)
    store.write_dataset(RECIPE["name"], rows, tokens, marks, manifest)
    return tmp_path


def test_every_learner_runs_and_the_leaderboard_ranks_them_by_log_loss(lab):
    task = tasks.get("tactic-found")
    assert task.primary == "log_loss" and task.lower_is_better and task.kind == "binary"
    for name in CONFIGS:
        record = runs.run("tactic-found", name, smoke=True, log=lambda _: None)
        primary = record["test"][task.primary]
        assert primary["low"] <= primary["value"] <= primary["high"]
        assert record["calibration"]["fitted_on"] == "valid"
        assert record["test_rows"] == sum(band["rows"] for band in record["test_by_band"].values())
    board = leaderboard.build("tactic-found", smoke=True)
    scores = [entry["test"][task.primary]["value"] for entry in board["runs"]]
    assert scores == sorted(scores)
    gains = {entry["run"]: entry["gain"] for entry in board["runs"]}
    assert gains[task.reference] is None
    assert all(gains[name] is not None for name in CONFIGS if name != task.reference)
    text = (runs.results_dir("tactic-found", smoke=True) / "leaderboard.md").read_text()
    assert "the rating formula on `mover_elo` against `rating`" in text
    assert "Log loss (lower is better)" in text and "not compared" not in text


def test_the_rating_formula_reads_the_two_ratings_and_nothing_else(lab):
    record = runs.run("tactic-found", "puzzle-rating", smoke=True, log=lambda _: None)
    assert record["learner"] == {"player": "mover_elo", "against": "rating", "scale": 400}
    dataset = store.read_dataset("tactics-test")
    prepared = learners.prepare(tasks.get("tactic-found"), dataset)
    fitted = learners.fit_rating_formula(prepared, CONFIGS["puzzle-rating"], log=lambda _: None)
    test = dataset.rows[prepared.test]
    gap = (test["mover_elo"] - test["rating"]).to_numpy()
    assert np.allclose(fitted.test, 1 / (1 + 10 ** (-gap / 400)))
    level = fitted.test[np.argmin(np.abs(gap))]
    assert abs(level - 0.5) < 0.05
    scored = pl.read_parquet(runs.predictions_path("tactic-found", "puzzle-rating", smoke=True))
    order = np.argsort(gap, kind="mergesort")
    steps = np.diff(scored["p"].to_numpy()[order])
    assert (steps >= -1e-12).all() or (steps <= 1e-12).all()


def test_the_rating_formula_needs_a_yes_or_no_label(lab):
    prepared = learners.prepare(tasks.get("puzzle-difficulty"), store.read_dataset("tactics-test"))
    with pytest.raises(ValueError, match="yes-or-no"):
        learners.fit_rating_formula(prepared, CONFIGS["puzzle-rating"], log=lambda _: None)
