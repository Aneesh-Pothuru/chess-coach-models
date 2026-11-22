"""The lab's tasks, by name. Adding a model starts with a Task here."""

from __future__ import annotations

from ..encode.board import CASTLING
from .base import Task


PUZZLE_DIFFICULTY = Task(
    name="puzzle-difficulty",
    dataset="puzzles",
    kind="regression",
    label="rating",
    unit="Lichess puzzle rating points",
    context=("solver_moves", *CASTLING),
    primary="rmse",
    lower_is_better=True,
    reference="gbm-hand",
)

_CLOCKS = ("mover_elo", "opponent_elo", "log_clock", "log_opponent_clock", "log_base", "increment", "ply")

BLUNDER_HAZARD = Task(
    name="blunder-hazard",
    dataset="game-positions",
    kind="binary",
    label="blunder",
    unit="chance the mover loses more than 20 points of win probability",
    context=(*_CLOCKS, "win_before", *CASTLING),
    primary="pr_auc",
    lower_is_better=False,
    reference="gbm-hand",
)

THINK_TIME = Task(
    name="think-time",
    dataset="game-positions",
    kind="regression",
    label="log_spent",
    unit="log(1 + seconds spent on the move)",
    context=(*_CLOCKS, *CASTLING),
    primary="mae",
    lower_is_better=True,
    reference="gbm-hand",
)

TACTIC_FOUND = Task(
    name="tactic-found",
    dataset="tactics",
    kind="binary",
    label="found",
    unit="chance the move played is the first move of the tactic",
    context=(*_CLOCKS, "win_prior", "win_before", "solver_moves", *CASTLING),
    primary="log_loss",
    lower_is_better=True,
    reference="gbm-hand",
)

TASKS = {task.name: task for task in (PUZZLE_DIFFICULTY, BLUNDER_HAZARD, THINK_TIME, TACTIC_FOUND)}


def get(name: str) -> Task:
    if name not in TASKS:
        raise KeyError(f"no task named {name!r}: the lab has {', '.join(sorted(TASKS))}")
    return TASKS[name]
