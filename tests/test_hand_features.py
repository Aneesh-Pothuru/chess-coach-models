import chess

from chess_coach_models.data.puzzles import MARKS, example, line_marks, puzzle_band, source_game
from chess_coach_models.encode.board import square
from chess_coach_models.encode.hand import (
    GAME_FEATURES,
    GROUPS,
    LINE_FEATURES,
    POSITION_FEATURES,
    group_of,
    line_features,
    position_features,
)


def scholars_mate() -> chess.Board:
    board = chess.Board()
    for san in ["e4", "e5", "Qh5", "Nc6", "Bc4", "Nf6"]:
        board.push_san(san)
    return board


def test_position_features_count_what_the_mover_can_do():
    features = position_features(chess.Board())
    assert set(features) == set(POSITION_FEATURES)
    assert features["legal_moves"] == 20
    assert features["legal_captures"] == 0 and features["legal_checks"] == 0
    assert features["material_imbalance"] == 0
    mating = position_features(scholars_mate())
    assert mating["legal_checks"] >= 2 and mating["legal_captures"] >= 3


def test_line_features_of_a_mate_in_one():
    board = scholars_mate()
    line = [board.parse_san("Qxf7#")]
    features = line_features(board, line, setup_capture=False)
    assert set(features) == set(LINE_FEATURES)
    assert features["solver_moves"] == 1
    assert features["first_piece"] == chess.QUEEN
    assert features["first_capture"] == 1 and features["first_captured_value"] == 1
    assert features["first_check"] == 1 and features["ends_in_mate"] == 1
    assert features["line_quiet"] == 0 and features["line_pieces_moved"] == 1
    assert features["first_sacrifice"] == 0
    assert board.fullmove_number == 4 and board.turn == chess.WHITE


def test_a_queen_given_for_a_pawn_is_a_sacrifice():
    board = chess.Board("6k1/5ppp/8/8/8/8/1q3PPP/1R4K1 b - - 0 1")
    line = [board.parse_san("Qxf2+"), chess.Move.from_uci("g1f2")]
    features = line_features(board, line, setup_capture=True)
    assert features["first_sacrifice"] == 1 and features["line_sacrifices"] == 1
    assert features["reply_captures"] == 1 and features["setup_capture"] == 1
    assert features["final_material_gain"] == -8


def test_a_puzzle_row_becomes_an_example():
    row = (
        "00008",
        "r6k/pp2r2p/4Rp1Q/3p4/8/1N1P2R1/PqP2bPP/7K b - - 0 24",
        "f2g3 e6e7 b2b1 b3c1 b1c1 h6c1",
        1819,
        77,
        10446,
        "crushing hangingPiece long middlegame",
        "https://lichess.org/787zsVup/black#48",
    )
    built = example(row)
    assert built["key"] == "00008" and built["game_id"] == "787zsVup"
    assert built["fen"].split(" ")[1] == "w"
    assert built["setup"] == "f2g3" and built["line"] == "e6e7 b2b1 b3c1 b1c1 h6c1"
    assert built["solver_moves"] == 3 and built["band"] == "1800-2199"
    assert built["setup_capture"] == 1
    assert example((*row[:2], "f2g3 a1a8", *row[3:])) is None


def test_marks_follow_the_line():
    pairs = line_marks("f2g3", ["e6e7", "b2b1"], True)
    assert (MARKS.index("setup_from"), square("f2", True)) in pairs
    assert (MARKS.index("solver1_to"), square("e7", True)) in pairs
    assert (MARKS.index("reply1_from"), square("b2", True)) in pairs
    long_line = line_marks("a2a3", ["a7a6"] * 8, False)
    assert (MARKS.index("later"), square("a6", False)) in long_line


def test_puzzle_bands_and_game_ids():
    assert puzzle_band(999) == "<1000" and puzzle_band(1000) == "1000-1399" and puzzle_band(2600) == "2200+"
    assert source_game("https://lichess.org/787zsVup/black#48") == "787zsVup"
    assert source_game("https://lichess.org/787zsVup#12") == "787zsVup"


def test_every_hand_feature_is_in_one_group():
    grouped = [name for names in GROUPS.values() for name in names]
    assert sorted(grouped) == sorted(POSITION_FEATURES + LINE_FEATURES + GAME_FEATURES)
    assert {group_of(name) for name in GAME_FEATURES} == {"accuracy", "tempo", "choices"}
    assert group_of("hanging_own") == "hanging" and group_of("first_check") == "first-move"
    assert {group_of(name) for name in POSITION_FEATURES} == {"material", "mobility", "hanging", "pawns", "kings"}
