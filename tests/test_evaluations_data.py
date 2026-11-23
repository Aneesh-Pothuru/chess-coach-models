"""The open Lichess evaluations as a dataset: a position, its deepest evaluation, and the mover's chance of winning."""

import json
from pathlib import Path

import pytest

zstandard = pytest.importorskip("zstandard")

from chess_coach_models import cli  # noqa: E402
from chess_coach_models.data import evaluations, store  # noqa: E402
from chess_coach_models.encode.hand import POSITION_FEATURES  # noqa: E402
from chess_coach_models.winprob import win_percent  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "evaluations_sample.jsonl"
RECIPE = {
    "name": "evaluations-test",
    "builder": "evaluations",
    "source": "tests/fixtures/evaluations_sample.jsonl",
    "min_depth": 20,
    "sample": 1.0,
    "positions": 40,
    "split": {"salt": "test", "valid": 0.2, "test": 0.2},
}


def line(fen: str, *found: tuple[int, dict]) -> str:
    return json.dumps({"fen": fen, "evals": [{"pvs": [{**first, "line": "e2e4"}], "knodes": 1, "depth": depth} for depth, first in found]})


def test_a_position_is_cut_from_the_start_of_its_line():
    assert evaluations.position_of('{"fen":"8/8/8/8/8/8/8/K6k w - -","evals":[]}') == "8/8/8/8/8/8/8/K6k w - -"
    assert evaluations.position_of("not a line") is None
    assert len(evaluations.position_key("8/8/8/8/8/8/8/K6k w - -")) == 16


def test_the_deepest_evaluation_is_the_row_and_it_is_read_from_the_movers_side():
    start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    white = evaluations.example(line(f"{start} w KQkq -", (22, {"cp": 30}), (40, {"cp": 100})), 20)
    assert (white["depth"], white["cp"], white["mate"]) == (40, 100, None)
    assert white["win"] == pytest.approx(win_percent(100)) and white["win"] > 50
    black = evaluations.example(line(f"{start} b KQkq -", (40, {"cp": 100})), 20)
    assert black["win"] == pytest.approx(100 - win_percent(100)) and black["key"] != white["key"]
    assert (white["men"], white["band"], white["legal_moves"]) == (32, "25-32", 20.0)
    assert set(POSITION_FEATURES) <= set(white)


def test_a_forced_mate_is_a_sure_thing_for_the_side_that_gives_it():
    ending = "6k1/6p1/8/4K3/4NN2/8/8/8"
    white = evaluations.example(line(f"{ending} w - -", (30, {"mate": 15})), 20)
    assert (white["cp"], white["mate"], white["win"]) == (None, 15, pytest.approx(win_percent(10_000)))
    assert evaluations.example(line(f"{ending} b - -", (30, {"mate": 15})), 20)["win"] == pytest.approx(100 - win_percent(10_000))
    assert evaluations.example(line(f"{ending} b - -", (30, {"mate": -3})), 20)["win"] == pytest.approx(win_percent(10_000))


def test_a_line_with_nothing_deep_enough_or_no_position_gives_no_row():
    start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -"
    assert evaluations.example(line(start, (12, {"cp": 30}), (19, {"cp": 20})), 20) is None
    assert evaluations.example(line("8/8/8/8/8/8/8/8 w - -", (30, {"cp": 0})), 20) is None
    assert evaluations.example(json.dumps({"fen": start, "evals": [{"pvs": [], "knodes": 1, "depth": 40}]}), 20) is None
    assert evaluations.example("{broken", 20) is None
    stalemate = "7k/5Q2/6K1/8/8/8/8/8 b - -"
    assert evaluations.example(line(stalemate, (30, {"cp": 0})), 20) is None


@pytest.fixture()
def built(temp_lab, tmp_path):
    compressed = tmp_path / "evaluations.jsonl.zst"
    compressed.write_bytes(zstandard.ZstdCompressor().compress(FIXTURE.read_bytes()))
    temp_lab.recipe("evaluations", RECIPE)
    cli.build_data("evaluations", smoke=False, source=str(compressed), workers=2, rebuild=False)
    return store.read_dataset("evaluations-test")


def test_a_build_stops_at_its_count_and_says_how_far_it_read(built):
    rows = built.rows
    assert len(rows) == len(built.tokens) == len(built.marks) == 40
    assert built.manifest["lines_read"] == 60 and built.manifest["group"] == "key"
    assert built.manifest["marks"] == ["en_passant"] and built.manifest["hand"] == list(POSITION_FEATURES)
    assert built.manifest["fingerprint"] == store.fingerprint(rows, built.tokens, built.marks)
    assert rows["key"].n_unique() == 40 and set(rows["split"].unique()) <= {"train", "valid", "test"}
    assert rows["win"].min() >= 0 and rows["win"].max() <= 100
    assert rows["depth"].min() >= 20 and (rows["cp"].is_null() != rows["mate"].is_null()).all()
    first = json.loads(FIXTURE.read_text().splitlines()[0])
    assert rows["fen"][0].startswith(first["fen"])
    assert {"castle_own_king", "band", "men"} <= set(rows.columns)


def test_a_sample_is_a_hash_of_the_position(temp_lab, tmp_path):
    compressed = tmp_path / "evaluations.jsonl.zst"
    compressed.write_bytes(zstandard.ZstdCompressor().compress(FIXTURE.read_bytes()))
    temp_lab.recipe("evaluations", {**RECIPE, "sample": 0.5, "positions": 1000})
    cli.build_data("evaluations", smoke=False, source=str(compressed), workers=2, rebuild=False)
    half = store.read_dataset("evaluations-test")
    assert 10 < len(half.rows) < 45 and half.manifest["lines_read"] == 60
    kept = {position for position in map(evaluations.position_of, FIXTURE.read_text().splitlines()) if evaluations.keep(position, "test", 0.5)}
    assert {fen.rsplit(" ", 2)[0].split(" ")[0] for fen in half.rows["fen"]} <= {position.split(" ")[0] for position in kept}
