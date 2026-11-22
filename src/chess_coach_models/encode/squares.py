"""What a person would count on each square, for the tree baseline of a model that predicts squares.

A network reads a board square by square. The trees of a model whose answer is
a set of squares read one row a square instead. Without the hand features a
row holds only what needs no chess: where the square is, what stands on it and
the marks the task lets a learner read there. With them it also holds what a
person would count on the square: who attacks it and with what, whether the
piece on it hangs or is pinned, how many of the mover's moves start and end
there, how many of those take or give check, and how far each king is.

Squares are numbered as the networks see them (``encode/board.py``): from the
mover's near left corner, so the mover always plays up the board.
"""

from __future__ import annotations

from collections.abc import Sequence

import chess
import numpy as np

from .hand import PIECE_VALUES


SQUARE_PLAIN = ("square_file", "square_rank", "square_piece")
SQUARE_HAND = (
    "square_value",
    "square_attackers_own",
    "square_attackers_opponent",
    "square_cheapest_own",
    "square_cheapest_opponent",
    "square_hanging",
    "square_pinned",
    "square_moves_from",
    "square_moves_to",
    "square_captures_to",
    "square_checks_from",
    "square_checks_to",
    "square_to_own_king",
    "square_to_opponent_king",
)
# A king takes last, so as the cheapest attacker of a square it counts above a queen, and no attacker is 0.
_KING_TAKES = 10.0
# Below this many positions a pool of workers costs more than it saves.
POOL_FROM = 20_000
CHUNK = 2_000


def _cheapest(board: chess.Board, attackers: chess.SquareSet) -> float:
    return min((PIECE_VALUES[board.piece_type_at(square)] or _KING_TAKES for square in attackers), default=0.0)


def square_features(board: chess.Board) -> np.ndarray:
    """The hand features of every square of one position, ``[64, len(SQUARE_HAND)]``, squares in the networks' order."""
    mover = board.turn
    flip = 0 if mover == chess.WHITE else 56
    out = np.zeros((64, len(SQUARE_HAND)), dtype=np.float32)
    own_king, opponent_king = board.king(mover), board.king(not mover)
    for square in chess.SQUARES:
        row = out[square ^ flip]
        own = board.attackers(mover, square)
        opponent = board.attackers(not mover, square)
        row[1], row[2] = len(own), len(opponent)
        row[3], row[4] = _cheapest(board, own), _cheapest(board, opponent)
        piece = board.piece_at(square)
        if piece is not None:
            value = PIECE_VALUES[piece.piece_type]
            row[0] = value
            if piece.piece_type != chess.KING:
                takers, defenders = (opponent, own) if piece.color == mover else (own, opponent)
                cheapest = row[4] if piece.color == mover else row[3]
                row[5] = float(bool(takers) and (cheapest < value or not defenders))
            row[6] = float(board.is_pinned(piece.color, square))
        row[12] = 0.0 if own_king is None else chess.square_distance(square, own_king)
        row[13] = 0.0 if opponent_king is None else chess.square_distance(square, opponent_king)
    for move in board.legal_moves:
        start, end = out[move.from_square ^ flip], out[move.to_square ^ flip]
        start[7] += 1
        end[8] += 1
        if board.is_capture(move):
            end[9] += 1
        if board.gives_check(move):
            start[10] += 1
            end[11] += 1
    return out


def _chunk(fens: Sequence[str]) -> np.ndarray:
    return np.stack([square_features(chess.Board(fen)) for fen in fens])


def squares_of(fens: Sequence[str], *, workers: int | None = None) -> np.ndarray:
    """``square_features`` for many positions, ``[n, 64, len(SQUARE_HAND)]``, in a pool of workers when there are enough."""
    if not len(fens):
        return np.zeros((0, 64, len(SQUARE_HAND)), dtype=np.float32)
    if len(fens) < POOL_FROM:
        return _chunk(fens)
    from ..data.store import worker_pool

    chunks = [list(fens[start : start + CHUNK]) for start in range(0, len(fens), CHUNK)]
    with worker_pool(workers) as pool:
        return np.concatenate(pool.map(_chunk, chunks))


def plain_of(tokens: np.ndarray) -> np.ndarray:
    """What needs no chess, for every square of every board: its file, its rank and the piece on it as the
    networks read it, ``[n, 64, len(SQUARE_PLAIN)]``."""
    out = np.zeros((*tokens.shape, len(SQUARE_PLAIN)), dtype=np.float32)
    out[..., 0] = np.arange(64) % 8
    out[..., 1] = np.arange(64) // 8
    out[..., 2] = tokens
    return out
