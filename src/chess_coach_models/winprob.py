"""An engine's evaluation as a chance of winning, the way Lichess and the app turn one into the other.

The blunder label and every evaluation a model reads go through this curve.
``bridge/winprob-parity`` holds it to the app's own, so a label learned here
means the same thing there.
"""

from __future__ import annotations

import math

import chess


def eval_to_cp(value: str | int | float, mate_cp: int = 10_000) -> float:
    """A Lichess evaluation from White's side as centipawns: ``0.35`` is in pawns, ``#-3`` is a mate."""
    if isinstance(value, (int, float)):
        return float(value)
    token = value.strip()
    if token.startswith("#"):
        return float(-mate_cp if token[1:].startswith("-") else mate_cp)
    return float(token) * 100.0


def win_percent(cp: float, clamp_cp: float = 1_000.0) -> float:
    """Lichess's published curve from centipawns to White's chance of winning, in percent."""
    bounded = max(-clamp_cp, min(clamp_cp, float(cp)))
    return 50.0 + 50.0 * (2.0 / (1.0 + math.exp(-0.00368208 * bounded)) - 1.0)


def mover_win_percent(cp_white: float, mover: chess.Color) -> float:
    white = win_percent(cp_white)
    return white if mover == chess.WHITE else 100.0 - white
