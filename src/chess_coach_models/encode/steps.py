"""Per-move temporal and board-geometry features for sequence models (``game-rating``).

A sequence dataset (``data/sides.py``) stores every move's board as 64 square tokens,
square marks (en passant, the opponent's last move, and the player's move) and per-move
numbers (ply, both clocks, time spent, win probability before the move, win probability
lost, legal moves, capture, check and castling rights).

This module derives two feature groups from those stored arrays without touching the
dataset files or altering any dataset fingerprint:

- **Temporal features** from consecutive moves within each game: the opponent's implied
  win-probability loss and think time, clock fractions and differences, position
  decisiveness (distinguishing accuracy in live positions from one-sided ones),
  move-to-move deltas and running accuracy trajectories.
- **Board-geometry features** from each move's tokens and marks in vectorised NumPy
  with 64-bit occupancy bitboards: material, development, centre control, pawn structure
  (doubled, isolated and passed pawns), king position and pawn shield, moved and captured
  piece geometry, and exact attacker/defender counts on the move's squares and around
  both kings.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

from .relations import BETWEEN, REACH


# Piece values matching encode/hand.py (tokens 1..6 own P,N,B,R,Q,K; 7..12 opp P,N,B,R,Q,K).
_TOKEN_VALUES = np.array([0.0, 1.0, 3.0, 3.25, 5.0, 9.0, 0.0, 1.0, 3.0, 3.25, 5.0, 9.0, 0.0], dtype=np.float32)

# Precomputed square masks and coordinates on the 64-square mover board (a1=0 .. h8=63).
_SQUARES = np.arange(64, dtype=np.int64)
_FILES = _SQUARES % 8
_RANKS = _SQUARES // 8
_BIT = np.uint64(1) << _SQUARES.astype(np.uint64)

# Bitboard of squares strictly between square a and square b: shape [64, 64] uint64.
_BETWEEN_BB = (BETWEEN.astype(np.uint64) * _BIT[None, None, :]).sum(axis=2, dtype=np.uint64)

# King ring squares (up to 8 neighbours) padded with -1 for each square 0..63.
_KING_RING = np.full((64, 8), -1, dtype=np.int64)
_KING_RING_MASK = np.zeros((64, 8), dtype=bool)
for _sq in range(64):
    _f, _r = _sq % 8, _sq // 8
    _idx = 0
    for _df in (-1, 0, 1):
        for _dr in (-1, 0, 1):
            if _df == 0 and _dr == 0:
                continue
            _nf, _nr = _f + _df, _r + _dr
            if 0 <= _nf < 8 and 0 <= _nr < 8:
                _KING_RING[_sq, _idx] = _nr * 8 + _nf
                _KING_RING_MASK[_sq, _idx] = True
                _idx += 1

# Pawn shield squares directly in front of king (rank+1 for own king, rank-1 for opp king).
_OWN_SHIELD = np.zeros((64, 64), dtype=np.float32)
_OPP_SHIELD = np.zeros((64, 64), dtype=np.float32)
for _sq in range(64):
    _f, _r = _sq % 8, _sq // 8
    for _df in (-1, 0, 1):
        _nf = _f + _df
        if 0 <= _nf < 8:
            if _r + 1 < 8:
                _OWN_SHIELD[_sq, (_r + 1) * 8 + _nf] = 1.0
            if _r - 1 >= 0:
                _OPP_SHIELD[_sq, (_r - 1) * 8 + _nf] = 1.0

# Passed-pawn blocker masks: enemy pawns ahead on same or adjacent file.
_OWN_PASSED_MASK = np.zeros((64, 64), dtype=np.uint64)
_OPP_PASSED_MASK = np.zeros((64, 64), dtype=np.uint64)
for _sq in range(64):
    _f, _r = _sq % 8, _sq // 8
    for _other in range(64):
        _of, _or = _other % 8, _other // 8
        if abs(_of - _f) <= 1:
            if _or > _r:
                _OWN_PASSED_MASK[_sq, _other] = 1
            elif _or < _r:
                _OPP_PASSED_MASK[_sq, _other] = 1
_OWN_PASSED_BB = (_OWN_PASSED_MASK * _BIT[None, :]).sum(axis=1, dtype=np.uint64)
_OPP_PASSED_BB = (_OPP_PASSED_MASK * _BIT[None, :]).sum(axis=1, dtype=np.uint64)

# Masks for board regions.
_CENTER4 = np.zeros(64, dtype=bool)
_CENTER4[[27, 28, 35, 36]] = True  # d4, e4, d5, e5
_CENTER16 = (_FILES >= 2) & (_FILES <= 5) & (_RANKS >= 2) & (_RANKS <= 5)
_RANK0 = _RANKS == 0
_RANK7 = _RANKS == 7
_OWN_ADV5 = _RANKS >= 4
_OWN_ADV6 = _RANKS >= 5
_OPP_ADV5 = _RANKS <= 3
_OPP_ADV6 = _RANKS <= 2
_FILE_MASKS = np.stack([_FILES == f for f in range(8)], axis=0)  # [8, 64]
_ADJ_FILE = np.zeros((8, 8), dtype=bool)
for _f in range(8):
    if _f > 0:
        _ADJ_FILE[_f, _f - 1] = True
    if _f < 7:
        _ADJ_FILE[_f, _f + 1] = True

# Reach lookup reshaped for fast [token, square, target] indexing: REACH is [13, 64, 64].
_REACH = REACH


TEMPORAL_NAMES = (
    "win_after",
    "opp_loss",
    "has_next",
    "opp_log_spent",
    "clock_frac",
    "opp_clock_frac",
    "clock_diff",
    "spent_frac",
    "decisiveness",
    "undecided_loss",
    "undecided_opp_loss",
    "loss_pos",
    "loss_abs",
    "loss_gt5",
    "loss_gt10",
    "loss_gt20",
    "opp_loss_gt10",
    "opp_loss_gt20",
    "delta_win",
    "delta_loss",
    "delta_spent",
    "delta_legal",
    "step_frac",
    "log_legal_moves",
    "is_forced",
    "cum_loss_mean",
    "cum_opp_loss_mean",
)

# Subset of temporal features that depend only on the player's own moves and clock (no opponent info or win_before).
TEMPORAL_OWN_ONLY = (
    "has_next",
    "clock_frac",
    "spent_frac",
    "loss_pos",
    "loss_abs",
    "loss_gt5",
    "loss_gt10",
    "loss_gt20",
    "delta_loss",
    "delta_spent",
    "delta_legal",
    "step_frac",
    "log_legal_moves",
    "is_forced",
    "cum_loss_mean",
)

BOARD_STEP_NAMES = (
    "own_p",
    "own_n",
    "own_b",
    "own_r",
    "own_q",
    "opp_p",
    "opp_n",
    "opp_b",
    "opp_r",
    "opp_q",
    "material_total",
    "material_imbalance",
    "own_bishop_pair",
    "opp_bishop_pair",
    "own_undev_minors",
    "opp_undev_minors",
    "own_center4",
    "opp_center4",
    "own_center16",
    "opp_center16",
    "own_pawns_adv5",
    "opp_pawns_adv5",
    "own_pawns_adv6",
    "opp_pawns_adv6",
    "own_rooks_open",
    "opp_rooks_open",
    "own_doubled_pawns",
    "opp_doubled_pawns",
    "own_isolated_pawns",
    "opp_isolated_pawns",
    "own_passed_pawns",
    "opp_passed_pawns",
    "own_king_file",
    "own_king_rank",
    "opp_king_file",
    "opp_king_rank",
    "own_king_shield",
    "opp_king_shield",
    "moved_val",
    "moved_p",
    "moved_n",
    "moved_b",
    "moved_r",
    "moved_q",
    "moved_k",
    "captured_val",
    "move_from_rank",
    "move_from_file",
    "move_to_rank",
    "move_to_file",
    "move_dist",
    "move_forward",
    "is_recapture",
    "move_to_center",
    "opp_moved_val",
    "opp_move_dist",
    "own_def_move_to",
    "opp_atk_move_to",
    "opp_atk_move_from",
    "own_atk_last_to",
    "opp_def_last_to",
    "atk_near_own_king",
    "atk_near_opp_king",
)


def attackers_on(tokens: np.ndarray, targets: np.ndarray, occ: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Count own (tokens 1..6) and opponent (tokens 7..12) pieces attacking each row's target square.

    ``tokens`` has shape ``[n, 64]`` (uint8), ``targets`` has shape ``[n]`` (int64, -1 for none).
    Returns ``(own_count, opp_count)`` each of shape ``[n]`` (float32). Uses 64-bit occupancy
    bitboards so ray blocking is exact and takes milliseconds per batch.
    """
    n = len(tokens)
    valid = targets >= 0
    safe_t = np.where(valid, targets, 0)
    if occ is None:
        occ = ((tokens > 0).astype(np.uint64) * _BIT[None, :]).sum(axis=1, dtype=np.uint64)
    # _REACH[tokens, sq, target]: whether piece on sq can reach target on an empty board.
    can_reach = _REACH[tokens, _SQUARES[None, :], safe_t[:, None]]
    # Clear path iff no occupied square lies strictly between sq and target.
    clear = (_BETWEEN_BB[:, safe_t].T & occ[:, None]) == 0
    hits = can_reach & clear & valid[:, None]
    own = (hits & (tokens >= 1) & (tokens <= 6)).sum(axis=1, dtype=np.int32).astype(np.float32)
    opp = (hits & (tokens >= 7) & (tokens <= 12)).sum(axis=1, dtype=np.int32).astype(np.float32)
    return own, opp


def temporal_features(
    step_numbers: np.ndarray,
    step_names: Sequence[str],
    first_step: np.ndarray,
    step_count: np.ndarray,
    base: np.ndarray,
    increment: np.ndarray,
    *,
    without_opponent: bool = False,
) -> tuple[np.ndarray, list[str]]:
    """Derive move-to-move temporal features within each game's sequence.

    Never crosses game boundaries: the first move of a game has zero backward deltas,
    and the last move has zero forward (opponent reply) values.
    """
    n = len(step_numbers)
    by_name = {name: step_numbers[:, idx].astype(np.float32) for idx, name in enumerate(step_names)}
    log_clock = by_name["log_clock"]
    log_opp_clock = by_name.get("log_opponent_clock", np.zeros(n, dtype=np.float32))
    log_spent = by_name["log_spent"]
    win_before = by_name.get("win_before", np.full(n, 50.0, dtype=np.float32))
    loss = by_name["loss"]
    legal_moves = by_name["legal_moves"]

    clock = np.expm1(log_clock)
    opp_clock = np.expm1(log_opp_clock)
    spent = np.expm1(log_spent)

    base_step = np.repeat(np.asarray(base, dtype=np.float32), step_count)
    inc_step = np.repeat(np.asarray(increment, dtype=np.float32), step_count)
    count_step = np.repeat(step_count.astype(np.float32), step_count)
    first_for_step = np.repeat(first_step.astype(np.int64), step_count)
    pos_in_game = np.arange(n, dtype=np.int64) - first_for_step

    is_first = pos_in_game == 0
    is_last = pos_in_game == (np.repeat(step_count.astype(np.int64), step_count) - 1)
    has_next = (~is_last).astype(np.float32)

    next_idx = np.minimum(np.arange(n, dtype=np.int64) + 1, n - 1)
    prev_idx = np.maximum(np.arange(n, dtype=np.int64) - 1, 0)

    win_after = win_before - loss
    opp_loss = np.where(~is_last, np.clip(win_before[next_idx] - win_after, -100.0, 100.0), 0.0).astype(np.float32)
    opp_spent = np.where(
        ~is_last, np.log1p(np.maximum(0.0, opp_clock - opp_clock[next_idx] + inc_step)), 0.0
    ).astype(np.float32)

    clock_frac = clock / np.maximum(base_step, 1.0)
    opp_clock_frac = opp_clock / np.maximum(base_step, 1.0)
    clock_diff = log_clock - log_opp_clock
    spent_frac = np.clip(spent / np.maximum(clock, 1.0), 0.0, 1.0)

    decisiveness = 1.0 - np.abs(win_before - 50.0) / 50.0
    undecided_loss = loss * decisiveness
    undecided_opp_loss = opp_loss * decisiveness
    loss_pos = np.maximum(loss, 0.0)
    loss_abs = np.abs(loss)
    loss_gt5 = (loss > 5.0).astype(np.float32)
    loss_gt10 = (loss > 10.0).astype(np.float32)
    loss_gt20 = (loss > 20.0).astype(np.float32)
    opp_loss_gt10 = (opp_loss > 10.0).astype(np.float32)
    opp_loss_gt20 = (opp_loss > 20.0).astype(np.float32)

    delta_win = np.where(~is_first, win_before - win_before[prev_idx], 0.0).astype(np.float32)
    delta_loss = np.where(~is_first, loss - loss[prev_idx], 0.0).astype(np.float32)
    delta_spent = np.where(~is_first, log_spent - log_spent[prev_idx], 0.0).astype(np.float32)
    delta_legal = np.where(~is_first, legal_moves - legal_moves[prev_idx], 0.0).astype(np.float32)

    step_frac = pos_in_game.astype(np.float32) / np.maximum(count_step - 1.0, 1.0)
    log_legal_moves = np.log1p(np.maximum(legal_moves, 0.0))
    is_forced = (legal_moves <= 1.0).astype(np.float32)

    # Running mean of loss and opponent loss within each game via prefix sums.
    cs_loss = np.cumsum(loss.astype(np.float64))
    prev_end = first_for_step - 1
    offset_loss = np.where(prev_end >= 0, cs_loss[np.maximum(prev_end, 0)], 0.0)
    cum_loss_mean = ((cs_loss - offset_loss) / (pos_in_game + 1.0)).astype(np.float32)

    cs_opp = np.cumsum(opp_loss.astype(np.float64))
    offset_opp = np.where(prev_end >= 0, cs_opp[np.maximum(prev_end, 0)], 0.0)
    cum_opp_loss_mean = ((cs_opp - offset_opp) / (pos_in_game + 1.0)).astype(np.float32)

    all_cols = {
        "win_after": win_after,
        "opp_loss": opp_loss,
        "has_next": has_next,
        "opp_log_spent": opp_spent,
        "clock_frac": clock_frac,
        "opp_clock_frac": opp_clock_frac,
        "clock_diff": clock_diff,
        "spent_frac": spent_frac,
        "decisiveness": decisiveness,
        "undecided_loss": undecided_loss,
        "undecided_opp_loss": undecided_opp_loss,
        "loss_pos": loss_pos,
        "loss_abs": loss_abs,
        "loss_gt5": loss_gt5,
        "loss_gt10": loss_gt10,
        "loss_gt20": loss_gt20,
        "opp_loss_gt10": opp_loss_gt10,
        "opp_loss_gt20": opp_loss_gt20,
        "delta_win": delta_win,
        "delta_loss": delta_loss,
        "delta_spent": delta_spent,
        "delta_legal": delta_legal,
        "step_frac": step_frac,
        "log_legal_moves": log_legal_moves,
        "is_forced": is_forced,
        "cum_loss_mean": cum_loss_mean,
        "cum_opp_loss_mean": cum_opp_loss_mean,
    }
    wanted = list(TEMPORAL_OWN_ONLY if without_opponent else TEMPORAL_NAMES)
    return np.stack([all_cols[name] for name in wanted], axis=1).astype(np.float32), wanted


def _mark_square(marks: np.ndarray, channel: int | None) -> np.ndarray:
    """First marked square for a bit channel, or -1 where none is set."""
    if channel is None:
        return np.full(len(marks), -1, dtype=np.int64)
    present = ((marks >> np.uint16(channel)) & np.uint16(1)) != 0
    has = present.any(axis=1)
    return np.where(has, present.argmax(axis=1), -1).astype(np.int64)


def board_step_features(
    tokens: np.ndarray,
    marks: np.ndarray,
    mark_names: Sequence[str],
    *,
    chunk: int = 32768,
) -> tuple[np.ndarray, list[str]]:
    """Vectorised chess board-geometry and move features for every step in a sequence dataset.

    Computed purely from ``step_tokens`` (64 uint8s on the mover's board) and ``step_marks``
    (uint16 bitmasks) in chunks so memory stays small.
    """
    n = len(tokens)
    out = np.empty((n, len(BOARD_STEP_NAMES)), dtype=np.float32)
    ch = {name: idx for idx, name in enumerate(mark_names)}
    ch_last_from = ch.get("last_from")
    ch_last_to = ch.get("last_to")
    ch_move_from = ch.get("move_from")
    ch_move_to = ch.get("move_to")

    for start in range(0, n, chunk):
        end = min(n, start + chunk)
        tok = tokens[start:end]
        mrk = marks[start:end]
        b = len(tok)
        rows_idx = np.arange(b, dtype=np.int64)

        # Piece counts 1..5 (own P..Q) and 7..11 (opp P..Q).
        own_p_mask = tok == 1
        own_n_mask = tok == 2
        own_b_mask = tok == 3
        own_r_mask = tok == 4
        own_q_mask = tok == 5
        own_k_mask = tok == 6
        opp_p_mask = tok == 7
        opp_n_mask = tok == 8
        opp_b_mask = tok == 9
        opp_r_mask = tok == 10
        opp_q_mask = tok == 11
        opp_k_mask = tok == 12

        own_p = own_p_mask.sum(axis=1, dtype=np.float32)
        own_n = own_n_mask.sum(axis=1, dtype=np.float32)
        own_b = own_b_mask.sum(axis=1, dtype=np.float32)
        own_r = own_r_mask.sum(axis=1, dtype=np.float32)
        own_q = own_q_mask.sum(axis=1, dtype=np.float32)
        opp_p = opp_p_mask.sum(axis=1, dtype=np.float32)
        opp_n = opp_n_mask.sum(axis=1, dtype=np.float32)
        opp_b = opp_b_mask.sum(axis=1, dtype=np.float32)
        opp_r = opp_r_mask.sum(axis=1, dtype=np.float32)
        opp_q = opp_q_mask.sum(axis=1, dtype=np.float32)

        own_mat = own_p + 3.0 * own_n + 3.25 * own_b + 5.0 * own_r + 9.0 * own_q
        opp_mat = opp_p + 3.0 * opp_n + 3.25 * opp_b + 5.0 * opp_r + 9.0 * opp_q
        mat_total = own_mat + opp_mat
        mat_imb = own_mat - opp_mat
        own_bp = (own_b >= 2).astype(np.float32)
        opp_bp = (opp_b >= 2).astype(np.float32)

        # Development and board activity.
        own_pieces = (tok >= 1) & (tok <= 6)
        opp_pieces = (tok >= 7) & (tok <= 12)
        own_undev = ((own_n_mask | own_b_mask) & _RANK0[None, :]).sum(axis=1, dtype=np.float32)
        opp_undev = ((opp_n_mask | opp_b_mask) & _RANK7[None, :]).sum(axis=1, dtype=np.float32)
        own_c4 = (own_pieces & _CENTER4[None, :]).sum(axis=1, dtype=np.float32)
        opp_c4 = (opp_pieces & _CENTER4[None, :]).sum(axis=1, dtype=np.float32)
        own_c16 = (own_pieces & _CENTER16[None, :]).sum(axis=1, dtype=np.float32)
        opp_c16 = (opp_pieces & _CENTER16[None, :]).sum(axis=1, dtype=np.float32)
        own_adv5 = (own_p_mask & _OWN_ADV5[None, :]).sum(axis=1, dtype=np.float32)
        opp_adv5 = (opp_p_mask & _OPP_ADV5[None, :]).sum(axis=1, dtype=np.float32)
        own_adv6 = (own_p_mask & _OWN_ADV6[None, :]).sum(axis=1, dtype=np.float32)
        opp_adv6 = (opp_p_mask & _OPP_ADV6[None, :]).sum(axis=1, dtype=np.float32)

        # File-based pawn structure & open-file rooks: [b, 8] counts per file.
        own_p_files = own_p_mask.reshape(b, 8, 8).sum(axis=1)  # [b, 8]
        opp_p_files = opp_p_mask.reshape(b, 8, 8).sum(axis=1)
        own_r_files = own_r_mask.reshape(b, 8, 8).sum(axis=1)
        opp_r_files = opp_r_mask.reshape(b, 8, 8).sum(axis=1)

        own_rooks_open = (own_r_files * (own_p_files == 0)).sum(axis=1, dtype=np.float32)
        opp_rooks_open = (opp_r_files * (opp_p_files == 0)).sum(axis=1, dtype=np.float32)
        own_doubled = np.maximum(own_p_files - 1, 0).sum(axis=1, dtype=np.float32)
        opp_doubled = np.maximum(opp_p_files - 1, 0).sum(axis=1, dtype=np.float32)
        own_has_adj = (own_p_files > 0) @ _ADJ_FILE  # [b, 8]
        opp_has_adj = (opp_p_files > 0) @ _ADJ_FILE
        own_isolated = (own_p_files * (~own_has_adj)).sum(axis=1, dtype=np.float32)
        opp_isolated = (opp_p_files * (~opp_has_adj)).sum(axis=1, dtype=np.float32)

        # Exact passed pawns via 64-bit bitboards.
        own_p_bb = (own_p_mask.astype(np.uint64) * _BIT[None, :]).sum(axis=1, dtype=np.uint64)
        opp_p_bb = (opp_p_mask.astype(np.uint64) * _BIT[None, :]).sum(axis=1, dtype=np.uint64)
        own_passed = (own_p_mask & ((_OWN_PASSED_BB[None, :] & opp_p_bb[:, None]) == 0)).sum(axis=1, dtype=np.float32)
        opp_passed = (opp_p_mask & ((_OPP_PASSED_BB[None, :] & own_p_bb[:, None]) == 0)).sum(axis=1, dtype=np.float32)

        # King positions and pawn shields.
        has_own_k = own_k_mask.any(axis=1)
        has_opp_k = opp_k_mask.any(axis=1)
        own_k_sq = np.where(has_own_k, own_k_mask.argmax(axis=1), 4)
        opp_k_sq = np.where(has_opp_k, opp_k_mask.argmax(axis=1), 60)
        own_k_file = (own_k_sq % 8).astype(np.float32) / 7.0
        own_k_rank = (own_k_sq // 8).astype(np.float32) / 7.0
        opp_k_file = (opp_k_sq % 8).astype(np.float32) / 7.0
        opp_k_rank = (opp_k_sq // 8).astype(np.float32) / 7.0
        own_shield = (own_p_mask.astype(np.float32) * _OWN_SHIELD[own_k_sq]).sum(axis=1)
        opp_shield = (opp_p_mask.astype(np.float32) * _OPP_SHIELD[opp_k_sq]).sum(axis=1)

        # Move played and opponent's last move geometry.
        m_from = _mark_square(mrk, ch_move_from)
        m_to = _mark_square(mrk, ch_move_to)
        l_from = _mark_square(mrk, ch_last_from)
        l_to = _mark_square(mrk, ch_last_to)

        has_m = (m_from >= 0) & (m_to >= 0)
        sf_from = np.where(m_from >= 0, m_from, 0)
        sf_to = np.where(m_to >= 0, m_to, 0)
        moved_tok = np.where(has_m, tok[rows_idx, sf_from], 0)
        dest_tok = np.where(has_m, tok[rows_idx, sf_to], 0)
        moved_val = _TOKEN_VALUES[moved_tok]
        captured_val = np.where(dest_tok >= 7, _TOKEN_VALUES[dest_tok], 0.0).astype(np.float32)

        mf_rank = np.where(has_m, (sf_from // 8) / 7.0, 0.0).astype(np.float32)
        mf_file = np.where(has_m, (sf_from % 8) / 7.0, 0.0).astype(np.float32)
        mt_rank = np.where(has_m, (sf_to // 8) / 7.0, 0.0).astype(np.float32)
        mt_file = np.where(has_m, (sf_to % 8) / 7.0, 0.0).astype(np.float32)
        move_dist = np.where(
            has_m, np.maximum(np.abs((sf_to % 8) - (sf_from % 8)), np.abs((sf_to // 8) - (sf_from // 8))), 0.0
        ).astype(np.float32)
        move_fwd = np.where(has_m, (sf_to // 8) - (sf_from // 8), 0.0).astype(np.float32)
        is_recap = (has_m & (l_to >= 0) & (m_to == l_to)).astype(np.float32)
        move_to_c16 = (has_m & _CENTER16[sf_to]).astype(np.float32)

        has_l = (l_from >= 0) & (l_to >= 0)
        sl_from = np.where(l_from >= 0, l_from, 0)
        sl_to = np.where(l_to >= 0, l_to, 0)
        opp_moved_tok = np.where(has_l, tok[rows_idx, sl_to], 0)
        opp_moved_val = _TOKEN_VALUES[opp_moved_tok]
        opp_move_dist = np.where(
            has_l, np.maximum(np.abs((sl_to % 8) - (sl_from % 8)), np.abs((sl_to // 8) - (sl_from // 8))), 0.0
        ).astype(np.float32)

        # Exact bitboard attacks on move_to, move_from, last_to, and both king rings.
        occ = ((tok > 0).astype(np.uint64) * _BIT[None, :]).sum(axis=1, dtype=np.uint64)
        own_def_mto, opp_atk_mto = attackers_on(tok, m_to, occ)
        _, opp_atk_mfrom = attackers_on(tok, m_from, occ)
        own_atk_lto, opp_def_lto = attackers_on(tok, l_to, occ)

        # Attackers on the 8 squares around each king (same definition as encode/hand._king_attackers).
        atk_own_k = np.zeros(b, dtype=np.float32)
        atk_opp_k = np.zeros(b, dtype=np.float32)
        own_rings = np.where(has_own_k[:, None], _KING_RING[own_k_sq], -1)
        opp_rings = np.where(has_opp_k[:, None], _KING_RING[opp_k_sq], -1)
        for slot in range(8):
            _, opp_hits = attackers_on(tok, own_rings[:, slot], occ)
            own_hits, _ = attackers_on(tok, opp_rings[:, slot], occ)
            atk_own_k += opp_hits
            atk_opp_k += own_hits

        out[start:end] = np.stack(
            [
                own_p, own_n, own_b, own_r, own_q,
                opp_p, opp_n, opp_b, opp_r, opp_q,
                mat_total, mat_imb, own_bp, opp_bp,
                own_undev, opp_undev, own_c4, opp_c4, own_c16, opp_c16,
                own_adv5, opp_adv5, own_adv6, opp_adv6, own_rooks_open, opp_rooks_open,
                own_doubled, opp_doubled, own_isolated, opp_isolated, own_passed, opp_passed,
                own_k_file, own_k_rank, opp_k_file, opp_k_rank, own_shield, opp_shield,
                moved_val,
                (moved_tok == 1).astype(np.float32),
                (moved_tok == 2).astype(np.float32),
                (moved_tok == 3).astype(np.float32),
                (moved_tok == 4).astype(np.float32),
                (moved_tok == 5).astype(np.float32),
                (moved_tok == 6).astype(np.float32),
                captured_val,
                mf_rank, mf_file, mt_rank, mt_file, move_dist, move_fwd,
                is_recap, move_to_c16, opp_moved_val, opp_move_dist,
                own_def_mto, opp_atk_mto, opp_atk_mfrom, own_atk_lto, opp_def_lto,
                atk_own_k, atk_opp_k,
            ],
            axis=1,
        )
    return out, list(BOARD_STEP_NAMES)
