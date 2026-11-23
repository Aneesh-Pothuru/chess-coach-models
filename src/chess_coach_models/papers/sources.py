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
from ..encode.hand import group_of
from ..evals import analysis, leaderboard
from ..evals.metrics import METRICS
from . import charts, tex


# A metric as a table's head names it, and as a sentence or an axis does.
METRIC_NAMES = {**leaderboard.NAMES, "r2": "R\\textsuperscript{2}", "top1": "Top-1 accuracy", "top3": "Top-3 accuracy"}
METRIC_WORDS = {
    **METRIC_NAMES,
    "log_loss": "log loss",
    "calibration_error": "calibration error",
    "brier": "Brier score",
    "spearman": "rank correlation",
    "ap": "average precision",
    "top1": "top-1 accuracy",
    "top3": "top-3 accuracy",
}


# The studies a paper gives tables of their own. A run under any other study was tried as a run of the
# model's own, and filed there when it did not beat the run it changed (``train/filing.py``).
STUDIES = ("games", "features")


@dataclass
class Sources:
    model: str
    smoke: bool
    task: tasks.Task
    runs: list[dict[str, Any]]
    studies: list[dict[str, Any]]
    recipe: dict[str, Any]
    plan: dict[str, Any]
    look: dict[str, Any] | None
    marks: tuple[str, ...]
    hand: tuple[str, ...]
    # The numbers of each position of a row, where a row is a sequence of positions: none where it is one.
    steps: tuple[str, ...] = ()

    @property
    def primary(self) -> str:
        return self.task.primary

    @property
    def closer(self) -> bool:
        """Whether the closer look has what a paper's closer sections are drawn from: its cuts, its examples,
        how sure a run is. The look of a model whose answer is a set or a move holds its pairs alone."""
        return self.look is not None and "slices" in self.look

    @property
    def sequence(self) -> bool:
        """Whether a row is a sequence of positions, each with numbers of its own, and not one position."""
        return bool(self.steps)

    @property
    def extra(self) -> list[str]:
        """The hand features a learner reads beside the context features. A feature the task gives every
        learner as context is in a group of hand features too, and is counted once, as context."""
        return [name for name in self.hand if name not in self.task.context]

    def group_size(self, group: str) -> int:
        """How many features a run loses when it leaves a group of hand features out: a context feature of
        the group stays (``train/learners/base.py``)."""
        return sum(1 for name in self.extra if group_of(name) == group)

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
    def ladder(self) -> list[dict[str, Any]]:
        """The networks every model is given, without the runs that change one thing in one of them."""
        return [run for run in self.networks if not charts.variant(run["run"])]

    @property
    def filed(self) -> list[dict[str, Any]]:
        """The runs that were tried as runs of the model's own and filed under a study when they did not beat
        the run they changed: the study runs outside the games and the features study."""
        return [run for run in self.studies if run["config"]["study"] not in STUDIES]

    def variants(self, run: dict[str, Any]) -> list[dict[str, Any]]:
        """The networks that change one thing in a run (more epochs, another start): the ones on the
        leaderboard, then the ones that were filed. A run that trained on a larger build of the dataset is
        not one of them: its epoch is longer than the run's, so the two share no epoch to be read by, and it
        stands in the games study."""
        ranked = [
            other
            for other in self.networks
            if other is not run and charts.family(other["run"]) == run["run"] and "train_dataset" not in other
        ]
        filed = [other for other in self.filed if other["config"].get("base") == run["run"] and other["config"]["learner"]["kind"] == "net"]
        return ranked + filed

    @property
    def board_only(self) -> dict[str, Any] | None:
        """The best network that reads the board and the context numbers and no hand feature."""
        return next((run for run in self.networks if run["config"]["learner"].get("features") != "hand"), None)

    @property
    def challenger(self) -> dict[str, Any] | None:
        """The best run that is not the reference: the one the closer look compares with it group by group."""
        return next((run for run in self.runs if run["run"] != self.task.reference), None)

    def twin(self, run: dict[str, Any]) -> dict[str, Any] | None:
        """The run with the same learner that does not read the hand features, for a network that does: the one
        trained on the same schedule when there is one."""
        learner = run["config"]["learner"]
        if learner.get("features") != "hand" or learner["kind"] != "net":
            return None
        plain = {key: value for key, value in learner.items() if key != "features"}
        alike = [other for other in self.runs if other["config"]["learner"] == plain]
        same = [other for other in alike if other["config"].get("train") == run["config"].get("train")]
        return next(iter(same or alike), None)

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
        """A label or a prediction beside a board or in a sentence: as ``label_text``, but a large quantity
        without its decimal, and a small one to three decimals."""
        if tex.known(value) and self.task.kind != "binary" and self.task.scale == "linear":
            if abs(value) >= 100:
                return tex.fixed(value, 0)
            if abs(value) < 10:
                return tex.fixed(value, 3)
        return self.label_text(value)


def run_tex(name: str) -> str:
    """A run's name, set as code. The papers' preamble lets a line end after one of its hyphens or slashes, so the
    same text serves a sentence, a table's cell and a column's head."""
    return f"\\run{{{tex.esc(name)}}}"


# An encoder as a paper names it, and what a constant model predicts where a task's answer is not one number.
ENCODERS = {"transformer": "Transformer", "conv": "ResNet", "hybrid": "CNN-transformer hybrid"}
CONSTANTS = {
    "squares": "Each square's frequency in the training set",
    "tags": "Each tag's frequency in the training set",
    "moves": "Uniform over the legal moves",
}
PER_EXAMPLE = {"squares": ", one example per square", "tags": ", one model per tag", "moves": ", one example per legal move"}


def describe(record: dict[str, Any]) -> str:
    """A model in a few words, as a paper's table describes it, from its record's config: the model class, its
    size, what it reads, what it starts from, and the larger training set it was trained on where it has one."""
    learner, kind = record["config"]["learner"], record["task"]["kind"]
    more = record.get("train_dataset")
    larger = "" if more is None else f"; {tex.count(record['train_rows'])} training examples (\\code{{{tex.esc(more['dataset'])}}})"
    if learner["kind"] == "constant":
        return CONSTANTS.get(kind, "Constant prediction")
    if learner["kind"] == "maia2":
        told = [learner["player"], learner["against"]]
        rated = (
            ""
            if all(isinstance(one, str) for one in told)
            else f", both ratings set to {tex.esc(told[0])}"
            if told[0] == told[1]
            else f", ratings set to {tex.esc(told[0])} and {tex.esc(told[1])}"
        )
        return f"Maia-2 ({tex.esc(learner.get('type', 'rapid'))}) as published{rated}; not trained here"
    if learner["kind"] == "column":
        scale = float(learner.get("scale", 1.0))
        return f"The feature \\code{{{tex.esc(learner['column'])}}}" + ("" if scale == 1.0 else f", scaled by {scale:g}")
    if learner["kind"] == "rating-formula":
        return f"Elo expected score from \\code{{{tex.esc(learner['player'])}}} and \\code{{{tex.esc(learner['against'])}}}"
    removed = f", \\code{{{tex.esc(' and '.join(learner['without']))}}} group removed" if learner.get("without") else ""
    if learner["kind"] == "gbm":
        reads = "context and hand-crafted features" if learner["features"] == "hand" else "context features"
        return f"GBDT{PER_EXAMPLE.get(kind, '')}, {reads}{removed}{larger}"
    body = learner["body"]
    if body == "hybrid":
        shape = f"Hybrid, {learner['convs']} residual blocks and {learner['depth']} transformer layers, width {learner['dim']}"
    elif body == "conv":
        shape = f"ResNet, {learner['depth']} blocks, width {learner['dim']}" + (", squeeze-and-excitation" if learner.get("squeeze") else "")
    else:
        shape = f"{ENCODERS.get(body, tex.esc(body))}, {learner['depth']} layers, width {learner['dim']}"
        shape += ", attack-aware attention bias" if learner.get("attacks") else ""
        shape += "" if learner.get("geometry", True) else ", no relative position bias"
    over = learner.get("over")
    if over:
        layers = "transformer layers" if "depth" not in over else f"{over['depth']} transformer layer{'' if int(over['depth']) == 1 else 's'}"
        shape += f" per position, then {layers} over the sequence"
    reads = ", hand-crafted features" if learner.get("features") == "hand" else ""
    start = f", initialised from \\code{{{tex.esc(learner['init']['model'] + '/' + learner['init']['run'])}}}" if learner.get("init") else ""
    return f"{shape}{reads}{removed}{start}{larger}"


def wide_head(text: str, span: int, width: str) -> str:
    """A head over the columns that are its own: centred, and broken where it is wider than they are."""
    return f"\\multicolumn{{{span}}}{{c}}{{\\parbox[b]{{{width}}}{{\\centering {text}}}}}"


def run_head(name: str, span: int, width: str) -> str:
    """A run's name over the columns that are its own."""
    return wide_head(run_tex(name), span, width)


def retitled(look: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    """An error analysis under the titles its plan gives its subgroups today. A title is a paper's wording and
    changes nothing that was measured, so the plan's title wins over the one the analysis was written with, and
    rewording a title needs no second analysis. The subgroups of the comparison with the model that is shown
    more are the same subgroups, and take the same titles."""
    titles = {spec["key"]: spec["title"] for spec in plan.get("slices") or [] if "title" in spec}
    if "title" in (plan.get("band") or {}):
        titles["band"] = plan["band"]["title"]
    for one in [*(look.get("slices") or []), *((look.get("shown") or {}).get("slices") or [])]:
        one["title"] = titles.get(one["key"], one["title"])
    grids = {spec["key"]: spec for spec in plan.get("grids") or []}
    for one in look.get("grids") or []:
        for side in ("rows", "columns"):
            title = (grids.get(one["key"], {}).get(side) or {}).get("title")
            if title:
                one[side]["title"] = title
    return look


def read(model: str, *, smoke: bool = False) -> Sources:
    """A model's files as a paper reads them. The records are ranked best first, as on its leaderboard, and
    the study runs, which no leaderboard ranks, are kept apart. The marks, the hand features and, where a row
    is a sequence of positions, the numbers of each position are the ones the task lets a learner read."""
    task = tasks.get(model)
    ranked = leaderboard.ranked(task, leaderboard.records(model, smoke=smoke))
    runs = [run for run in ranked if run["config"].get("study") is None]
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
        names = [run["run"] for run in runs]
        missing = [name for name in names if name not in look["runs"]]
        if missing:
            raise ValueError(
                f"{path} has no look at {', '.join(missing)}: run `lab analyse {model}` again "
                "where the predictions are, so the paper's closer look covers every run on the leaderboard"
            )
        gone = [name for name in look["runs"] if name not in names]
        if gone:
            raise ValueError(
                f"{path} looks at {', '.join(gone)}, which the leaderboard no longer ranks: run `lab analyse {model}` "
                "again where the predictions are, so the paper's closer look is of the runs as they are filed now"
            )
    plan = analysis.plan(model)
    return Sources(
        model=model,
        smoke=smoke,
        task=task,
        runs=runs,
        studies=[run for run in ranked if run["config"].get("study") is not None],
        recipe=recipe,
        plan=plan,
        look=retitled(look, plan) if look is not None else None,
        marks=tuple(name for name in builder.MARKS if task.marks is None or name in task.marks),
        hand=tuple(name for name in builder.HAND if task.hand is None or group_of(name) in task.hand),
        steps=tuple(name for name in getattr(builder, "STEPS", ()) if task.steps is None or name in task.steps),
    )
