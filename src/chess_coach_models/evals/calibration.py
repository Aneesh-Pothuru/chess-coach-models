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


def _log_chances(p: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Each row's candidates and the log of their chances, with zero where a row has no candidate."""
    held = ~np.isnan(p)
    return held, np.log(np.clip(np.where(held, p, 1.0), 1e-12, None))


def temper(p: np.ndarray, temperature: float) -> np.ndarray:
    """A row's chances over its own candidates, each raised to one over the temperature and the row scaled
    to add up to one again. Above one flattens a row's chances and below one sharpens them, and neither
    moves a candidate past another. A place with no candidate stays without a number."""
    held, logs = _log_chances(p)
    z = np.where(held, logs / temperature, -np.inf)
    z = z - z.max(axis=1, keepdims=True)
    raised = np.exp(z)
    return np.where(held, raised / raised.sum(axis=1, keepdims=True), np.nan)


def temperature(p: np.ndarray, played: np.ndarray) -> float:
    """The temperature at which the chances given to the candidates that were played are highest together:
    the one number that fits a run's confidence to what happened, as the line through the log-odds does
    for a single chance.

    Newton's method on the mean of minus the log of the played candidate's chance, as a function of one
    over the temperature, where it has one lowest point. A step is halved until the loss does not rise,
    and the answer is kept between a twentieth and twenty.
    """
    held, logs = _log_chances(p)
    own = logs[np.arange(len(logs)), np.asarray(played).astype(np.int64)]

    def parts(sharpness: float) -> tuple[float, float, float]:
        z = np.where(held, sharpness * logs, -np.inf)
        top = z.max(axis=1, keepdims=True)
        raised = np.exp(z - top)
        total = raised.sum(axis=1, keepdims=True)
        chances = raised / total
        mean = (chances * logs).sum(axis=1)
        spread = (chances * logs * logs).sum(axis=1) - mean * mean
        loss = float(np.mean(top[:, 0] + np.log(total[:, 0]) - sharpness * own))
        return loss, float(np.mean(mean - own)), float(np.mean(spread))

    low, high = 1.0 / 20.0, 20.0
    sharpness = 1.0
    current, slope, curve = parts(sharpness)
    for _ in range(100):
        if curve <= 1e-12:
            break
        step = slope / curve
        scale = 1.0
        while scale > 1e-8:
            tried = min(high, max(low, sharpness - scale * step))
            loss, new_slope, new_curve = parts(tried)
            if loss <= current:
                break
            scale /= 2
        if scale <= 1e-8 or abs(tried - sharpness) < 1e-9:
            break
        sharpness, current, slope, curve = tried, loss, new_slope, new_curve
    return 1.0 / sharpness
