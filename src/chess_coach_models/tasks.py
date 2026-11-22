"""What a model is asked: the label it predicts, what it may read, how it is scored.

A model's task is ``models/<model>/task.yaml``, beside its card, its runs and
its results, so a model is one folder and adding one touches no code:

    dataset: puzzles              the recipe in datasets/ whose rows it reads
    kind: regression              a quantity (regression), a chance (binary), a chance for each of a
                                  fixed list of candidates: the squares of the board (squares), tags
                                  (tags), or a chance for each legal move of the position (moves)
    label: rating                 the column it predicts
    unit: Lichess puzzle rating points
    primary: rmse                 the metric its runs are ranked by
    reference: gbm-hand           the run every other run is compared with
    context: [solver_moves]       the numbers every learner reads beside the board
    band: band                    the column its results are also given by
    scale: log1p                  how its label reads: as it is (linear), or as log(1 + x)
    marks: [en_passant, setup_to] the only marks on squares its learners may read
    hand: [material, mobility]    the only groups of hand features its learners may read
    steps: [ply, log_clock]       for a dataset whose rows are sequences, the only numbers of each
                                  position its networks may read
    purpose: body                 what the lab has the model for, when that is not its answer: a
                                  body the other models start from

A task that names no ``marks``, no ``hand`` or no ``steps`` lets its learners
read all the dataset has. One that names them asks its question with
something hidden: a puzzle's difficulty with its solution never shown, say.

A model is in the lab for its answer, which says something about people. One
whose task says ``purpose: body`` is there to be started from
(``learner.init``): its answer is something an engine computes. It is trained,
scored and ranked like any model, and the lab's paper lists it apart from the
models it sets side by side.

A task whose answer is a set says where the set is:

    kind: squares
    label: [solver1_from, solver1_to]   the marks on squares whose squares are right
    marks: [en_passant, setup_to]       what a learner may read, which can be none of those

    kind: tags
    label: themes                       a column of words separated by spaces
    tags: [fork, pin]                   the words it predicts, each a candidate

A task that predicts the move played names the column that holds it:

    kind: moves
    label: move                         the move played, as UCI

Its dataset's rows are positions (``fen``), a row's candidates are the moves
its position allows (``encode/moves.py``), and its runs are ranked by how
often the move played is the one given the highest chance (``top1``).

How a model's paper looks at its results is beside it, in ``analysis.yaml``
(``evals/analysis.py``): changing that changes no run.
"""

from __future__ import annotations

from dataclasses import dataclass

import yaml

from . import paths
from .encode.hand import GROUPS
from .evals.metrics import LOWER_IS_BETTER, METRICS


REQUIRED = ("dataset", "kind", "label", "unit", "primary", "reference", "context")
OPTIONAL = ("band", "scale", "marks", "hand", "tags", "steps", "purpose")
SCALES = ("linear", "log1p")
PURPOSES = ("answer", "body")
SQUARES = tuple(f"{file}{rank}" for rank in "12345678" for file in "abcdefgh")


@dataclass(frozen=True)
class Task:
    """One question put to a dataset.

    ``name`` is the model's folder under ``models/``. ``context`` names the
    numbers every learner reads beside the board; the tree baseline also reads
    the dataset's hand features. ``reference`` is the run every other run is
    compared against, pair by pair on the same test rows. ``scale`` says how a
    quantity's label reads: with ``log1p`` a label of 2.4 is 10 of something
    and an error of 0.69 is a factor of two, which a paper needs to know to
    say either in plain units. ``marks`` and ``hand`` are the marks on squares
    and the groups of hand features (``encode/hand.py``) a learner may read,
    or ``None`` for all the dataset has. ``label`` is a column, or for a task
    that predicts squares the marks whose squares are right, and for one that
    predicts moves the column of the move played; ``tags`` are the
    words a task that predicts tags gives a chance each. ``steps`` are the
    numbers of each position a network may read where a row is a sequence of
    positions, or ``None`` for all of them. ``purpose`` is what the lab has
    the model for: its ``answer``, or its ``body`` for other models to start
    from.
    """

    name: str
    dataset: str
    kind: str
    label: str | tuple[str, ...]
    unit: str
    context: tuple[str, ...]
    primary: str
    reference: str
    band: str = "band"
    scale: str = "linear"
    marks: tuple[str, ...] | None = None
    hand: tuple[str, ...] | None = None
    tags: tuple[str, ...] | None = None
    steps: tuple[str, ...] | None = None
    purpose: str = "answer"

    @property
    def lower_is_better(self) -> bool:
        return self.primary in LOWER_IS_BETTER

    @property
    def candidates(self) -> tuple[str, ...]:
        """What a task whose answer is a set gives a chance each: the squares of the mover's board from its
        near left corner, or its tags. A task with one number a row has none, and nor has one that predicts
        moves: there a row's candidates are its own position's legal moves."""
        return SQUARES if self.kind == "squares" else self.tags or ()

    def better(self, a: float, b: float) -> bool:
        """Whether score ``a`` beats score ``b`` on the primary metric."""
        return a < b if self.lower_is_better else a > b


def names() -> list[str]:
    """Every model that has a task: the folders under ``models/`` with a ``task.yaml``."""
    return sorted(path.parent.name for path in paths.models().glob("*/task.yaml"))


def get(name: str) -> Task:
    path = paths.model(name) / "task.yaml"
    if not path.exists():
        raise KeyError(f"no task named {name!r}: the lab has {', '.join(names())}")
    with path.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    missing = [key for key in REQUIRED if key not in loaded]
    unknown = [key for key in loaded if key not in REQUIRED + OPTIONAL]
    if missing or unknown:
        raise ValueError(
            f"{path}: " + "; ".join(
                part for part in (
                    f"it lacks {', '.join(missing)}" if missing else "",
                    f"it has {', '.join(unknown)}, which a task does not know" if unknown else "",
                ) if part
            )
        )
    if loaded["kind"] not in METRICS:
        raise ValueError(f"{path}: a task's kind is one of {', '.join(METRICS)}, not {loaded['kind']!r}")
    if loaded["primary"] not in METRICS[loaded["kind"]]:
        raise ValueError(
            f"{path}: a {loaded['kind']} task is ranked by one of {', '.join(METRICS[loaded['kind']])}, "
            f"not {loaded['primary']!r}"
        )
    if loaded.get("scale", "linear") not in SCALES:
        raise ValueError(f"{path}: a label's scale is one of {', '.join(SCALES)}, not {loaded['scale']!r}")
    if loaded.get("scale", "linear") != "linear" and loaded["kind"] != "regression":
        raise ValueError(f"{path}: only a quantity has a scale, and this task predicts a chance")
    if loaded.get("purpose", "answer") not in PURPOSES:
        raise ValueError(f"{path}: a model is in the lab for its {' or its '.join(PURPOSES)}, not {loaded['purpose']!r}")
    strangers = [group for group in loaded.get("hand") or [] if group not in GROUPS]
    if strangers:
        raise ValueError(
            f"{path}: the hand features come in the groups {', '.join(GROUPS)}, not {', '.join(strangers)}"
        )
    label, tags = loaded["label"], loaded.get("tags")
    if loaded["kind"] == "squares":
        if not isinstance(label, list) or not label:
            raise ValueError(f"{path}: a task that predicts squares names, as its label, the marks whose squares are right")
        shown = [name for name in label if name in (loaded.get("marks") or [])]
        if loaded.get("marks") is None or shown:
            raise ValueError(
                f"{path}: a task that predicts squares names the marks its learners may read, and none of them "
                f"is a mark it predicts" + (f" ({', '.join(shown)} is both)" if shown else "")
            )
        label = tuple(label)
    elif not isinstance(label, str):
        raise ValueError(f"{path}: a {loaded['kind']} task's label is one column")
    if (loaded["kind"] == "tags") != (tags is not None):
        raise ValueError(f"{path}: a task names its tags when, and only when, it predicts tags")
    if tags is not None and (not isinstance(tags, list) or len(tags) < 2 or len(set(tags)) != len(tags)):
        raise ValueError(f"{path}: a task that predicts tags names at least two, each once")
    return Task(
        name=name,
        dataset=loaded["dataset"],
        kind=loaded["kind"],
        label=label,
        unit=loaded["unit"],
        context=tuple(loaded["context"]),
        primary=loaded["primary"],
        reference=loaded["reference"],
        band=loaded.get("band", "band"),
        scale=loaded.get("scale", "linear"),
        marks=None if loaded.get("marks") is None else tuple(loaded["marks"]),
        hand=None if loaded.get("hand") is None else tuple(loaded["hand"]),
        tags=None if tags is None else tuple(tags),
        steps=None if loaded.get("steps") is None else tuple(loaded["steps"]),
        purpose=loaded.get("purpose", "answer"),
    )
