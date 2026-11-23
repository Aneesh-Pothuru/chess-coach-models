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
from ...encode.moves import moves_of, played
from ...tasks import Task


@dataclass
class Prepared:
    """A task's arrays over one dataset: labels, context numbers, hand features and the three splits.

    ``hand_names`` and ``mark_names`` are what the task lets a learner read of the dataset's hand features and
    marks on squares, and ``mark_channels`` where each of those marks sits among the dataset's own. ``y`` is
    one number a row, or for a task whose answer is a set one column a candidate, 1 where it is right.
    Where a row is a sequence of positions, ``step_names`` are the numbers of each position a network may
    read and ``step_columns`` where each sits among the dataset's own. For a task that predicts the move
    played, ``moves`` are every row's candidates (``encode/moves.py``: its legal moves as pairs of squares,
    one column a candidate, -1 where a row has fewer) and ``y`` is which of them was played.
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
    step_names: list[str] = field(default_factory=list)
    step_columns: list[int] = field(default_factory=list)
    moves: np.ndarray | None = None


@dataclass
class Fitted:
    """What a learner said of the valid and the test rows, in the label's own unit: one number a row, or for
    a task whose answer is a set one chance a candidate. For a task that predicts the move played, one
    chance for each of a row's candidates that add up to one, and no number (NaN) where it has none."""

    valid: np.ndarray
    test: np.ndarray
    details: dict[str, Any] = field(default_factory=dict)
    save: Callable[[Path], None] = lambda directory: None


def labels(task: Task, dataset: Dataset, moves: np.ndarray | None = None) -> np.ndarray:
    """What a task asks of every row of a dataset.

    A quantity or a chance is its column. The squares that are right are the squares that carry any of the
    marks the task names as its label. The tags that are right are those among the words of its column.
    The move played is which of the row's candidates (``moves``) its column names.
    """
    rows, manifest = dataset.rows, dataset.manifest
    if task.kind == "moves":
        return played(moves, rows["fen"].to_list(), rows[task.label].to_list(), rows["key"].to_list())
    if task.kind == "squares":
        strangers = [name for name in task.label if name not in manifest["marks"]]
        if strangers:
            raise ValueError(
                f"{dataset.name} marks {', '.join(manifest['marks'])} on its squares, "
                f"and {task.name} predicts {', '.join(strangers)}"
            )
        bits = sum(1 << manifest["marks"].index(name) for name in task.label)
        return ((dataset.marks & np.uint16(bits)) != 0).astype(np.uint8)
    if task.kind == "tags":
        words = rows[task.label].fill_null("").str.split(" ")
        return np.stack([words.list.contains(tag).to_numpy() for tag in task.tags], axis=1).astype(np.uint8)
    return rows[task.label].to_numpy().astype(np.float64)


def share_of(groups: np.ndarray, share: float) -> np.ndarray:
    """Which rows a share of the training games keeps, given each row's game.

    A game is kept by a hash of its name, so the same games are kept on every machine, every row of a game
    stays or goes together, and a smaller share is always inside a larger one.
    """
    names, row_game = np.unique(groups, return_inverse=True)
    kept = np.fromiter((unit_hash(str(name), "train-share") < share for name in names), dtype=bool, count=len(names))
    return kept[row_game]


def rows_held(dataset: Dataset, scored: Dataset, split: str) -> np.ndarray:
    """Where a larger build of a dataset holds one split of the build a task is scored on: the larger build's
    row for each of that split's rows, in that split's order.

    A larger build is there to give a run more training rows and nothing else, so every row a run is scored
    on must be in it as it is in the task's own build: the same board, the same marks, the same game and
    the same split. Anything else is refused: a run would be scored on other rows than the runs beside it.
    """
    own = scored.split(split)
    places = (
        scored.rows.select("key")[own]
        .join(dataset.rows.select("key").with_row_index("row"), on="key", how="left", maintain_order="left")["row"]
    )
    if len(places) != len(own) or places.null_count():
        raise ValueError(
            f"{dataset.name} is not a larger build of {scored.name}: it lacks "
            f"{places.null_count() or abs(len(places) - len(own)):,} of its {len(own):,} {split} rows"
        )
    held = places.to_numpy().astype(np.int64)
    group = scored.manifest["group"]
    same = (
        np.array_equal(dataset.tokens[held], scored.tokens[own])
        and np.array_equal(dataset.marks[held], scored.marks[own])
        and bool((dataset.rows[group][held] == scored.rows[group][own]).all())
        and bool((dataset.rows["split"][held] == split).all())
    )
    if not same:
        raise ValueError(
            f"{dataset.name} is not a larger build of {scored.name}: its {split} rows do not hold the same "
            f"boards, marks and games in the same split"
        )
    return held


def prepare(task: Task, dataset: Dataset, *, train_share: float = 1.0, scored: Dataset | None = None) -> Prepared:
    """A task's arrays over a dataset. ``train_share`` trains on that share of the training games only;
    the valid and test rows are never touched by it.

    ``scored`` is the task's own build when ``dataset`` is a larger build of it (``data/__init__.py``): the
    run trains on the larger build's training rows and is scored on the own build's valid and test rows, as
    the larger build holds them, so its predictions line up row for row with every other run's. No game of
    those rows may be among the training games, and every training row of the own build must be among
    the larger build's.
    """
    rows, manifest = dataset.rows, dataset.manifest
    hand_names = [name for name in manifest["hand"] if task.hand is None or group_of(name) in task.hand]
    mark_names = list(manifest["marks"]) if task.marks is None else list(task.marks)
    strangers = [name for name in mark_names if name not in manifest["marks"]]
    if strangers:
        raise ValueError(
            f"{dataset.name} marks {', '.join(manifest['marks'])} on its squares, "
            f"and {task.name} asks for {', '.join(strangers)}"
        )
    known = list(manifest.get("steps", []))
    step_names = known if task.steps is None else list(task.steps)
    strangers = [name for name in step_names if name not in known]
    if strangers:
        raise ValueError(
            f"{dataset.name} gives each position of a row {', '.join(known) or 'no numbers: its rows are not sequences'}, "
            f"and {task.name} asks for {', '.join(strangers)}"
        )
    moves = None
    if task.kind == "moves":
        if dataset.steps is not None or "fen" not in rows.columns:
            raise ValueError(f"{task.name} predicts the move played, and {dataset.name} does not hold one position a row")
        moves = moves_of(dataset)
    train = dataset.split("train")
    valid, test = dataset.split("valid"), dataset.split("test")
    y = labels(task, dataset, moves)
    context = rows.select(list(task.context)).to_numpy().astype(np.float32)
    if scored is not None:
        if dataset.steps is not None or scored.steps is not None:
            raise ValueError(f"{task.name}: a larger build of a dataset whose rows are sequences is not read yet")
        valid, test = rows_held(dataset, scored, "valid"), rows_held(dataset, scored, "test")
        games = rows[manifest["group"]]
        if games[train].is_in(games[np.concatenate([valid, test])].unique().implode()).any():
            raise ValueError(f"{dataset.name} trains on a game that {scored.name} keeps for its valid or test rows")
        own_train = scored.rows.select("key")[scored.split("train")]
        lacking = len(own_train) - len(own_train.join(rows.select("key")[train], on="key", how="semi"))
        if lacking:
            raise ValueError(
                f"{dataset.name} is not a larger build of {scored.name}: it lacks {lacking:,} of its {len(own_train):,} training rows"
            )
        # What a run is scored against, and what it reads there, has to be what the own build says: the label,
        # the context numbers and the hand features. The move played is compared as it is written, since which
        # candidate it is follows from the board.
        mine = np.concatenate([scored.split("valid"), scored.split("test")])
        theirs = np.concatenate([valid, test])
        read = [*task.context, *(name for name in hand_names if name not in task.context)]
        if [name for name in read if name not in scored.rows.columns]:
            raise ValueError(f"{dataset.name} is not a larger build of {scored.name}: the two do not hold the same hand features")
        own_read = scored.rows.select(read)[mine].to_numpy().astype(np.float32)
        if task.kind == "moves":
            same_label = bool((rows[task.label][theirs] == scored.rows[task.label][mine]).all())
        else:
            wanted = np.asarray(labels(task, scored)[mine], dtype=np.float64)
            same_label = np.allclose(np.asarray(y[theirs], dtype=np.float64), wanted, equal_nan=True)
        if not (same_label and np.allclose(rows.select(read)[theirs].to_numpy().astype(np.float32), own_read, equal_nan=True)):
            raise ValueError(
                f"{dataset.name} and {scored.name} do not agree on the label, the context numbers or the hand "
                f"features of the rows a run is scored on"
            )
    if train_share != 1.0:
        if not 0.0 < train_share < 1.0:
            raise ValueError(f"a run trains on a share of the games above 0 and up to 1, not {train_share}")
        train = train[share_of(rows[manifest["group"]].to_numpy()[train], train_share)]
    return Prepared(
        task=task,
        dataset=dataset,
        y=y,
        context=context,
        hand=rows.select(hand_names).to_numpy().astype(np.float32),
        hand_names=hand_names,
        mark_names=mark_names,
        mark_channels=[manifest["marks"].index(name) for name in mark_names],
        train=train,
        valid=valid,
        test=test,
        step_names=step_names,
        step_columns=[known.index(name) for name in step_names],
        moves=moves,
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
