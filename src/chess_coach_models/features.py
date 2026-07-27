from __future__ import annotations

from collections.abc import Iterable
from typing import Any

import chess

from .bands import rating_band
from .winprob import mover_win_percent


PIECE_VALUES = {
    chess.PAWN: 1.0,
    chess.KNIGHT: 3.0,
    chess.BISHOP: 3.25,
    chess.ROOK: 5.0,
    chess.QUEEN: 9.0,
    chess.KING: 0.0,
}

HAND_FEATURES = [
    "side_to_move_white",
    "mover_elo",
    "rating_band_index",
    "material_count",
    "material_imbalance",
    "phase_piece_count",
    "in_check",
    "legal_move_count",
    "hanging_piece_count",
    "passed_pawns_mover",
    "passed_pawns_opponent",
    "attackers_near_own_king",
    "castling_kingside",
    "castling_queenside",
    "current_win_pct",
    "abs_eval_cp",
]

MAIA_FEATURES = [
    "maia_entropy",
    "maia_top1_probability",
    "maia_stockfish_best_probability",
]


def _material(board: chess.Board, color: chess.Color) -> float:
    return sum(
        len(board.pieces(piece_type, color)) * value
        for piece_type, value in PIECE_VALUES.items()
    )


def _hanging_piece_count(board: chess.Board, color: chess.Color) -> int:
    """Cheap SEE proxy: attacked pieces whose cheapest attacker costs less."""
    count = 0
    opponent = not color
    for square, piece in board.piece_map().items():
        if piece.color != color or piece.piece_type == chess.KING:
            continue
        attackers = board.attackers(opponent, square)
        if not attackers:
            continue
        cheapest = min(
            PIECE_VALUES[board.piece_type_at(attacker)] for attacker in attackers
        )
        defended = bool(board.attackers(color, square))
        if cheapest < PIECE_VALUES[piece.piece_type] or not defended:
            count += 1
    return count


def _passed_pawns(board: chess.Board, color: chess.Color) -> int:
    enemy_pawns = board.pieces(chess.PAWN, not color)
    count = 0
    for square in board.pieces(chess.PAWN, color):
        file_index = chess.square_file(square)
        rank_index = chess.square_rank(square)
        blocked = False
        for enemy in enemy_pawns:
            enemy_file = chess.square_file(enemy)
            enemy_rank = chess.square_rank(enemy)
            in_lane = abs(enemy_file - file_index) <= 1
            ahead = enemy_rank > rank_index if color == chess.WHITE else enemy_rank < rank_index
            if in_lane and ahead:
                blocked = True
                break
        count += int(not blocked)
    return count


def _king_attackers(board: chess.Board, color: chess.Color) -> int:
    king = board.king(color)
    if king is None:
        return 0
    ring = chess.SquareSet(chess.BB_KING_ATTACKS[king])
    return sum(len(board.attackers(not color, square)) for square in ring)


def board_features(
    board_or_fen: chess.Board | str,
    mover_elo: int,
    eval_cp_white: float,
    bands: Iterable[dict[str, Any]],
) -> dict[str, float]:
    board = (
        board_or_fen.copy(stack=False)
        if isinstance(board_or_fen, chess.Board)
        else chess.Board(board_or_fen)
    )
    mover = board.turn
    band_names = [str(band["name"]) for band in bands]
    band = rating_band(mover_elo, bands)
    mover_material = _material(board, mover)
    opponent_material = _material(board, not mover)
    phase_pieces = sum(
        len(board.pieces(piece_type, color))
        for color in chess.COLORS
        for piece_type in (chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN)
    )
    return {
        "side_to_move_white": float(mover == chess.WHITE),
        "mover_elo": float(mover_elo),
        "rating_band_index": float(band_names.index(band) if band in band_names else 2),
        "material_count": mover_material + opponent_material,
        "material_imbalance": mover_material - opponent_material,
        "phase_piece_count": float(phase_pieces),
        "in_check": float(board.is_check()),
        "legal_move_count": float(board.legal_moves.count()),
        "hanging_piece_count": float(_hanging_piece_count(board, mover)),
        "passed_pawns_mover": float(_passed_pawns(board, mover)),
        "passed_pawns_opponent": float(_passed_pawns(board, not mover)),
        "attackers_near_own_king": float(_king_attackers(board, mover)),
        "castling_kingside": float(board.has_kingside_castling_rights(mover)),
        "castling_queenside": float(board.has_queenside_castling_rights(mover)),
        "current_win_pct": mover_win_percent(eval_cp_white, mover),
        "abs_eval_cp": abs(float(eval_cp_white)),
    }


def feature_matrix(
    rows: Iterable[dict[str, Any]],
    bands: Iterable[dict[str, Any]],
    *,
    include_maia: bool = False,
) -> tuple[list[dict[str, float]], list[str]]:
    names = HAND_FEATURES + (MAIA_FEATURES if include_maia else [])
    result = []
    for row in rows:
        features = board_features(
            row["fen"],
            int(row["mover_elo"]),
            float(row["eval_cp_white_before"]),
            bands,
        )
        if include_maia:
            for name in MAIA_FEATURES:
                features[name] = float(row[name])
        result.append({name: float(features[name]) for name in names})
    return result, names

