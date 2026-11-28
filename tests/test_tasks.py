"""A model's task and its analysis plan, read from its folder."""

import json

import pytest
import yaml

from chess_coach_models import data, paths, tasks
from chess_coach_models.encode.hand import GROUPS
from chess_coach_models.evals import analysis
from chess_coach_models.evals.metrics import METRICS


RELEASES = "https://github.com/Aneesh-Pothuru/chess-coach-models/releases/download"

TASK = {
    "dataset": "puzzles",
    "kind": "regression",
    "label": "rating",
    "unit": "rating points",
    "primary": "rmse",
    "reference": "gbm-hand",
    "context": ["solver_moves"],
}


def write_task(root, name, task):
    folder = root / "models" / name
    folder.mkdir(parents=True)
    (folder / "task.yaml").write_text(yaml.safe_dump(task), encoding="utf-8")


def test_every_model_with_a_task_has_the_runs_a_leaderboard_needs():
    assert tasks.names() == sorted(path.parent.name for path in paths.models().glob("*/task.yaml"))
    assert tasks.names()
    for name in tasks.names():
        task = tasks.get(name)
        assert task.name == name and task.primary in METRICS[task.kind]
        assert (paths.recipes() / f"{task.dataset}.yaml").exists()
        runs = {path.stem for path in paths.configs(name).glob("*.yaml")}
        assert {"constant", task.reference} <= runs
        assert (paths.model(name) / "README.md").exists()


def test_a_task_is_read_from_its_folder(temp_lab):
    write_task(temp_lab.root, "tiny", {**TASK, "band": "level"})
    task = tasks.get("tiny")
    assert tasks.names() == ["tiny"]
    assert (task.dataset, task.label, task.context, task.band) == ("puzzles", "rating", ("solver_moves",), "level")
    assert task.lower_is_better and task.better(1.0, 2.0)


def test_a_task_names_everything_and_nothing_else(temp_lab):
    write_task(temp_lab.root, "short", {key: value for key, value in TASK.items() if key != "label"})
    with pytest.raises(ValueError, match="it lacks label"):
        tasks.get("short")
    write_task(temp_lab.root, "long", {**TASK, "colour": "blue"})
    with pytest.raises(ValueError, match="it has colour"):
        tasks.get("long")
    with pytest.raises(KeyError, match="no task named"):
        tasks.get("absent")


def test_a_model_is_in_the_lab_for_its_answer_unless_its_task_says_its_body(temp_lab):
    write_task(temp_lab.root, "asked", TASK)
    write_task(temp_lab.root, "lender", {**TASK, "purpose": "body"})
    assert (tasks.get("asked").purpose, tasks.get("lender").purpose) == ("answer", "body")
    write_task(temp_lab.root, "odd", {**TASK, "purpose": "fun"})
    with pytest.raises(ValueError, match="for its answer or its body, not 'fun'"):
        tasks.get("odd")


def test_a_model_the_lab_has_for_its_body_is_one_some_other_model_s_run_starts_from():
    lenders = {name for name in tasks.names() if tasks.get(name).purpose == "body"}
    started = set()
    for name in tasks.names():
        for path in paths.configs(name).glob("*.yaml"):
            init = ((yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("learner") or {}).get("init")
            if init and init["model"] != name:
                started.add(init["model"])
    assert lenders <= started


def test_a_task_is_ranked_by_a_metric_of_its_kind(temp_lab):
    write_task(temp_lab.root, "odd", {**TASK, "kind": "ranking"})
    with pytest.raises(ValueError, match="kind is one of"):
        tasks.get("odd")
    write_task(temp_lab.root, "mixed", {**TASK, "primary": "log_loss"})
    with pytest.raises(ValueError, match="ranked by one of"):
        tasks.get("mixed")


def test_a_task_can_keep_marks_and_hand_features_from_its_learners(temp_lab):
    write_task(temp_lab.root, "open", TASK)
    assert (tasks.get("open").marks, tasks.get("open").hand) == (None, None)
    write_task(temp_lab.root, "hidden", {**TASK, "marks": ["en_passant"], "hand": ["material", "kings"]})
    assert (tasks.get("hidden").marks, tasks.get("hidden").hand) == (("en_passant",), ("material", "kings"))
    write_task(temp_lab.root, "odd", {**TASK, "hand": ["material", "weather"]})
    with pytest.raises(ValueError, match="not weather"):
        tasks.get("odd")


def test_a_task_whose_answer_is_a_set_says_where_the_set_is(temp_lab):
    squares = {**TASK, "kind": "squares", "primary": "ap", "label": ["solver1_from", "solver1_to"], "marks": ["en_passant"]}
    write_task(temp_lab.root, "squares", squares)
    task = tasks.get("squares")
    assert task.label == ("solver1_from", "solver1_to") and task.tags is None
    assert len(task.candidates) == 64 and task.candidates[:2] == ("a1", "b1") and task.candidates[-1] == "h8"
    assert not task.lower_is_better and task.better(0.6, 0.5)
    write_task(temp_lab.root, "one-column", {**squares, "label": "rating"})
    with pytest.raises(ValueError, match="names, as its label, the marks"):
        tasks.get("one-column")
    write_task(temp_lab.root, "shown", {**squares, "marks": ["en_passant", "solver1_to"]})
    with pytest.raises(ValueError, match="solver1_to is both"):
        tasks.get("shown")
    write_task(temp_lab.root, "open", {key: value for key, value in squares.items() if key != "marks"})
    with pytest.raises(ValueError, match="names the marks its learners may read"):
        tasks.get("open")
    tags = {**TASK, "kind": "tags", "primary": "ap", "label": "themes", "tags": ["fork", "pin"]}
    write_task(temp_lab.root, "tags", tags)
    assert tasks.get("tags").candidates == ("fork", "pin") and tasks.get("tags").label == "themes"
    for name, change, message in (
        ("untagged", {"tags": None}, "names its tags when"),
        ("single", {"tags": ["fork"]}, "at least two, each once"),
        ("twice", {"tags": ["fork", "fork"]}, "at least two, each once"),
        ("listed", {"label": ["themes"]}, "label is one column"),
    ):
        write_task(temp_lab.root, name, {key: value for key, value in {**tags, **change}.items() if value is not None})
        with pytest.raises(ValueError, match=message):
            tasks.get(name)
    write_task(temp_lab.root, "tagged", {**TASK, "tags": ["fork", "pin"]})
    with pytest.raises(ValueError, match="names its tags when"):
        tasks.get("tagged")
    assert tasks.get("squares").kind in METRICS and tasks.Task(**{**tasks.get("tags").__dict__, "kind": "regression", "tags": None}).candidates == ()


def test_a_task_that_predicts_the_move_played_names_its_column(temp_lab):
    moves = {**TASK, "dataset": "game-positions", "kind": "moves", "primary": "top1", "label": "move", "context": ["mover_elo"]}
    write_task(temp_lab.root, "moves", moves)
    task = tasks.get("moves")
    assert task.kind == "moves" and task.label == "move" and task.candidates == () and task.tags is None
    assert not task.lower_is_better and task.better(0.5, 0.4)
    assert list(METRICS["moves"]) == ["top1", "top3", "log_loss"]
    for name, change, message in (
        ("listed", {"label": ["move"]}, "label is one column"),
        ("ranked", {"primary": "ap"}, "ranked by one of top1, top3, log_loss"),
        ("tagged", {"tags": ["fork", "pin"]}, "names its tags when"),
        ("scaled", {"scale": "log1p"}, "only a quantity has a scale"),
    ):
        write_task(temp_lab.root, name, {**moves, **change})
        with pytest.raises(ValueError, match=message):
            tasks.get(name)
    write_task(temp_lab.root, "by-loss", {**moves, "primary": "log_loss"})
    assert tasks.get("by-loss").lower_is_better


def test_a_run_that_changes_another_names_a_run_the_model_has():
    for name in tasks.names():
        configs = {path.stem: yaml.safe_load(path.read_text(encoding="utf-8")) for path in paths.configs(name).glob("*.yaml")}
        for run, config in configs.items():
            assert "study" not in config or "base" in config, (name, run)
            assert config.get("base", run) in configs, (name, run)
            assert set(config.get("learner", {}).get("without", [])) <= set(GROUPS), (name, run)
            assert 0 < config.get("data", {}).get("train_share", 0.5) < 1, (name, run)
            # A run that trains on a larger build names one of its own task's dataset.
            more = config.get("data", {}).get("train_on")
            assert more is None or data.larger_of(more) == tasks.get(name).dataset, (name, run)


def test_every_colab_plan_names_models_and_runs_the_lab_has():
    plans = sorted((paths.ROOT / "colab" / "plans").glob("*.yaml"))
    assert plans
    for plan in plans:
        for name, asked in yaml.safe_load(plan.read_text(encoding="utf-8")).items():
            assert name in tasks.names(), (plan.name, name)
            if not asked:
                continue
            configs = {path.stem: yaml.safe_load(path.read_text(encoding="utf-8")) for path in paths.configs(name).glob("*.yaml")}
            studies = {config.get("study") for config in configs.values()} - {None}
            runs = asked.split(",")
            for run in runs:
                known = run.removeprefix("study:") in studies if run.startswith("study:") else run in configs
                assert known, (plan.name, name, run)
            # Every other run is compared with the reference trained on the same machine, so it comes first.
            assert runs[0] == tasks.get(name).reference and len(set(runs)) == len(runs), (plan.name, name)


def test_what_the_lab_says_it_has_published_is_what_the_run_s_record_names():
    for name in tasks.names():
        listed = paths.model(name) / "published.yaml"
        if not listed.exists():
            continue
        for run, entry in yaml.safe_load(listed.read_text(encoding="utf-8")).items():
            record = json.loads((paths.results(name) / f"{run}.json").read_text(encoding="utf-8"))
            (weights,) = [file for file in record["weights"] if file["file"] == "model.pt"]
            assert (entry["bytes"], entry["sha256"]) == (weights["bytes"], weights["sha256"]), (name, run)
            # A release of the lab's own repository, by a tag: what is there does not change under a run.
            assert entry["url"].startswith(f"{RELEASES}/"), (name, run)


def test_a_larger_build_of_a_dataset_changes_only_how_much_of_the_source_it_keeps():
    larger = {path.stem: data.larger_of(path.stem) for path in paths.recipes().glob("*.yaml")}
    assert {name: other for name, other in larger.items() if other} == {
        "puzzles-all": "puzzles",
        "game-positions-120k": "game-positions",
        "games-200k": "games",
        "tactics-all": "tactics",
        "masters-classical-all": "masters-classical",
    }
    for name, other in larger.items():
        if other is None:
            continue
        # The small sample a check runs on is a larger build of the other's small sample too.
        assert data.larger_of(name, smoke=True) == other
        ours, theirs = data.recipe(name), data.recipe(other)
        assert ours["name"] != theirs["name"] and ours["split"] == theirs["split"]
        assert any(ours[size] > theirs[size] for size in data.SIZES if size in ours and size in theirs), name
        assert all(ours[size] >= theirs[size] for size in data.SIZES if size in ours and size in theirs), name
        small_ours, small_theirs = data.recipe(name, smoke=True), data.recipe(other, smoke=True)
        assert all(small_ours[size] >= small_theirs[size] for size in data.SIZES if size in small_ours and size in small_theirs), name
        assert any(small_ours[size] > small_theirs[size] for size in data.SIZES if size in small_ours and size in small_theirs), name


def test_every_analysis_plan_asks_for_things_the_analysis_knows():
    for name in tasks.names():
        plan = analysis.plan(name)
        assert set(plan) <= {"band", "describe", "label", "within", "slices", "grids", "examples", "pairs", "shown"}, name
        cuts = plan.get("slices", []) + [side for grid in plan.get("grids", []) for side in (grid["rows"], grid["columns"])]
        for cut in cuts:
            assert sum(kind in cut for kind in ("values", "edges", "tags")) == 1, (name, cut)
            assert len(cut.get("labels", cut.get("values", []))) == len(cut.get("values", [])), (name, cut)
        keys = ["band"] + [cut["key"] for cut in plan.get("slices", [])]
        assert len(keys) == len(set(keys)), name
        grids = [grid["key"] for grid in plan.get("grids", [])]
        assert len(grids) == len(set(grids)), name
        runs = {path.stem for path in paths.configs(name).glob("*.yaml")}
        for pair in plan.get("pairs", []):
            assert len(pair) == 2 and pair[0] != pair[1] and set(pair) <= runs, (name, pair)


def test_a_model_read_against_one_that_is_shown_more_asks_the_same_of_the_same_rows():
    read = [name for name in tasks.names() if analysis.plan(name).get("shown")]
    assert "puzzle-difficulty-unsolved" in read
    for name in read:
        other = analysis.plan(name)["shown"]
        here, there = tasks.get(name), tasks.get(other)
        assert other != name
        assert all(getattr(here, part) == getattr(there, part) for part in analysis.SHARED), name
        # What is hidden is hidden by the task, which names the marks or the hand features its learners may read.
        assert here.marks is not None or here.hand is not None, name
        # A run of the same name is the same run in both, so the two differ only in what the task shows.
        ours = {path.name: yaml.safe_load(path.read_text(encoding="utf-8")) for path in paths.configs(name).glob("*.yaml")}
        theirs = {path.name: yaml.safe_load(path.read_text(encoding="utf-8")) for path in paths.configs(other).glob("*.yaml")}
        both = set(ours) & set(theirs)
        assert {"constant.yaml", "gbm-hand.yaml"} <= both, name
        assert all(ours[run] == theirs[run] for run in both), (name, [run for run in both if ours[run] != theirs[run]])


def test_a_model_without_a_plan_is_asked_nothing_more(temp_lab):
    write_task(temp_lab.root, "tiny", TASK)
    assert analysis.plan("tiny") == {}
