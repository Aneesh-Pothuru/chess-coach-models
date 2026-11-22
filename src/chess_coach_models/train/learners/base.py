"""What every learner is given and gives back."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from ...data.splits import unit_hash
from ...data.store import Dataset
from ...encode.hand import GROUPS, group_of
from ...tasks import Task


@dataclass
class Prepared:
    """A task's arrays over one dataset: labels, context numbers, hand features and the three splits.

    ``hand_names`` and ``mark_names`` are what the task lets a learner read of the dataset's hand features and
    marks on squares, and ``mark_channels`` where each of those marks sits among the dataset's own.
    """

    task: Task
    dataset: Dataset
    y: np.ndarray
    context: np.ndarray
    hand: np.ndarray
    hand_names: list[str]
    mark_names: list[str]
    mark_channels: list[int]
    train: np.ndarray
    valid: np.ndarray
    test: np.ndarray


@dataclass
class Fitted:
    valid: np.ndarray
    test: np.ndarray
    details: dict[str, Any] = field(default_factory=dict)
    save: Callable[[Path], None] = lambda directory: None


def share_of(groups: np.ndarray, share: float) -> np.ndarray:
    """Which rows a share of the training games keeps, given each row's game.

    A game is kept by a hash of its name, so the same games are kept on every machine, every row of a game
    stays or goes together, and a smaller share is always inside a larger one.
    """
    names, row_game = np.unique(groups, return_inverse=True)
    kept = np.fromiter((unit_hash(str(name), "train-share") < share for name in names), dtype=bool, count=len(names))
    return kept[row_game]


def prepare(task: Task, dataset: Dataset, *, train_share: float = 1.0) -> Prepared:
    """A task's arrays over a dataset. ``train_share`` trains on that share of the training games only;
    the valid and test rows are never touched by it."""
    rows, manifest = dataset.rows, dataset.manifest
    hand_names = [name for name in manifest["hand"] if task.hand is None or group_of(name) in task.hand]
    mark_names = list(manifest["marks"]) if task.marks is None else list(task.marks)
    strangers = [name for name in mark_names if name not in manifest["marks"]]
    if strangers:
        raise ValueError(
            f"{dataset.name} marks {', '.join(manifest['marks'])} on its squares, "
            f"and {task.name} asks for {', '.join(strangers)}"
        )
    train = dataset.split("train")
    if train_share != 1.0:
        if not 0.0 < train_share < 1.0:
            raise ValueError(f"a run trains on a share of the games above 0 and up to 1, not {train_share}")
        train = train[share_of(rows[manifest["group"]].to_numpy()[train], train_share)]
    return Prepared(
        task=task,
        dataset=dataset,
        y=rows[task.label].to_numpy().astype(np.float64),
        context=rows.select(list(task.context)).to_numpy().astype(np.float32),
        hand=rows.select(hand_names).to_numpy().astype(np.float32),
        hand_names=hand_names,
        mark_names=mark_names,
        mark_channels=[manifest["marks"].index(name) for name in mark_names],
        train=train,
        valid=dataset.split("valid"),
        test=dataset.split("test"),
    )


def features(prepared: Prepared, which: str, without: Sequence[str] = ()) -> tuple[np.ndarray, list[str]]:
    """The numbers a learner reads beside the board: the task's ``context``, or with ``hand`` the hand features too.

    ``without`` names groups of hand features (``encode/hand.py``) a run leaves out. A number the task gives
    every learner as context stays, whatever group it is in.
    """
    names = list(prepared.task.context)
    if which == "context":
        if without:
            raise ValueError("only a run that reads the hand features can leave a group of them out")
        return prepared.context, names
    if which != "hand":
        raise ValueError("a learner reads `context` or `hand` features")
    strangers = [group for group in without if group not in GROUPS]
    if strangers:
        raise ValueError(f"the hand features come in the groups {', '.join(GROUPS)}, not {', '.join(strangers)}")
    extra = [name for name in prepared.hand_names if name not in names]
    for group in without:
        if not any(group_of(name) == group for name in extra):
            raise ValueError(f"{prepared.dataset.name} gives {prepared.task.name} no hand feature of the group {group} to leave out")
    if without:
        extra = [name for name in extra if group_of(name) not in without]
    columns = [prepared.hand_names.index(name) for name in extra]
    return np.concatenate([prepared.context, prepared.hand[:, columns]], axis=1), names + extra
