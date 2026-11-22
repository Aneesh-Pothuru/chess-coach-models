"""The learners that fit nothing: a column of the dataset read as the prediction, and the rating formula."""

import numpy as np
import polars as pl
import pytest

from chess_coach_models import tasks
from chess_coach_models.data import store
from chess_coach_models.train import learners
from chess_coach_models.train.learners import column, rating_formula


ROWS = 600


def a_task(label: str) -> tasks.Task:
    return tasks.Task(
        name="tiny",
        dataset="tiny",
        kind="regression",
        label=label,
        unit="a unit",
        context=("mover_elo",),
        primary="rmse",
        reference="gbm-hand",
    )


def a_dataset() -> store.Dataset:
    rng = np.random.default_rng(0)
    index = np.arange(ROWS)
    rows = pl.DataFrame(
        {
            "key": [f"row{number:04d}" for number in index],
            "game_id": [f"game{number // 3:04d}" for number in index],
            "mover_elo": rng.integers(800, 2400, size=ROWS),
            "opponent_elo": rng.integers(800, 2400, size=ROWS),
            "win_before": rng.uniform(0, 100, size=ROWS),
            "mover_score": rng.choice([0.0, 0.5, 1.0], size=ROWS),
            "band": ["all"] * ROWS,
            "split": np.where(index % 5 == 0, "test", np.where(index % 5 == 1, "valid", "train")),
        }
    )
    empty = np.zeros((ROWS, 64), dtype=np.uint8)
    manifest = {"group": "game_id", "hand": ["win_before"], "marks": ["en_passant"]}
    return store.Dataset(name="tiny", rows=rows, tokens=empty, marks=empty.astype(np.uint16), manifest=manifest)


def test_a_column_is_read_as_the_prediction_with_nothing_fitted():
    dataset = a_dataset()
    prepared = learners.prepare(a_task("mover_score"), dataset)
    config = {"learner": {"kind": "column", "column": "win_before", "scale": 0.01}}
    fitted = learners.fit(prepared, config, log=lambda _: None)
    said = dataset.rows["win_before"].to_numpy() * 0.01
    assert np.array_equal(fitted.test, said[prepared.test]) and np.array_equal(fitted.valid, said[prepared.valid])
    assert fitted.details == {"column": "win_before", "scale": 0.01}
    as_it_is = column.fit(prepared, {"learner": {"kind": "column", "column": "win_before"}}, log=lambda _: None)
    assert np.array_equal(as_it_is.test, dataset.rows["win_before"].to_numpy()[prepared.test])


def test_the_rating_formula_gives_a_result_its_expected_score():
    dataset = a_dataset()
    prepared = learners.prepare(a_task("mover_score"), dataset)
    config = {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "opponent_elo"}}
    fitted = learners.fit(prepared, config, log=lambda _: None)
    gap = (dataset.rows["mover_elo"] - dataset.rows["opponent_elo"]).to_numpy()[prepared.test]
    assert np.allclose(fitted.test, 1 / (1 + 10 ** (-gap / 400)))
    assert ((fitted.test > 0) & (fitted.test < 1)).all()


def test_the_rating_formula_refuses_a_label_that_is_no_score():
    prepared = learners.prepare(a_task("mover_elo"), a_dataset())
    config = {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "opponent_elo"}}
    with pytest.raises(ValueError, match="yes-or-no label or a score from 0 to 1"):
        rating_formula.fit(prepared, config, log=lambda _: None)


def test_a_run_names_a_learner_the_lab_has():
    prepared = learners.prepare(a_task("mover_score"), a_dataset())
    with pytest.raises(ValueError, match="no learner named"):
        learners.fit(prepared, {"learner": {"kind": "oracle"}}, log=lambda _: None)
