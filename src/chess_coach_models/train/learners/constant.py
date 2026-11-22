"""The floor: one number for every row."""

from __future__ import annotations

from typing import Any

import numpy as np

from .base import Fitted, Prepared


def fit(prepared: Prepared, config: dict[str, Any], *, log, device=None) -> Fitted:
    """One number for every row: the training rows' mean label, or their median when the task is scored by absolute error. What a model must beat to have learned anything."""
    labels = prepared.y[prepared.train]
    value = float(np.median(labels) if prepared.task.primary == "mae" else labels.mean())
    return Fitted(
        valid=np.full(len(prepared.valid), value),
        test=np.full(len(prepared.test), value),
        details={"constant": value},
    )
