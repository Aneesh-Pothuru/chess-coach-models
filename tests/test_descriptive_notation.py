import sys
from pathlib import Path

import chess

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "models" / "coach-narrator" / "corpus"))

from descriptive import ORIGINS, Reader, matches  # noqa: E402


def read_all(*texts: str) -> list[str]:
    reader = Reader()
    sans = []
    for text in texts:
        move = reader.read(text)
        assert move is not None, text
        sans.append(reader.board.san(move))
        reader.push(move)
    return sans


def test_a_game_in_descriptive_notation_reads_as_san():
    assert read_all(
        "P - Q 4", "P - Q 4", "P - Q B 4", "P - K 3", "Kt - Q B 3", "Kt - K B 3", "B - Kt 5", "B - K 2",
        "P - K 3", "Kt - K 5", "B × B", "Q × B", "B - Q 3", "Kt × Kt", "P × Kt", "Kt - Q 2", "Kt - B 3", "O - O",
    ) == ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7", "e3", "Ne4", "Bxe7", "Qxe7", "Bd3", "Nxc3", "bxc3", "Nd7", "Nf3", "O-O"]


def test_books_that_print_without_spaces_read_the_same():
    assert read_all("P-Q 4", "P-Q4", "P-QB4", "P-K3", "Kt-QB3", "P-QB4", "PxQP", "KPxP") == [
        "d4", "d5", "c4", "e6", "Nc3", "c5", "cxd5", "exd5"
    ]


def test_a_square_in_brackets_says_which_piece_moves():
    board = chess.Board("4k3/8/8/3R4/8/8/8/3RK3 w - - 0 1")
    assert len(matches(board, {}, "R - Q 3")) == 2
    assert [board.san(move) for move in matches(board, {}, "R (Q 5) - Q 3")] == ["R5d3"]
    assert [board.san(move) for move in matches(board, {}, "R (Q 1) - Q 3")] == ["R1d3"]


def test_a_move_that_fits_two_legal_moves_is_not_read_without_its_qualifier():
    board = chess.Board()
    assert len(matches(board, dict(ORIGINS), "Kt - B 3")) == 2
    assert Reader().read("Kt - B 3") is None
    assert read_all("K Kt - B 3") == ["Nf3"]
    assert read_all("Q Kt - B 3") == ["Nc3"]


def test_algebraic_columns_are_read_as_well():
    board = chess.Board()
    assert [board.san(move) for move in matches(board, {}, "Ktb1-c3")] == ["Nc3"]
    assert [board.san(move) for move in matches(board, {}, "d2-d4")] == ["d4"]
