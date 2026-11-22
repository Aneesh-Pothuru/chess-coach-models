"""Positions from rated Lichess games, with what the players did there.

A game is read from its movetext alone: each move's SAN, the engine evaluation
Lichess attached after it and the mover's clock. A position row then says what
a model may read (the board, the last move, both ratings, both clocks, the
evaluation before the move) and what it may be asked to predict (the seconds
spent, the loss of win probability, the result).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import chess

from ..winprob import eval_to_cp, mover_win_percent
from .splits import unit_hash


MOVE_RE = re.compile(r"(?:\d+\.+\s*)?([A-Za-z][^\s{}]*)(?:\s*\{([^}]*)\})?")
EVAL_RE = re.compile(r"\[%eval\s+([^\]\s]+)")
CLOCK_RE = re.compile(r"\[%clk\s+(\d+):(\d+):(\d+(?:\.\d+)?)")
RESULTS = {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}
BLUNDER_LOSS = 20.0


@dataclass(frozen=True)
class Ply:
    san: str
    eval_cp_white: float | None
    clock: float | None


def _seconds(clock: re.Match[str]) -> float:
    """A ``[%clk h:mm:ss]`` match as seconds."""
    return int(clock.group(1)) * 3600 + int(clock.group(2)) * 60 + float(clock.group(3))


def parse_movetext(movetext: str) -> list[Ply]:
    plies = []
    for match in MOVE_RE.finditer(movetext):
        comment = match.group(2) or ""
        found_eval = EVAL_RE.search(comment)
        found_clock = CLOCK_RE.search(comment)
        plies.append(
            Ply(
                san=match.group(1).rstrip("?!"),
                eval_cp_white=eval_to_cp(found_eval.group(1)) if found_eval else None,
                clock=_seconds(found_clock) if found_clock else None,
            )
        )
    return plies


EXPORT_RE = re.compile(r"\{([^}]*)\}|([()])|([A-Za-z][^\s{}()]*)")


def parse_export(movetext: str) -> list[Ply]:
    """The plies of a game as Lichess's game export writes it.

    The export says more than a month of the database does: a judgment in a
    comment of its own before the one with the evaluation and the clock, the
    opening's name in another, and the engine's better line in brackets after
    a mistake. Only the game's own moves count, and a move takes its
    evaluation and its clock from whichever of its comments carries them.
    """
    sans: list[str] = []
    evals: list[float | None] = []
    clocks: list[float | None] = []
    depth = 0
    for match in EXPORT_RE.finditer(movetext):
        comment, bracket, word = match.groups()
        if bracket:
            depth += 1 if bracket == "(" else -1
        elif depth:
            continue
        elif word:
            sans.append(word.rstrip("?!"))
            evals.append(None)
            clocks.append(None)
        elif comment and sans:
            found_eval = EVAL_RE.search(comment)
            found_clock = CLOCK_RE.search(comment)
            if found_eval:
                evals[-1] = eval_to_cp(found_eval.group(1))
            if found_clock:
                clocks[-1] = _seconds(found_clock)
    return [Ply(san=san, eval_cp_white=value, clock=clock) for san, value, clock in zip(sans, evals, clocks)]


def time_control(value: str) -> tuple[int, int] | None:
    """``600+5`` as base seconds and increment."""
    base, plus, increment = value.partition("+")
    if not plus or not base.isdigit() or not increment.isdigit():
        return None
    return int(base), int(increment)


def speed(base: int, increment: int) -> str:
    """Lichess's speed class, from the time a 40-move game is given."""
    estimate = base + 40 * increment
    if estimate < 30:
        return "ultrabullet"
    if estimate < 180:
        return "bullet"
    if estimate < 480:
        return "blitz"
    if estimate < 1500:
        return "rapid"
    return "classical"


def game_id(headers: dict[str, str]) -> str:
    return headers.get("Site", "").rsplit("/", 1)[-1]


def wanted(headers: dict[str, str], movetext: str, *, speeds: tuple[str, ...]) -> bool:
    """Whether a game can give rows: rated, between two rated humans, analysed, at a wanted speed."""
    if not headers.get("Event", "").startswith("Rated") or "[%eval" not in movetext:
        return False
    if headers.get("Result") not in RESULTS or not game_id(headers):
        return False
    if "BOT" in (headers.get("WhiteTitle"), headers.get("BlackTitle")):
        return False
    if headers.get("Termination") not in ("Normal", "Time forfeit"):
        return False
    if not headers.get("WhiteElo", "").isdigit() or not headers.get("BlackElo", "").isdigit():
        return False
    control = time_control(headers.get("TimeControl", ""))
    return control is not None and speed(*control) in speeds


def game_rows(
    headers: dict[str, str],
    movetext: str,
    *,
    min_ply: int,
    per_game: int,
    salt: str,
) -> list[dict[str, Any]]:
    """Up to ``per_game`` positions of one game, chosen by a hash of the game and the ply.

    A ply is eligible from ``min_ply`` on when the evaluation before and after
    the move and all three clocks around it are known, so every row carries
    every label.
    """
    control = time_control(headers.get("TimeControl", ""))
    if control is None:
        return []
    base, increment = control
    plies = parse_movetext(movetext)
    identity = game_id(headers)
    eligible = [
        index
        for index in range(max(2, min_ply - 1), len(plies))
        if plies[index].eval_cp_white is not None
        and plies[index - 1].eval_cp_white is not None
        and plies[index].clock is not None
        and plies[index - 1].clock is not None
        and plies[index - 2].clock is not None
    ]
    chosen = set(
        sorted(eligible, key=lambda index: unit_hash(f"{identity}:{index}", salt))[:per_game]
    )
    if not chosen:
        return []
    elos = {chess.WHITE: int(headers["WhiteElo"]), chess.BLACK: int(headers["BlackElo"])}
    white_score = RESULTS[headers["Result"]]
    board = chess.Board()
    last_move = ""
    rows = []
    for index, ply in enumerate(plies[: max(chosen) + 1]):
        try:
            move = board.parse_san(ply.san)
        except ValueError:
            return []
        if index in chosen:
            mover = board.turn
            before = plies[index - 1].eval_cp_white
            win_before = mover_win_percent(before, mover)
            win_after = mover_win_percent(ply.eval_cp_white, mover)
            clock = plies[index - 2].clock
            rows.append(
                {
                    "key": f"{identity}:{index + 1}",
                    "game_id": identity,
                    "ply": index + 1,
                    "fen": board.fen(),
                    "last_move": last_move,
                    "move": move.uci(),
                    "mover_elo": elos[mover],
                    "opponent_elo": elos[not mover],
                    "base": base,
                    "increment": increment,
                    "clock": clock,
                    "opponent_clock": plies[index - 1].clock,
                    "spent": max(0.0, clock - ply.clock + increment),
                    "win_before": win_before,
                    "win_after": win_after,
                    "loss": win_before - win_after,
                    "blunder": int(win_before - win_after > BLUNDER_LOSS),
                    "mover_score": white_score if mover == chess.WHITE else 1.0 - white_score,
                    "plies": len(plies),
                }
            )
        board.push(move)
        last_move = move.uci()
    return rows
