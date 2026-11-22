import chess
import numpy as np

from chess_coach_models.encode.board import (
    CASTLING,
    encode_fen,
    encode_positions,
    mark_planes,
    move_squares,
    square,
)


def test_start_position_is_read_from_whites_side():
    tokens, en_passant, rights = encode_fen(chess.STARTING_FEN)
    assert list(tokens[:8]) == [4, 2, 3, 5, 6, 3, 2, 4]
    assert set(tokens[8:16]) == {1}
    assert set(tokens[48:56]) == {7}
    assert list(tokens[56:]) == [10, 8, 9, 11, 12, 9, 8, 10]
    assert en_passant == -1
    assert rights == (1, 1, 1, 1)
    assert len(CASTLING) == len(rights)


def test_the_mover_always_plays_up_the_board():
    board = chess.Board()
    for san in ["e4", "c5", "Nf3", "d6", "Bb5+", "Bd7", "Bxd7+", "Qxd7", "O-O", "Nc6", "c4", "g5", "d4", "g4"]:
        board.push_san(san)
        assert encode_fen(board.fen()) == encode_fen(board.mirror().fen())


def test_en_passant_and_castling_follow_the_mover():
    board = chess.Board()
    for san in ["e4", "a6", "e5", "d5"]:
        board.push_san(san)
    tokens, en_passant, rights = encode_fen(board.fen())
    assert en_passant == square("d6", True)
    _, target, rights = encode_fen("r3k2r/8/8/8/4P3/8/8/4K2R b Kq e3 0 1")
    assert target == square("e3", False) == chess.square_mirror(chess.E3)
    assert rights == (0, 1, 1, 0)


def test_marks_are_bit_sets_a_square():
    fen = "r3k2r/8/8/8/4P3/8/8/4K2R b Kq e3 0 1"
    start, end = move_squares("e2e4", False)
    tokens, marks, castling = encode_positions([fen], [[(1, start), (2, end), (2, start)]])
    assert tokens.shape == (1, 64) and marks.shape == (1, 64) and castling.shape == (1, 4)
    planes = mark_planes(marks, 3)
    assert planes.shape == (1, 64, 3)
    assert planes[0, square("e3", False), 0] == 1
    assert planes[0, start].tolist() == [0, 1, 1]
    assert planes[0, end].tolist() == [0, 0, 1]
    assert planes.sum() == 4
    assert np.array_equal(tokens[0], np.frombuffer(encode_fen(fen)[0], dtype=np.uint8))
