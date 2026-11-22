"""The lab end to end on a few hundred public puzzles: build, train every kind of learner, score, rank."""

import hashlib
import json
from pathlib import Path

import pytest

pytest.importorskip("torch")
pytest.importorskip("lightgbm")
zstandard = pytest.importorskip("zstandard")

import polars as pl  # noqa: E402

from chess_coach_models import cli, paths, tasks  # noqa: E402
from chess_coach_models.data import store  # noqa: E402
from chess_coach_models.evals import analysis, calibration, leaderboard  # noqa: E402
from chess_coach_models.train import run as runs  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "puzzles_sample.csv"
RECIPE = {
    "name": "puzzles-test",
    "builder": "puzzles",
    "source": "tests/fixtures/puzzles_sample.csv",
    "filters": {"max_rating_deviation": 500, "min_plays": 0},
    "sample": 1.0,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}
DATASET = "puzzles-test-smoke"
CONFIGS = {
    "gbm-hand": {"learner": {"kind": "gbm", "features": "hand", "rounds": 20, "min_child_samples": 5}},
    "constant": {"learner": {"kind": "constant"}},
    "transformer-small": {
        "learner": {"kind": "net", "body": "transformer", "dim": 16, "depth": 1, "heads": 2},
        "train": {"epochs": 2, "batch": 32, "lr": 0.01},
    },
    "conv-hand": {
        "learner": {"kind": "net", "body": "conv", "features": "hand", "dim": 8, "depth": 1},
        "train": {"epochs": 1, "batch": 32, "lr": 0.01},
    },
}


SAVED = {"gbm": ["model.txt"], "net": ["model.pt"]}


@pytest.fixture()
def lab(temp_lab, tmp_path):
    compressed = tmp_path / "puzzles.csv.zst"
    compressed.write_bytes(zstandard.ZstdCompressor().compress(FIXTURE.read_bytes()))
    temp_lab.recipe("puzzles", RECIPE)
    temp_lab.model("puzzle-difficulty", CONFIGS)
    cli.build_data("puzzles", smoke=True, source=str(compressed), workers=2, rebuild=False)
    return tmp_path


def test_a_dataset_is_rows_boards_and_a_manifest(lab):
    dataset = store.read_dataset(DATASET)
    assert len(dataset.rows) == len(dataset.tokens) == len(dataset.marks) == 240
    assert dataset.tokens.shape[1] == 64 and dataset.tokens.max() <= 12
    assert set(dataset.rows["split"].unique()) == {"train", "valid", "test"}
    assert dataset.manifest["rows"] == 240 and dataset.manifest["group"] == "game_id"
    assert sum(dataset.manifest["splits"].values()) == 240
    assert dataset.rows["key"].n_unique() == 240
    assert dataset.manifest["fingerprint"] == store.fingerprint(dataset.rows, dataset.tokens, dataset.marks)


def test_a_fingerprint_follows_the_boards_and_the_exact_columns_only(lab):
    import polars as pl

    dataset = store.read_dataset(DATASET)
    rows, tokens, marks = dataset.rows, dataset.tokens, dataset.marks
    same = store.fingerprint(rows, tokens, marks)
    rerated = rows.with_columns(pl.when(pl.int_range(pl.len()) == 0).then(pl.col("rating") + 1).otherwise(pl.col("rating")).alias("rating"))
    assert store.fingerprint(rerated, tokens, marks) != same
    moved = tokens.copy()
    moved[0, 0] = (moved[0, 0] + 1) % 13
    assert store.fingerprint(rows, moved, marks) != same
    fraction = next(name for name in rows.columns if rows[name].dtype.is_float())
    nudged = rows.with_columns(pl.col(fraction) * (1 + 1e-15))
    assert store.fingerprint(nudged, tokens, marks) == same


def test_every_learner_runs_and_the_leaderboard_ranks_them(lab):
    task = tasks.get("puzzle-difficulty")
    for name in CONFIGS:
        record = runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None)
        primary = record["test"][task.primary]
        assert primary["low"] <= primary["value"] <= primary["high"]
        assert record["test_rows"] == sum(band["rows"] for band in record["test_by_band"].values())
        assert "node" not in record["machine"]
        assert set(record["software"]) == {"python", "numpy", "polars", "lightgbm", "torch"}
        assert record["software"]["polars"] == pl.__version__
        saved = paths.run_files("puzzle-difficulty", name, smoke=True)
        assert record["weights"] == [
            {"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
            for path in sorted(saved.iterdir())
            if path.name != "predictions.parquet"
        ]
        assert [entry["file"] for entry in record["weights"]] == SAVED.get(CONFIGS[name]["learner"]["kind"], [])
    board = leaderboard.build("puzzle-difficulty", smoke=True)
    scores = [entry["test"][task.primary]["value"] for entry in board["runs"]]
    assert scores == sorted(scores)
    gains = {entry["run"]: entry["gain"] for entry in board["runs"]}
    assert gains[task.reference] is None
    assert all(gains[name] is not None for name in CONFIGS if name != task.reference)
    assert all(gain["low"] <= gain["gain"] <= gain["high"] for gain in gains.values() if gain)
    text = (paths.results("puzzle-difficulty", smoke=True) / "leaderboard.md").read_text()
    assert "| `gbm-hand` |" in text and "reference" in text and "not compared" not in text


def test_a_leaderboard_is_written_from_the_records_alone(lab):
    import shutil

    task = tasks.get("puzzle-difficulty")
    for name in ("gbm-hand", "constant"):
        runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None)
    first = leaderboard.build("puzzle-difficulty", smoke=True)
    shutil.rmtree(paths.artifacts() / "smoke-runs")
    again = leaderboard.build("puzzle-difficulty", smoke=True)
    assert again == first
    assert next(entry for entry in again["runs"] if entry["run"] == "constant")["gain"] is not None
    assert task.reference == "gbm-hand"


def test_a_run_trained_without_the_reference_is_not_compared(lab):
    record = runs.run("puzzle-difficulty", "constant", smoke=True, log=lambda _: None)
    assert record["gain"] is None
    leaderboard.build("puzzle-difficulty", smoke=True)
    text = (paths.results("puzzle-difficulty", smoke=True) / "leaderboard.md").read_text()
    assert "not compared" in text


def test_a_leaderboard_refuses_a_gain_measured_against_another_reference(lab):
    for name in ("gbm-hand", "constant"):
        runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None)
    path = paths.results("puzzle-difficulty", smoke=True) / "gbm-hand.json"
    record = json.loads(path.read_text())
    record["test"]["rmse"]["value"] *= 1.2
    path.write_text(json.dumps(record))
    with pytest.raises(ValueError, match="compared with a gbm-hand"):
        leaderboard.build("puzzle-difficulty", smoke=True)


def test_the_closer_look_agrees_with_the_records_and_stays_off_the_leaderboard(lab):
    task = tasks.get("puzzle-difficulty")
    records = {name: runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None) for name in ("gbm-hand", "constant")}
    look = analysis.analyse("puzzle-difficulty", smoke=True)
    written = paths.results("puzzle-difficulty", smoke=True) / "analysis.json"
    assert json.loads(written.read_text(encoding="utf-8")) == look
    assert look["runs"] == ["gbm-hand", "constant"] and look["skipped"] == {}
    assert (look["best"], look["reference"], look["challenger"]) == ("gbm-hand", "gbm-hand", "constant")
    assert look["test_rows"] == records["gbm-hand"]["test_rows"]
    assert look["dataset"]["fingerprint"] == records["gbm-hand"]["dataset"]["fingerprint"]
    by_band = look["slices"][0]
    assert by_band["key"] == "band" and by_band["title"] == "The puzzle's rating"
    for group in by_band["groups"]:
        for name, record in records.items():
            recorded = record["test_by_band"][group["group"]]
            assert group["rows"] == recorded["rows"]
            if group["rows"] > 1:
                assert group["runs"][name][task.primary] == pytest.approx(recorded[task.primary], rel=1e-5)
    histogram = look["label"]["histogram"]
    assert sum(histogram["counts"]) + histogram["below"] + histogram["above"] == look["label"]["rows"] == 240
    assert set(look["closeness"]["gbm-hand"]["within"]) == {"100", "200", "300"}
    assert {slice_["key"] for slice_ in look["slices"]} >= {"moves", "themes", "mate"}
    example = look["examples"]["typical"][0]
    assert set(example["moves"]) == {"setup", "line"} and example["id"] and set(example["predicted"]) == set(records)
    board = leaderboard.build("puzzle-difficulty", smoke=True)
    assert [entry["run"] for entry in board["runs"]] == ["gbm-hand", "constant"]


def test_the_closer_look_leaves_out_a_run_whose_predictions_are_gone(lab):
    for name in ("gbm-hand", "constant"):
        runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None)
    paths.predictions("puzzle-difficulty", "constant", smoke=True).unlink()
    look = analysis.analyse("puzzle-difficulty", smoke=True)
    assert look["runs"] == ["gbm-hand"] and "not on this machine" in look["skipped"]["constant"]
    assert look["challenger"] is None
    paths.predictions("puzzle-difficulty", "gbm-hand", smoke=True).unlink()
    with pytest.raises(FileNotFoundError, match="no run of puzzle-difficulty"):
        analysis.analyse("puzzle-difficulty", smoke=True)


def test_platt_scaling_recovers_a_known_distortion():
    import numpy as np

    rng = np.random.default_rng(0)
    truth = rng.uniform(0.02, 0.6, size=20_000)
    y = (rng.random(20_000) < truth).astype(float)
    logit = np.log(truth / (1 - truth))
    distorted = 1 / (1 + np.exp(-(2.0 * logit + 1.0)))
    slope, intercept = calibration.platt(distorted, y)
    assert slope == pytest.approx(0.5, abs=0.05)
    fixed = calibration.apply_platt(distorted, slope, intercept)
    assert abs(fixed.mean() - y.mean()) < 0.01


def test_platt_scaling_comes_back_from_predictions_that_are_far_off():
    import numpy as np

    rng = np.random.default_rng(1)
    gap = rng.normal(400, 500, size=5_000)
    truth = 1 / (1 + np.exp(-(0.45 + 0.0012 * gap)))
    y = (rng.random(5_000) < truth).astype(float)
    stated = 1 / (1 + 10 ** (-gap / 400))
    slope, intercept = calibration.platt(stated, y)
    assert slope == pytest.approx(0.0012 * 400 / np.log(10), abs=0.03)
    assert intercept == pytest.approx(0.45, abs=0.08)
    fixed = calibration.apply_platt(stated, slope, intercept)
    x = np.log(stated / (1 - stated))
    assert abs(np.sum(fixed - y)) < 1e-6 and abs(np.sum((fixed - y) * x)) < 1e-5
