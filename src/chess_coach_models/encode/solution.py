"""Intermediate and final board encodings along a puzzle's solution line.

A puzzle dataset stores the starting position the solver sees (``tokens``) and
square bitmasks for the solution moves (``marks``). Rare themes — especially
checkmate shapes (``epauletteMate``, ``operaMate``, ``pillsburysMate``),
end-of-line traps and multi-move interference — depend directly on where pieces
stand after the first move and at the end of the solution.

``solution_boards`` replays ``(fen, line)`` for each row and returns
``[n, 2, 64]`` uint8 tokens:

- index 0: the board after the solver's first move;
- index 1: the final board after the complete solution line.

Both boards stay in the **original solver's** coordinate frame and piece
numbering (1..6 solver's pieces, 7..12 opponent's pieces, mover playing up the
board), so every square index aligns with ``dataset.tokens``. Results are
cached beside the dataset keyed by its fingerprint so no dataset rebuild or
fingerprint change is needed.
"""

from __future__ import annotations

from collections.abc import Sequence

import chess
import numpy as np

from ..data.store import Dataset, dataset_dir, worker_pool
from .board import _CODE, _SWAP

POOL_FROM = 20_000
CHUNK = 4_000


def _encode_from_solver(board: chess.Board, solver_is_white: bool) -> bytes:
    """Encode ``board`` as 64 square tokens from the original solver's perspective."""
    placement = board.board_fen()
    arr = bytearray(64)
    rank, file = 7, 0
    for char in placement:
        if char == "/":
            rank, file = rank - 1, 0
        elif char.isdigit():
            file += int(char)
        else:
            arr[rank * 8 + file] = _CODE[char]
            file += 1
    if solver_is_white:
        return bytes(arr)
    swapped = arr.translate(_SWAP)
    return b"".join(swapped[row * 8 : row * 8 + 8] for row in range(7, -1, -1))


def replay_pair(fen: str, line: str) -> tuple[bytes, bytes]:
    """Return ``(after_first_move, final_board)`` token bytes from the solver's perspective."""
    board = chess.Board(fen)
    solver_white = board.turn == chess.WHITE
    ucis = line.split()
    after1 = None
    for idx, uci in enumerate(ucis):
        try:
            move = board.parse_uci(uci)
        except ValueError:
            break
        board.push(move)
        if idx == 0:
            after1 = _encode_from_solver(board, solver_white)
    end = _encode_from_solver(board, solver_white)
    if after1 is None:
        after1 = end
    return after1, end


def _replay_chunk(pairs: Sequence[tuple[str, str]]) -> np.ndarray:
    out = np.empty((len(pairs), 2, 64), dtype=np.uint8)
    for row, (fen, line) in enumerate(pairs):
        after1, end = replay_pair(fen, line)
        out[row, 0] = np.frombuffer(after1, dtype=np.uint8)
        out[row, 1] = np.frombuffer(end, dtype=np.uint8)
    return out


def solution_boards(dataset: Dataset, *, workers: int | None = None) -> np.ndarray:
    """Return ``[n, 2, 64]`` uint8 ``(after1, end)`` tokens for every row, cached by fingerprint."""
    fingerprint = dataset.manifest.get("fingerprint")
    cache = dataset_dir(dataset.name) / f"solution_boards.{fingerprint[:16]}.npy" if fingerprint else None
    if cache is not None and cache.exists():
        loaded = np.load(cache)
        if loaded.shape == (len(dataset.rows), 2, 64):
            return loaded
    pairs = list(zip(dataset.rows["fen"].to_list(), dataset.rows["line"].to_list(), strict=True))
    if len(pairs) < POOL_FROM:
        result = _replay_chunk(pairs)
    else:
        chunks = [pairs[start : start + CHUNK] for start in range(0, len(pairs), CHUNK)]
        with worker_pool(workers) as pool:
            result = np.concatenate(pool.map(_replay_chunk, chunks), axis=0)
    if cache is not None and cache.parent.exists():
        tmp = cache.with_suffix(".tmp.npy")
        np.save(tmp, result)
        tmp.replace(cache)
    return result
