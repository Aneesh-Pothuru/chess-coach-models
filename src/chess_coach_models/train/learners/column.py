"""What one column of the dataset already says, read as the prediction."""

from __future__ import annotations

from typing import Any

import numpy as np

from .base import Fitted, Prepared


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """A column of the dataset, times a constant, as the prediction for every row.

    Nothing is fitted: this is what a number the dataset already carries says on its own, such as an engine's
    evaluation read as a chance of winning. The run names the column, and the constant that puts it in the
    label's unit (``scale``, 1 unless the run says otherwise).
    """
    learner = config["learner"]
    scale = float(learner.get("scale", 1.0))
    said = prepared.dataset.rows[learner["column"]].to_numpy().astype(np.float64) * scale
    return Fitted(
        valid=said[prepared.valid],
        test=said[prepared.test],
        details={"column": learner["column"], "scale": scale},
    )
