"""Hand-made features of a position and of a line, for the tree baselines.

A network reads the board itself. A gradient-boosted baseline reads these
counts instead, and every model's leaderboard keeps one, so a network's score
always stands beside what a few dozen plain features already explain.
"""

from __future__ import annotations

import chess

from ..features import (
    PIECE_VALUES,
    _hanging_piece_count,
    _king_attackers,
    _material,
    _passed_pawns,
)


POSITION_FEATURES = (
    "material_count",
    "material_imbalance",
    "phase_piece_count",
    "in_check",
    "legal_moves",
    "legal_captures",
    "legal_checks",
    "hanging_own",
    "hanging_opponent",
    "passed_pawns_own",
    "passed_pawns_opponent",
    "attackers_near_own_king",
    "attackers_near_opponent_king",
)

LINE_FEATURES = (
    "solver_moves",
    "first_piece",
    "first_capture",
    "first_captured_value",
    "first_check",
    "first_promotion",
    "first_distance",
    "first_backward",
    "first_to_attacked",
    "first_sacrifice",
    "line_checks",
    "line_captures",
    "line_quiet",
    "line_promotions",
    "line_pieces_moved",
    "line_sacrifices",
    "line_max_distance",
    "ends_in_mate",
    "reply_captures",
    "setup_capture",
    "final_material_gain",
)


def position_features(board: chess.Board) -> dict[str, float]:
    mover = board.turn
    own = _material(board, mover)
    opponent = _material(board, not mover)
    captures = 0
    checks = 0
    moves = 0
    for move in board.legal_moves:
        moves += 1
        captures += board.is_capture(move)
        checks += board.gives_check(move)
    minor_and_major = (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    return {
        "material_count": own + opponent,
        "material_imbalance": own - opponent,
        "phase_piece_count": float(
            sum(len(board.pieces(kind, color)) for color in chess.COLORS for kind in minor_and_major)
        ),
        "in_check": float(board.is_check()),
        "legal_moves": float(moves),
        "legal_captures": float(captures),
        "legal_checks": float(checks),
        "hanging_own": float(_hanging_piece_count(board, mover)),
        "hanging_opponent": float(_hanging_piece_count(board, not mover)),
        "passed_pawns_own": float(_passed_pawns(board, mover)),
        "passed_pawns_opponent": float(_passed_pawns(board, not mover)),
        "attackers_near_own_king": float(_king_attackers(board, mover)),
        "attackers_near_opponent_king": float(_king_attackers(board, not mover)),
    }


def _captured_value(board: chess.Board, move: chess.Move) -> float:
    if board.is_en_passant(move):
        return PIECE_VALUES[chess.PAWN]
    victim = board.piece_type_at(move.to_square)
    return PIECE_VALUES[victim] if victim else 0.0


def _is_sacrifice(board: chess.Board, move: chess.Move) -> bool:
    """The moved piece can be taken where it lands, by something cheaper or with nothing defending it, having won less than it is worth."""
    mover = board.turn
    moved = PIECE_VALUES[board.piece_type_at(move.from_square)]
    gained = _captured_value(board, move)
    board.push(move)
    try:
        takers = [
            board.piece_type_at(capture.from_square)
            for capture in board.generate_legal_moves(to_mask=chess.BB_SQUARES[move.to_square])
        ]
        if not takers:
            return False
        cheapest = min(
            (PIECE_VALUES[taker] for taker in takers if taker != chess.KING), default=float("inf")
        )
        defended = bool(board.attackers(mover, move.to_square))
        return gained < moved and (cheapest < moved or not defended)
    finally:
        board.pop()


def line_features(
    board: chess.Board, line: list[chess.Move], *, setup_capture: bool
) -> dict[str, float]:
    """What a puzzle's solution looks like.

    ``line`` alternates the solver's moves and the forced replies from
    ``board``, which is left as it was given. ``setup_capture`` says whether
    the opponent's move that led to ``board`` took something.
    """
    solver = board.turn
    start_balance = _material(board, solver) - _material(board, not solver)
    first = line[0]
    features = {
        "solver_moves": float((len(line) + 1) // 2),
        "first_piece": float(board.piece_type_at(first.from_square)),
        "first_capture": float(board.is_capture(first)),
        "first_captured_value": _captured_value(board, first),
        "first_check": float(board.gives_check(first)),
        "first_promotion": float(first.promotion is not None),
        "first_distance": float(chess.square_distance(first.from_square, first.to_square)),
        "first_backward": float(
            (chess.square_rank(first.to_square) - chess.square_rank(first.from_square))
            * (1 if solver == chess.WHITE else -1)
            < 0
        ),
        "first_to_attacked": float(board.is_attacked_by(not solver, first.to_square)),
        "first_sacrifice": float(_is_sacrifice(board, first)),
        "setup_capture": float(setup_capture),
    }
    checks = captures = quiet = promotions = sacrifices = reply_captures = 0
    longest = pieces_moved = 0
    standing: set[int] = set()
    walk = board.copy(stack=False)
    for index, move in enumerate(line):
        if index % 2 == 0:
            capture = walk.is_capture(move)
            check = walk.gives_check(move)
            checks += check
            captures += capture
            quiet += not capture and not check
            promotions += move.promotion is not None
            sacrifices += _is_sacrifice(walk, move)
            longest = max(longest, chess.square_distance(move.from_square, move.to_square))
            if move.from_square in standing:
                standing.discard(move.from_square)
            else:
                pieces_moved += 1
            standing.add(move.to_square)
        else:
            reply_captures += walk.is_capture(move)
            standing.discard(move.to_square)
        walk.push(move)
    features.update(
        {
            "line_checks": float(checks),
            "line_captures": float(captures),
            "line_quiet": float(quiet),
            "line_promotions": float(promotions),
            "line_pieces_moved": float(pieces_moved),
            "line_sacrifices": float(sacrifices),
            "line_max_distance": float(longest),
            "ends_in_mate": float(walk.is_checkmate()),
            "reply_captures": float(reply_captures),
            "final_material_gain": (_material(walk, solver) - _material(walk, not solver))
            - start_balance,
        }
    )
    return features
