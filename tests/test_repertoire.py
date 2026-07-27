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
