"""What a person would count on each square, for the trees of a model that predicts squares."""

import chess
import numpy as np

from chess_coach_models.encode.board import encode_positions
from chess_coach_models.encode.squares import SQUARE_HAND, SQUARE_PLAIN, plain_of, square_features, squares_of


def at(features: np.ndarray, square: str, name: str) -> float:
    return float(features[chess.parse_square(square), SQUARE_HAND.index(name)])


def test_a_square_says_who_attacks_it_and_what_stands_on_it():
    features = square_features(chess.Board("4k3/8/8/8/6b1/5N2/8/3QK3 w - - 0 1"))
    assert features.shape == (64, len(SQUARE_HAND))
    assert at(features, "f3", "square_value") == 3.0 and at(features, "g4", "square_value") == 3.25
    assert at(features, "e1", "square_value") == 0.0 and at(features, "a8", "square_value") == 0.0
    assert (at(features, "f3", "square_attackers_own"), at(features, "f3", "square_attackers_opponent")) == (1.0, 1.0)
    assert (at(features, "f3", "square_cheapest_own"), at(features, "f3", "square_cheapest_opponent")) == (9.0, 3.25)
    assert at(features, "f3", "square_hanging") == 0.0 and at(features, "f3", "square_pinned") == 0.0
    assert at(features, "f3", "square_moves_from") == 7.0 and at(features, "g5", "square_moves_to") == 1.0
    assert (at(features, "f3", "square_to_own_king"), at(features, "f3", "square_to_opponent_king")) == (2.0, 5.0)
    assert at(features, "d2", "square_cheapest_own") == 3.0 and at(features, "c1", "square_cheapest_own") == 9.0
    assert at(features, "f1", "square_cheapest_own") == 10.0 and at(features, "a8", "square_cheapest_own") == 0.0


def test_a_square_says_what_can_be_taken_what_is_pinned_and_where_a_check_starts():
    takes = square_features(chess.Board("4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1"))
    assert at(takes, "d5", "square_hanging") == 1.0 and at(takes, "d5", "square_captures_to") == 1.0
    assert at(takes, "c3", "square_hanging") == 0.0 and at(takes, "c3", "square_captures_to") == 0.0
    pinned = square_features(chess.Board("4k3/4r3/8/8/8/8/4N3/4K3 w - - 0 1"))
    assert at(pinned, "e2", "square_pinned") == 1.0 and at(pinned, "e2", "square_moves_from") == 0.0
    assert at(pinned, "e2", "square_hanging") == 0.0 and at(pinned, "e7", "square_pinned") == 0.0
    checks = square_features(chess.Board("4k3/8/8/8/8/8/8/R3K3 w - - 0 1"))
    assert at(checks, "a1", "square_checks_from") == 1.0 and at(checks, "a8", "square_checks_to") == 1.0
    assert at(checks, "e1", "square_checks_from") == 0.0 and at(checks, "a7", "square_checks_to") == 0.0


def test_the_mover_always_plays_up_the_board():
    for fen in (
        "4k3/8/8/8/6b1/5N2/8/3QK3 w - - 0 1",
        "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3",
        "8/5pk1/6p1/8/3Q4/6P1/5PK1/3r4 w - - 0 1",
    ):
        board = chess.Board(fen)
        assert np.array_equal(square_features(board), square_features(board.mirror()))
        tokens, _, _ = encode_positions([fen], [[]])
        valued = square_features(board)[:, SQUARE_HAND.index("square_value")] > 0
        assert np.array_equal(valued, np.isin(tokens[0], (1, 2, 3, 4, 5, 7, 8, 9, 10, 11)))


def test_many_positions_are_counted_one_after_another():
    fens = ["4k3/8/8/3q4/8/2N5/8/4K3 w - - 0 1", "4k3/4r3/8/8/8/8/4N3/4K3 b - - 0 1"]
    counted = squares_of(fens)
    assert counted.shape == (2, 64, len(SQUARE_HAND)) and counted.dtype == np.float32
    assert np.array_equal(counted[1], square_features(chess.Board(fens[1])))
    assert squares_of([]).shape == (0, 64, len(SQUARE_HAND))
    tokens, _, _ = encode_positions(fens, [[], []])
    plain = plain_of(tokens)
    assert plain.shape == (2, 64, len(SQUARE_PLAIN))
    assert plain[0, 10].tolist() == [2.0, 1.0, float(tokens[0, 10])] and plain[1, 63, :2].tolist() == [7.0, 7.0]
