from pathlib import Path

import polars as pl
import pytest

from chess_coach_models.config import load_config
from chess_coach_models.pipeline import process_stream
from chess_coach_models.repertoire import aggregate_opening_tree, wilson_interval


FIXTURE = Path(__file__).parent / "fixtures" / "tiny_annotated.pgn"


def test_wilson_interval_contains_observed_score() -> None:
    low, high = wilson_interval(60, 100)
    assert low < 0.6 < high
    assert low == pytest.approx(0.502, abs=0.002)


def test_opening_tree_counts_fixture_games() -> None:
    config = load_config()
    config["data"]["max_eval_positions"] = 100
    config["data"]["max_opening_games"] = 100
    with FIXTURE.open(encoding="utf-8") as handle:
        openings, positions, _ = process_stream(handle, config, write_outputs=False)
    tree = aggregate_opening_tree(openings, positions, max_plies=4)
    root_e4 = [
        row
        for row in tree
        if row["perspective"] == "white"
        and row["rating_band"] == "1100-1400"
        and row["prefix_uci"] == "e2e4"
    ]
    assert len(root_e4) == 1
    assert root_e4[0]["n"] == 1
    assert root_e4[0]["score_pct"] == 100
    assert root_e4[0]["trap_annotated_games"] == 1
    assert isinstance(pl.DataFrame(tree), pl.DataFrame)


def test_trap_density_denominator_is_eval_annotated_games_only() -> None:
    openings = pl.DataFrame(
        [
            {
                "game_id": "annotated",
                "moves_uci": "e2e4 e7e5 g1f3",
                "white_band": "<1100",
                "black_band": "<1100",
                "white_score": 1.0,
                "black_score": 0.0,
                "has_evals": True,
                "early_trap_plies": "3",
                "opening": "King's Pawn Game",
                "eco": "C20",
            },
            {
                "game_id": "unannotated",
                "moves_uci": "e2e4 e7e5 f1c4",
                "white_band": "<1100",
                "black_band": "<1100",
                "white_score": 0.0,
                "black_score": 1.0,
                "has_evals": False,
                "early_trap_plies": "",
                "opening": "Bishop's Opening",
                "eco": "C23",
            },
        ]
    )
    tree = aggregate_opening_tree(openings, pl.DataFrame(), max_plies=3)
    root = next(
        row
        for row in tree
        if row["perspective"] == "white" and row["prefix_uci"] == "e2e4"
    )
    assert root["n"] == 2
    assert root["trap_annotated_games"] == 1
    assert root["trap_density"] == 1.0
