"""A whole lab in a temporary folder, for the tests that build, train and score."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from chess_coach_models import paths


REPOSITORY = Path(__file__).resolve().parents[1]


class TempLab:
    """A lab whose every path is under one temporary root: recipes, models, datasets and artifacts."""

    def __init__(self, root: Path):
        self.root = root

    def recipe(self, dataset: str, recipe: dict[str, Any]) -> None:
        """Writes ``datasets/<dataset>.yaml``."""
        path = self.root / "datasets" / f"{dataset}.yaml"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(recipe), encoding="utf-8")

    def model(self, name: str, configs: dict[str, dict[str, Any]]) -> None:
        """Gives the lab a model: the repository's own task for it, its analysis plan when it has one, and these run configs."""
        folder = self.root / "models" / name
        (folder / "configs").mkdir(parents=True, exist_ok=True)
        for file in ("task.yaml", "analysis.yaml"):
            if (REPOSITORY / "models" / name / file).exists():
                shutil.copy(REPOSITORY / "models" / name / file, folder / file)
        for run, config in configs.items():
            (folder / "configs" / f"{run}.yaml").write_text(yaml.safe_dump(config), encoding="utf-8")


@pytest.fixture()
def temp_lab(tmp_path, monkeypatch) -> TempLab:
    monkeypatch.setattr(paths, "ROOT", tmp_path)
    return TempLab(tmp_path)
