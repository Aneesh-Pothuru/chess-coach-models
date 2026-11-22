"""The tables a network reads a board's attacks from, held to a chess library's own."""

import random

import chess
import numpy as np

from chess_coach_models.encode.board import encode_fen
from chess_coach_models.encode.relations import BETWEEN, REACH, RELATIONS, attacks


PIECES = [chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN, chess.KING]


def squares_of(row: np.ndarray) -> set[int]:
    return set(np.flatnonzero(row).tolist())


def positions(count: int) -> list[str]:
    """Positions from games of random legal moves, with either side to move."""
    rng = random.Random(4)
    found = []
    while len(found) < count:
        board = chess.Board()
        for _ in range(rng.randint(4, 70)):
            if board.is_game_over():
                break
            board.push(rng.choice(sorted(board.legal_moves, key=lambda move: move.uci())))
        found.append(board.fen())
    return found


def test_a_piece_alone_reaches_what_the_library_says_it_attacks():
    assert REACH.shape == (13, 64, 64) and not REACH[0].any()
    for theirs, colour in ((0, chess.WHITE), (6, chess.BLACK)):
        for token, piece in enumerate(PIECES, start=1):
            for square in range(64):
                board = chess.Board(None)
                board.set_piece_at(square, chess.Piece(piece, colour))
                assert squares_of(REACH[token + theirs, square]) == set(board.attacks(square)), (token, square)
    # The mover's pawns take up the board and the opponent's down; nothing else depends on the side.
    assert squares_of(REACH[1, 12]) == {19, 21} and squares_of(REACH[7, 12]) == {3, 5}
    assert all(np.array_equal(REACH[token], REACH[token + 6]) for token in range(2, 7))


def test_the_squares_between_two_squares_are_the_library_s():
    assert BETWEEN.shape == (64, 64, 64)
    for first in range(64):
        for second in range(64):
            assert squares_of(BETWEEN[first, second]) == set(chess.SquareSet(chess.between(first, second)))
    assert squares_of(BETWEEN[0, 63]) == {9, 18, 27, 36, 45, 54} and not BETWEEN[0, 10].any()


def test_a_board_s_attacks_are_the_library_s_from_the_mover_s_side():
    fens = positions(60)
    assert {fen.split()[1] for fen in fens} == {"w", "b"}
    tokens = np.stack([np.frombuffer(encode_fen(fen)[0], dtype=np.uint8) for fen in fens])
    hits, behind = attacks(tokens)
    assert hits.shape == behind.shape == (60, 64, 64) and not (hits & behind).any()
    seen = 0
    for row, fen in enumerate(fens):
        board = chess.Board(fen)
        mover = board if board.turn else board.mirror()
        for square in range(64):
            piece = mover.piece_at(square)
            if piece is None:
                assert not hits[row, square].any() and not behind[row, square].any()
                continue
            assert squares_of(hits[row, square]) == set(mover.attacks(square)), (fen, square)
            # Behind one man: a square on one of the piece's own lines with exactly one man between.
            expected = set()
            if piece.piece_type in (chess.BISHOP, chess.ROOK, chess.QUEEN):
                empty = chess.Board(None)
                empty.set_piece_at(square, piece)
                for target in empty.attacks(square):
                    if len(chess.SquareSet(chess.between(square, target)) & mover.occupied) == 1:
                        expected.add(target)
            assert squares_of(behind[row, square]) == expected, (fen, square)
            seen += len(expected)
    assert seen > 200


def test_a_pin_and_a_battery_are_pieces_behind_one_man():
    # The mover's rook on e1 behind its own knight on e4, which the opponent's queen on e8 pins from behind
    # the pawn on e6: the rook attacks e4 and stands behind it as far as e6.
    tokens = np.frombuffer(encode_fen("4q1k1/8/4p3/8/4N3/8/8/4R1K1 w - - 0 1")[0], dtype=np.uint8)[None]
    hits, behind = attacks(tokens)
    e1, e4, e6, e8 = chess.E1, chess.E4, chess.E6, chess.E8
    assert hits[0, e1, e4] and not hits[0, e1, e6] and behind[0, e1, e6] and not behind[0, e1, e8]
    assert hits[0, e8, e6] and behind[0, e8, e4] and not behind[0, e8, e1]
    assert len(RELATIONS) == 4
