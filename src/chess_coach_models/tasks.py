"""What a model is asked: the label it predicts, what it may read, how it is scored.

A model's task is ``models/<model>/task.yaml``, beside its card, its runs and
its results, so a model is one folder and adding one touches no code:

    dataset: puzzles              the recipe in datasets/ whose rows it reads
    kind: regression              a quantity (regression) or a chance (binary)
    label: rating                 the column it predicts
    unit: Lichess puzzle rating points
    primary: rmse                 the metric its runs are ranked by
    reference: gbm-hand           the run every other run is compared with
    context: [solver_moves]       the numbers every learner reads beside the board
    band: band                    the column its results are also given by

How a model's paper looks at its results is beside it, in ``analysis.yaml``
(``evals/analysis.py``): changing that changes no run.
"""

from __future__ import annotations

from dataclasses import dataclass

import yaml

from . import paths
from .evals.metrics import LOWER_IS_BETTER, METRICS


REQUIRED = ("dataset", "kind", "label", "unit", "primary", "reference", "context")
OPTIONAL = ("band",)


@dataclass(frozen=True)
class Task:
    """One question put to a dataset.

    ``name`` is the model's folder under ``models/``. ``context`` names the
    numbers every learner reads beside the board; the tree baseline also reads
    the dataset's hand features. ``reference`` is the run every other run is
    compared against, pair by pair on the same test rows.
    """

    name: str
    dataset: str
    kind: str
    label: str
    unit: str
    context: tuple[str, ...]
    primary: str
    reference: str
    band: str = "band"

    @property
    def lower_is_better(self) -> bool:
        return self.primary in LOWER_IS_BETTER

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
    return Task(
        name=name,
        dataset=loaded["dataset"],
        kind=loaded["kind"],
        label=loaded["label"],
        unit=loaded["unit"],
        context=tuple(loaded["context"]),
        primary=loaded["primary"],
        reference=loaded["reference"],
        band=loaded.get("band", "band"),
    )
