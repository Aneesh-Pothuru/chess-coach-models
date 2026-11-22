"""What a model's paper is drawn from: its task, its run records, its analysis plan and its closer look.

Everything is a committed file, so a paper is drawn on any machine. The closer
look (``results/analysis.json``) is the one part that may not be there yet: it
is written where the dataset and the test predictions are, and a paper drawn
before it leaves its closer-look sections out.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from importlib import import_module
from typing import Any

from .. import data, paths, tasks
from ..evals import analysis, leaderboard
from ..evals.metrics import METRICS
from . import tex


# A metric as a table's head names it, and as a sentence or an axis does.
METRIC_NAMES = {**leaderboard.NAMES, "r2": "R\\textsuperscript{2}"}
METRIC_WORDS = {
    **METRIC_NAMES,
    "log_loss": "log loss",
    "calibration_error": "calibration error",
    "brier": "Brier score",
    "spearman": "rank correlation",
}


@dataclass
class Sources:
    model: str
    smoke: bool
    task: tasks.Task
    runs: list[dict[str, Any]]
    recipe: dict[str, Any]
    plan: dict[str, Any]
    look: dict[str, Any] | None
    marks: tuple[str, ...]
    hand: tuple[str, ...]

    @property
    def primary(self) -> str:
        return self.task.primary

    @property
    def metrics(self) -> list[str]:
        """The task's metrics, the one its runs are ranked by first."""
        return [self.primary, *(name for name in METRICS[self.task.kind] if name != self.primary)]

    @property
    def names(self) -> list[str]:
        return [run["run"] for run in self.runs]

    def run(self, name: str) -> dict[str, Any] | None:
        return next((run for run in self.runs if run["run"] == name), None)

    @property
    def best(self) -> dict[str, Any]:
        return self.runs[0]

    @property
    def reference(self) -> dict[str, Any] | None:
        return self.run(self.task.reference)

    @property
    def floor(self) -> dict[str, Any] | None:
        return next((run for run in self.runs if run["config"]["learner"]["kind"] == "constant"), None)

    @property
    def networks(self) -> list[dict[str, Any]]:
        return [run for run in self.runs if run["config"]["learner"]["kind"] == "net"]

    @property
    def board_only(self) -> dict[str, Any] | None:
        """The best network that reads the board and the context numbers and no hand feature."""
        return next((run for run in self.networks if run["config"]["learner"].get("features") != "hand"), None)

    @property
    def challenger(self) -> dict[str, Any] | None:
        """The best run that is not the reference: the one the closer look compares with it group by group."""
        return next((run for run in self.runs if run["run"] != self.task.reference), None)

    def twin(self, run: dict[str, Any]) -> dict[str, Any] | None:
        """The run with the same learner that does not read the hand features, for a run that does."""
        learner = run["config"]["learner"]
        if learner.get("features") != "hand" or learner["kind"] != "net":
            return None
        plain = {key: value for key, value in learner.items() if key != "features"}
        return next((other for other in self.runs if other["config"]["learner"] == plain), None)

    def better_by(self, value: float, than: float) -> float:
        """How much better ``value`` is than ``than`` on the primary metric: positive when it is better."""
        return than - value if self.task.lower_is_better else value - than

    def plain(self, value: float) -> float:
        """A label or a prediction in plain units: itself, or for a logarithm what it is the logarithm of."""
        return math.expm1(value) if self.task.scale == "log1p" else value

    def label_text(self, value: float | None) -> str:
        """A label's average as a paper prints it: a rate in percent, a quantity as a score, a logarithm in plain units."""
        if not tex.known(value):
            return "n/a"
        if self.task.kind == "binary":
            return tex.percent(value) + "\\%"
        if self.task.scale == "log1p":
            return tex.fixed(self.plain(value), 1)
        return tex.score(value)

    def example_text(self, value: float | None) -> str:
        """A label or a prediction beside a board: as ``label_text``, but a large quantity without its decimal."""
        if tex.known(value) and self.task.kind != "binary" and self.task.scale == "linear" and abs(value) >= 100:
            return tex.fixed(value, 0)
        return self.label_text(value)


def run_tex(name: str) -> str:
    return f"\\run{{{tex.esc(name)}}}"


def run_head(name: str, span: int, width: str) -> str:
    """A run's name over the columns that are its own: centred, and broken at a hyphen when it is wider than they are."""
    broken = tex.esc(name).replace("-", "-\\allowbreak ")
    return f"\\multicolumn{{{span}}}{{c}}{{\\parbox[b]{{{width}}}{{\\centering\\ttfamily {broken}}}}}"


def read(model: str, *, smoke: bool = False) -> Sources:
    """A model's files as a paper reads them. The records are ranked best first, as on its leaderboard."""
    task = tasks.get(model)
    runs = leaderboard.ranked(task, leaderboard.records(model, smoke=smoke))
    if not runs:
        raise FileNotFoundError(f"{model} has no run records yet: a paper is drawn from them")
    recipe = data.recipe(task.dataset, smoke=smoke)
    builder = import_module(f"..data.{data.BUILDERS[recipe['builder']]}", __package__)
    path = paths.results(model, smoke=smoke) / "analysis.json"
    look = json.loads(path.read_text(encoding="utf-8")) if path.exists() else None
    if look is not None:
        fingerprint = runs[0]["dataset"]["fingerprint"]
        if look["dataset"]["fingerprint"] != fingerprint:
            raise ValueError(
                f"{path} looks at another build of the data than {model}'s records name: "
                f"run `lab analyse {model}` again where the dataset and the predictions are"
            )
        missing = [name for name in (run["run"] for run in runs) if name not in look["runs"]]
        if missing:
            raise ValueError(
                f"{path} has no look at {', '.join(missing)}: run `lab analyse {model}` again "
                "where the predictions are, so the paper's closer look covers every run on the leaderboard"
            )
    return Sources(
        model=model,
        smoke=smoke,
        task=task,
        runs=runs,
        recipe=recipe,
        plan=analysis.plan(model),
        look=look,
        marks=tuple(builder.MARKS),
        hand=tuple(builder.HAND),
    )
