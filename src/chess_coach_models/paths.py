"""Where the lab keeps things, all from one root.

Everything that reads or writes a file asks here, so a test can stand a whole
lab up in a temporary folder by setting ``ROOT``.

    models/<model>/           a model: its card, task.yaml, configs/, results/, paper/
    datasets/<name>.yaml      a dataset's recipe
    papers/                   what every paper shares, and the lab's own paper
    data/processed/<name>/    a built dataset (not committed)
    artifacts/runs/           each run's test predictions and weights (not committed)
    artifacts/smoke*/         everything a ``--smoke`` check writes (not committed)
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def models() -> Path:
    return ROOT / "models"


def model(name: str) -> Path:
    return ROOT / "models" / name


def recipes() -> Path:
    return ROOT / "datasets"


def processed() -> Path:
    return ROOT / "data" / "processed"


def artifacts() -> Path:
    return ROOT / "artifacts"


def configs(name: str) -> Path:
    return model(name) / "configs"


def results(name: str, *, smoke: bool = False) -> Path:
    """Where a model's run records, leaderboard and analysis are: among its results, or for a smoke check among the artifacts."""
    return artifacts() / "smoke" / name if smoke else model(name) / "results"


def run_files(name: str, run: str, *, smoke: bool = False) -> Path:
    """Where a run keeps what is too large to commit: its test predictions and its weights."""
    return artifacts() / ("smoke-runs" if smoke else "runs") / name / run


def predictions(name: str, run: str, *, smoke: bool = False) -> Path:
    return run_files(name, run, smoke=smoke) / "predictions.parquet"


def papers() -> Path:
    return ROOT / "papers"


def paper(name: str, *, smoke: bool = False) -> Path:
    """A model's paper folder. A smoke check builds its paper in a copy of the tree under the artifacts, so the paper's own relative paths still hold."""
    return (artifacts() / "smoke-papers" if smoke else ROOT) / "models" / name / "paper"


def lab_paper(*, smoke: bool = False) -> Path:
    """The folder of the lab's own paper, which sets every model's results side by side. A smoke check builds
    it under the artifacts, beside a copy of what every paper shares."""
    return (artifacts() / "smoke-papers" if smoke else ROOT) / "papers" / "lab"
