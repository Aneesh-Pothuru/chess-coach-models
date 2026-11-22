"""The learners a run can name: a constant, a column of the dataset, the rating formula, gradient-boosted trees, a network.

Each takes the prepared arrays of a task and returns its predictions on the
valid and test rows in the label's own unit (a rating, a log of seconds, a
chance), with what it took to get them. A learner's module is imported when a
run names it, so the floor, a column and the formula need neither LightGBM nor Torch.
"""

from __future__ import annotations

from importlib import import_module
from pathlib import Path
from typing import Any

from .base import Fitted, Prepared, features, prepare


# A run's ``learner.kind`` and the module here whose ``fit`` trains it.
LEARNERS = {
    "constant": "constant",
    "column": "column",
    "rating-formula": "rating_formula",
    "gbm": "gbm",
    "net": "net",
}


def fit(
    prepared: Prepared, config: dict[str, Any], *, log, device: str | None = None, start: Path | None = None
) -> Fitted:
    """Trains the learner a run's config names. ``start`` is the saved network a run begins from
    (``learner.init`` in its config), which only a network can."""
    kind = config["learner"]["kind"]
    if kind not in LEARNERS:
        raise ValueError(f"no learner named {kind!r}: the lab has {', '.join(sorted(LEARNERS))}")
    learner = import_module(f".{LEARNERS[kind]}", __name__)
    if start is None:
        return learner.fit(prepared, config, log=log, device=device)
    if kind != "net":
        raise ValueError("only a network starts from another run's weights")
    return learner.fit(prepared, config, log=log, device=device, start=start)


__all__ = ["LEARNERS", "Fitted", "Prepared", "features", "fit", "prepare"]
