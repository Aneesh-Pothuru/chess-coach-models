"""Plain words for the names a dataset gives its columns, its marks and its hand features.

A paper's reader never sees ``log_opponent_clock``. Each name has a short label
for a chart or a table cell, and a sentence for the table that says what a
model reads. A test holds every name a model reads, or its analysis plan
shows, to an entry here, so a new column cannot reach a paper without its
words.
"""

from __future__ import annotations


# name: (label, what it is)
COLUMNS: dict[str, tuple[str, str]] = {
    # What a row is about.
    "rating": ("the puzzle's rating", "The puzzle's Lichess rating: where the crowd's attempts settled."),
    "rating_deviation": ("the rating's deviation", "The Glicko deviation of the puzzle's rating: how unsettled it still is."),
    "plays": ("attempts", "How many times the puzzle has been attempted on Lichess."),
    "themes": ("themes", "The themes Lichess tags the puzzle with."),
    "speed": ("speed of the game", "The game's speed class on Lichess: blitz, rapid or classical."),
    "found": ("found", "Whether the move played was the first move of the tactic."),
    "blunder": ("blunder", "Whether the move played lost more than the blunder bar of win probability."),
    "spent": ("seconds spent", "The seconds the move took: the mover's clock before it, less the clock after it, plus the increment."),
    "log_spent": ("log seconds spent", "The seconds the move took, as log(1 + seconds)."),
    "win_after": ("winning chances after the move", "The mover's win probability from the engine's evaluation after the move, in percent."),
    "clock": ("the mover's clock", "The seconds left on the mover's clock."),
    "opponent_clock": ("the opponent's clock", "The seconds left on the opponent's clock."),
    "base": ("base time", "The time control's starting time, in seconds."),
    # Context numbers: what every learner reads beside the board.
    "mover_elo": ("the mover's rating", "The Lichess rating of the player to move."),
    "opponent_elo": ("the opponent's rating", "The Lichess rating of the opponent."),
    "log_clock": ("the mover's clock", "The seconds left on the mover's clock, as log(1 + seconds)."),
    "log_opponent_clock": ("the opponent's clock", "The seconds left on the opponent's clock, as log(1 + seconds)."),
    "log_base": ("base time", "The time control's starting time, as log(1 + seconds)."),
    "increment": ("increment", "The seconds the time control adds after each move."),
    "ply": ("ply of the game", "How many half-moves into the game the position is."),
    "win_before": (
        "winning chances before the move",
        "The mover's win probability from the engine's evaluation of the position, in percent.",
    ),
    "win_prior": (
        "winning chances before the mistake",
        "The mover's win probability from the engine's evaluation one move earlier, before the opponent's mistake, in percent.",
    ),
    "solver_moves": ("moves in the line", "How many moves the solver has to find."),
    "castle_own_king": ("mover may castle short", "Whether the mover may still castle on the king's side."),
    "castle_own_queen": ("mover may castle long", "Whether the mover may still castle on the queen's side."),
    "castle_opp_king": ("opponent may castle short", "Whether the opponent may still castle on the king's side."),
    "castle_opp_queen": ("opponent may castle long", "Whether the opponent may still castle on the queen's side."),
    # Hand features of the position.
    "material_count": ("material on the board", "Both sides' material added up, a pawn as 1, a knight 3, a bishop 3.25, a rook 5, a queen 9."),
    "material_imbalance": ("material balance", "The mover's material less the opponent's, on the same scale."),
    "phase_piece_count": ("pieces left", "Knights, bishops, rooks and queens still on the board, both sides."),
    "in_check": ("mover in check", "Whether the mover is in check."),
    "legal_moves": ("legal moves", "How many legal moves the mover has."),
    "legal_captures": ("captures on offer", "How many of the mover's legal moves take something."),
    "legal_checks": ("checks on offer", "How many of the mover's legal moves give check."),
    "hanging_own": ("mover's pieces that can be taken", "The mover's pieces that something cheaper attacks, or that anything attacks while nothing defends them."),
    "hanging_opponent": ("opponent's pieces that can be taken", "The opponent's pieces that something cheaper attacks, or that anything attacks while nothing defends them."),
    "passed_pawns_own": ("mover's passed pawns", "The mover's pawns with no enemy pawn ahead of them on their file or a neighbouring one."),
    "passed_pawns_opponent": ("opponent's passed pawns", "The opponent's pawns with no enemy pawn ahead of them on their file or a neighbouring one."),
    "attackers_near_own_king": ("attacks near the mover's king", "How many attacks the opponent has on the squares around the mover's king."),
    "attackers_near_opponent_king": ("attacks near the opponent's king", "How many attacks the mover has on the squares around the opponent's king."),
    # Hand features of a line.
    "first_piece": ("piece that moves first", "Which piece makes the line's first move, from pawn (1) to king (6)."),
    "first_capture": ("first move takes", "Whether the line's first move takes something."),
    "first_captured_value": ("value the first move takes", "The value of what the line's first move takes."),
    "first_check": ("first move checks", "Whether the line's first move gives check."),
    "first_promotion": ("first move promotes", "Whether the line's first move promotes a pawn."),
    "first_distance": ("distance of the first move", "How many squares the first move travels, counted as a king would walk it."),
    "first_backward": ("first move goes backward", "Whether the first move goes back toward the mover's own side."),
    "first_to_attacked": ("first move lands on an attacked square", "Whether the opponent attacks the square the first move lands on."),
    "first_sacrifice": ("first move gives up material", "Whether the piece that moves first can be taken where it lands, having won less than it is worth."),
    "line_checks": ("checks in the line", "How many of the solver's moves give check."),
    "line_captures": ("captures in the line", "How many of the solver's moves take something."),
    "line_quiet": ("quiet moves in the line", "How many of the solver's moves neither take nor check."),
    "line_promotions": ("promotions in the line", "How many of the solver's moves promote a pawn."),
    "line_pieces_moved": ("pieces the line moves", "How many different pieces the solver moves."),
    "line_sacrifices": ("sacrifices in the line", "How many of the solver's moves give up material."),
    "line_max_distance": ("longest move in the line", "The longest distance one of the solver's moves travels."),
    "ends_in_mate": ("line ends in mate", "Whether the line ends in checkmate."),
    "reply_captures": ("captures among the replies", "How many of the opponent's replies in the line take something."),
    "setup_capture": ("opponent's move took something", "Whether the opponent's move that set the position up took something."),
    "final_material_gain": ("material the line wins", "The material balance after the line, less the balance before it."),
    # What a row is shown with.
    "puzzle_id": ("puzzle", "The puzzle's id on Lichess."),
}

MARKS: dict[str, str] = {
    "en_passant": "The square a pawn may be taken on in passing.",
    "last_from": "The square the opponent's last move left.",
    "last_to": "The square the opponent's last move reached.",
    "setup_from": "The square the opponent's move left: the move that set the position up.",
    "setup_to": "The square that move reached.",
    "solver1_from": "The square the line's first move leaves.",
    "solver1_to": "The square the line's first move reaches.",
    "reply1_from": "The square the first reply leaves.",
    "reply1_to": "The square the first reply reaches.",
    "solver2_from": "The square the solver's second move leaves.",
    "solver2_to": "The square the solver's second move reaches.",
    "reply2_from": "The square the second reply leaves.",
    "reply2_to": "The square the second reply reaches.",
    "solver3_from": "The square the solver's third move leaves.",
    "solver3_to": "The square the solver's third move reaches.",
    "later": "Every square a later move of the line leaves or reaches.",
}

# How a column's values are printed beside a board: a unit after the number.
UNITS: dict[str, str] = {
    "clock": "s",
    "opponent_clock": "s",
    "spent": "s",
    "base": "s",
    "increment": "s",
    "win_before": "\\%",
    "win_after": "\\%",
    "win_prior": "\\%",
}


def label(name: str) -> str:
    """A column's short name for a chart or a table cell."""
    return COLUMNS[name][0]


def title(name: str) -> str:
    """A column's short name where it starts a line: the row of a table, the name of a bar."""
    text = label(name)
    return text[:1].upper() + text[1:]


def says(name: str) -> str:
    """What a column is, as a sentence."""
    return COLUMNS[name][1]
