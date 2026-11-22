"""A stated chance made to mean what it says.

A model can rank well and still say 40% where three in ten happen. One line
through its log-odds, fitted on the valid rows, fixes what one line can, so a
run is scored on how well it tells cases apart and on what is left of its
miscalibration, not on a scale it never had the chance to learn. For the
rating formula the same two numbers are the stretch and the shift between two
rating scales.
"""

from __future__ import annotations

import numpy as np


def platt(p: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    """The slope and intercept that best map a model's log-odds onto what happened.

    Newton's method on the log loss, with a step halved until the loss does not rise: from predictions that are
    far from calibrated a full step can overshoot and never come back.
    """
    clipped = np.clip(p, 1e-6, 1 - 1e-6)
    x = np.log(clipped / (1 - clipped))

    def loss(slope: float, intercept: float) -> float:
        z = slope * x + intercept
        return float(np.mean(np.logaddexp(0.0, z) - y * z))

    slope, intercept = 1.0, 0.0
    current = loss(slope, intercept)
    for _ in range(100):
        q = 1.0 / (1.0 + np.exp(-(slope * x + intercept)))
        weight = q * (1 - q)
        gradient = np.array([np.sum((q - y) * x), np.sum(q - y)])
        hessian = np.array(
            [[np.sum(weight * x * x), np.sum(weight * x)], [np.sum(weight * x), np.sum(weight)]]
        ) + 1e-9 * np.eye(2)
        step = np.linalg.solve(hessian, gradient)
        scale = 1.0
        while scale > 1e-8 and loss(slope - scale * step[0], intercept - scale * step[1]) > current:
            scale /= 2
        if scale <= 1e-8:
            break
        slope, intercept = slope - scale * step[0], intercept - scale * step[1]
        current = loss(slope, intercept)
        if np.max(np.abs(scale * step)) < 1e-9:
            break
    return float(slope), float(intercept)


def apply_platt(p: np.ndarray, slope: float, intercept: float) -> np.ndarray:
    clipped = np.clip(p, 1e-6, 1 - 1e-6)
    return 1.0 / (1.0 + np.exp(-(slope * np.log(clipped / (1 - clipped)) + intercept)))
