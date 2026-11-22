"""The floor: one number for every row."""

from __future__ import annotations

from typing import Any

import numpy as np

from ...evals.metrics import SETS
from .base import Fitted, Prepared


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """One number for every row: the training rows' mean label, or their median when the task is scored by
    absolute error. For a task whose answer is a set, the same chances for every row: each candidate's share
    of the training rows. What a model must beat to have learned anything."""
    labels = prepared.y[prepared.train]
    if prepared.task.kind in SETS:
        shares = labels.mean(axis=0)
        return Fitted(
            valid=np.tile(shares, (len(prepared.valid), 1)),
            test=np.tile(shares, (len(prepared.test), 1)),
            details={"shares": dict(zip(prepared.task.candidates, (round(float(share), 6) for share in shares)))},
        )
    value = float(np.median(labels) if prepared.task.primary == "mae" else labels.mean())
    return Fitted(
        valid=np.full(len(prepared.valid), value),
        test=np.full(len(prepared.test), value),
        details={"constant": value},
    )
