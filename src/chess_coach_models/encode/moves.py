"""The moves a position allows, as a model that predicts the move played reads them.

A move is the square it leaves and the square it reaches, both on the mover's
board (``encode/board.py``: the mover always plays up the board), as one
number: the first times 64 plus the second. A pawn that promotes has one
candidate whatever piece it becomes, so a row's candidates are its legal moves
with the four promotions on one pair of squares counted once. A row's
candidates are in rising order of that number, which is the same on every
machine.

The trees of such a model read one row a legal move. Without the hand features
a row holds what needs no chess: where the move leaves and lands, what moves
and what stands where it lands, and the marks the task lets a learner read on
both squares. With them it also holds what a person would count on the two
squares (``encode/squares.py``) and of the move itself: whether it gives
check, castles, promotes, or takes in passing, a promotion counted as the
pawn becoming a queen.
"""

from __future__ import annotations

from collections.abc import Sequence

import chess
import numpy as np

from .board import move_squares, white_to_move
from .squares import SQUARE_HAND, square_features


PAIRS = 64 * 64
MOVE_PLAIN = (
    "move_from_file",
    "move_from_rank",
    "move_to_file",
    "move_to_rank",
    "move_files",
    "move_ranks",
    "move_piece",
    "move_takes",
)
MOVE_OWN = ("move_check", "move_castles", "move_promotes", "move_in_passing")
MOVE_HAND = tuple(f"from_{name}" for name in SQUARE_HAND) + tuple(f"to_{name}" for name in SQUARE_HAND) + MOVE_OWN
# Below this many positions a pool of workers costs more than it saves.
POOL_FROM = 20_000
CHUNK = 2_000


def pair_of(uci: str, white: bool) -> int:
    """A UCI move as its pair of squares on the mover's board."""
    start, end = move_squares(uci, white)
    return start * 64 + end


def pairs_of(board: chess.Board) -> list[int]:
    """A position's candidates: its legal moves as pairs of squares on the mover's board, in rising order."""
    flip = 0 if board.turn == chess.WHITE else 56
    return sorted({(move.from_square ^ flip) * 64 + (move.to_square ^ flip) for move in board.legal_moves})


def _pairs_chunk(fens: Sequence[str]) -> list[list[int]]:
    return [pairs_of(chess.Board(fen)) for fen in fens]


def _pooled(work, fens: Sequence[str], workers: int | None) -> list:
    if len(fens) < POOL_FROM:
        return [work(fens)]
    from ..data.store import worker_pool

    chunks = [list(fens[start : start + CHUNK]) for start in range(0, len(fens), CHUNK)]
    with worker_pool(workers) as pool:
        return pool.map(work, chunks)


def filled_out(counts: np.ndarray, flat: np.ndarray) -> np.ndarray:
    """Rows of different lengths, given one after another, as one array as wide as the longest: ``[n, most]``,
    with -1 where a row has no candidate."""
    most = int(counts.max()) if len(counts) else 0
    held = np.arange(most)[None, :] < counts[:, None]
    out = np.full((len(counts), most), -1, dtype=np.int16)
    out[held] = flat
    return out


def legal_pairs(fens: Sequence[str], *, workers: int | None = None) -> np.ndarray:
    """Every position's candidates, ``[n, most]`` with -1 where a position has fewer legal moves than the one
    with the most. In a pool of workers when there are enough positions."""
    found = [pairs for chunk in _pooled(_pairs_chunk, fens, workers) for pairs in chunk]
    counts = np.fromiter((len(pairs) for pairs in found), dtype=np.int64, count=len(found))
    flat = np.fromiter((pair for pairs in found for pair in pairs), dtype=np.int16, count=int(counts.sum()))
    return filled_out(counts, flat)


def moves_of(dataset, *, workers: int | None = None) -> np.ndarray:
    """``legal_pairs`` for every row of a dataset of positions, kept beside the dataset once worked out.

    The file is named by the build's fingerprint, so another build of the dataset never reads it. A dataset
    that is not on disk, or that has no fingerprint, has them worked out each time.
    """
    from ..data.store import dataset_dir

    build = dataset.manifest.get("fingerprint")
    directory = dataset_dir(dataset.name)
    if build is None or not directory.exists():
        return legal_pairs(dataset.rows["fen"].to_list(), workers=workers)
    path = directory / f"moves-{build[:16]}.npz"
    if path.exists():
        with np.load(path) as kept:
            return filled_out(kept["counts"].astype(np.int64), kept["pairs"])
    pairs = legal_pairs(dataset.rows["fen"].to_list(), workers=workers)
    held = pairs >= 0
    # Under a name of its own first: a second run may be working the same file out.
    partial = path.with_name(f"{path.stem}.{np.random.default_rng().integers(1 << 32):08x}.npz")
    np.savez(partial, counts=held.sum(axis=1).astype(np.int16), pairs=pairs[held])
    partial.replace(path)
    return pairs


def played(pairs: np.ndarray, fens: Sequence[str], moves: Sequence[str], keys: Sequence[str]) -> np.ndarray:
    """Which of each row's candidates is the move that was played there, given as UCI. A row whose move is
    none of its legal moves stops the run: its position and its move do not belong together."""
    codes = np.fromiter(
        (pair_of(move, white_to_move(fen)) for fen, move in zip(fens, moves, strict=True)), dtype=np.int16, count=len(fens)
    )
    hit = pairs == codes[:, None]
    lost = np.flatnonzero(~hit.any(axis=1))
    if len(lost):
        row = int(lost[0])
        raise ValueError(
            f"{len(lost):,} rows name a move their position does not allow, the first {keys[row]}: {moves[row]} in {fens[row]}"
        )
    return hit.argmax(axis=1)


def plain_of(tokens: np.ndarray, pairs: np.ndarray) -> np.ndarray:
    """What needs no chess, for each move given as its position's board and its pair of squares,
    ``[moves, len(MOVE_PLAIN)]``: the files and ranks it leaves and reaches, how far it goes along each
    (forward is up the board), the piece that moves and what stands where it lands, as the networks read
    them."""
    start, end = pairs // 64, pairs % 64
    out = np.zeros((len(pairs), len(MOVE_PLAIN)), dtype=np.float32)
    out[:, 0], out[:, 1] = start % 8, start // 8
    out[:, 2], out[:, 3] = end % 8, end // 8
    out[:, 4], out[:, 5] = out[:, 2] - out[:, 0], out[:, 3] - out[:, 1]
    rows = np.arange(len(pairs))
    out[:, 6], out[:, 7] = tokens[rows, start], tokens[rows, end]
    return out


def move_features(board: chess.Board) -> np.ndarray:
    """What a person would count of each legal move of one position, ``[moves, len(MOVE_HAND)]``, the moves in
    the order ``pairs_of`` gives them: the squares it leaves and reaches as ``square_features`` counts them,
    and whether it gives check, castles, promotes or takes in passing. A promotion's four choices are one
    candidate, counted as the pawn becoming a queen."""
    flip = 0 if board.turn == chess.WHITE else 56
    own: dict[int, list[float]] = {}
    for move in board.legal_moves:
        if move.promotion not in (None, chess.QUEEN):
            continue
        own[(move.from_square ^ flip) * 64 + (move.to_square ^ flip)] = [
            float(board.gives_check(move)),
            float(board.is_castling(move)),
            float(move.promotion is not None),
            float(board.is_en_passant(move)),
        ]
    pairs = np.array(sorted(own), dtype=np.int64)
    squares = square_features(board)
    return np.concatenate(
        [squares[pairs // 64], squares[pairs % 64], np.array([own[pair] for pair in sorted(own)], dtype=np.float32).reshape(-1, len(MOVE_OWN))],
        axis=1,
    )


def _features_chunk(fens: Sequence[str]) -> np.ndarray:
    return np.concatenate([move_features(chess.Board(fen)) for fen in fens])


def move_features_of(fens: Sequence[str], *, workers: int | None = None) -> np.ndarray:
    """``move_features`` for many positions, their moves one position after another, in a pool of workers
    when there are enough."""
    if not len(fens):
        return np.zeros((0, len(MOVE_HAND)), dtype=np.float32)
    return np.concatenate(_pooled(_features_chunk, fens, workers))
