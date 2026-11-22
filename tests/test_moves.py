"""The moves a position allows, as a model that predicts the move played reads them."""

import chess
import numpy as np
import polars as pl
import pytest

from chess_coach_models.data import store
from chess_coach_models.encode import moves
from chess_coach_models.encode.board import encode_fen
from chess_coach_models.encode.squares import SQUARE_HAND, square_features


AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
PROMOTES = "3r4/4P1k1/8/8/8/8/6K1/8 w - - 0 1"
CASTLES = "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8"
IN_PASSING = "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3"
ONE_MOVE = "R5k1/5pp1/8/8/8/8/8/4K3 b - - 0 1"


def test_a_move_is_its_two_squares_on_the_mover_s_board():
    assert moves.pair_of("e2e4", True) == 12 * 64 + 28
    # Black's e7e5 is the same pair as White's e2e4: the mover always plays up the board.
    assert moves.pair_of("e7e5", False) == moves.pair_of("e2e4", True)
    assert moves.pair_of("e7e8q", True) == moves.pair_of("e7e8n", True) == 52 * 64 + 60
    start = moves.pairs_of(chess.Board())
    assert len(start) == 20 and start == sorted(start) and moves.pair_of("g1f3", True) in start
    assert moves.pairs_of(chess.Board(AFTER_E4)) == start


def test_a_promotion_is_one_candidate_whatever_the_pawn_becomes():
    board = chess.Board(PROMOTES)
    assert sum(move.promotion is not None for move in board.legal_moves) == 8
    pairs = moves.pairs_of(board)
    assert len(pairs) == board.legal_moves.count() - 6
    assert moves.pair_of("e7e8q", True) in pairs and moves.pair_of("e7d8r", True) in pairs


def test_positions_with_fewer_moves_are_filled_out_and_the_move_played_is_found():
    fens = [chess.STARTING_FEN, ONE_MOVE, PROMOTES, AFTER_E4]
    pairs = moves.legal_pairs(fens)
    assert pairs.dtype == np.int16 and pairs.shape == (4, 20)
    assert (pairs >= 0).sum(axis=1).tolist() == [20, 1, 10, 20]
    for row in pairs:
        held = row[row >= 0]
        assert held.tolist() == sorted(set(held.tolist())) and (row[len(held) :] == -1).all()
    index = moves.played(pairs, fens, ["g1f3", "g8h7", "e7e8n", "g8f6"], ["a", "b", "c", "d"])
    assert pairs[np.arange(4), index].tolist() == [
        moves.pair_of("g1f3", True),
        moves.pair_of("g8h7", False),
        moves.pair_of("e7e8q", True),
        moves.pair_of("g8f6", False),
    ]
    assert index[1] == 0
    with pytest.raises(ValueError, match="1 rows name a move their position does not allow, the first b: g8f8"):
        moves.played(pairs, fens, ["g1f3", "g8f8", "e7e8n", "g8f6"], ["a", "b", "c", "d"])
    assert moves.legal_pairs([]).shape == (0, 0)


def test_what_needs_no_chess_of_a_move_is_where_it_goes_and_what_stands_there():
    assert moves.MOVE_PLAIN == (
        "move_from_file", "move_from_rank", "move_to_file", "move_to_rank", "move_files", "move_ranks", "move_piece", "move_takes",
    )  # fmt: skip
    board = chess.Board(PROMOTES)
    tokens = np.frombuffer(encode_fen(PROMOTES)[0], dtype=np.uint8)
    pairs = np.array(moves.pairs_of(board), dtype=np.int64)
    plain = moves.plain_of(np.repeat(tokens[None], len(pairs), axis=0), pairs)
    takes = plain[pairs.tolist().index(moves.pair_of("e7d8q", True))]
    # The pawn on e7 takes the rook on d8: one file to the left, one rank up, a pawn onto the opponent's rook.
    assert takes.tolist() == [4, 6, 3, 7, -1, 1, 1, 10]
    black = chess.Board(AFTER_E4)
    tokens = np.frombuffer(encode_fen(AFTER_E4)[0], dtype=np.uint8)
    pairs = np.array(moves.pairs_of(black), dtype=np.int64)
    plain = moves.plain_of(np.repeat(tokens[None], len(pairs), axis=0), pairs)
    knight = plain[pairs.tolist().index(moves.pair_of("g8f6", False))]
    # Black's knight goes up its own board, from its first rank to its third.
    assert knight.tolist() == [6, 0, 5, 2, -1, 2, 2, 0]


def test_what_a_person_would_count_of_a_move_is_its_two_squares_and_what_it_does():
    assert moves.MOVE_OWN == ("move_check", "move_castles", "move_promotes", "move_in_passing")
    assert len(moves.MOVE_HAND) == 2 * len(SQUARE_HAND) + 4 and moves.MOVE_HAND[0] == "from_square_value"

    def of(fen: str, uci: str) -> np.ndarray:
        board = chess.Board(fen)
        counted = moves.move_features(board)
        pairs = moves.pairs_of(board)
        assert counted.shape == (len(pairs), len(moves.MOVE_HAND)) and counted.dtype == np.float32
        return counted[pairs.index(moves.pair_of(uci, board.turn == chess.WHITE))]

    own = slice(2 * len(SQUARE_HAND), None)
    assert of(CASTLES, "e1g1")[own].tolist() == [0, 1, 0, 0] and of(CASTLES, "e1c1")[own].tolist() == [0, 1, 0, 0]
    assert of("4k3/8/8/8/8/8/3R4/4K3 w - - 0 1", "d2e2")[own].tolist() == [1, 0, 0, 0] and of(CASTLES, "a2a3")[own].tolist() == [0, 0, 0, 0]
    assert of(IN_PASSING, "e5f6")[own].tolist() == [0, 0, 0, 1] and of(IN_PASSING, "e5e6")[own].tolist() == [0, 0, 0, 0]
    # A promotion is counted as the pawn becoming a queen: a knight on e8 would give check here, and a queen does not.
    assert of(PROMOTES, "e7e8q")[own].tolist() == [0, 0, 1, 0] and of(PROMOTES, "e7d8q")[own].tolist() == [0, 0, 1, 0]
    assert chess.Board(PROMOTES).gives_check(chess.Move.from_uci("e7e8n"))
    assert of("6k1/4P3/8/8/8/8/6K1/8 w - - 0 1", "e7e8q")[own].tolist() == [1, 0, 1, 0]
    # The two squares are counted as a model that predicts squares counts them.
    board = chess.Board(CASTLES)
    squares = square_features(board)
    taking = of(CASTLES, "c4e6")
    assert np.array_equal(taking[: len(SQUARE_HAND)], squares[chess.C4]) and np.array_equal(taking[len(SQUARE_HAND) : own.start], squares[chess.E6])
    black = chess.Board(AFTER_E4)
    assert np.array_equal(of(AFTER_E4, "g8f6")[: len(SQUARE_HAND)], square_features(black)[chess.G8 ^ 56])
    many = moves.move_features_of([CASTLES, AFTER_E4, ONE_MOVE])
    assert len(many) == chess.Board(CASTLES).legal_moves.count() + 20 + 1
    assert moves.move_features_of([]).shape == (0, len(moves.MOVE_HAND))


def test_a_dataset_s_moves_are_worked_out_once_and_kept_under_its_build_s_name(temp_lab, monkeypatch):
    fens = [chess.STARTING_FEN, ONE_MOVE, PROMOTES]
    empty = np.zeros((3, 64), dtype=np.uint8)
    dataset = store.Dataset(
        name="tiny", rows=pl.DataFrame({"fen": fens}), tokens=empty, marks=empty.astype(np.uint16), manifest={"fingerprint": "ab" * 32}
    )
    store.dataset_dir("tiny").mkdir(parents=True)
    first = moves.moves_of(dataset)
    assert np.array_equal(first, moves.legal_pairs(fens))
    assert [path.name for path in store.dataset_dir("tiny").iterdir()] == ["moves-abababababababab.npz"]
    with monkeypatch.context() as patch:
        patch.setattr(moves, "legal_pairs", lambda *args, **kwargs: pytest.fail("worked out again"))
        assert np.array_equal(moves.moves_of(dataset), first)
    # Another build of the dataset has another name for them.
    other = store.Dataset(name="tiny", rows=dataset.rows.head(2), tokens=empty[:2], marks=dataset.marks[:2], manifest={"fingerprint": "cd" * 32})
    assert moves.moves_of(other).shape == (2, 20)
    assert len(list(store.dataset_dir("tiny").iterdir())) == 2
