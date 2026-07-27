from __future__ import annotations

import math
import re

import chess


EVAL_RE = re.compile(r"(?:\[%eval\s+)([^\]\s]+)")
CLOCK_RE = re.compile(r"(?:\[%clk\s+)([^\]\s]+)")


def eval_to_cp(value: str | int | float, mate_cp: int = 10_000) -> float:
    """Parse a White-perspective Lichess eval into centipawns."""
    if isinstance(value, (int, float)):
        return float(value)
    token = value.strip()
    if token.startswith("#"):
        mate = token[1:]
        sign = -1 if mate.startswith("-") else 1
        return float(sign * mate_cp)
    # Lichess PGN evals are in pawns, not centipawns.
    return float(token) * 100.0


def parse_eval_comment(comment: str, mate_cp: int = 10_000) -> float | None:
    match = EVAL_RE.search(comment or "")
    return eval_to_cp(match.group(1), mate_cp=mate_cp) if match else None


def parse_clock_comment(comment: str) -> float | None:
    match = CLOCK_RE.search(comment or "")
    if not match:
        return None
    parts = match.group(1).split(":")
    try:
        if len(parts) == 3:
            hours, minutes, seconds = map(float, parts)
            return hours * 3600 + minutes * 60 + seconds
        if len(parts) == 2:
            minutes, seconds = map(float, parts)
            return minutes * 60 + seconds
    except ValueError:
        return None
    return None


def win_percent(cp: float, clamp_cp: float = 1_000.0) -> float:
    """Lichess's published centipawn-to-White-win-percent conversion."""
    bounded = max(-clamp_cp, min(clamp_cp, float(cp)))
    return 50.0 + 50.0 * (
        2.0 / (1.0 + math.exp(-0.00368208 * bounded)) - 1.0
    )


def mover_win_percent(cp_white: float, mover: chess.Color) -> float:
    white_probability = win_percent(cp_white)
    return white_probability if mover == chess.WHITE else 100.0 - white_probability


def mover_loss_win_percent(
    cp_white_before: float, cp_white_after: float, mover: chess.Color
) -> float:
    """Positive values mean the move reduced the mover's win probability."""
    return mover_win_percent(cp_white_before, mover) - mover_win_percent(
        cp_white_after, mover
    )

