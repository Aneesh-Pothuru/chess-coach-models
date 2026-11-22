"""The bands a model's results are also given by.

One score over every row hides who a model is good for, so each dataset puts
every row in a band and each run is scored band by band. A band is named by
its floor: the first one a value reaches. The names are part of a dataset's
rows, and so of its fingerprint.
"""

from __future__ import annotations


Floors = tuple[tuple[int, str], ...]

# The rating of the player to move in a game.
PLAYER: Floors = ((2000, "2000+"), (1700, "1700-2000"), (1400, "1400-1700"), (1100, "1100-1400"), (0, "<1100"))
# A puzzle's own rating.
PUZZLE: Floors = ((2200, "2200+"), (1800, "1800-2199"), (1400, "1400-1799"), (1000, "1000-1399"), (0, "<1000"))
# The player to move in a game a puzzle was cut from. Lichess cuts its puzzles from games between
# players rated about 1500 and up, so these start higher than the players' usual ones.
PUZZLE_PLAYER: Floors = ((2300, "2300+"), (2100, "2100-2299"), (1900, "1900-2099"), (1700, "1700-1899"), (0, "<1700"))


# The men on the board, kings and pawns among them: from a full board down to a bare ending.
MEN: Floors = ((25, "25-32"), (17, "17-24"), (9, "9-16"), (0, "<9"))


def band(value: float, floors: Floors) -> str:
    return next(name for floor, name in floors if value >= floor)


def rating_band(elo: int | float) -> str:
    """The band of a player's rating."""
    return band(int(elo), PLAYER)


def men_band(men: int) -> str:
    """The band of a position by how many men are on the board."""
    return band(int(men), MEN)


def order(name: str) -> tuple[int, int]:
    """A sort key that puts bands in order by their first number, an open lower band such as ``<1000`` first."""
    digits = "".join(char if char.isdigit() else " " for char in name).split()
    return (int(digits[0]) if digits else 0, 0 if name.startswith("<") else 1)
