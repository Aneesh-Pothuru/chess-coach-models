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
