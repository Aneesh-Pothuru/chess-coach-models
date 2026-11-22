"""A run's config and its record: a run that changes another, a study on its leaderboard, and its pair in the closer look."""

import json

import numpy as np
import polars as pl
import pytest
import yaml

from chess_coach_models import cli, paths
from chess_coach_models.data import store
from chess_coach_models.evals import analysis, leaderboard
from chess_coach_models.train import run as runs


ROWS = 900
TASK = {
    "dataset": "tiny",
    "kind": "regression",
    "label": "mover_score",
    "unit": "expected score",
    "primary": "rmse",
    "reference": "engine-curve",
    "context": ["mover_elo"],
}
NET = {
    "needs": "cuda",
    "learner": {"kind": "net", "body": "transformer", "features": "hand", "dim": 16},
    "train": {"epochs": 12, "patience": 3, "lr": 0.01},
    "smoke": {"train": {"epochs": 1}},
}
CONFIGS = {
    "engine-curve": {"learner": {"kind": "column", "column": "win_before", "scale": 0.01}},
    "constant": {"learner": {"kind": "constant"}},
    "elo-gap": {"learner": {"kind": "rating-formula", "player": "mover_elo", "against": "opponent_elo"}},
    "constant-half": {"base": "constant", "study": "games", "data": {"train_share": 0.5}},
    "net": NET,
    "net-half": {"base": "net", "study": "games", "data": {"train_share": 0.5}, "train": {"epochs": 24, "patience": 6}},
    "net-no-kings": {"base": "net", "study": "features", "learner": {"without": ["kings"]}},
    "net-half-wide": {"base": "net-half", "learner": {"dim": 32}},
}


def write_configs(root, model: str, configs: dict) -> None:
    folder = root / "models" / model / "configs"
    folder.mkdir(parents=True, exist_ok=True)
    for run, config in configs.items():
        (folder / f"{run}.yaml").write_text(yaml.safe_dump(config), encoding="utf-8")


@pytest.fixture()
def lab(temp_lab):
    """A lab with one model whose runs need neither trees nor a network, and its dataset built."""
    rng = np.random.default_rng(0)
    index = np.arange(ROWS)
    win = rng.uniform(0, 100, size=ROWS)
    rows = pl.DataFrame(
        {
            "key": [f"row{number:04d}" for number in index],
            "game_id": [f"game{number // 3:04d}" for number in index],
            "fen": ["8/8/8/8/8/8/8/K6k w - - 0 1"] * ROWS,
            "mover_elo": rng.integers(800, 2400, size=ROWS),
            "opponent_elo": rng.integers(800, 2400, size=ROWS),
            "win_before": win,
            "mover_score": (rng.uniform(0, 100, size=ROWS) < win).astype(np.float64),
            "band": np.where(index % 2 == 0, "<1000", "1000-1399"),
            "split": np.where(index // 3 % 5 == 0, "test", np.where(index // 3 % 5 == 1, "valid", "train")),
        }
    )
    empty = np.zeros((ROWS, 64), dtype=np.uint8)
    manifest = {"source": "made up", "licence": "none", "group": "game_id", "hand": [], "marks": ["en_passant"]}
    temp_lab.recipe("tiny", {"name": "tiny-v1"})
    store.write_dataset("tiny-v1", rows, empty, empty.astype(np.uint16), manifest)
    (temp_lab.root / "models" / "tiny").mkdir(parents=True)
    (temp_lab.root / "models" / "tiny" / "task.yaml").write_text(yaml.safe_dump(TASK), encoding="utf-8")
    write_configs(temp_lab.root, "tiny", CONFIGS)
    return temp_lab


def test_a_run_that_names_a_base_is_that_run_with_its_own_blocks_laid_over(lab):
    half = runs.run_config("tiny", "net-half")
    assert half["learner"] == NET["learner"] and half["needs"] == "cuda"
    assert half["train"] == {"epochs": 24, "patience": 6, "lr": 0.01}
    assert (half["base"], half["study"], half["data"]) == ("net", "games", {"train_share": 0.5})
    assert "smoke" not in half
    assert runs.run_config("tiny", "net-half", smoke=True)["train"] == {"epochs": 1, "patience": 6, "lr": 0.01}
    assert runs.run_config("tiny", "net-no-kings")["learner"] == {**NET["learner"], "without": ["kings"]}
    assert runs.run_config("tiny", "net") == {key: value for key, value in NET.items() if key != "smoke"}


def test_a_study_is_not_handed_down_to_a_run_on_top_of_a_study_run(lab):
    wide = runs.run_config("tiny", "net-half-wide")
    assert "study" not in wide and wide["base"] == "net-half"
    assert wide["learner"]["dim"] == 32 and wide["data"] == {"train_share": 0.5} and wide["train"]["epochs"] == 24


def test_a_base_has_to_be_there_and_cannot_lead_back(lab):
    write_configs(lab.root, "tiny", {"orphan": {"base": "absent"}, "a": {"base": "b"}, "b": {"base": "a"}, "self": {"base": "self"}})
    with pytest.raises(FileNotFoundError, match="no run named 'absent'"):
        runs.run_config("tiny", "orphan")
    for name in ("a", "self"):
        with pytest.raises(ValueError, match="lead back to itself"):
            runs.run_config("tiny", name)


def test_a_models_runs_are_its_leaderboards_own_and_a_study_is_asked_for_by_name(lab):
    own = ["constant", "elo-gap", "engine-curve", "net", "net-half-wide"]
    assert runs.run_names("tiny") == own
    assert runs.studies("tiny") == ["features", "games"]
    assert runs.run_names("tiny", study="games") == ["constant-half", "net-half"]
    assert cli.planned("tiny", None) == own
    assert cli.planned("tiny", "engine-curve,study:games,constant-half") == ["engine-curve", "constant-half", "net-half"]
    with pytest.raises(SystemExit, match="no study named 'weather'"):
        cli.planned("tiny", "study:weather")


def test_what_a_run_changes_is_read_off_the_two_configs():
    base = {"needs": "cuda", "seed": 0, "learner": {"kind": "net", "dim": 16}, "train": {"epochs": 12, "patience": 3}}
    run = {
        "base": "net",
        "study": "games",
        "seed": 1,
        "learner": {"kind": "net", "dim": 16, "without": ["kings", "pawns"]},
        "train": {"epochs": 24},
        "data": {"train_share": 0.5},
    }
    assert leaderboard.changes(run, base) == [
        "`data.train_share` 0.5",
        "`learner.without` kings, pawns",
        "`seed` 1 (the base has 0)",
        "`train.epochs` 24 (the base has 12)",
        "`train.patience` not set (the base has 3)",
    ]
    assert leaderboard.changes(base, base) == []


def test_a_study_run_is_listed_apart_and_set_against_the_run_it_changes(lab):
    for name in ("engine-curve", "constant", "elo-gap", "constant-half"):
        runs.run("tiny", name, log=lambda _: None)
    whole = json.loads((paths.results("tiny") / "constant.json").read_text())
    half = json.loads((paths.results("tiny") / "constant-half.json").read_text())
    assert whole["train_rows"] == 540 and whole["train_groups"] == 180
    assert 0 < half["train_rows"] < 540 and half["train_rows"] == 3 * half["train_groups"]
    assert half["config"] == {"learner": {"kind": "constant"}, "base": "constant", "study": "games", "data": {"train_share": 0.5}}
    assert "marks" not in half["task"] and "hand" not in half["task"]

    board = leaderboard.build("tiny")
    assert {entry["run"] for entry in board["runs"]} == {"engine-curve", "constant", "elo-gap"}
    (study,) = board["studies"]["games"]
    assert (study["run"], study["base"], study["changes"]) == ("constant-half", "constant", ["`data.train_share` 0.5"])
    assert study["train_rows"] == half["train_rows"] and study["gain"] is not None
    assert study["base_test"] == whole["test"]["rmse"]
    text = (paths.results("tiny") / "leaderboard.md").read_text()
    head, studies = text.split("## Studies")
    assert "`constant-half`" not in head and "### `games`" in studies
    assert f"| `constant-half` | `constant` | `data.train_share` 0.5 | {half['train_rows']:,} rows |" in studies

    look = analysis.analyse("tiny")
    assert set(look["runs"]) == {"engine-curve", "constant", "elo-gap"} and look["studies"] == ["constant-half"]
    assert look["skipped"] == {} and "constant-half" not in look["reliability"]
    (pair,) = look["pairs"]
    assert (pair["run"], pair["over"], pair["study"]) == ("constant-half", "constant", "games")
    assert pair["low"] <= pair["gain"] <= pair["high"]


def test_a_leaderboard_of_runs_alone_says_nothing_of_studies(lab):
    for name in ("engine-curve", "constant"):
        runs.run("tiny", name, log=lambda _: None)
    board = leaderboard.build("tiny")
    assert "studies" not in board and "## Studies" not in (paths.results("tiny") / "leaderboard.md").read_text()
    look = analysis.analyse("tiny")
    assert "studies" not in look and look["pairs"] == []


def test_a_model_needs_a_run_of_its_own_before_a_study(lab):
    runs.run("tiny", "constant-half", log=lambda _: None)
    with pytest.raises(FileNotFoundError, match="study runs only"):
        leaderboard.build("tiny")
