"""Plain words for the names a dataset gives its columns, its marks and its hand features.

A paper's reader never sees ``log_opponent_clock``. Each name has a short label
for a chart or a table cell, and a sentence for the table that says what a
model reads. A test holds every name a model reads, or its analysis plan
shows, to an entry here, so a new column cannot reach a paper without its
words.
"""

from __future__ import annotations

from ..encode.hand import GROUPS as GROUP_FEATURES


# name: (label, what it is)
COLUMNS: dict[str, tuple[str, str]] = {
    # What a row is about.
    "rating": ("the puzzle's rating", "The puzzle's Lichess rating: where the crowd's attempts settled."),
    "rating_deviation": ("the rating's deviation", "The Glicko deviation of the puzzle's rating: how unsettled it still is."),
    "plays": ("attempts", "How many times the puzzle has been attempted on Lichess."),
    "themes": ("themes", "The themes Lichess tags the puzzle with."),
    "speed": ("speed of the game", "The game's speed class on Lichess: blitz, rapid or classical."),
    "found": ("found", "Whether the move played was the first move of the tactic."),
    "move": ("the move played", "The move the player made in the position, among the moves the position allows."),
    "blunder": ("blunder", "Whether the move played lost more than the blunder bar of win probability."),
    "spent": ("seconds spent", "The seconds the move took: the mover's clock before it, less the clock after it, plus the increment."),
    "log_spent": ("log seconds spent", "The seconds the move took, as log(1 + seconds)."),
    "win_after": ("winning chances after the move", "The mover's win probability from the engine's evaluation after the move, in percent."),
    "loss": ("winning chances the move lost", "The mover's win probability before the move less the one after it, in points of a percent."),
    "mover_score": ("the mover's result", "How the game ended for the player to move: a win 1, a draw 0.5, a loss 0."),
    "plies": ("plies in the game", "How many half-moves the whole game lasted."),
    "win": ("winning chances by the engine", "The mover's win probability from the engine's deepest evaluation of the position, in percent."),
    "cp": ("evaluation in centipawns", "The engine's evaluation in hundredths of a pawn, from White's side, where it gives one."),
    "mate": ("mate in", "The moves to mate the engine found, positive when White mates, where it found one."),
    "depth": ("depth of the evaluation", "How many half-moves deep the engine searched for the evaluation."),
    "men": ("men on the board", "Every piece and pawn on the board, both kings included."),
    "clock": ("the mover's clock", "The seconds left on the mover's clock."),
    "opponent_clock": ("the opponent's clock", "The seconds left on the opponent's clock."),
    "base": ("base time", "The time control's starting time, in seconds."),
    "player_elo": ("the player's rating", "The Lichess rating of the player whose moves the row holds."),
    "elo_gap": ("the player's rating less the opponent's", "The player's Lichess rating less the opponent's."),
    "side": ("the player's colour", "Whether the player had White or Black."),
    "player_score": ("the player's result", "How the game ended for the player: a win 1, a draw 0.5, a loss 0."),
    "steps": ("moves read", "How many of the player's moves the row holds, in order: those that carry an evaluation and clocks."),
    "worst_ply": ("ply of the costliest move", "How many half-moves into the game the player's costliest move was played."),
    "capture": ("move takes", "Whether the move played took something."),
    "check": ("move gives check", "Whether the move played gave check."),
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
    # Counts over one player's moves in one game.
    "loss_mean": ("winning chances lost a move", "What the player's moves lost on average, in points of winning chances."),
    "loss_median": ("median loss of a move", "The median of what the player's moves lost, in points of winning chances."),
    "loss_worst": ("loss of the costliest move", "What the player's costliest move lost, in points of winning chances."),
    "loss_over_5": ("moves that lost over 5 points", "The share of the player's moves that lost more than 5 points of winning chances."),
    "loss_over_10": ("moves that lost over 10 points", "The share of the player's moves that lost more than 10 points of winning chances."),
    "loss_over_20": ("moves that lost over 20 points", "The share of the player's moves that lost more than 20 points of winning chances."),
    "win_before_mean": ("winning chances on average", "The player's winning chances before each of the moves, averaged, in percent."),
    "spent_mean": ("seconds a move", "The seconds the player's moves took on average."),
    "spent_median": ("median seconds a move", "The median of the seconds the player's moves took."),
    "spent_longest": ("longest think", "The most seconds one of the player's moves took."),
    "spent_under_2": ("moves played at once", "The share of the player's moves that took under 2 seconds."),
    "spent_over_30": ("long thinks", "The share of the player's moves that took over 30 seconds."),
    "clock_lowest": ("lowest clock", "The fewest seconds the player had on the clock before one of the moves."),
    "clock_used": ("share of the clock used", "The share of the starting time gone when the player made the last of the moves, which an increment can make negative."),
    "legal_moves_mean": ("legal moves on average", "How many legal moves the player had, averaged over the moves."),
    "capture_share": ("share of moves that took", "The share of the player's moves that took something."),
    "check_share": ("share of moves that gave check", "The share of the player's moves that gave check."),
    # What the trees of a model that predicts squares read of each square (encode/squares.py).
    "square_file": ("the square's file", "The square's file, counted from the mover's left."),
    "square_rank": ("the square's rank", "The square's rank, counted from the mover's side."),
    "square_piece": ("piece on the square", "What stands on the square, as the networks read it: nothing, one of the mover's six kinds of piece, or one of the opponent's."),
    "square_en_passant": ("square a pawn may be taken on in passing", "Whether a pawn may be taken in passing on the square."),
    "square_last_from": ("square the last move left", "Whether the opponent's last move left the square."),
    "square_last_to": ("square the last move reached", "Whether the opponent's last move reached the square."),
    "square_setup_from": ("square the opponent's move left", "Whether the opponent's move that set the position up left the square."),
    "square_setup_to": ("square the opponent's move reached", "Whether the opponent's move that set the position up reached the square."),
    "square_value": ("value of the piece on the square", "The value of the piece on the square, on the scale the material is added up on, or 0 for an empty square or a king."),
    "square_attackers_own": ("mover's attackers of the square", "How many of the mover's pieces attack the square."),
    "square_attackers_opponent": ("opponent's attackers of the square", "How many of the opponent's pieces attack the square."),
    "square_cheapest_own": ("mover's cheapest attacker of the square", "The value of the cheapest of the mover's pieces that attack the square, a king counted above a queen, or 0 when none does."),
    "square_cheapest_opponent": ("opponent's cheapest attacker of the square", "The value of the cheapest of the opponent's pieces that attack the square, a king counted above a queen, or 0 when none does."),
    "square_hanging": ("piece on the square can be taken", "Whether something cheaper attacks the piece on the square, or anything attacks it while nothing defends it."),
    "square_pinned": ("piece on the square is pinned", "Whether the piece on the square is pinned to its own king."),
    "square_moves_from": ("moves that start on the square", "How many of the mover's legal moves start on the square."),
    "square_moves_to": ("moves that end on the square", "How many of the mover's legal moves end on the square."),
    "square_captures_to": ("captures that end on the square", "How many of the mover's legal moves take something on the square."),
    "square_checks_from": ("checks that start on the square", "How many of the mover's legal moves from the square give check."),
    "square_checks_to": ("checks that end on the square", "How many of the mover's legal moves to the square give check."),
    "square_to_own_king": ("distance to the mover's king", "How many king moves the square is from the mover's king."),
    "square_to_opponent_king": ("distance to the opponent's king", "How many king moves the square is from the opponent's king."),
    # What the trees of a model that predicts the move read of each legal move (encode/moves.py). What they
    # read of its two squares is named after a square's own feature, and worded from it (``_entry``).
    "move_from_file": ("file the move leaves", "The file of the square the move leaves, counted from the mover's left."),
    "move_from_rank": ("rank the move leaves", "The rank of the square the move leaves, counted from the mover's side."),
    "move_to_file": ("file the move reaches", "The file of the square the move reaches, counted from the mover's left."),
    "move_to_rank": ("rank the move reaches", "The rank of the square the move reaches, counted from the mover's side."),
    "move_files": ("files the move crosses", "How many files the move goes to the mover's right, or to the left when it is below 0."),
    "move_ranks": ("ranks the move crosses", "How many ranks the move goes up the board, or back down it when it is below 0."),
    "move_piece": ("piece that moves", "Which of the mover's six kinds of piece moves, as the networks read it."),
    "move_takes": ("what stands where the move lands", "What stands on the square the move reaches, as the networks read it: nothing, or one of the opponent's kinds of piece."),
    "move_check": ("move gives check", "Whether the move gives check."),
    "move_castles": ("move castles", "Whether the move castles."),
    "move_promotes": ("move promotes", "Whether the move promotes a pawn."),
    "move_in_passing": ("move takes in passing", "Whether the move takes a pawn in passing."),
    # What a row is shown with.
    "puzzle_id": ("puzzle", "The puzzle's id on Lichess."),
}

# A feature of one of a move's two squares is a square's feature with the end of the move before its name
# (``from_square_hanging``, ``to_last_to``): which end, in a label and in a sentence.
ENDS: dict[str, tuple[str, str]] = {
    "from_": ("where the move starts", "the square the move leaves"),
    "to_": ("where the move ends", "the square the move reaches"),
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
    "move_from": "The square the move played leaves.",
    "move_to": "The square the move played reaches.",
}

# The groups the hand features come in, as a run that leaves one out names them, and as a paper says them.
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
    """A group of hand features in a paper's words."""
    return GROUPS[name]
