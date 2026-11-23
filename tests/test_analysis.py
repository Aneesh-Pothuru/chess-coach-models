"""The closer look at a model's results: its groups, its tables, and which predictions it will read."""

import json

import numpy as np
import polars as pl
import pytest

from chess_coach_models import paths, tasks
from chess_coach_models.data import store
from chess_coach_models.evals import analysis
from chess_coach_models.evals.metrics import METRICS


ROWS = 2_000


def a_task(kind: str) -> tasks.Task:
    primary = "log_loss" if kind == "binary" else "rmse"
    label = "found" if kind == "binary" else "rating"
    return tasks.Task(name="tiny", dataset="tiny", kind=kind, label=label, unit="a unit", context=(), primary=primary, reference="gbm-hand")


def a_dataset() -> store.Dataset:
    rng = np.random.default_rng(0)
    level = rng.integers(0, 4, size=ROWS)
    rows = pl.DataFrame(
        {
            "key": [f"row{index:05d}" for index in range(ROWS)],
            "game_id": [f"game{index // 2:05d}" for index in range(ROWS)],
            "fen": ["8/8/8/8/8/8/8/K6k w - - 0 1"] * ROWS,
            "line": ["a1a2 h1h2"] * ROWS,
            "level": level,
            "clock": rng.uniform(0, 600, size=ROWS),
            "themes": [" ".join(tag for tag, bit in (("fork", 1), ("pin", 2)) if value & bit) for value in level],
            "band": np.where(level < 2, "<1000", "1000-1399"),
            "rating": 1000.0 + 200.0 * level + rng.normal(0, 50, size=ROWS),
            "found": (rng.random(ROWS) < 0.2 + 0.2 * level).astype(np.int64),
            "split": np.where(np.arange(ROWS) % 4 == 0, "test", "train"),
        }
    )
    empty = np.zeros((ROWS, 64), dtype=np.uint8)
    return store.Dataset(name="tiny", rows=rows, tokens=empty, marks=empty.astype(np.uint16), manifest={"group": "game_id"})


def a_look(kind: str) -> analysis.Look:
    task, dataset = a_task(kind), a_dataset()
    y = dataset.rows[task.label].to_numpy().astype(np.float64)
    test = dataset.split("test")
    level = dataset.rows["level"].to_numpy()[test]
    rng = np.random.default_rng(1)
    if kind == "binary":
        sharp, blunt = 0.2 + 0.2 * level, np.full(len(test), y[test].mean())
    else:
        sharp, blunt = 1000.0 + 200.0 * level, 1000.0 + 200.0 * level + rng.normal(0, 150, size=len(test))
    return analysis.Look(
        task=task,
        dataset=dataset,
        y=y,
        test=test,
        games=dataset.rows["game_id"].to_numpy()[test],
        predictions={"net": sharp, "gbm-hand": blunt},
    )


def test_groups_are_named_by_their_values_their_edges_or_their_tags():
    rows = a_dataset().rows
    named = analysis.groups(rows, {"column": "level", "values": [0, 1], "labels": ["none", "one"], "rest": "more"})
    assert [name for name, _ in named] == ["none", "one", "more"]
    assert sum(int(mask.sum()) for _, mask in named) == ROWS
    cut = analysis.groups(rows, {"column": "clock", "edges": [60, 300]})
    assert [name for name, _ in cut] == ["<60", "60-300", "300+"]
    assert sum(int(mask.sum()) for _, mask in cut) == ROWS
    clock = rows["clock"].to_numpy()
    assert bool(((clock >= 60) & (clock < 300) == cut[1][1]).all())
    # An edge below zero: no dash beside a minus sign.
    around = analysis.groups(rows.with_columns(gap=rows["clock"] - 300), {"column": "gap", "edges": [-100, -50, 0, 50]})
    assert [name for name, _ in around] == ["<-100", "-100 to -50", "-50 to 0", "0-50", "50+"]
    assert sum(int(mask.sum()) for _, mask in around) == ROWS
    tagged = analysis.groups(rows, {"column": "themes", "tags": 1})
    assert len(tagged) == 1 and tagged[0][0] in ("fork", "pin")
    both = dict(analysis.groups(rows, {"column": "themes", "tags": 5}))
    assert set(both) == {"fork", "pin"}
    assert int((both["fork"] & both["pin"]).sum()) == int((rows["level"].to_numpy() == 3).sum())
    with pytest.raises(ValueError, match="values"):
        analysis.groups(rows, {"column": "level"})


@pytest.mark.parametrize("kind", ["binary", "regression"])
def test_a_slice_says_what_happened_and_what_each_run_said_group_by_group(kind):
    look = a_look(kind)
    table = analysis.slice_table(look, {"key": "level", "column": "level", "title": "Level", "values": [0, 1, 2, 3]})
    assert table["key"] == "level" and table["title"] == "Level"
    assert sum(group["rows"] for group in table["groups"]) == len(look.test)
    level = look.dataset.rows["level"].to_numpy()
    for value, group in enumerate(table["groups"]):
        inside = level[look.test] == value
        assert group["rows_all"] == int((level == value).sum())
        assert group["label_mean"] == pytest.approx(look.truth[inside].mean())
        said = group["runs"]["net"]
        assert said["mean"] == pytest.approx(look.predictions["net"][inside].mean())
        assert said["bias"] == pytest.approx(said["mean"] - group["label_mean"])
        scored = METRICS[look.task.kind][look.task.primary](look.truth[inside], look.predictions["net"][inside])
        assert said[look.task.primary] == pytest.approx(scored)


@pytest.mark.parametrize("kind", ["binary", "regression"])
def test_the_gain_inside_a_group_is_of_the_best_other_run_over_the_reference(kind):
    look = a_look(kind)
    assert look.best == "net" and look.challenger == "net"
    everyone = np.ones(len(look.test), dtype=bool)
    gain = look.gain(everyone)
    assert gain["low"] <= gain["gain"] <= gain["high"]
    assert gain["gain"] > 0 and gain["beyond_noise"]
    assert look.gain(np.arange(len(look.test)) < analysis.SMALLEST_COMPARED - 1) is None
    alone = analysis.Look(look.task, look.dataset, look.y, look.test, look.games, {"gbm-hand": look.predictions["gbm-hand"]})
    assert alone.challenger is None and alone.gain(everyone) is None
    absent = analysis.Look(look.task, look.dataset, look.y, look.test, look.games, {"net": look.predictions["net"]})
    assert absent.challenger is None


def test_the_tasks_bands_are_a_slice_in_their_order():
    table = analysis.band_slice(a_look("binary"), {"title": "The puzzle's rating"})
    assert table["key"] == "band" and table["title"] == "The puzzle's rating"
    assert [group["group"] for group in table["groups"]] == ["<1000", "1000-1399"]


def test_a_grid_is_the_label_by_two_columns_at_once():
    look = a_look("binary")
    grid = analysis.grid_table(
        look,
        {"key": "both", "rows": {"column": "level", "values": [0, 1, 2, 3]}, "columns": {"column": "clock", "title": "Clock", "edges": [300]}},
    )
    assert grid["rows"]["groups"] == ["0", "1", "2", "3"] and grid["columns"] == {"column": "clock", "title": "Clock", "groups": ["<300", "300+"]}
    assert sum(cell["rows"] for line in grid["cells"] for cell in line) == len(look.test)
    assert sum(cell["rows_all"] for line in grid["cells"] for cell in line) == ROWS
    assert set(grid["cells"][0][0]["runs"]) == {"net", "gbm-hand"}


def test_reliability_sets_what_a_run_said_against_what_happened():
    look = a_look("binary")
    table = analysis.reliability("binary", look.truth, look.predictions["net"])
    assert sum(row["n"] for row in table) == len(look.test)
    assert [row["predicted"] for row in table] == sorted(row["predicted"] for row in table)
    wide = analysis.reliability("regression", a_look("regression").truth, a_look("regression").predictions["net"])
    assert len(wide) == 20 and all(row["observed_low"] <= row["observed"] <= row["observed_high"] for row in wide)


def test_a_chance_is_ranked_from_both_ends():
    y = np.array([1.0] * 10 + [0.0] * 90)
    p = np.linspace(1.0, 0.0, 100)
    ends = analysis.ranking(y, p)
    top = {row["share"]: row for row in ends["top"]}
    assert top[0.10]["precision"] == 1.0 and top[0.10]["recall"] == 1.0 and top[0.10]["lift"] == pytest.approx(10.0)
    assert top[0.20]["precision"] == 0.5 and top[0.05]["recall"] == 0.5
    bottom = {row["share"]: row for row in ends["bottom"]}
    assert bottom[0.50]["precision"] == 1.0 and bottom[0.50]["recall"] == pytest.approx(50 / 90)


def test_closeness_counts_the_predictions_inside_each_distance():
    y = np.zeros(10)
    p = np.array([0.0, 1, 2, 3, 4, 5, 6, 7, 8, 100])
    near = analysis.closeness(y, p, {"2": 2, "5": 5})
    assert near["median_error"] == 4.5
    assert near["within"]["2"] == {"distance": 2.0, "share": 0.3} and near["within"]["5"]["share"] == 0.6


@pytest.mark.parametrize("kind", ["binary", "regression"])
def test_examples_are_chosen_by_rule(kind):
    look = a_look(kind)
    spec = {"count": 2, "id": "key", "moves": ["line", "absent"], "show": ["level"]}
    first, again = analysis.examples(look, spec), analysis.examples(look, spec)
    assert first == again
    misses = {"surprised-no", "surprised-yes"} if kind == "binary" else {"over", "under"}
    assert set(first) == {"typical", "highest", "lowest"} | misses
    assert all(len(group) == 2 for group in first.values())
    one = first["highest"][0]
    assert set(one) == {"id", "fen", "moves", "label", "predicted", "show"}
    assert one["moves"] == {"line": "a1a2 h1h2"} and set(one["predicted"]) == {"net", "gbm-hand"}
    assert one["predicted"]["net"] == look.predictions["net"].max()
    assert first["lowest"][0]["predicted"]["net"] == look.predictions["net"].min()
    if kind == "binary":
        assert all(example["label"] == 0.0 for example in first["surprised-no"])
        assert all(example["label"] == 1.0 for example in first["surprised-yes"])
    else:
        over = first["over"][0]
        assert over["predicted"]["net"] - over["label"] == pytest.approx((look.predictions["net"] - look.truth).max())


def test_a_run_beside_the_reference_is_how_alike_and_how_often_closer():
    look = a_look("regression")
    beside = analysis.against_reference(look)
    assert set(beside) == {"net"}
    assert 0 < beside["net"]["correlation"] < 1 and beside["net"]["closer_share"] > 0.5


def test_a_pair_sets_one_run_against_the_run_it_changed():
    look = a_look("regression")
    first, second, third = analysis.pair_table(
        look, [["net", "gbm-hand"], ["gbm-hand", "net"], ["net", "absent"]], resamples=50
    )
    assert (first["run"], first["over"]) == ("net", "gbm-hand")
    assert first["low"] <= first["gain"] <= first["high"]
    assert first["gain"] > 0 and first["beyond_noise"]
    assert second["gain"] == pytest.approx(-first["gain"]) and second["beyond_noise"]
    assert third == {"run": "net", "over": "absent", "gain": None}


def test_a_study_run_is_read_only_to_be_set_against_the_run_it_changes():
    look = a_look("regression")
    worse = look.predictions["net"] + np.random.default_rng(2).normal(0, 80, size=len(look.test))
    (pair,) = analysis.pair_table(look, [["net-half", "net"]], studied={"net-half": worse}, studies={"net-half": "games"}, resamples=50)
    assert (pair["run"], pair["over"], pair["study"]) == ("net-half", "net", "games")
    assert pair["gain"] < 0 and pair["beyond_noise"]
    assert "net-half" not in look.predictions and look.best == "net"
    (unread,) = analysis.pair_table(look, [["net-quarter", "net"]], studied={}, studies={"net-quarter": "games"}, resamples=50)
    assert unread == {"run": "net-quarter", "over": "net", "gain": None, "study": "games"}


def test_numbers_are_written_at_six_digits_and_a_missing_one_as_null():
    assert analysis.rounded({"a": [np.float64(1 / 3), float("nan"), np.int64(3)], "b": "text", "c": None}) == {
        "a": [0.333333, None, 3],
        "b": "text",
        "c": None,
    }
    assert json.dumps(analysis.rounded({"x": float("inf")})) == '{"x": null}'


def record(run: str, value: float, fingerprint: str) -> dict:
    return {"run": run, "dataset": {"fingerprint": fingerprint}, "test": {"rmse": {"value": value}}}


def test_only_the_predictions_a_record_scored_are_read(temp_lab):
    task, dataset = a_task("regression"), a_dataset()
    dataset.manifest["fingerprint"] = "this-build"
    y = dataset.rows["rating"].to_numpy().astype(np.float64)
    test = dataset.split("test")
    keys = dataset.rows["key"].to_numpy()[test]
    rmse = METRICS["regression"]["rmse"]

    def save(run: str, p: np.ndarray, on: np.ndarray = keys) -> float:
        path = paths.predictions("tiny", run)
        path.parent.mkdir(parents=True, exist_ok=True)
        pl.DataFrame({"key": on, "p": p}).write_parquet(path)
        return float(rmse(y[test], p)) if len(p) == len(test) else 0.0

    good = save("good", y[test] + 1.0)
    better = save("better", y[test] + 0.5)
    save("moved", y[test][::-1].copy(), keys[::-1].copy())
    save("rescored", y[test] + 2.0)
    runs = [
        record("good", good, "this-build"),
        record("better", better, "this-build"),
        record("elsewhere", 0.1, "this-build"),
        record("old", 0.2, "another-build"),
        record("moved", 0.3, "this-build"),
        record("rescored", 0.4, "this-build"),
    ]
    predictions, skipped = analysis.read_predictions("tiny", task, runs, dataset, y, test, smoke=False)
    assert list(predictions) == ["better", "good"]
    assert set(skipped) == {"elsewhere", "old", "moved", "rescored"}
    assert "not on this machine" in skipped["elsewhere"] and "another build" in skipped["old"]
    assert "test rows" in skipped["moved"] and "record scored" in skipped["rescored"]
