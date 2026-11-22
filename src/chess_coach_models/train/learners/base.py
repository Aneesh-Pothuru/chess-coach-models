"""What every learner is given and gives back."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from ...data.store import Dataset
from ...tasks import Task


@dataclass
class Prepared:
    """A task's arrays over one dataset: labels, context numbers, hand features and the three splits."""

    task: Task
    dataset: Dataset
    y: np.ndarray
    context: np.ndarray
    hand: np.ndarray
    train: np.ndarray
    valid: np.ndarray
    test: np.ndarray


@dataclass
class Fitted:
    valid: np.ndarray
    test: np.ndarray
    details: dict[str, Any] = field(default_factory=dict)
    save: Callable[[Path], None] = lambda directory: None


def prepare(task: Task, dataset: Dataset) -> Prepared:
    rows = dataset.rows
    return Prepared(
        task=task,
        dataset=dataset,
        y=rows[task.label].to_numpy().astype(np.float64),
        context=rows.select(list(task.context)).to_numpy().astype(np.float32),
        hand=rows.select(list(dataset.manifest["hand"])).to_numpy().astype(np.float32),
        train=dataset.split("train"),
        valid=dataset.split("valid"),
        test=dataset.split("test"),
    )


def features(prepared: Prepared, which: str) -> tuple[np.ndarray, list[str]]:
    """The numbers a learner reads beside the board: the task's ``context``, or with ``hand`` the dataset's hand features too."""
    names = list(prepared.task.context)
    if which == "context":
        return prepared.context, names
    if which != "hand":
        raise ValueError("a learner reads `context` or `hand` features")
    hand = prepared.dataset.manifest["hand"]
    extra = [name for name in hand if name not in names]
    columns = [hand.index(name) for name in extra]
    return np.concatenate([prepared.context, prepared.hand[:, columns]], axis=1), names + extra
