"""A model's task and its analysis plan, read from its folder."""

import pytest
import yaml

from chess_coach_models import paths, tasks
from chess_coach_models.encode.hand import GROUPS
from chess_coach_models.evals import analysis
from chess_coach_models.evals.metrics import METRICS


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


def test_a_run_that_changes_another_names_a_run_the_model_has():
    for name in tasks.names():
        configs = {path.stem: yaml.safe_load(path.read_text(encoding="utf-8")) for path in paths.configs(name).glob("*.yaml")}
        for run, config in configs.items():
            assert "study" not in config or "base" in config, (name, run)
            assert config.get("base", run) in configs, (name, run)
            assert set(config.get("learner", {}).get("without", [])) <= set(GROUPS), (name, run)
            assert 0 < config.get("data", {}).get("train_share", 0.5) < 1, (name, run)


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
        assert all(getattr(here, part) == getattr(there, part) for part in ("dataset", "kind", "label", "primary")), name
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
