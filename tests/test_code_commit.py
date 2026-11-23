"""A record names the commit of its code, and only a change to code marks it."""

import subprocess
from pathlib import Path

import pytest

from chess_coach_models import paths
from chess_coach_models.data import store


def git(root: Path, *args: str) -> str:
    out = subprocess.run(
        ["git", "-C", str(root), "-c", "user.name=test", "-c", "user.email=test@example.org", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout.strip()


@pytest.fixture
def lab(tmp_path, monkeypatch) -> Path:
    for name in (
        "src/chess_coach_models/cli.py",
        "datasets/puzzles.yaml",
        "models/blunder-hazard/task.yaml",
        "models/blunder-hazard/analysis.yaml",
        "models/blunder-hazard/configs/gbm-hand.yaml",
        "models/blunder-hazard/results/gbm-hand.json",
        "models/blunder-hazard/paper/paper.tex",
        "README.md",
    ):
        path = tmp_path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("as committed\n")
    git(tmp_path, "init", "-q")
    git(tmp_path, "add", "-A")
    git(tmp_path, "commit", "-q", "-m", "a lab")
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    return tmp_path


def test_results_and_docs_a_session_writes_are_not_changes_to_the_code(lab):
    commit = git(lab, "rev-parse", "HEAD")
    assert store.code_commit() == commit
    (lab / "models/blunder-hazard/results/gbm-hand.json").write_text("a new record\n")
    (lab / "models/blunder-hazard/results/conv-small.json").write_text("another record\n")
    (lab / "models/blunder-hazard/results/analysis.json").write_text("a paper's numbers\n")
    (lab / "models/blunder-hazard/analysis.yaml").write_text("another way to cut the results\n")
    (lab / "models/blunder-hazard/paper/paper.tex").write_text("a paper's words\n")
    (lab / "README.md").write_text("a new table\n")
    assert store.code_commit() == commit


@pytest.mark.parametrize(
    "changed",
    [
        "src/chess_coach_models/cli.py",
        "datasets/puzzles.yaml",
        "models/blunder-hazard/task.yaml",
        "models/blunder-hazard/configs/gbm-hand.yaml",
        "models/blunder-hazard/configs/a-new-run.yaml",
        "src/chess_coach_models/a_new_module.py",
    ],
)
def test_a_change_to_the_harness_a_recipe_a_task_or_a_config_marks_the_commit(lab, changed):
    (lab / changed).write_text("edited\n")
    assert store.code_commit() == git(lab, "rev-parse", "HEAD") + "+changes"


def test_outside_a_repository_the_commit_is_unknown(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    assert store.code_commit() == "unknown"
