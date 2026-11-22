from pathlib import Path

import pytest

from chess_coach_models.data import positions
from chess_coach_models.data.games import (
    game_rows,
    parse_movetext,
    speed,
    time_control,
    wanted,
)
from chess_coach_models.data.splits import keep, split_of, unit_hash


FIXTURE = Path(__file__).parent / "fixtures" / "tiny_annotated.pgn"
HEADERS = {
    "Event": "Rated Rapid game",
    "Site": "https://lichess.org/tiny0001",
    "Result": "1-0",
    "WhiteElo": "1250",
    "BlackElo": "1300",
    "TimeControl": "600+5",
    "Termination": "Normal",
}
MOVETEXT = (
    "1. e4 { [%eval 0.20] [%clk 0:10:00] } e5 { [%eval 0.10] [%clk 0:10:00] } "
    "2. Qh5 { [%eval -0.20] [%clk 0:09:55] } Nc6 { [%eval 0.00] [%clk 0:09:57] } "
    "3. Bc4 { [%eval 0.20] [%clk 0:09:50] } Nf6?? { [%eval 4.00] [%clk 0:09:53] } "
    "4. Qxf7# { [%eval #1] [%clk 0:09:46] } 1-0"
)


def test_movetext_gives_san_eval_and_clock():
    plies = parse_movetext(MOVETEXT)
    assert [ply.san for ply in plies] == ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6", "Qxf7#"]
    assert plies[2].eval_cp_white == pytest.approx(-20.0)
    assert plies[6].eval_cp_white == 10_000
    assert plies[2].clock == 595.0
    assert parse_movetext("1. e4 e5 2. Nf3 1/2-1/2")[2].clock is None


def test_speed_classes_and_time_controls():
    assert time_control("600+5") == (600, 5)
    assert time_control("-") is None
    assert speed(600, 0) == "rapid"
    assert speed(180, 2) == "blitz"
    assert speed(60, 0) == "bullet"
    assert speed(1800, 0) == "classical"


def test_only_rated_analysed_games_between_humans_are_wanted():
    assert wanted(HEADERS, MOVETEXT, speeds=("rapid",))
    assert not wanted(HEADERS, MOVETEXT, speeds=("blitz",))
    assert not wanted({**HEADERS, "Event": "Casual Rapid game"}, MOVETEXT, speeds=("rapid",))
    assert not wanted({**HEADERS, "WhiteTitle": "BOT"}, MOVETEXT, speeds=("rapid",))
    assert not wanted({**HEADERS, "Termination": "Abandoned"}, MOVETEXT, speeds=("rapid",))
    assert not wanted(HEADERS, "1. e4 { [%clk 0:10:00] } 1-0", speeds=("rapid",))


def test_rows_carry_the_clock_the_cost_and_the_position_before_the_move():
    rows = game_rows(HEADERS, MOVETEXT, min_ply=3, per_game=10, salt="test")
    assert [row["ply"] for row in rows] == [3, 4, 5, 6, 7]
    third = rows[0]
    assert third["key"] == "tiny0001:3"
    assert third["fen"].split(" ")[0] == "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR"
    assert third["last_move"] == "e7e5" and third["move"] == "d1h5"
    assert third["clock"] == 600.0 and third["opponent_clock"] == 600.0
    assert third["spent"] == 10.0
    assert third["mover_elo"] == 1250 and third["opponent_elo"] == 1300
    assert third["mover_score"] == 1.0
    blunder = rows[3]
    assert blunder["move"] == "g8f6" and blunder["blunder"] == 1
    assert blunder["loss"] == pytest.approx(blunder["win_before"] - blunder["win_after"])
    assert blunder["loss"] > 20 and blunder["mover_score"] == 0.0
    assert sum(row["blunder"] for row in rows) == 1


def test_a_cap_keeps_the_same_plies_every_time():
    first = game_rows(HEADERS, MOVETEXT, min_ply=3, per_game=2, salt="test")
    again = game_rows(HEADERS, MOVETEXT, min_ply=3, per_game=2, salt="test")
    assert len(first) == 2 and first == again


def test_splits_are_fixed_by_the_key():
    assert unit_hash("abc", "salt") == unit_hash("abc", "salt")
    assert unit_hash("abc", "salt") != unit_hash("abc", "other")
    splits = [split_of(f"game{index}", "salt", valid=0.05, test=0.10) for index in range(4000)]
    assert 0.07 < splits.count("test") / 4000 < 0.13
    assert 0.03 < splits.count("valid") / 4000 < 0.07
    kept = sum(keep(f"game{index}", "salt", 0.25) for index in range(4000))
    assert 0.21 < kept / 4000 < 0.29
    assert keep("anything", "salt", 1.0)


def stream_of(tmp_path, events: list[str]) -> str:
    """A compressed PGN stream of the tiny game under one event name a game, each with its own id."""
    zstandard = pytest.importorskip("zstandard")
    games = []
    for number, event in enumerate(events):
        headers = {**HEADERS, "Event": event, "Site": f"https://lichess.org/tiny{number:04d}"}
        games.append("".join(f'[{key} "{value}"]\n' for key, value in headers.items()) + f"\n{MOVETEXT}\n\n")
    path = tmp_path / "games.pgn.zst"
    path.write_bytes(zstandard.ZstdCompressor().compress("".join(games).encode()))
    return str(path)


def positions_recipe(games: int) -> dict:
    return {
        "month": "2026-10",
        "speeds": ["rapid"],
        "min_ply": 3,
        "per_game": 10,
        "games": games,
        "split": {"salt": "test", "valid": 0.2, "test": 0.2},
    }


def test_a_build_counts_the_games_up_to_the_last_one_it_kept_however_far_the_pool_read_ahead(tmp_path):
    source = stream_of(tmp_path, ["Casual Rapid game", "Rated Rapid game"] * 40)
    built = [
        positions.build(positions_recipe(3), source=source, workers=workers, log=lambda _: None)
        for workers in (1, 3)
    ]
    for rows, tokens, marks, manifest in built:
        assert manifest["games_kept"] == 3 and rows["game_id"].unique().sort().to_list() == ["tiny0001", "tiny0003", "tiny0005"]
        assert manifest["games_read"] == 6
        assert len(rows) == len(tokens) == len(marks) == 15


def test_a_build_that_reads_the_stream_to_its_end_counts_every_game(tmp_path):
    source = stream_of(tmp_path, ["Rated Rapid game", "Casual Rapid game", "Rated Rapid game", "Casual Rapid game", "Casual Rapid game"])
    rows, _, _, manifest = positions.build(positions_recipe(10), source=source, workers=2, log=lambda _: None)
    assert manifest["games_kept"] == 2 and manifest["games_read"] == 5
