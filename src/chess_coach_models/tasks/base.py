"""What a model is asked: the label it predicts, what it may read, how it is scored."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Task:
    """One question put to a dataset.

    ``name`` is also the model's folder under ``models/``. ``context`` names
    the numbers every learner reads beside the board; the tree baseline also
    reads the dataset's hand features. ``reference`` is the run every other
    run is compared against, pair by pair on the same test rows.
    """

    name: str
    dataset: str
    kind: str
    label: str
    unit: str
    context: tuple[str, ...]
    primary: str
    lower_is_better: bool
    reference: str
    band: str = "band"

    def better(self, a: float, b: float) -> bool:
        """Whether score ``a`` beats score ``b`` on the primary metric."""
        return a < b if self.lower_is_better else a > b
