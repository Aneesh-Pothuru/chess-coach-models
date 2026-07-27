from pathlib import Path

from chess_coach_models.config import load_config
from chess_coach_models.pipeline import process_stream


FIXTURE = Path(__file__).parent / "fixtures" / "tiny_annotated.pgn"


def test_fixture_constructs_labels_and_openings() -> None:
    config = load_config()
    config["data"]["max_eval_positions"] = 100
    config["data"]["max_opening_games"] = 100
    with FIXTURE.open(encoding="utf-8") as handle:
        openings, positions, stats = process_stream(
            handle, config, write_outputs=False
        )

    assert stats.games_read == 2
    assert openings.height == 2
    assert openings["white_band"].to_list() == ["1100-1400", "<1100"]
    black_blunder = positions.filter(
        (positions["game_id"] == "tiny0001")
        & (positions["move_uci"] == "g8f6")
    )
    assert black_blunder.height == 1
    assert black_blunder["is_blunder"][0] == 1
    assert black_blunder["loss_win_pct"][0] > 20
    assert positions["game_id"].n_unique() == 2


def test_opening_move_counts_are_capped() -> None:
    config = load_config()
    config["data"]["opening_plies"] = 4
    config["data"]["max_eval_positions"] = 100
    config["data"]["max_opening_games"] = 1
    with FIXTURE.open(encoding="utf-8") as handle:
        openings, _, _ = process_stream(handle, config, write_outputs=False)
    assert openings.height == 1
    assert openings["plies_captured"][0] == 4
    assert len(openings["moves_uci"][0].split()) == 4

