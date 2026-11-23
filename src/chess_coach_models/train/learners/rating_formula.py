"""What two ratings alone say: the rating formula's expected score."""

from __future__ import annotations

from typing import Any

import numpy as np

from .base import Fitted, Prepared


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """The rating formula's expected score of a player against something rated, from the two columns the run names.

    Nothing is fitted: this is what two ratings alone say. The two may sit on different scales (a game rating and
    a puzzle rating do). The formula's log-odds are the rating gap times a constant, so the slope and the
    intercept a run fits on valid rows before a chance is scored are exactly the stretch and the shift between
    them. A task whose label is a score from 0 to 1 (a game's result) is given the expected score as it is.
    """
    labels = prepared.y[prepared.train]
    if prepared.task.kind != "binary" and not (len(labels) and labels.min() >= 0.0 and labels.max() <= 1.0):
        raise ValueError(
            "the rating formula gives an expected score, so its task needs a yes-or-no label or a score from 0 to 1"
        )
    learner = config["learner"]
    rows = prepared.dataset.rows
    gap = (
        rows[learner["player"]].to_numpy().astype(np.float64)
        - rows[learner["against"]].to_numpy().astype(np.float64)
    )
    expected = 1.0 / (1.0 + 10.0 ** (-gap / 400.0))
    return Fitted(
        valid=expected[prepared.valid],
        test=expected[prepared.test],
        details={"player": learner["player"], "against": learner["against"], "scale": 400},
    )
