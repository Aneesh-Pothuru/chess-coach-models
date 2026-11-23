"""Plain words for the names a dataset gives its columns, its auxiliary planes and its hand-crafted features.

A paper's reader never sees ``log_opponent_clock``. Each name has a short label
for a chart or a table cell, and a sentence for the table that says what a
model is given. A test holds every name a model reads, or its analysis plan
shows, to an entry here, so a new column cannot reach a paper without its
words. The words are a paper's: standard chess and machine-learning terms
(``docs/writing.md``).
"""

from __future__ import annotations

from ..encode.hand import GROUPS as GROUP_FEATURES


# name: (label, what it is)
COLUMNS: dict[str, tuple[str, str]] = {
    # What an example is about.
    "rating": ("puzzle rating", "The puzzle's Lichess rating (Glicko-2)."),
    "rating_deviation": ("rating deviation", "The Glicko-2 deviation of the puzzle's rating, which measures how uncertain the rating still is."),
    "plays": ("attempts", "The number of times the puzzle has been attempted on Lichess."),
    "themes": ("themes", "The theme tags that Lichess assigns to the puzzle."),
    "speed": ("game speed", "The game's speed class on Lichess: blitz, rapid or classical."),
    "found": ("found", "Whether the move played was the first move of the tactic."),
    "move": ("move played", "The move the player made in the position, one of its legal moves."),
    "blunder": ("blunder", "Whether the move played lost more win probability than the blunder threshold."),
    "spent": ("time spent", "The time spent on the move in seconds: the mover's clock before the move, minus the clock after it, plus the increment."),
    "log_spent": ("log time spent", "The time spent on the move, as log(1 + seconds)."),
    "win_after": ("win probability after the move", "The mover's win probability implied by the engine evaluation after the move, in percent."),
    "loss": ("win probability lost by the move", "The mover's win probability before the move minus that after it, in percentage points."),
    "mover_score": ("mover's result", "The game result for the mover: 1 for a win, 0.5 for a draw, 0 for a loss."),
    "plies": ("game length in plies", "The length of the whole game in plies (half-moves)."),
    "win": ("engine win probability", "The mover's win probability implied by the engine's deepest evaluation of the position, in percent."),
    "cp": ("evaluation in centipawns", "The engine evaluation in centipawns from White's point of view, where the engine reports one."),
    "mate": ("mate in", "The number of moves to mate found by the engine, positive when White mates, where it reports one."),
    "depth": ("evaluation depth", "The search depth of the engine evaluation, in plies."),
    "men": ("pieces on the board", "The number of pieces and pawns on the board, including both kings."),
    "clock": ("mover's clock", "The time left on the mover's clock, in seconds."),
    "opponent_clock": ("opponent's clock", "The time left on the opponent's clock, in seconds."),
    "base": ("base time", "The initial time of the time control, in seconds."),
    "player_elo": ("player's rating", "The Lichess rating of the player whose moves form the example."),
    "elo_gap": ("rating difference to the opponent", "The player's Lichess rating minus the opponent's."),
    "side": ("player's colour", "Whether the player had White or Black."),
    "player_score": ("player's result", "The game result for the player: 1 for a win, 0.5 for a draw, 0 for a loss."),
    "steps": ("moves in the sequence", "The number of the player's moves in the example, in order: those that have an engine evaluation and clock times."),
    "worst_ply": ("ply of the most costly move", "The ply at which the player made the move that lost the most win probability."),
    "capture": ("move is a capture", "Whether the move played was a capture."),
    "check": ("move gives check", "Whether the move played gave check."),
    # Scalar context features: what every model is given beside the board.
    "mover_elo": ("mover's rating", "The Lichess rating of the side to move."),
    "opponent_elo": ("opponent's rating", "The Lichess rating of the opponent."),
    "log_clock": ("mover's clock", "The time left on the mover's clock, as log(1 + seconds)."),
    "log_opponent_clock": ("opponent's clock", "The time left on the opponent's clock, as log(1 + seconds)."),
    "log_base": ("base time", "The initial time of the time control, as log(1 + seconds)."),
    "increment": ("increment", "The increment of the time control: the seconds added after each move."),
    "ply": ("ply", "The ply (half-move) number of the position in the game."),
    "win_before": (
        "win probability before the move",
        "The mover's win probability implied by the engine evaluation of the position, in percent.",
    ),
    "win_prior": (
        "win probability before the opponent's mistake",
        "The mover's win probability implied by the engine evaluation one move earlier, before the opponent's mistake, in percent.",
    ),
    "solver_moves": ("solution length", "The number of moves the solver has to find."),
    "castle_own_king": ("mover can castle kingside", "Whether the mover still has the right to castle kingside."),
    "castle_own_queen": ("mover can castle queenside", "Whether the mover still has the right to castle queenside."),
    "castle_opp_king": ("opponent can castle kingside", "Whether the opponent still has the right to castle kingside."),
    "castle_opp_queen": ("opponent can castle queenside", "Whether the opponent still has the right to castle queenside."),
    # Hand-crafted features of the position.
    "material_count": ("total material", "The total material of both sides, counting a pawn as 1, a knight as 3, a bishop as 3.25, a rook as 5 and a queen as 9."),
    "material_imbalance": ("material balance", "The mover's material minus the opponent's, on the same scale."),
    "phase_piece_count": ("minor and major pieces", "The number of knights, bishops, rooks and queens on the board, both sides together."),
    "in_check": ("mover in check", "Whether the mover is in check."),
    "legal_moves": ("legal moves", "The number of legal moves the mover has."),
    "legal_captures": ("legal captures", "The number of the mover's legal moves that are captures."),
    "legal_checks": ("legal checks", "The number of the mover's legal moves that give check."),
    "hanging_own": ("mover's hanging pieces", "The number of the mover's pieces that are attacked by a less valuable piece, or attacked and not defended."),
    "hanging_opponent": ("opponent's hanging pieces", "The number of the opponent's pieces that are attacked by a less valuable piece, or attacked and not defended."),
    "passed_pawns_own": ("mover's passed pawns", "The number of the mover's pawns with no enemy pawn ahead of them on their own or an adjacent file."),
    "passed_pawns_opponent": ("opponent's passed pawns", "The number of the opponent's pawns with no enemy pawn ahead of them on their own or an adjacent file."),
    "attackers_near_own_king": ("attacks near the mover's king", "The number of attacks by the opponent on the squares adjacent to the mover's king."),
    "attackers_near_opponent_king": ("attacks near the opponent's king", "The number of attacks by the mover on the squares adjacent to the opponent's king."),
    # Hand-crafted features of a line of moves.
    "first_piece": ("piece moved first", "The piece that makes the first move of the line, from pawn (1) to king (6)."),
    "first_capture": ("first move is a capture", "Whether the first move of the line is a capture."),
    "first_captured_value": ("value captured by the first move", "The value of the piece captured by the first move of the line."),
    "first_check": ("first move gives check", "Whether the first move of the line gives check."),
    "first_promotion": ("first move promotes", "Whether the first move of the line promotes a pawn."),
    "first_distance": ("distance of the first move", "The distance covered by the first move, in king moves (Chebyshev distance)."),
    "first_backward": ("first move is a retreat", "Whether the first move goes backward, towards the mover's own side of the board."),
    "first_to_attacked": ("first move to an attacked square", "Whether the destination square of the first move is attacked by the opponent."),
    "first_sacrifice": ("first move is a sacrifice", "Whether the piece moved first can be captured on its destination square, by a less valuable piece or while undefended, having captured less than its own value."),
    "line_checks": ("checks in the solution", "The number of the solver's moves that give check."),
    "line_captures": ("captures in the solution", "The number of the solver's moves that are captures."),
    "line_quiet": ("quiet moves in the solution", "The number of the solver's moves that are neither captures nor checks."),
    "line_promotions": ("promotions in the solution", "The number of the solver's moves that promote a pawn."),
    "line_pieces_moved": ("pieces moved in the solution", "The number of different pieces the solver moves."),
    "line_sacrifices": ("sacrifices in the solution", "The number of the solver's moves that sacrifice material."),
    "line_max_distance": ("longest move in the solution", "The largest distance covered by one of the solver's moves."),
    "ends_in_mate": ("solution ends in mate", "Whether the line ends in checkmate."),
    "reply_captures": ("captures among the replies", "The number of the opponent's replies in the line that are captures."),
    "setup_capture": ("opponent's last move is a capture", "Whether the opponent's move that leads to the position was a capture."),
    "final_material_gain": ("material won by the solution", "The material balance after the line minus the balance before it."),
    # Aggregates over one player's moves in one game.
    "loss_mean": ("mean win probability lost per move", "The mean win probability lost by the player's moves, in percentage points."),
    "loss_median": ("median win probability lost per move", "The median win probability lost by the player's moves, in percentage points."),
    "loss_worst": ("win probability lost by the most costly move", "The win probability lost by the player's most costly move, in percentage points."),
    "loss_over_5": ("share of moves losing over 5 points", "The share of the player's moves that lost more than 5 percentage points of win probability."),
    "loss_over_10": ("share of moves losing over 10 points", "The share of the player's moves that lost more than 10 percentage points of win probability."),
    "loss_over_20": ("share of moves losing over 20 points", "The share of the player's moves that lost more than 20 percentage points of win probability."),
    "win_before_mean": ("mean win probability", "The player's win probability before each of the moves, averaged over the moves, in percent."),
    "spent_mean": ("mean time per move", "The mean time the player spent on a move, in seconds."),
    "spent_median": ("median time per move", "The median time the player spent on a move, in seconds."),
    "spent_longest": ("longest time on a move", "The longest time the player spent on one move, in seconds."),
    "spent_under_2": ("share of moves under 2 seconds", "The share of the player's moves that took less than 2 seconds."),
    "spent_over_30": ("share of moves over 30 seconds", "The share of the player's moves that took more than 30 seconds."),
    "clock_lowest": ("lowest clock", "The lowest time on the player's clock before any of the moves, in seconds."),
    "clock_used": ("share of the clock used", "The share of the initial time that had elapsed before the last of the moves; an increment can make it negative."),
    "legal_moves_mean": ("mean number of legal moves", "The number of legal moves the player had, averaged over the moves."),
    "capture_share": ("share of captures", "The share of the player's moves that were captures."),
    "check_share": ("share of checks", "The share of the player's moves that gave check."),
    # What the GBDT of a task that predicts squares is given for each square (encode/squares.py).
    "square_file": ("file of the square", "The square's file, counted from the mover's left."),
    "square_rank": ("rank of the square", "The square's rank, counted from the mover's side."),
    "square_piece": ("piece on the square", "The square's token, as the networks receive it: empty, one of the mover's six piece types, or one of the opponent's."),
    "square_en_passant": ("en passant target square", "Whether the square is the en passant target square."),
    "square_last_from": ("origin of the last move", "Whether the square is the origin square of the opponent's last move."),
    "square_last_to": ("destination of the last move", "Whether the square is the destination square of the opponent's last move."),
    "square_setup_from": ("origin of the opponent's move", "Whether the square is the origin square of the opponent's move that leads to the position."),
    "square_setup_to": ("destination of the opponent's move", "Whether the square is the destination square of the opponent's move that leads to the position."),
    "square_value": ("value of the piece on the square", "The value of the piece on the square, on the scale used for material, or 0 for an empty square or a king."),
    "square_attackers_own": ("mover's attackers of the square", "The number of the mover's pieces that attack the square."),
    "square_attackers_opponent": ("opponent's attackers of the square", "The number of the opponent's pieces that attack the square."),
    "square_cheapest_own": ("mover's least valuable attacker of the square", "The value of the least valuable of the mover's pieces that attack the square, with a king counted above a queen, or 0 when none does."),
    "square_cheapest_opponent": ("opponent's least valuable attacker of the square", "The value of the least valuable of the opponent's pieces that attack the square, with a king counted above a queen, or 0 when none does."),
    "square_hanging": ("piece on the square is hanging", "Whether the piece on the square is attacked by a less valuable piece, or attacked and not defended."),
    "square_pinned": ("piece on the square is pinned", "Whether the piece on the square is pinned to its own king."),
    "square_moves_from": ("legal moves from the square", "The number of the mover's legal moves that start on the square."),
    "square_moves_to": ("legal moves to the square", "The number of the mover's legal moves that end on the square."),
    "square_captures_to": ("legal captures on the square", "The number of the mover's legal moves that capture on the square."),
    "square_checks_from": ("legal checks from the square", "The number of the mover's legal moves from the square that give check."),
    "square_checks_to": ("legal checks to the square", "The number of the mover's legal moves to the square that give check."),
    "square_to_own_king": ("distance to the mover's king", "The distance from the square to the mover's king, in king moves."),
    "square_to_opponent_king": ("distance to the opponent's king", "The distance from the square to the opponent's king, in king moves."),
    # What the GBDT of a task that predicts the move is given for each legal move (encode/moves.py). The
    # features of its two squares are named after a square's own feature, and worded from it (``_entry``).
    "move_from_file": ("file of the origin square", "The file of the move's origin square, counted from the mover's left."),
    "move_from_rank": ("rank of the origin square", "The rank of the move's origin square, counted from the mover's side."),
    "move_to_file": ("file of the destination square", "The file of the move's destination square, counted from the mover's left."),
    "move_to_rank": ("rank of the destination square", "The rank of the move's destination square, counted from the mover's side."),
    "move_files": ("files moved", "The number of files the move goes to the mover's right, negative for a move to the left."),
    "move_ranks": ("ranks moved", "The number of ranks the move goes up the board, negative for a move backward."),
    "move_piece": ("piece moved", "The type of the piece that moves, as the networks receive it."),
    "move_takes": ("piece on the destination square", "The token of the destination square, as the networks receive it: empty, or one of the opponent's piece types."),
    "move_check": ("move gives check", "Whether the move gives check."),
    "move_castles": ("move castles", "Whether the move is castling."),
    "move_promotes": ("move promotes", "Whether the move promotes a pawn."),
    "move_in_passing": ("move captures en passant", "Whether the move captures a pawn en passant."),
    # What an example is shown with.
    "puzzle_id": ("puzzle", "The puzzle's identifier on Lichess."),
}

# A feature of one of a move's two squares is a square's feature with the end of the move before its name
# (``from_square_hanging``, ``to_last_to``): which end, in a label and in a sentence.
ENDS: dict[str, tuple[str, str]] = {
    "from_": ("origin square", "the move's origin square"),
    "to_": ("destination square", "the move's destination square"),
}

MARKS: dict[str, str] = {
    "en_passant": "The en passant target square, if there is one.",
    "last_from": "The origin square of the opponent's last move.",
    "last_to": "The destination square of the opponent's last move.",
    "setup_from": "The origin square of the opponent's move that leads to the position.",
    "setup_to": "The destination square of that move.",
    "solver1_from": "The origin square of the solver's first move.",
    "solver1_to": "The destination square of the solver's first move.",
    "reply1_from": "The origin square of the opponent's first reply.",
    "reply1_to": "The destination square of the opponent's first reply.",
    "solver2_from": "The origin square of the solver's second move.",
    "solver2_to": "The destination square of the solver's second move.",
    "reply2_from": "The origin square of the opponent's second reply.",
    "reply2_to": "The destination square of the opponent's second reply.",
    "solver3_from": "The origin square of the solver's third move.",
    "solver3_to": "The destination square of the solver's third move.",
    "later": "The origin and destination squares of all later moves of the line.",
    "move_from": "The origin square of the move played.",
    "move_to": "The destination square of the move played.",
}

# The groups the hand-crafted features come in, as a run that leaves one out names them, and as a paper says them.
GROUPS: dict[str, str] = {
    "material": "material",
    "mobility": "mobility",
    "hanging": "hanging pieces",
    "pawns": "passed pawns",
    "kings": "king safety",
    "setup": "opponent's last move",
    "first-move": "first move",
    "line": "solution line",
    "accuracy": "move accuracy",
    "tempo": "clock use",
    "choices": "available moves",
}

# How a column's values are printed beside a board: a unit after the number.
UNITS: dict[str, str] = {
    "clock": "s",
    "opponent_clock": "s",
    "spent": "s",
    "base": "s",
    "increment": "s",
    "spent_mean": "s",
    "spent_longest": "s",
    "win_before": "\\%",
    "win_after": "\\%",
    "win_prior": "\\%",
}


def _entry(name: str) -> tuple[str, str]:
    """A name's label and its sentence: its own, or for a feature of one of a move's two squares the square's
    feature said of that end of the move."""
    if name in COLUMNS:
        return COLUMNS[name]
    for end, (where, which) in ENDS.items():
        if name.startswith(end):
            rest = name[len(end) :]
            short, long = COLUMNS[rest if rest.startswith("square_") else f"square_{rest}"]
            return f"{where}: {short}", f"Of {which}: {long[:1].lower()}{long[1:]}"
    raise KeyError(name)


def label(name: str) -> str:
    """A column's short name for a chart or a table cell."""
    return _entry(name)[0]


def title(name: str) -> str:
    """A column's short name where it starts a line: the row of a table, the name of a bar."""
    text = label(name)
    return text[:1].upper() + text[1:]


def says(name: str) -> str:
    """What a column is, as a sentence."""
    return _entry(name)[1]


def group(name: str) -> str:
    """A group of hand-crafted features in a paper's words."""
    return GROUPS[name]
