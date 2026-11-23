from pathlib import Path

import numpy as np
import pytest

from chess_coach_models import cli
from chess_coach_models.data import positions, sides, store
from chess_coach_models.data.games import (
    game_rows,
    game_sides,
    parse_movetext,
    speed,
    time_control,
    wanted,
)
from chess_coach_models.data.splits import keep, split_of, unit_hash
from chess_coach_models.encode.board import move_squares
from chess_coach_models.encode.hand import GAME_FEATURES


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


def test_a_game_read_a_player_at_a_time_gives_each_their_moves_in_order():
    white, black = game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=2, most_moves=10)
    assert (white["key"], white["side"], white["player_elo"], white["opponent_elo"], white["elo_gap"]) == (
        "tiny0001:white",
        "white",
        1250,
        1300,
        -50,
    )
    assert (black["key"], black["side"], black["player_elo"], black["elo_gap"]) == ("tiny0001:black", "black", 1300, 50)
    assert (white["player_score"], black["player_score"]) == (1.0, 0.0)
    assert white["game_id"] == black["game_id"] == "tiny0001" and white["plies"] == black["plies"] == 7
    assert [step["ply"] for step in white["steps"]] == [3, 5, 7] and white["moves"] == 3
    assert [step["move"] for step in black["steps"]] == ["b8c6", "g8f6"] and black["moves"] == 2
    first = white["steps"][0]
    assert first["fen"].split(" ")[0] == "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR"
    assert (first["last_move"], first["move"]) == ("e7e5", "d1h5")
    assert (first["clock"], first["opponent_clock"], first["spent"]) == (600.0, 600.0, 10.0)
    assert (first["legal_moves"], first["capture"], first["check"]) == (29, 0, 0)
    mate = white["steps"][-1]
    assert (mate["move"], mate["capture"], mate["check"], mate["spent"]) == ("h5f7", 1, 1, 9.0)


def test_a_player_s_move_is_what_the_position_row_says_of_it():
    by_ply = {row["ply"]: row for row in game_rows(HEADERS, MOVETEXT, min_ply=3, per_game=10, salt="test")}
    steps = [step for side in game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=1, most_moves=10) for step in side["steps"]]
    assert sorted(step["ply"] for step in steps) == sorted(by_ply)
    for step in steps:
        row = by_ply[step["ply"]]
        for name in ("fen", "last_move", "move", "clock", "opponent_clock", "spent"):
            assert step[name] == row[name]
        assert step["win_before"] == pytest.approx(row["win_before"]) and step["loss"] == pytest.approx(row["loss"])


def test_a_player_s_row_carries_the_costliest_move_and_counts_over_the_moves():
    white, black = game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=2, most_moves=10)
    blunder = black["steps"][1]
    assert (black["worst_move"], black["worst_ply"]) == ("g8f6", 6)
    assert (black["fen"], black["last_move"]) == (blunder["fen"], "f1c4")
    assert black["loss_worst"] == blunder["loss"] and blunder["loss"] > 20
    assert (white["worst_move"], white["worst_ply"], white["fen"]) == ("d1h5", 3, white["steps"][0]["fen"])
    assert set(GAME_FEATURES) <= set(white)
    assert white["spent_mean"] == pytest.approx(29 / 3) and white["spent_longest"] == 10.0
    assert white["capture_share"] == pytest.approx(1 / 3) and white["check_share"] == pytest.approx(1 / 3)
    assert white["clock_lowest"] == 590.0 and white["clock_used"] == pytest.approx(1 - 590 / 600)
    assert black["loss_over_20"] == 0.5 and black["legal_moves_mean"] == 27.0


def test_a_player_with_too_few_moves_gives_no_row_and_a_long_game_keeps_its_first_moves():
    assert [side["side"] for side in game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=3, most_moves=10)] == ["white"]
    assert game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=4, most_moves=10) == []
    cut = game_sides(HEADERS, MOVETEXT, min_ply=3, least_moves=2, most_moves=2)
    assert [[step["ply"] for step in side["steps"]] for side in cut] == [[3, 5], [4, 6]]
    assert cut[0]["moves"] == 2 and cut[0]["spent_mean"] == 10.0 and cut[0]["capture_share"] == 0.0
    assert game_sides({**HEADERS, "TimeControl": "-"}, MOVETEXT, min_ply=3, least_moves=1, most_moves=10) == []
    assert game_sides(HEADERS, "1. e4 e5 2. Nf3 1/2-1/2", min_ply=3, least_moves=1, most_moves=10) == []


def sides_recipe(games: int) -> dict:
    return {
        "month": "2026-10",
        "speeds": ["rapid"],
        "min_ply": 3,
        "least_moves": 2,
        "most_moves": 10,
        "games": games,
        "split": {"salt": "test", "valid": 0.2, "test": 0.2},
    }


def test_a_build_of_players_keeps_each_row_s_moves_one_after_another(tmp_path):
    source = stream_of(tmp_path, ["Casual Rapid game", "Rated Rapid game"] * 40)
    for workers in (1, 3):
        rows, tokens, marks, manifest, steps = sides.build(sides_recipe(3), source=source, workers=workers, log=lambda _: None)
        assert manifest["games_kept"] == 3 and manifest["games_read"] == 6
        assert rows["key"].to_list() == [f"tiny{game:04d}:{side}" for game in (1, 3, 5) for side in ("white", "black")]
        assert rows["steps"].to_list() == [3, 2] * 3 and rows["first_step"].to_list() == [0, 3, 5, 8, 10, 13]
        assert rows["split"].to_list()[0::2] == rows["split"].to_list()[1::2]
        assert rows["band"].to_list()[:2] == ["1100-1400", "1100-1400"] and rows["log_base"][0] == pytest.approx(np.log1p(600))
        assert len(tokens) == len(marks) == 6
        assert len(steps.tokens) == len(steps.marks) == 15 and steps.numbers.shape == (15, len(sides.STEPS))
        assert manifest["steps"] == list(sides.STEPS) and manifest["marks"] == list(sides.MARKS)
        assert manifest["hand"] == list(GAME_FEATURES) and manifest["group"] == "game_id"
        numbers = dict(zip(sides.STEPS, steps.numbers[:3].T))
        assert numbers["ply"].tolist() == [3, 5, 7]
        assert numbers["capture"].tolist() == [0, 0, 1] and numbers["check"].tolist() == [0, 0, 1]
        assert numbers["log_clock"] == pytest.approx(np.log1p([600, 595, 590]))
        assert numbers["log_spent"] == pytest.approx(np.log1p([10, 10, 9]))
        assert numbers["legal_moves"].tolist() == [29, 39, 43] and numbers["castle_own_king"].tolist() == [1, 1, 1]

        def marked(square_marks: np.ndarray, name: str) -> list[int]:
            return np.flatnonzero((square_marks >> sides.MARKS.index(name)) & 1).tolist()

        # White's first counted move, on White's own board, and Black's on a board turned round.
        assert (marked(steps.marks[0], "move_from"), marked(steps.marks[0], "move_to")) == tuple([square] for square in move_squares("d1h5", True))
        assert (marked(steps.marks[0], "last_from"), marked(steps.marks[0], "last_to")) == tuple([square] for square in move_squares("e7e5", True))
        assert (marked(steps.marks[3], "move_from"), marked(steps.marks[3], "move_to")) == tuple([square] for square in move_squares("b8c6", False))
        # A row's own board is the position of its costliest move: White's first here, and Black's second.
        assert np.array_equal(tokens[0], steps.tokens[0]) and np.array_equal(marks[0], steps.marks[0])
        assert np.array_equal(tokens[1], steps.tokens[4]) and np.array_equal(marks[1], steps.marks[4])


@pytest.fixture()
def players(temp_lab, tmp_path):
    temp_lab.recipe("games", {**sides_recipe(3), "name": "games-test", "builder": "game_sides"})
    source = stream_of(tmp_path, ["Rated Rapid game"] * 5)
    cli.build_data("games", smoke=False, source=source, workers=2, rebuild=False)
    return store.read_dataset("games-test")


def test_a_dataset_of_sequences_is_written_and_read_with_its_steps(players):
    steps = players.steps
    assert players.manifest["rows"] == 6 and players.manifest["positions"] == 15
    assert steps.tokens.shape == (15, 64) and steps.marks.shape == (15, 64) and steps.numbers.shape == (15, len(sides.STEPS))
    assert players.manifest["fingerprint"] == store.fingerprint(players.rows, players.tokens, players.marks, steps)
    # A dataset's steps are part of what it is: a board among them changes the fingerprint.
    assert players.manifest["fingerprint"] != store.fingerprint(players.rows, players.tokens, players.marks)
    moved = steps.tokens.copy()
    moved[7, 0] ^= 1
    assert players.manifest["fingerprint"] != store.fingerprint(
        players.rows, players.tokens, players.marks, store.Steps(moved, steps.marks, steps.numbers)
    )


def test_steps_that_do_not_fit_their_rows_are_refused(players):
    rows, steps, manifest = players.rows, players.steps, players.manifest
    store.check_steps(rows, steps, manifest)
    with pytest.raises(ValueError, match="names every number"):
        store.check_steps(rows, store.Steps(steps.tokens, steps.marks, steps.numbers[:, :-1]), manifest)
    with pytest.raises(ValueError, match="one board"):
        store.check_steps(rows, store.Steps(steps.tokens, steps.marks[:-1], steps.numbers), manifest)
    with pytest.raises(ValueError, match="follow the row before"):
        store.check_steps(rows, store.Steps(steps.tokens[:-1], steps.marks[:-1], steps.numbers[:-1]), manifest)
    with pytest.raises(ValueError, match="follow the row before"):
        store.check_steps(rows.with_columns(first_step=rows["first_step"] + 1), steps, manifest)
