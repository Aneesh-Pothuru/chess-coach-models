import chess

from chess_coach_models.bands import DEFAULT_BANDS
from chess_coach_models.features import HAND_FEATURES, board_features


def test_starting_position_features() -> None:
    features = board_features(chess.Board(), 1250, 0.0, DEFAULT_BANDS)
    assert set(features) == set(HAND_FEATURES)
    assert features["side_to_move_white"] == 1
    assert features["material_imbalance"] == 0
    assert features["phase_piece_count"] == 14
    assert features["legal_move_count"] == 20
    assert features["current_win_pct"] == 50
    assert features["castling_kingside"] == 1


def test_passed_pawn_and_hanging_piece_features() -> None:
    board = chess.Board("8/8/8/3p4/4P3/8/8/4K2k w - - 0 1")
    features = board_features(board, 1000, -50, DEFAULT_BANDS)
    assert features["passed_pawns_mover"] == 0
    assert features["passed_pawns_opponent"] == 0

