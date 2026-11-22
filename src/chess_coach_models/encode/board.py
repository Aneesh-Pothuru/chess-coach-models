"""A position as the networks read it.

Every board is seen from the side to move: its own pieces are tokens 1 to 6
(pawn, knight, bishop, rook, queen, king), the opponent's 7 to 12, an empty
square 0, and when Black is to move the board is turned so the mover always
plays up the board. A model then learns one game, not a white one and a black
one.

``marks`` add what the task knows about squares, one bit a channel: channel 0
is always the en passant square, and a task names the rest (the last move, the
squares of a puzzle's solution). Castling rights travel as four numbers, the
mover's first.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

import numpy as np


TOKENS = 13
EN_PASSANT = 0
MAX_MARKS = 16
CASTLING = ("castle_own_king", "castle_own_queen", "castle_opp_king", "castle_opp_queen")

_CODE = {piece: index + 1 for index, piece in enumerate("PNBRQKpnbrqk")}
_SWAP = bytes([0, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]) + bytes(range(13, 256))


def square(name: str, white_to_move: bool) -> int:
    """A square such as ``e4`` as its index on the mover's board (a1 is 0, h8 is 63)."""
    index = (ord(name[0]) - 97) + 8 * (int(name[1]) - 1)
    return index if white_to_move else index ^ 56


def white_to_move(fen: str) -> bool:
    return fen.split(" ", 2)[1] == "w"


def encode_fen(fen: str) -> tuple[bytes, int, tuple[int, int, int, int]]:
    """A FEN as 64 tokens, its en passant square (or -1) and its castling rights, all from the mover's side."""
    placement, turn, castling, en_passant = fen.split(" ")[:4]
    board = bytearray(64)
    rank, file = 7, 0
    for char in placement:
        if char == "/":
            rank, file = rank - 1, 0
        elif char.isdigit():
            file += int(char)
        else:
            board[rank * 8 + file] = _CODE[char]
            file += 1
    white = turn == "w"
    if white:
        tokens = bytes(board)
        rights = ("K" in castling, "Q" in castling, "k" in castling, "q" in castling)
    else:
        swapped = board.translate(_SWAP)
        tokens = b"".join(swapped[row * 8 : row * 8 + 8] for row in range(7, -1, -1))
        rights = ("k" in castling, "q" in castling, "K" in castling, "Q" in castling)
    target = -1 if en_passant == "-" else square(en_passant, white)
    return tokens, target, tuple(int(right) for right in rights)


def move_squares(uci: str, white: bool) -> tuple[int, int]:
    """The from and to squares of a UCI move on the mover's board."""
    return square(uci[0:2], white), square(uci[2:4], white)


def encode_positions(
    fens: Sequence[str], square_marks: Iterable[Sequence[tuple[int, int]]]
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Boards for a batch of FENs.

    ``square_marks`` gives, for each FEN, its ``(channel, square)`` pairs with
    squares already on the mover's board (``move_squares``). Returns tokens
    ``[n, 64]`` (uint8), marks ``[n, 64]`` (uint16 bit sets) and castling
    rights ``[n, 4]`` (float32).
    """
    count = len(fens)
    tokens = np.zeros((count, 64), dtype=np.uint8)
    marks = np.zeros((count, 64), dtype=np.uint16)
    castling = np.zeros((count, 4), dtype=np.float32)
    for row, (fen, pairs) in enumerate(zip(fens, square_marks, strict=True)):
        board, target, rights = encode_fen(fen)
        tokens[row] = np.frombuffer(board, dtype=np.uint8)
        castling[row] = rights
        if target >= 0:
            marks[row, target] |= 1 << EN_PASSANT
        for channel, index in pairs:
            if not 0 < channel < MAX_MARKS:
                raise ValueError(f"mark channel {channel} is outside 1..{MAX_MARKS - 1}")
            marks[row, index] |= 1 << channel
    return tokens, marks, castling


def mark_planes(marks: np.ndarray, channels: int) -> np.ndarray:
    """Bit-set marks ``[n, 64]`` as 0/1 planes ``[n, 64, channels]``."""
    bits = np.arange(channels, dtype=np.uint16)
    return ((marks[..., None] >> bits) & 1).astype(np.float32)
