"""What each piece attacks, as tables a network can read a board's attacks from.

A piece's token and its square say which squares it would attack on an empty
board (``REACH``), and the squares strictly between two squares of one line say
what can stand in its way (``BETWEEN``). A board's attacks follow from the two
with no search: a piece attacks a square it reaches with nothing between them,
and it stands behind a square (a pin, a skewer, a battery, a discovered attack
waiting) when it reaches it with exactly one man between.

The tables are on the mover's board, as the tokens are (``encode/board.py``):
the mover's pawns take up the board and the opponent's down. ``attacks`` is the
plain reading of them, which the networks' own (``nets/model.py``) is held to.
"""

from __future__ import annotations

import numpy as np

from .board import TOKENS


# What attention can be told of two squares, the one that asks and the one it looks at: the first's
# piece attacks the second, the second's attacks the first, and the same two for a piece that stands
# behind one man.
RELATIONS = ("attacks", "attacked_by", "behind", "behind_it")

_KNIGHT = ((1, 2), (2, 1), (2, -1), (1, -2), (-1, -2), (-2, -1), (-2, 1), (-1, 2))
_STRAIGHT = ((1, 0), (-1, 0), (0, 1), (0, -1))
_DIAGONAL = ((1, 1), (1, -1), (-1, 1), (-1, -1))
# Tokens of the mover's men; the opponent's are six further on.
_PAWN, _KNIGHT_TOKEN, _BISHOP, _ROOK, _QUEEN, _KING = range(1, 7)


def _tables() -> tuple[np.ndarray, np.ndarray]:
    reach = np.zeros((TOKENS, 64, 64), dtype=bool)
    between = np.zeros((64, 64, 64), dtype=bool)

    def at(file: int, rank: int) -> int | None:
        return rank * 8 + file if 0 <= file < 8 and 0 <= rank < 8 else None

    for start in range(64):
        file, rank = start % 8, start // 8
        for theirs, up in ((0, 1), (6, -1)):
            steps = (
                (_PAWN, ((-1, up), (1, up))),
                (_KNIGHT_TOKEN, _KNIGHT),
                (_KING, _STRAIGHT + _DIAGONAL),
            )
            for token, moves in steps:
                for across, along in moves:
                    end = at(file + across, rank + along)
                    if end is not None:
                        reach[token + theirs, start, end] = True
        for directions, tokens in ((_DIAGONAL, (_BISHOP, _QUEEN)), (_STRAIGHT, (_ROOK, _QUEEN))):
            for across, along in directions:
                passed: list[int] = []
                end = at(file + across, rank + along)
                while end is not None:
                    for token in tokens:
                        reach[token, start, end] = reach[token + 6, start, end] = True
                    between[start, end, passed] = True
                    passed.append(end)
                    end = at(end % 8 + across, end // 8 + along)
    return reach, between


# REACH[token, a, b]: a piece with this token on square a attacks square b on an empty board.
# BETWEEN[a, b, c]: square c is strictly between a and b on a rank, a file or a diagonal.
REACH, BETWEEN = _tables()


def attacks(tokens: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """For boards ``[n, 64]`` of tokens: ``hits[n, a, b]``, the piece on ``a`` attacks square ``b``, and
    ``behind[n, a, b]``, it would if the one man between them were gone. A man of either side stands in the
    way, and a piece attacks the squares of its own side's men as it does any other."""
    tokens = np.asarray(tokens)
    men = (tokens > 0).astype(np.int16)
    blockers = (men @ BETWEEN.reshape(4096, 64).T.astype(np.int16)).reshape(-1, 64, 64)
    reach = REACH[tokens, np.arange(64)]
    return reach & (blockers == 0), reach & (blockers == 1)
