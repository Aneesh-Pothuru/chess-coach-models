"""The lab end to end on a few hundred public puzzles: build, train every kind of learner, score, rank."""

import hashlib
import json
import shutil
from pathlib import Path

import pytest

pytest.importorskip("torch")
pytest.importorskip("lightgbm")
zstandard = pytest.importorskip("zstandard")

import polars as pl  # noqa: E402

from chess_coach_models import cli, paths, tasks  # noqa: E402
from chess_coach_models.data import store  # noqa: E402
from chess_coach_models.encode.hand import GROUPS  # noqa: E402
from chess_coach_models.evals import analysis, calibration, leaderboard  # noqa: E402
from chess_coach_models.papers import build as papers  # noqa: E402
from chess_coach_models.papers import overview, tex  # noqa: E402
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
# Runs that change one thing in a run above: fewer training games, and a group of hand features left out.
STUDIES = {
    "gbm-hand-no-line": {"base": "gbm-hand", "study": "features", "learner": {"without": ["line", "first-move"]}},
    "conv-hand-no-line": {"base": "conv-hand", "study": "features", "learner": {"without": ["line"]}},
    "transformer-small-half": {"base": "transformer-small", "study": "games", "data": {"train_share": 0.5}, "train": {"epochs": 3}},
}
POSITION_GROUPS = ("material", "mobility", "hanging", "pawns", "kings", "setup")


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


def test_a_paper_reads_every_run_by_name_from_the_closer_look(lab):
    model, names = "puzzle-difficulty", ("gbm-hand", "constant", "transformer-small")
    for name in names:
        runs.run(model, name, smoke=True, log=lambda _: None)
    look = analysis.analyse(model, smoke=True)
    src, out = papers.generate(model, smoke=True)
    assert src.task.reference == "gbm-hand" and set(look["runs"]) == set(names)
    pair = [look["challenger"], look["reference"]]
    (other,) = [name for name in names if name not in pair]
    # What every run said in every group it was scored in, and how far the reference leads it there.
    for one in look["slices"]:
        for group in one["groups"]:
            inner = tex.key("slice", one["key"], group["group"])
            for name in names:
                assert (f"{inner}.{name}.said" in out.values) == (name in group["runs"])
            assert f"{inner}.gbm-hand.behind" not in out.values
    band = [group for group in look["slices"][0]["groups"] if group["rows"]]
    assert sum(group["rows"] for group in band) == look["test_rows"]
    happened = sum(group["rows"] * group["label_mean"] for group in band) / look["test_rows"]
    assert out.values["overall.happened"] == src.example_text(happened)
    assert all(f"overall.{name}.said" in out.values for name in names)
    assert f"slice.band.{other}.widest-off" in out.values and f"slice.band.{other}.behind.most.group" in out.values
    assert f"run.{other}.reliability.widest-gap" in out.values and f"run.{other}.beside.closer" in out.values
    # A run the closer look does not already set beside the reference has figures and tables of its own.
    for block in (f"slice-band-{other}", f"slice-band-said-{other}", f"slice-band-bias-{other}", f"slices-{other}", f"reliability-{other}"):
        assert block in out.files
    assert f"tab:slice-band-{other}" in out.files[f"slices-{other}"] and "Reference's lead" in out.files[f"slice-band-{other}"]
    for name in pair:
        assert f"slice-band-said-{name}" not in out.files and f"reliability-{name}" not in out.files
    assert {"slice-band", "slice-band-said", "slices", "reliability"} <= set(out.files)
    assert "tab:slice-band}" in out.files["slices"] and "95\\% interval" in out.files["slice-band"]


def test_a_paper_stops_on_what_its_files_cannot_give(lab):
    model = "puzzle-difficulty"
    for name in ("gbm-hand", "constant"):
        runs.run(model, name, smoke=True, log=lambda _: None)
    analysis.analyse(model, smoke=True)
    # A paper is drawn from a model's committed results: here the small check's records stand in for them.
    shutil.copytree(paths.results(model, smoke=True), paths.results(model))
    folder = paths.paper(model)
    folder.mkdir(parents=True)
    prose = folder / "paper.tex"
    with pytest.raises(FileNotFoundError, match="is not written yet"):
        papers.write(model)
    prose.write_text(
        "\\V{best.score} \\block{leaderboard} % \\V{in.a.comment}\n\\ifgames \\V{no.such.value} \\block{study-games} \\fi\n",
        encoding="utf-8",
    )
    assert papers.write(model) == folder
    written = folder / "generated"
    assert sorted(path.name for path in written.iterdir()) == ["leaderboard.tex", "values.tex"]
    values = (written / "values.tex").read_text(encoding="utf-8")
    assert "\\setvalue{best.score}" in values and "\\looktrue" in values and "\\gamesfalse" in values
    assert values.count("\\setvalue") == 1
    prose.write_text("\\V{best.score} \\V{no.such.value} \\block{no-such-block}\n", encoding="utf-8")
    with pytest.raises(KeyError, match="the block no-such-block, the value no.such.value"):
        papers.write(model)
    # The same prose is let through as a smoke build, which proves only that the paper compiles.
    assert papers.write(model, smoke=True) == paths.paper(model, smoke=True)


def test_the_lab_s_paper_reads_every_model_under_its_name_and_lists_one_that_waits(lab, temp_lab):
    model, waiting = "puzzle-difficulty", "puzzle-difficulty-unsolved"
    blind = {"learner": {"kind": "gbm", "features": "context", "rounds": 20, "min_child_samples": 5}}
    temp_lab.model(model, {**CONFIGS, "gbm-context": blind})
    temp_lab.model(waiting, {name: CONFIGS[name] for name in ("gbm-hand", "constant")})
    names = ("gbm-hand", "constant", "gbm-context", "transformer-small")
    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in names}
    analysis.analyse(model, smoke=True)
    whole, out = overview.generate(smoke=True)
    assert list(whole.models) == [model] and list(whole.waiting) == [waiting]
    assert overview.switches(whole) == {
        "waiting": True, "changehand": True, "changeepochs": False, "changestart": False, "games": False, "features": False,
        "studies": False,
    }  # fmt: skip
    # Everything a model's own paper can read is there under the model's name.
    _, own = papers.generate(model, smoke=True)
    assert all(out.values[f"{model}.{key}"] == value for key, value in own.values.items())
    assert all(out.files[f"{model}-{block}"] == latex for block, latex in own.files.items())
    assert out.values["lab.models.count"] == "one" and out.values["lab.tasks.count"] == "two"
    assert out.values["lab.waiting.names"] == "puzzle difficulty unsolved"
    assert out.values["lab.runs.count"] == "4" and out.values["lab.networks.count"] == "1"
    assert out.values["lab.split.test.percent"] == own.values["recipe.split.test.percent"] == "20"
    # The one scale: the floor makes none of the reference's step, and a run its share of it.
    src = whole.models[model]
    floor, reference, network = (records[name]["test"]["rmse"]["value"] for name in ("constant", "gbm-hand", "transformer-small"))
    assert overview.step(src) == pytest.approx(floor - reference)
    assert overview.share(src, src.run("transformer-small")) == pytest.approx(100.0 * (floor - network) / (floor - reference))
    assert out.values[f"{model}.floor.lift.share"] == "0" and out.values[f"{model}.reference.lift.share"] == "100"
    assert f"{model}.network.gain.of-lift" in out.values and f"{model}.run.gbm-context.lift.share" in out.values
    # The hand features under the trees are a pair of every model, with the trees' gain turned round.
    assert out.values["lab.change.hand.gbm.count"] == "one"
    (pair,) = [entry for entry in overview.pairs(src) if entry["kind"] is not None]
    assert (pair["run"], pair["over"]) == ("gbm-hand", "gbm-context") and pair["gain"] == -records["gbm-context"]["gain"]["gain"]
    made = {"lab-models", "lab-scores", "lab-shares", "lab-networks", "lab-changes", "lab-changes-figure", "lab-cost", "lab-waiting"}
    assert made <= set(out.files) and "unsolved" in out.files["lab-waiting"] and "over \\run{gbm-context}" in out.files["lab-changes"]
    assert out.values["lab.change.hand.over.gbm-context.models"] == "puzzle difficulty"
    assert out.values["lab.change.hand.over.gbm-context.said"].endswith("in the one model (puzzle difficulty)")

    # The paper itself is drawn from the committed results: here the small check's records stand in for them.
    shutil.copytree(paths.results(model, smoke=True), paths.results(model))
    folder = paths.lab_paper()
    with pytest.raises(FileNotFoundError, match="is not written yet"):
        overview.write()
    folder.mkdir(parents=True)
    prose = folder / "paper.tex"
    prose.write_text(
        f"\\V{{{model}.best.score}} \\V{{lab.models.count}} \\block{{lab-scores}} \\block{{{model}-leaderboard}} % \\V{{in.a.comment}}\n"
        "\\ifwaiting \\V{lab.waiting.names} \\block{lab-waiting} \\else \\V{no.such.value} \\fi\n",
        encoding="utf-8",
    )
    assert overview.write() == folder
    written = folder / "generated"
    assert sorted(path.name for path in written.iterdir()) == ["lab-scores.tex", "lab-waiting.tex", f"{model}-leaderboard.tex", "values.tex"]
    values = (written / "values.tex").read_text(encoding="utf-8")
    assert "\\waitingtrue" in values and f"\\setvalue{{{model}.best.score}}" in values and values.count("\\setvalue") == 3
    prose.write_text("\\V{lab.no.such.value} \\block{lab-no-such-block}\n", encoding="utf-8")
    with pytest.raises(KeyError, match="the block lab-no-such-block, the value lab.no.such.value"):
        overview.write()
    # The same prose is let through as a smoke build, which proves only that the paper compiles.
    assert overview.write(smoke=True) == paths.lab_paper(smoke=True)
    assert (paths.lab_paper(smoke=True) / "paper.tex").read_text(encoding="utf-8") == prose.read_text(encoding="utf-8")
    assert "lab.models.count" in overview.listing() and "blocks: " in overview.listing()


def test_study_runs_train_on_what_their_config_changes_and_are_listed_apart(lab, temp_lab):
    temp_lab.model("puzzle-difficulty", {**CONFIGS, **STUDIES})
    records = {name: runs.run("puzzle-difficulty", name, smoke=True, log=lambda _: None) for name in [*CONFIGS, *STUDIES]}
    whole, fewer = records["gbm-hand"]["learner"]["features"], records["gbm-hand-no-line"]["learner"]["features"]
    assert whole - fewer == len(GROUPS["line"]) + len(GROUPS["first-move"]) - 1
    # The line's length is a number the task gives every learner, so it stays when the line group is left out.
    assert "solver_moves" in tasks.get("puzzle-difficulty").context
    assert records["conv-hand"]["learner"]["features"] - records["conv-hand-no-line"]["learner"]["features"] == len(GROUPS["line"]) - 1
    # A study run keeps its predictions for the closer look and no weights; the run it changes keeps both.
    for name in STUDIES:
        assert records[name]["weights"] == []
        assert [path.name for path in paths.run_files("puzzle-difficulty", name, smoke=True).iterdir()] == ["predictions.parquet"]
    assert [entry["file"] for entry in records["conv-hand"]["weights"]] == ["model.pt"]
    half = records["transformer-small-half"]
    assert 0 < half["train_rows"] < records["transformer-small"]["train_rows"]
    assert len(half["learner"]["history"]) <= 3 and half["config"]["train"] == {"epochs": 3, "batch": 32, "lr": 0.01}
    board = leaderboard.build("puzzle-difficulty", smoke=True)
    assert {entry["run"] for entry in board["runs"]} == set(CONFIGS)
    assert {study: [entry["run"] for entry in entries] for study, entries in board["studies"].items()} == {
        "features": sorted(["gbm-hand-no-line", "conv-hand-no-line"], key=lambda name: records[name]["test"]["rmse"]["value"]),
        "games": ["transformer-small-half"],
    }
    text = (paths.results("puzzle-difficulty", smoke=True) / "leaderboard.md").read_text()
    assert "| `learner.without` line, first-move |" in text and "`train.epochs` 3 (the base has 2)" in text
    assert board["studies"]["features"][0]["learner"].endswith("group")
    assert "LightGBM, context and hand features, without the line and first-move group" in {
        entry["learner"] for entry in board["studies"]["features"]
    }
    look = analysis.analyse("puzzle-difficulty", smoke=True)
    assert set(look["runs"]) == set(CONFIGS) and look["studies"] == sorted(STUDIES)
    pairs = {(pair["run"], pair["over"]): pair for pair in look["pairs"]}
    assert set(pairs) >= {(name, config["base"]) for name, config in STUDIES.items()}
    assert all(pairs[name, config["base"]]["gain"] is not None for name, config in STUDIES.items())
    assert pairs["gbm-hand-no-line", "gbm-hand"]["study"] == "features"


def test_the_lab_s_paper_reads_the_two_studies_across_its_models(lab, temp_lab):
    model = "puzzle-difficulty"
    across = {
        "gbm-hand-half": {"base": "gbm-hand", "study": "games", "data": {"train_share": 0.5}},
        "gbm-hand-no-kings": {"base": "gbm-hand", "study": "features", "learner": {"without": ["kings"]}},
    }
    temp_lab.model(model, {**CONFIGS, **STUDIES, **across})
    for name in ("gbm-hand", "constant", "gbm-hand-half", "gbm-hand-no-kings", "gbm-hand-no-line"):
        runs.run(model, name, smoke=True, log=lambda _: None)
    analysis.analyse(model, smoke=True)
    whole, out = overview.generate(smoke=True)
    switches = overview.switches(whole)
    assert switches["games"] and switches["features"] and switches["studies"]
    assert out.values["lab.studies.count"] == "3" and "Study runs" in out.files["lab-cost"]
    assert {base: list(parts) for base, parts in overview.games(whole).items()} == {"gbm-hand": [0.5]}
    # A run that leaves two groups out measures neither of them: the lab's table has a group a row.
    assert list(overview.features(whole)) == ["kings"]
    assert out.values["lab.games.gbm-hand.half.models"] == "puzzle difficulty" and out.values["lab.features.kings.count"] == "one"
    assert out.values["lab.features.in.puzzle-difficulty.groups"] == "one"
    assert out.values["lab.features.in.puzzle-difficulty.most.group"] == "attacks near the kings"
    assert {"lab-games", "lab-games-figure", "lab-features"} <= set(out.files)
    assert "\\run{gbm-hand} on" in out.files["lab-games"] and "& Half \\\\" in out.files["lab-games"]
    assert "Attacks near the kings & 2 &" in out.files["lab-features"]


def test_a_task_that_hides_the_solution_gives_no_learner_a_way_to_read_it(lab, temp_lab):
    import torch

    model = "puzzle-difficulty-unsolved"
    temp_lab.model(model, {name: CONFIGS[name] for name in ("gbm-hand", "constant", "transformer-small", "conv-hand")})
    task = tasks.get(model)
    assert task.marks == ("en_passant", "setup_from", "setup_to") and task.hand == POSITION_GROUPS
    assert not set(task.context) & {name for group in ("line", "first-move") for name in GROUPS[group]}
    position = [name for group in POSITION_GROUPS for name in GROUPS[group]]
    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in ("gbm-hand", "constant", "transformer-small", "conv-hand")}
    for record in records.values():
        assert record["task"]["marks"] == list(task.marks) and sorted(record["task"]["hand"]) == sorted(position)
    assert records["gbm-hand"]["learner"]["features"] == len(task.context) + len(position)
    assert {entry["feature"] for entry in records["gbm-hand"]["learner"]["leans_on"]} <= set(task.context) | set(position)
    for name, numbers in (("transformer-small", list(task.context)), ("conv-hand", list(task.context) + position)):
        saved = torch.load(paths.run_files(model, name, smoke=True) / "model.pt", weights_only=False)
        assert saved["marks"] == list(task.marks) and sorted(saved["context"]) == sorted(numbers)
    state = torch.load(paths.run_files(model, "transformer-small", smoke=True) / "model.pt", weights_only=False)["state"]
    assert state["body.mark.weight"].shape[1] == 3
    shown = runs.run("puzzle-difficulty", "gbm-hand", smoke=True, log=lambda _: None)
    assert "marks" not in shown["task"] and shown["learner"]["features"] > records["gbm-hand"]["learner"]["features"]
    assert shown["test_rows"] == records["gbm-hand"]["test_rows"]
    board = leaderboard.build(model, smoke=True)
    assert board["task"]["marks"] == list(task.marks)


def test_a_model_that_hides_something_is_read_beside_the_model_that_shows_it(lab, temp_lab):
    model, shown = "puzzle-difficulty-unsolved", "puzzle-difficulty"
    names = ("gbm-hand", "constant", "conv-hand")
    temp_lab.model(model, {name: CONFIGS[name] for name in names})
    assert analysis.plan(model)["shown"] == shown
    hidden = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in names}
    # Before the other model has a run on this machine there is nothing to read this one against.
    src, out = papers.generate(model, smoke=True)
    assert "shown" not in out.files and not any(key.startswith("shown.") for key in out.values)
    assert papers.switches(src, out)["shown"] is False

    seen = {name: runs.run(shown, name, smoke=True, log=lambda _: None) for name in ("gbm-hand", "constant", "transformer-small")}
    # The two leaderboards alone give the table. Runs of the same name are the rows: conv-hand has no run
    # there, and transformer-small none here.
    src, out = papers.generate(model, smoke=True)
    flags = papers.switches(src, out)
    assert flags["shown"] is True and flags["shownpaired"] is False
    assert out.values["shown.model"] == "puzzle difficulty" and out.values["shown.runs"] == "two"
    assert "shown.gbm-hand.gain" not in out.values and "shown.conv-hand.worth" not in out.values
    step = {name: one["constant"]["test"]["rmse"]["value"] - one["gbm-hand"]["test"]["rmse"]["value"] for name, one in (("here", hidden), ("there", seen))}
    worth = hidden["gbm-hand"]["test"]["rmse"]["value"] - seen["gbm-hand"]["test"]["rmse"]["value"]
    assert float(out.values["shown.gbm-hand.worth"].replace("$-$", "-")) == pytest.approx(worth, rel=0.01)
    assert out.values["shown.reference.worth"] == out.values["shown.gbm-hand.worth"]
    # A run only the other model has is still there to read by its name, beside the same floor.
    assert out.values["shown.there.transformer-small.score"] == tex.score(seen["transformer-small"]["test"]["rmse"]["value"])
    assert out.values["shown.there.gbm-hand.lift.percent"] == out.values["shown.gbm-hand.there.lift.percent"]
    # Its lead over its own model's reference is its record's, and that reference has none over itself.
    recorded = seen["transformer-small"]["gain"]
    assert out.values["shown.there.transformer-small.gain"] == tex.trio(recorded["gain"], recorded["low"], recorded["high"])[0]
    assert "shown.there.gbm-hand.gain" not in out.values
    assert out.values["shown.gbm-hand.here.lift.percent"] == out.values["reference.lift.percent"]
    lead = hidden["gbm-hand"]["test"]["rmse"]["value"] - seen["transformer-small"]["test"]["rmse"]["value"]
    assert out.values["shown.there.transformer-small.than-reference"] == ("ahead of" if lead > 0 else "behind")
    assert out.values["shown.there.transformer-small.over-reference"] == tex.sig(abs(lead), 3)
    # The floor says the training mean whatever it is shown, so being shown the line is worth nothing to it.
    assert out.values["shown.constant.worth"] == "0"
    assert float(out.values["shown.reference.kept.percent"].replace("$-$", "-")) == pytest.approx(100 * step["here"] / step["there"], abs=0.5)
    table = out.files["shown"]
    assert "Hidden" in table and "Shown" in table and table.count("\\\\") == 2 + 2
    # No closer look has measured a pair yet, so the table has no column for an interval.
    assert "interval" not in table and "{lrrrr}" in table
    # The lab's own paper gives the ends of a scale over every model, and over the models that hide nothing.
    _, across = overview.generate(smoke=True)
    assert across.values["lab.hidden.names"] == "puzzle difficulty unsolved"
    assert across.values["lab.hidden.count"] == across.values["lab.whole.count"] == "one"
    assert across.values["lab.network.gain.whole.most.model"] == across.values["lab.network.gain.whole.least.model"] == "puzzle difficulty"
    # A model is on a scale only where its reference is a step up from the floor, which a small sample may not give.
    on_step = {
        said: 100.0 * gain / lift
        for said, gain, lift in (
            ("puzzle difficulty", seen["transformer-small"]["gain"]["gain"], step["there"]),
            ("puzzle difficulty unsolved", hidden["conv-hand"]["gain"]["gain"], step["here"]),
        )
        if lift > 0
    }
    assert across.values["lab.network.gain.most.model"] == max(on_step, key=on_step.get)
    assert across.values["lab.network.gain.least.model"] == min(on_step, key=on_step.get)
    assert across.values["lab.network.gain.whole.most"] == tex.fixed(on_step["puzzle difficulty"], 0)
    assert not any(name.startswith("shown-") for name in out.files)

    # A run is the same run in both models only when both were trained from one config.
    record = paths.results(model, smoke=True) / "gbm-hand.json"
    changed = json.loads(record.read_text(encoding="utf-8"))
    changed["config"]["learner"]["leaves"] = 7
    record.write_text(json.dumps(changed), encoding="utf-8")
    src, out = papers.generate(model, smoke=True)
    assert out.values["shown.runs"] == "one" and "shown.gbm-hand.worth" not in out.values


def test_the_closer_look_measures_what_being_shown_more_is_worth(lab, temp_lab):
    model, shown = "puzzle-difficulty-unsolved", "puzzle-difficulty"
    names = ("gbm-hand", "constant", "conv-hand")
    temp_lab.model(model, {name: CONFIGS[name] for name in names})
    hidden = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in names}
    # Before the other model has a run on this machine there is nothing to set against.
    alone = analysis.analyse(model, smoke=True)["shown"]
    assert alone["model"] == shown and alone["pairs"] == [] and "best" not in alone and "slices" not in alone

    seen = {name: runs.run(shown, name, smoke=True, log=lambda _: None) for name in ("gbm-hand", "constant", "transformer-small")}
    look = analysis.analyse(model, smoke=True)["shown"]
    pairs = {pair["run"]: pair for pair in look["pairs"]}
    # Runs of the same name are paired: conv-hand has no run there, and transformer-small none here.
    assert set(pairs) == {"gbm-hand", "constant"} and all(pair["there"] == pair["run"] for pair in pairs.values())
    for name, pair in pairs.items():
        worth = hidden[name]["test"]["rmse"]["value"] - seen[name]["test"]["rmse"]["value"]
        assert pair["gain"] == pytest.approx(worth, rel=1e-5, abs=1e-9) and pair["low"] <= pair["gain"] <= pair["high"]
    assert pairs["constant"]["gain"] == 0 and pairs["constant"]["beyond_noise"] is False
    best = look["best"]
    assert best["run"] in names and best["there"] in seen and best["low"] <= best["gain"] <= best["high"]
    cuts = {one["key"]: one for one in look["slices"]}
    assert list(cuts)[0] == "band" and {"moves", "themes", "mate"} <= set(cuts)
    moves = cuts["moves"]["groups"]
    assert sum(group["rows"] for group in moves) == hidden["gbm-hand"]["test_rows"]
    assert all(group["gain"] is None for group in moves if group["rows"] < analysis.SMALLEST_COMPARED)

    src, out = papers.generate(model, smoke=True)
    flags = papers.switches(src, out)
    assert flags["shown"] is True and flags["shownpaired"] is True
    assert out.values["shown.gbm-hand.verdict"] in ("better beyond the noise", "inside the noise", "worse beyond the noise")
    assert out.values["shown.best.there.name"].startswith("\\") and "shown.best.gain.low" in out.values
    assert "95" in out.files["shown"] and {"shown-band", "shown-moves"} <= set(out.files)

    # A run of the same name trained from another config is not the same run, and the look says it left it out.
    record = paths.results(shown, smoke=True) / "constant.json"
    changed = json.loads(record.read_text(encoding="utf-8"))
    changed["config"]["note"] = "another config"
    record.write_text(json.dumps(changed), encoding="utf-8")
    again = analysis.analyse(model, smoke=True)["shown"]
    assert [pair["run"] for pair in again["pairs"]] == ["gbm-hand"] and "different configs" in again["skipped"]["constant"]

    # Two models are set against each other only where they share their rows, their label and their metric.
    plan = paths.model(model) / "analysis.yaml"
    plan.write_text(plan.read_text(encoding="utf-8").replace("shown: puzzle-difficulty", "shown: blunder-hazard"), encoding="utf-8")
    temp_lab.model("blunder-hazard", {})
    with pytest.raises(ValueError, match="do not share their dataset, kind, label, primary"):
        analysis.analyse(model, smoke=True)


def test_a_network_starts_from_the_body_another_run_trained(lab, temp_lab):
    import torch

    small = CONFIGS["transformer-small"]
    init = {"model": "puzzle-difficulty", "run": "transformer-small"}
    started = {**small, "learner": {**small["learner"], "init": init}}
    temp_lab.model(
        "puzzle-difficulty-unsolved",
        {
            "gbm-hand": CONFIGS["gbm-hand"],
            "transformer-small": small,
            "transformer-small-pretrained": {"base": "transformer-small", "learner": {"init": init}},
            "transformer-wide-pretrained": {**started, "learner": {**started["learner"], "dim": 32}},
            "gbm-pretrained": {"learner": {**CONFIGS["gbm-hand"]["learner"], "init": init}},
        },
    )
    model = "puzzle-difficulty-unsolved"
    assert cli.waits_for(model, "transformer-small-pretrained", smoke=True).startswith("starts from puzzle-difficulty/transformer-small")
    assert cli.waits_for(model, "transformer-small", smoke=True) is None
    with pytest.raises(FileNotFoundError, match="train that run here first"):
        runs.run(model, "transformer-small-pretrained", smoke=True, log=lambda _: None)

    runs.run("puzzle-difficulty", "transformer-small", smoke=True, log=lambda _: None)
    assert cli.waits_for(model, "transformer-small-pretrained", smoke=True) is None
    weights = paths.run_files("puzzle-difficulty", "transformer-small", smoke=True) / "model.pt"
    record = runs.run(model, "transformer-small-pretrained", smoke=True, log=lambda _: None)
    taken = record["learner"]["started_from"]
    assert (taken["model"], taken["run"]) == ("puzzle-difficulty", "transformer-small")
    assert taken["sha256"] == hashlib.sha256(weights.read_bytes()).hexdigest()
    assert taken["marks_taken"] == ["en_passant", "setup_from", "setup_to"]
    assert taken["new"] == ["body.context", "head"] and taken["tensors_taken"] > 10
    assert record["config"]["base"] == "transformer-small"
    board = leaderboard.build(model, smoke=True)
    words = {entry["run"]: entry["learner"] for entry in board["runs"]}
    assert words["transformer-small-pretrained"].endswith("started from `puzzle-difficulty/transformer-small`")

    from chess_coach_models.nets.model import build_net
    from chess_coach_models.train.learners.net import start_from

    saved = torch.load(weights, weights_only=False)
    fresh = build_net(small["learner"], marks=3, context=4)
    before = {name: tensor.clone() for name, tensor in fresh.state_dict().items()}
    start_from(fresh, saved, learner=small["learner"], marks=["en_passant", "setup_from", "setup_to"], numbers=["a", "b", "c", "d"])
    after = fresh.state_dict()
    assert torch.equal(after["body.piece.weight"], saved["state"]["body.piece.weight"])
    assert torch.equal(after["body.blocks.0.qkv.weight"], saved["state"]["body.blocks.0.qkv.weight"])
    assert torch.equal(after["body.mark.weight"], saved["state"]["body.mark.weight"][:, :3])
    assert torch.equal(after["head.0.weight"], before["head.0.weight"])
    assert torch.equal(after["body.context.0.weight"], before["body.context.0.weight"])
    reordered = build_net(small["learner"], marks=2, context=len(saved["context"]))
    told = start_from(reordered, saved, learner=small["learner"], marks=["setup_to", "brand_new"], numbers=saved["context"])
    assert told["marks_taken"] == ["setup_to"] and "body.context" not in told["new"]
    assert torch.equal(reordered.state_dict()["body.mark.weight"][:, 0], saved["state"]["body.mark.weight"][:, 2])
    assert torch.equal(reordered.state_dict()["body.context.0.weight"], saved["state"]["body.context.0.weight"])

    with pytest.raises(ValueError, match="differ in dim"):
        runs.run(model, "transformer-wide-pretrained", smoke=True, log=lambda _: None)
    with pytest.raises(ValueError, match="only a network starts"):
        runs.run(model, "gbm-pretrained", smoke=True, log=lambda _: None)


SET_CONFIGS = {
    "gbm-hand": {"learner": {"kind": "gbm", "features": "hand", "rounds": 20, "min_child_samples": 5}},
    "gbm-context": {"learner": {"kind": "gbm", "features": "context", "rounds": 20, "min_child_samples": 5}},
    "constant": {"learner": {"kind": "constant"}},
    "transformer-small": CONFIGS["transformer-small"],
    "conv-small": {
        "learner": {"kind": "net", "body": "conv", "dim": 8, "depth": 1},
        "train": {"epochs": 2, "batch": 32, "lr": 0.01},
    },
}
ROW_METRICS = ["ap", "top1", "log_loss"]


def read_set_predictions(model: str, name: str):
    import numpy as np

    frame = pl.read_parquet(paths.predictions(model, name, smoke=True))
    assert frame.columns == ["key", "group", "band", "y", "p", *ROW_METRICS]
    return frame, np.stack(frame["y"].to_list()), np.stack(frame["p"].to_list())


def test_a_model_that_predicts_squares_runs_scores_and_ranks(lab, temp_lab):
    import numpy as np
    import torch

    from chess_coach_models.encode.squares import SQUARE_HAND, SQUARE_PLAIN

    model = "where-to-look"
    temp_lab.model(model, SET_CONFIGS)
    task = tasks.get(model)
    dataset = store.read_dataset(DATASET)
    solution = [name for name in dataset.manifest["marks"] if name not in task.marks]
    assert task.kind == "squares" and sorted(task.label) == sorted(solution) and len(task.candidates) == 64
    position = [name for group in POSITION_GROUPS for name in GROUPS[group]]
    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in SET_CONFIGS}
    for name, record in records.items():
        assert record["task"]["candidates"] == list(task.candidates) and record["task"]["label"] == list(task.label)
        assert record["task"]["marks"] == list(task.marks) and list(record["test"]) == list(record["valid"]) == ROW_METRICS
        for metric in ROW_METRICS:
            entry = record["test"][metric]
            assert entry["low"] <= entry["value"] <= entry["high"]
        frame, y, p = read_set_predictions(model, name)
        assert y.shape == p.shape == (record["test_rows"], 64) and set(np.unique(y)) == {0, 1}
        assert (y.sum(axis=1) >= 2).all() and ((p > 0) & (p < 1)).all()
        for metric in ROW_METRICS:
            assert frame[metric].mean() == pytest.approx(record["test"][metric]["value"], rel=1e-9)
        assert sum(band["rows"] for band in record["test_by_band"].values()) == record["test_rows"]
        assert sum(row["n"] for row in record["test_calibration"]) == record["test_rows"] * 64
        assert "test_by_candidate" not in record and record["calibration"]["fitted_on"] == "valid"
    # What was right is every square a move of the solution leaves or lands on, and nothing a learner read.
    frame, y, _ = read_set_predictions(model, "gbm-hand")
    test = dataset.split("test")
    assert frame["key"].to_list() == dataset.rows["key"].gather(test).to_list()
    bits = sum(1 << dataset.manifest["marks"].index(name) for name in solution)
    assert np.array_equal(y, (dataset.marks[test] & bits) != 0)
    # The trees read a row a square: the position's numbers, the square, the marks they may see, and with
    # the hand features what a person would count there.
    plain = len(task.context) + len(SQUARE_PLAIN) + len(task.marks)
    assert records["gbm-context"]["learner"]["features"] == plain
    assert records["gbm-hand"]["learner"]["features"] == plain + len(position) + len(SQUARE_HAND)
    allowed = {*task.context, *position, *SQUARE_PLAIN, *SQUARE_HAND, *(f"square_{name}" for name in task.marks)}
    for name in ("gbm-context", "gbm-hand"):
        assert {entry["feature"] for entry in records[name]["learner"]["leans_on"]} <= allowed
    assert records["constant"]["learner"]["shares"].keys() == set(task.candidates)
    # A network gives every square its own logit from the square's vector, and reads none of the solution.
    for name in ("transformer-small", "conv-small"):
        saved = torch.load(paths.run_files(model, name, smoke=True) / "model.pt", weights_only=False)
        assert saved["marks"] == list(task.marks) and saved["candidates"] == list(task.candidates)
        assert saved["context"] == list(task.context)
        dim = SET_CONFIGS[name]["learner"]["dim"]
        assert saved["state"]["head.0.weight"].shape == (dim, dim) and saved["state"]["head.2.weight"].shape == (1, dim)
    assert torch.load(paths.run_files(model, "transformer-small", smoke=True) / "model.pt", weights_only=False)["state"][
        "body.mark.weight"
    ].shape[1] == len(task.marks)
    # Where a square is and what stands on it already beats the same chances for every position.
    scores = {name: record["test"]["ap"]["value"] for name, record in records.items()}
    assert scores["gbm-hand"] > scores["constant"] and scores["gbm-context"] > scores["constant"]
    board = leaderboard.build(model, smoke=True)
    assert [entry["test"]["ap"]["value"] for entry in board["runs"]] == sorted(scores.values(), reverse=True)
    gains = {entry["run"]: entry["gain"] for entry in board["runs"]}
    assert gains["gbm-hand"] is None and gains["constant"]["gain"] == pytest.approx(scores["constant"] - scores["gbm-hand"])
    assert all(gain["low"] <= gain["gain"] <= gain["high"] for gain in gains.values() if gain)
    assert "candidates" not in board and board["calibration"]["run"] == board["runs"][0]["run"]
    text = (paths.results(model, smoke=True) / "leaderboard.md").read_text()
    assert "| Run | Learner | Average precision | First right | Log loss |" in text
    assert "which of 64 squares are right" in text and "LightGBM on a row a square" in text
    assert "each square's share of the training rows" in text and "Every square of every test row" in text
    assert "not compared" not in text and "by itself" not in text
    with pytest.raises(ValueError, match="the closer look reads one number a row"):
        analysis.analyse(model, smoke=True)


def test_trees_that_read_a_row_a_square_ask_for_a_share_of_the_games(lab, temp_lab, monkeypatch):
    from chess_coach_models.train.learners import gbm

    model = "where-to-look"
    temp_lab.model(model, {**SET_CONFIGS, "gbm-hand-tenth": {**SET_CONFIGS["gbm-hand"], "data": {"train_share": 0.5}}})
    monkeypatch.setattr(gbm, "MOST_SQUARE_ROWS", 100 * 64)
    with pytest.raises(ValueError, match="Give the run a share of the training games"):
        runs.run(model, "gbm-hand", smoke=True, log=lambda _: None)
    record = runs.run(model, "gbm-hand-tenth", smoke=True, log=lambda _: None)
    assert record["train_rows"] <= 100 and record["test_rows"] == store.read_dataset(DATASET).manifest["splits"]["test"]


def test_a_model_that_predicts_tags_runs_scores_and_ranks(lab, temp_lab):
    import numpy as np
    import torch

    model = "puzzle-themes"
    temp_lab.model(model, SET_CONFIGS)
    task = tasks.get(model)
    dataset = store.read_dataset(DATASET)
    tags = list(task.candidates)
    assert task.kind == "tags" and task.label == "themes" and len(tags) == len(set(tags)) > 20
    test = dataset.split("test")
    words = [set((themes or "").split()) for themes in dataset.rows["themes"].gather(test).to_list()]
    carried = np.array([[tag in row for tag in tags] for row in words])
    assert carried.any() and not carried.any(axis=1).all()
    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in SET_CONFIGS}
    for name, record in records.items():
        assert record["task"]["candidates"] == tags and record["task"]["label"] == "themes"
        assert "marks" not in record["task"] and list(record["test"]) == ROW_METRICS
        frame, y, p = read_set_predictions(model, name)
        assert np.array_equal(y, carried) and p.shape == y.shape and ((p > 0) & (p < 1)).all()
        # A puzzle with none of the themes has no ranking to score: only the log loss counts it.
        none = ~carried.any(axis=1)
        assert frame["ap"].is_nan().to_numpy().tolist() == none.tolist() == frame["top1"].is_nan().to_numpy().tolist()
        assert not frame["log_loss"].is_nan().any()
        for metric in ROW_METRICS:
            known = frame[metric].to_numpy()
            assert np.nanmean(known) == pytest.approx(record["test"][metric]["value"], rel=1e-9)
            entry = record["test"][metric]
            assert entry["low"] <= entry["value"] <= entry["high"]
        each = record["test_by_candidate"]
        assert list(each) == tags and [each[tag]["rows"] for tag in tags] == carried.sum(axis=0).tolist()
        assert all((each[tag]["pr_auc"] != each[tag]["pr_auc"]) == (each[tag]["rows"] == 0) for tag in tags)
        assert sum(row["n"] for row in record["test_calibration"]) == record["test_rows"] * len(tags)
    # A booster a tag: a tag no training puzzle carries has no trees, and is given no chance.
    train = dataset.split("train")
    seen = {tag for themes in dataset.rows["themes"].gather(train).to_list() for tag in (themes or "").split()}
    trees = records["gbm-hand"]["learner"]["trees_by_tag"]
    assert list(trees) == tags and records["gbm-hand"]["learner"]["trees"] == sum(trees.values())
    assert {tag for tag in tags if trees[tag] == 0} == set(tags) - seen and 0 < len(seen & set(tags)) < len(tags)
    saved = (paths.run_files(model, "gbm-hand", smoke=True) / "model.txt").read_text(encoding="utf-8")
    assert [line[4:] for line in saved.splitlines() if line.startswith("tag ")] == [tag for tag in tags if trees[tag]]
    assert records["gbm-hand"]["learner"]["features"] == len(task.context) + len(dataset.manifest["hand"]) - 1
    assert records["gbm-context"]["learner"]["features"] == len(task.context)
    # A network's head gives the board's vector a logit a tag.
    state = torch.load(paths.run_files(model, "transformer-small", smoke=True) / "model.pt", weights_only=False)
    assert state["candidates"] == tags and state["state"]["head.2.weight"].shape == (len(tags), 16)
    assert state["marks"] == dataset.manifest["marks"]
    scores = {name: record["test"]["ap"]["value"] for name, record in records.items()}
    board = leaderboard.build(model, smoke=True)
    assert [entry["test"]["ap"]["value"] for entry in board["runs"]] == sorted(scores.values(), reverse=True)
    assert board["candidates"]["run"] == board["runs"][0]["run"] and list(board["candidates"]["each"]) == tags
    text = (paths.results(model, smoke=True) / "leaderboard.md").read_text()
    assert f"which of {len(tags)} tags are right" in text and "a LightGBM booster a tag" in text
    assert f"## Each tag by itself, for `{board['runs'][0]['run']}`" in text and "| Tag | Rows | Share | PR-AUC | ROC-AUC |" in text
    assert "each tag's share of the training rows" in text and "| n/a |" in text
    with pytest.raises(ValueError, match="the closer look reads one number a row"):
        analysis.analyse(model, smoke=True)


GAME_CONFIGS = {
    "gbm-hand": {"learner": {"kind": "gbm", "features": "hand", "rounds": 20, "min_child_samples": 5}},
    "constant": {"learner": {"kind": "constant"}},
    "gbm-context": {"learner": {"kind": "gbm", "features": "context", "rounds": 20, "min_child_samples": 5}},
    "conv-small": {
        "learner": {"kind": "net", "body": "conv", "dim": 8, "depth": 1, "over": {"depth": 1, "heads": 2}},
        "train": {"epochs": 2, "batch": 16, "lr": 0.01},
    },
    "transformer-hand": {
        "learner": {"kind": "net", "body": "transformer", "features": "hand", "dim": 16, "depth": 1, "heads": 2},
        "train": {"epochs": 1, "batch": 16, "lr": 0.01},
    },
}
GAMES_RECIPE = {
    "name": "games-test",
    "builder": "game_sides",
    "month": "2026-10",
    "speeds": ["rapid"],
    "min_ply": 3,
    "least_moves": 4,
    "most_moves": 9,
    "games": 70,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}


def played_games(count: int, *, takes: bool = False) -> str:
    """Rated rapid games of random legal moves, each move with an evaluation and a clock, as a month's file holds
    them. With ``takes`` a player takes whenever something can be taken, so which move is played can be learned."""
    import random

    import chess

    rng = random.Random(0)
    games = []
    for number in range(count):
        board = chess.Board()
        clocks = [600, 600]
        moves = []
        for ply in range(rng.randint(14, 30)):
            if board.is_game_over():
                break
            legal = sorted(board.legal_moves, key=lambda found: found.uci())
            move = rng.choice([found for found in legal if board.is_capture(found)] or legal if takes else legal)
            san = board.san(move)
            board.push(move)
            clocks[ply % 2] -= rng.randint(1, 20)
            minutes, seconds = divmod(clocks[ply % 2], 60)
            turn = f"{ply // 2 + 1}. " if ply % 2 == 0 else ""
            moves.append(f"{turn}{san} {{ [%eval {rng.uniform(-3, 3):.2f}] [%clk 0:{minutes:02d}:{seconds:02d}] }}")
        result = rng.choice(["1-0", "0-1", "1/2-1/2"])
        headers = {
            "Event": "Rated Rapid game",
            "Site": f"https://lichess.org/played{number:04d}",
            "Result": result,
            "WhiteElo": str(rng.randint(800, 2300)),
            "BlackElo": str(rng.randint(800, 2300)),
            "TimeControl": rng.choice(["600+0", "600+5", "900+10"]),
            "Termination": "Normal",
        }
        games.append("".join(f'[{key} "{value}"]\n' for key, value in headers.items()) + f"\n{' '.join(moves)} {result}\n\n")
    return "".join(games)


@pytest.fixture()
def players_lab(temp_lab, tmp_path):
    stream = tmp_path / "games.pgn.zst"
    stream.write_bytes(zstandard.ZstdCompressor().compress(played_games(80).encode()))
    temp_lab.recipe("games", GAMES_RECIPE)
    temp_lab.model("game-rating", GAME_CONFIGS)
    cli.build_data("games", smoke=True, source=str(stream), workers=2, rebuild=False)
    return temp_lab


def test_a_model_whose_rows_are_sequences_runs_scores_and_ranks(players_lab):
    import torch

    from chess_coach_models.encode.hand import GAME_FEATURES

    model, task = "game-rating", tasks.get("game-rating")
    dataset = store.read_dataset("games-test-smoke")
    rows, steps = dataset.rows, dataset.steps
    assert dataset.manifest["games_kept"] == 70 and len(rows) == 140
    assert int(rows["steps"].min()) >= 4 and int(rows["steps"].max()) == 9
    assert len(steps.tokens) == int(rows["steps"].sum()) == dataset.manifest["positions"]
    # Both players of a game are rows, and they share a split.
    assert rows.group_by("game_id").agg(pl.col("split").n_unique().alias("splits"), pl.len())["splits"].to_list() == [1] * 70

    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in GAME_CONFIGS}
    for name, record in records.items():
        primary = record["test"][task.primary]
        assert primary["low"] <= primary["value"] <= primary["high"]
        assert record["task"]["steps"] == list(task.steps) and record["task"]["label"] == "player_elo"
        assert record["dataset"]["positions"] == len(steps.tokens)
        assert record["test_rows"] == int((rows["split"] == "test").sum()) == 2 * record["test_groups"]
        predictions = pl.read_parquet(paths.predictions(model, name, smoke=True))
        assert len(predictions) == record["test_rows"]
    assert records["constant"]["gain"] is not None and records["gbm-hand"]["gain"] is None
    assert records["gbm-hand"]["learner"]["features"] == len(task.context) + len(GAME_FEATURES)

    # A saved network says what it read of each position, and how it scaled it.
    saved = torch.load(paths.run_files(model, "conv-small", smoke=True) / "model.pt", weights_only=False)
    assert saved["steps"] == list(task.steps) and saved["most_steps"] == 9
    assert saved["step_mean"].shape == saved["step_spread"].shape == (len(task.steps),)
    assert saved["context"] == list(task.context) and saved["marks"] == dataset.manifest["marks"]
    assert any(name.startswith("body.board.") for name in saved["state"]) and "body.place" in saved["state"]
    with_hand = torch.load(paths.run_files(model, "transformer-hand", smoke=True) / "model.pt", weights_only=False)
    assert with_hand["context"] == [*task.context, *GAME_FEATURES]

    board = leaderboard.build(model, smoke=True)
    scores = [entry["test"][task.primary]["value"] for entry in board["runs"]]
    assert scores == sorted(scores) and {entry["run"] for entry in board["runs"]} == set(GAME_CONFIGS)

    look = analysis.analyse(model, smoke=True)
    assert set(look["runs"]) == set(GAME_CONFIGS) and look["skipped"] == {}
    assert [slice_["key"] for slice_ in look["slices"]][:2] == ["band", "gap"]
    gap = look["slices"][1]
    assert sum(group["rows"] for group in gap["groups"]) == look["test_rows"]
    example = look["examples"]["typical"][0]
    assert set(example["moves"]) == {"last_move", "worst_move"} and "id" not in example
    assert set(example["show"]) == {"opponent_elo", "steps", "base", "increment", "player_score", "loss_mean", "loss_worst", "spent_mean"}


def test_a_network_over_a_game_scores_a_row_the_same_whatever_it_is_scored_with(players_lab):
    """The rows of a batch are filled out to its longest, and a row's score must not depend on its batch."""
    import numpy as np
    import torch

    from chess_coach_models.train import learners

    model = "game-rating"
    runs.run(model, "gbm-hand", smoke=True, log=lambda _: None)
    record = runs.run(model, "transformer-hand", smoke=True, log=lambda _: None)
    dataset = store.read_dataset("games-test-smoke")
    prepared = learners.prepare(tasks.get(model), dataset)
    said = pl.read_parquet(paths.predictions(model, "transformer-hand", smoke=True))
    saved = torch.load(paths.run_files(model, "transformer-hand", smoke=True) / "model.pt", weights_only=False)

    from chess_coach_models.nets.model import build_net

    numbers, names = learners.features(prepared, "hand")
    assert names == saved["context"]
    net = build_net(saved["learner"], marks=len(saved["marks"]), context=len(names), steps=len(saved["steps"]), most=saved["most_steps"])
    net.load_state_dict(saved["state"])
    net.eval()
    shifts = torch.tensor(prepared.mark_channels)
    test = prepared.test
    alone = []
    with torch.no_grad():
        for row in test:
            first, count = int(dataset.rows["first_step"][int(row)]), int(dataset.rows["steps"][int(row)])
            index = torch.arange(first, first + count)
            planes = ((torch.from_numpy(dataset.steps.marks.astype(np.int16))[index].long()[..., None] >> shifts) & 1).float()
            of_step = (dataset.steps.numbers[first : first + count][:, prepared.step_columns] - saved["step_mean"]) / saved["step_spread"]
            context = torch.from_numpy(((numbers[row] - saved["context_mean"]) / saved["context_spread"]).astype(np.float32))
            output = net(
                torch.from_numpy(dataset.steps.tokens)[index].long()[None],
                planes[None],
                torch.from_numpy(of_step.astype(np.float32))[None],
                torch.ones(1, count, dtype=torch.bool),
                context[None],
            )
            alone.append(float(output) * saved["label_spread"] + saved["label_mean"])
    assert record["test_rows"] == len(alone)
    assert np.allclose(said["p"].to_numpy(), np.array(alone), rtol=1e-4, atol=1e-2)


def test_a_network_over_a_game_does_not_start_from_another_run_yet(players_lab):
    model = "game-rating"
    init = {"model": model, "run": "conv-small"}
    players_lab.model(model, {**GAME_CONFIGS, "conv-small-started": {"base": "conv-small", "learner": {"init": init}}})
    runs.run(model, "gbm-hand", smoke=True, log=lambda _: None)
    runs.run(model, "conv-small", smoke=True, log=lambda _: None)
    with pytest.raises(ValueError, match="does not start from another run yet"):
        runs.run(model, "conv-small-started", smoke=True, log=lambda _: None)


MOVE_CONFIGS = {
    "gbm-hand": {"learner": {"kind": "gbm", "features": "hand", "rounds": 20, "min_child_samples": 5}},
    "constant": {"learner": {"kind": "constant"}},
    "gbm-context": {"learner": {"kind": "gbm", "features": "context", "rounds": 20, "min_child_samples": 5}},
    "transformer-small": CONFIGS["transformer-small"],
    "conv-small": {
        "learner": {"kind": "net", "body": "conv", "dim": 8, "depth": 1},
        "train": {"epochs": 2, "batch": 32, "lr": 0.01},
    },
}
POSITIONS_RECIPE = {
    "name": "game-positions-test",
    "builder": "game_positions",
    "month": "2026-10",
    "speeds": ["rapid"],
    "min_ply": 3,
    "per_game": 10,
    "games": 70,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}
POSITIONS = "game-positions-test-smoke"
MOVE_METRICS = ["top1", "top3", "log_loss"]


@pytest.fixture()
def positions_lab(temp_lab, tmp_path):
    stream = tmp_path / "games.pgn.zst"
    stream.write_bytes(zstandard.ZstdCompressor().compress(played_games(80, takes=True).encode()))
    temp_lab.recipe("game-positions", POSITIONS_RECIPE)
    temp_lab.model("human-move", MOVE_CONFIGS)
    cli.build_data("game-positions", smoke=True, source=str(stream), workers=2, rebuild=False)
    return temp_lab


def read_move_predictions(model: str, name: str):
    import numpy as np

    frame = pl.read_parquet(paths.predictions(model, name, smoke=True))
    assert frame.columns == ["key", "group", "band", "y", "p", *MOVE_METRICS]
    return frame, frame["y"].to_numpy(), np.stack(frame["p"].to_list()).astype(np.float64)


def moves_on_the_mover_s_board(fen: str) -> list[tuple[int, str]]:
    """Each legal move of a position as its pair of squares on the mover's own board and its UCI there, worked
    out with the board turned over for Black and none of the lab's own code."""
    import chess

    board = chess.Board(fen)
    seen = board if board.turn else board.mirror()
    return [(move.from_square * 64 + move.to_square, move.uci()) for move in seen.legal_moves]


def test_a_model_that_predicts_the_move_played_runs_scores_and_ranks(positions_lab):
    import chess
    import numpy as np
    import torch

    from chess_coach_models.data import positions
    from chess_coach_models.encode.moves import MOVE_HAND, MOVE_PLAIN

    model, task = "human-move", tasks.get("human-move")
    dataset = store.read_dataset(POSITIONS)
    rows, test = dataset.rows, dataset.split("test")
    assert task.kind == "moves" and task.label == "move" and task.candidates == () and task.primary == "top1"
    fens = rows["fen"].gather(test).to_list()
    pairs = [sorted({pair for pair, _ in moves_on_the_mover_s_board(fen)}) for fen in fens]
    counts = np.array([len(found) for found in pairs])
    records = {name: runs.run(model, name, smoke=True, log=lambda _: None) for name in MOVE_CONFIGS}
    for name, record in records.items():
        assert record["task"]["kind"] == "moves" and record["task"]["label"] == "move"
        assert "candidates" not in record["task"] and list(record["test"]) == list(record["valid"]) == MOVE_METRICS
        for metric in MOVE_METRICS:
            entry = record["test"][metric]
            assert entry["low"] <= entry["value"] <= entry["high"]
        frame, y, p = read_move_predictions(model, name)
        held = ~np.isnan(p)
        # A chance for each move the row's position allows, from the row's start, and no number after them.
        assert held.sum(axis=1).tolist() == counts.tolist()
        assert all(held[row, :count].all() for row, count in enumerate(counts.tolist()))
        assert np.allclose(np.nansum(p, axis=1), 1.0, atol=1e-5) and (p[held] > 0).all() and (y < counts).all()
        for metric in MOVE_METRICS:
            assert frame[metric].mean() == pytest.approx(record["test"][metric]["value"], rel=1e-9)
        assert sum(band["rows"] for band in record["test_by_band"].values()) == record["test_rows"] == len(test)
        assert sum(row["n"] for row in record["test_calibration"]) == int(counts.sum())
        assert record["test_candidates"] == {"mean": pytest.approx(counts.mean()), "most": int(counts.max())}
        calibration = record["calibration"]
        assert calibration["fitted_on"] == "valid" and 0.05 <= calibration["temperature"] <= 20
        assert set(calibration["log_loss_before"]) == {"valid", "test"} and "test_by_candidate" not in record
    # One temperature moves no move past another: the same chance for every move stays what it was.
    assert records["constant"]["calibration"]["log_loss_before"]["test"] == pytest.approx(
        records["constant"]["test"]["log_loss"]["value"]
    )
    assert records["constant"]["test"]["top1"]["value"] == pytest.approx(float((1 / counts).mean()))
    assert records["constant"]["learner"]["legal_moves"]["most"] >= int(counts.max())
    # What was right is the move the row's game played: its place among the position's moves, in rising
    # order of the two squares on the mover's own board.
    frame, y, _ = read_move_predictions(model, "gbm-hand")
    assert frame["key"].to_list() == rows["key"].gather(test).to_list()
    for fen, uci, place, found in zip(fens, rows["move"].gather(test).to_list(), y.tolist(), pairs):
        board = chess.Board(fen)
        move = chess.Move.from_uci(uci)
        flip = 0 if board.turn else 56
        assert found[place] == (move.from_square ^ flip) * 64 + (move.to_square ^ flip)
    # The trees read a row a legal move: the position's numbers, the move's own, the marks on both of its
    # squares, and with the hand features what a person would count of the move.
    marks = dataset.manifest["marks"]
    plain = len(task.context) + len(MOVE_PLAIN) + 2 * len(marks)
    position = [name for name in positions.HAND if name not in task.context]
    assert records["gbm-context"]["learner"]["features"] == plain
    assert records["gbm-hand"]["learner"]["features"] == plain + len(position) + len(MOVE_HAND)
    allowed = {*task.context, *position, *MOVE_PLAIN, *MOVE_HAND, *(f"{side}_{name}" for side in ("from", "to") for name in marks)}
    for name in ("gbm-context", "gbm-hand"):
        assert {entry["feature"] for entry in records[name]["learner"]["leans_on"]} <= allowed
    # A network gives every pair of squares a logit from the two squares' vectors.
    for name in ("transformer-small", "conv-small"):
        saved = torch.load(paths.run_files(model, name, smoke=True) / "model.pt", weights_only=False)
        assert saved["marks"] == marks and saved["context"] == list(task.context)
        dim = MOVE_CONFIGS[name]["learner"]["dim"]
        assert saved["state"]["leave.weight"].shape == saved["state"]["reach.weight"].shape == (dim, dim)
        assert not any(name.startswith("head.") for name in saved["state"])
    # The players of these games take whenever they can, and a move that takes is a number the trees read.
    scores = {name: record["test"]["top1"]["value"] for name, record in records.items()}
    assert scores["gbm-hand"] > 2 * scores["constant"] and scores["gbm-context"] > 2 * scores["constant"]
    board = leaderboard.build(model, smoke=True)
    assert [entry["test"]["top1"]["value"] for entry in board["runs"]] == sorted(scores.values(), reverse=True)
    gains = {entry["run"]: entry["gain"] for entry in board["runs"]}
    assert gains["gbm-hand"] is None and gains["constant"]["gain"] == pytest.approx(scores["constant"] - scores["gbm-hand"])
    assert all(gain["low"] <= gain["gain"] <= gain["high"] for gain in gains.values() if gain)
    assert "candidates" not in board and board["calibration"]["run"] == board["runs"][0]["run"]
    text = (paths.results(model, smoke=True) / "leaderboard.md").read_text()
    assert "| Run | Learner | First right | In the first three | Log loss |" in text
    assert "**A row's answer is a move:**" in text and "LightGBM on a row a legal move" in text
    assert "the same chance for every legal move" in text and "Every legal move of every test row" in text
    assert "not compared" not in text and "by itself" not in text
    with pytest.raises(ValueError, match="the closer look reads one number a row"):
        analysis.analyse(model, smoke=True)


def test_trees_that_read_a_row_a_legal_move_ask_for_a_share_of_the_games(positions_lab, monkeypatch):
    from chess_coach_models.encode.moves import moves_of
    from chess_coach_models.train.learners import gbm

    model = "human-move"
    positions_lab.model(model, {**MOVE_CONFIGS, "gbm-hand-half": {**MOVE_CONFIGS["gbm-hand"], "data": {"train_share": 0.5}}})
    dataset = store.read_dataset(POSITIONS)
    train = dataset.split("train")
    every = int((moves_of(dataset)[train] >= 0).sum())
    monkeypatch.setattr(gbm, "MOST_MOVE_ROWS", int(0.9 * every))
    with pytest.raises(ValueError, match="Give the run a share of the training games"):
        runs.run(model, "gbm-hand", smoke=True, log=lambda _: None)
    record = runs.run(model, "gbm-hand-half", smoke=True, log=lambda _: None)
    assert record["train_rows"] < len(train) and record["test_rows"] == dataset.manifest["splits"]["test"]


def a_stand_in_for_maia(monkeypatch):
    """A package that stands where ``maia2`` would: its list of moves, its board turned to the mover's side, its
    rating bands, and a network whose logits are a known function of the move, the two bands and the men on
    the board. ``from_pretrained`` writes the files the published model's download leaves."""
    import sys
    import types
    from importlib import metadata
    from importlib.machinery import ModuleSpec

    import chess
    import torch

    files = "abcdefgh"
    known = [f"{chess.square_name(a)}{chess.square_name(b)}" for a in range(64) for b in range(64) if a != b]
    # A promotion's four choices are four moves of the list, as they are in Maia-2's own.
    known += [
        f"{files[a]}7{files[b]}8{piece}" for a in range(8) for b in range(8) if abs(a - b) <= 1 for piece in "qrbn"
    ]
    places = {uci: place for place, uci in enumerate(known)}

    def band(rating: int) -> int:
        return (min(max(int(rating), 1000), 2099) - 1000) // 100

    def logit(uci: str, men: int, own: int, other: int) -> float:
        import math

        place = places[uci]
        return math.sin(place * (1 + band(own))) + math.cos(0.37 * place + band(other)) + math.sin(0.11 * place * men)

    class Net(torch.nn.Module):
        def __init__(self):
            super().__init__()
            self.weight = torch.nn.Parameter(torch.zeros(1))

        def forward(self, boards, own, other):
            place = torch.arange(len(known), dtype=torch.float64)[None, :]
            own, other, men = own[:, None].double(), other[:, None].double(), boards.double()
            logits = torch.sin(place * (1 + own)) + torch.cos(0.37 * place + other) + torch.sin(0.11 * place * men)
            return logits.float(), None, None

    def prepare():
        return places, "bands", {place: uci for uci, place in places.items()}

    def preprocessing(fen, own, other, ratings, moves):
        assert ratings == "bands" and moves is places
        board = chess.Board(fen)
        seen = board if board.turn else board.mirror()
        legal = torch.zeros(len(known))
        legal[[places[move.uci()] for move in seen.legal_moves]] = 1
        return torch.tensor([float(len(seen.piece_map()))]), band(own), band(other), legal

    def from_pretrained(type, device, save_root):
        folder = Path(save_root)
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "config.yaml").write_text("start_year: 2018\nstart_month: 5\nend_year: 2023\nend_month: 11\n")
        (folder / f"{type}_model.pt").write_bytes(b"stand-in weights")
        return Net()

    package = types.ModuleType("maia2")
    package.__spec__ = ModuleSpec("maia2", None)
    package.model = types.ModuleType("maia2.model")
    package.model.from_pretrained = from_pretrained
    package.inference = types.ModuleType("maia2.inference")
    package.inference.prepare, package.inference.preprocessing = prepare, preprocessing
    for name, module in (("maia2", package), ("maia2.model", package.model), ("maia2.inference", package.inference)):
        monkeypatch.setitem(sys.modules, name, module)
    real = metadata.version
    monkeypatch.setattr(metadata, "version", lambda name: "0.0+stand-in" if name == "maia2" else real(name))
    return logit


def chances_by_hand(logit, fen: str, own: int, other: int, most: int):
    """What the stand-in's network gives each candidate of a position: its chances over the moves the position
    allows, a promotion's four choices added, in rising order of the two squares on the mover's own board."""
    import chess
    import numpy as np

    found = moves_on_the_mover_s_board(fen)
    men = len(chess.Board(fen).piece_map())
    logits = np.array([logit(uci, men, own, other) for _, uci in found])
    chances = np.exp(logits - logits.max())
    chances /= chances.sum()
    by_pair: dict[int, float] = {}
    for (pair, _), chance in zip(found, chances.tolist()):
        by_pair[pair] = by_pair.get(pair, 0.0) + chance
    out = np.full(most, np.nan)
    out[: len(by_pair)] = [by_pair[pair] for pair in sorted(by_pair)]
    return out


MAIA_CONFIGS = {
    **MOVE_CONFIGS,
    "maia2": {
        "needs": "maia2",
        "learner": {"kind": "maia2", "type": "rapid", "player": "mover_elo", "against": "opponent_elo"},
    },
    "maia2-one-rating": {"base": "maia2", "study": "ratings", "learner": {"player": 1500, "against": 1500}},
}


def test_the_published_model_is_a_run_scored_on_the_same_rows_with_nothing_fitted_but_a_temperature(
    positions_lab, monkeypatch
):
    import numpy as np

    logit = a_stand_in_for_maia(monkeypatch)
    model = "human-move"
    positions_lab.model(model, MAIA_CONFIGS)
    assert cli.waits_for(model, "maia2", smoke=True) is None
    dataset = store.read_dataset(POSITIONS)
    rows, test = dataset.rows, dataset.split("test")
    told = {
        "maia2": (rows["mover_elo"].gather(test).to_list(), rows["opponent_elo"].gather(test).to_list()),
        "maia2-one-rating": ([1500] * len(test), [1500] * len(test)),
    }
    fens = rows["fen"].gather(test).to_list()
    reference = runs.run(model, "gbm-hand", smoke=True, log=lambda _: None)
    raw = {}
    for name, (own, other) in told.items():
        record = runs.run(model, name, smoke=True, log=lambda _: None)
        frame, y, p = read_move_predictions(model, name)
        by_hand = np.stack([chances_by_hand(logit, *row, p.shape[1]) for row in zip(fens, own, other)])
        raw[name] = by_hand
        # The record keeps the log loss of the published model's own chances, before the one temperature.
        before = record["calibration"]["log_loss_before"]["test"]
        assert before == pytest.approx(float(np.mean(-np.log(by_hand[np.arange(len(y)), y]))), rel=1e-6)
        heat = record["calibration"]["temperature"]
        assert np.allclose(p, calibration.temper(by_hand, heat), atol=1e-5, equal_nan=True)
        # The temperature moves no move past another.
        assert record["test"]["top1"]["value"] == pytest.approx(float(runs.row_scores("moves", y, by_hand)[:, 0].mean()))
        assert record["learner"]["published"] == {
            "package": "maia2 0.0+stand-in",
            "model": "rapid",
            "weights_sha256": hashlib.sha256(b"stand-in weights").hexdigest(),
            "games_from": "2018-05",
            "games_to": "2023-11",
        }
        assert record["learner"]["parameters"] == 1 and record["learner"]["device"] == "cpu"
        assert record["gain"]["reference"] == "gbm-hand" and record["test_rows"] == reference["test_rows"]
    assert json.loads((paths.results(model, smoke=True) / "maia2.json").read_text())["learner"]["reads"] == ["mover_elo", "opponent_elo"]
    assert json.loads((paths.results(model, smoke=True) / "maia2-one-rating.json").read_text())["learner"]["reads"] == [1500, 1500]
    # The two ratings are read: told that everyone is rated 1500, the model says something else.
    assert not np.allclose(raw["maia2"], raw["maia2-one-rating"], atol=1e-3, equal_nan=True)
    board = leaderboard.build(model, smoke=True)
    assert {entry["run"] for entry in board["runs"]} == {"gbm-hand", "maia2"}
    assert [entry["run"] for entry in board["studies"]["ratings"]] == ["maia2-one-rating"]
    assert board["studies"]["ratings"][0]["base"] == "maia2"
    text = (paths.results(model, smoke=True) / "leaderboard.md").read_text()
    assert "Maia-2 as published, its rapid model: nothing is fitted here" in text
    assert "told both players are rated 1500" not in text.split("## Studies")[0]
    assert "by their two intervals, with no paired difference" in text and "under `pairs`" not in text


def test_a_run_of_the_published_model_waits_for_its_package(positions_lab, monkeypatch):
    import importlib.util

    positions_lab.model("human-move", MAIA_CONFIGS)
    with monkeypatch.context() as patch:
        patch.setattr(importlib.util, "find_spec", lambda name: None)
        assert cli.waits_for("human-move", "maia2", smoke=True) == "needs the maia2 package, which is not installed here"
        assert cli.waits_for("human-move", "gbm-hand", smoke=True) is None


def test_the_published_model_s_four_promotions_are_one_candidate_and_black_is_read_from_its_own_side(temp_lab, monkeypatch):
    import numpy as np

    from chess_coach_models.encode.moves import legal_pairs
    from chess_coach_models.train.learners import maia

    logit = a_stand_in_for_maia(monkeypatch)
    # A pawn a step from promoting, and the same position with the colours changed and Black to move.
    fens = ["8/P6k/8/8/8/8/8/K7 w - - 0 1", "8/6k1/8/8/8/8/8/K7 w - - 0 1", "k7/8/8/8/8/8/p6K/8 b - - 0 1"]
    candidates = legal_pairs(fens)
    net = maia.published("rapid", "cpu")
    said = maia.read(net, fens, [1200, 1900, 1200], [1750, 1100, 1750], candidates)
    by_hand = np.stack([chances_by_hand(logit, *row, candidates.shape[1]) for row in zip(fens, [1200, 1900, 1200], [1750, 1100, 1750])])
    assert np.allclose(said, by_hand, atol=1e-9, equal_nan=True)
    assert np.allclose(said[0], said[2], atol=1e-12, equal_nan=True)
    # The pawn's step to the last rank is one candidate, the pair a7 to a8, holding all four choices' chances.
    promotion = candidates[0].tolist().index(48 * 64 + 56)
    four = np.array([logit(f"a7a8{piece}", 3, 1200, 1750) for piece in "qrbn"])
    others = np.array([logit(uci, 3, 1200, 1750) for _, uci in moves_on_the_mover_s_board(fens[0])])
    assert said[0, promotion] == pytest.approx(float(np.exp(four).sum() / np.exp(others).sum()))
    # A row whose candidates are another position's is refused.
    with pytest.raises(ValueError, match="are not the position's candidates"):
        maia.read(net, fens[:1], [1200], [1750], candidates[1:2])


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
