"""Tests for per-move step features, solution boards, StepBody, upgraded GameBody, ASL, and per-tag calibration."""

from __future__ import annotations

import chess
import numpy as np
import torch

from chess_coach_models.encode.board import encode_fen
from chess_coach_models.encode.solution import replay_pair
from chess_coach_models.encode.steps import (
    BOARD_STEP_NAMES,
    TEMPORAL_NAMES,
    TEMPORAL_OWN_ONLY,
    attackers_on,
    board_step_features,
    temporal_features,
)
from chess_coach_models.nets.model import BoardNet, GameBody, SquareConv, SquareTransformer, StepBody
from chess_coach_models.train.learners.net import _asymmetric_loss


def test_attackers_on_matches_python_chess():
    """Vectorised 64-bit bitboard attacker counts match python-chess exactly for both colours."""
    fens = [
        "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5",
        "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 0 8",
        "6k1/5ppp/8/3Q4/8/2B5/5PPP/6K1 w - - 0 1",
        "4r1k1/1p3ppp/p1p5/3b4/3P4/1P3N2/P4PPP/2R3K1 b - - 0 22",
    ]
    tokens = np.stack([np.frombuffer(encode_fen(fen)[0], dtype=np.uint8) for fen in fens], axis=0)
    bit = np.uint64(1) << np.arange(64, dtype=np.uint64)
    occ = ((tokens > 0).astype(np.uint64) * bit[None, :]).sum(axis=1, dtype=np.uint64)

    for sq in (0, 7, 12, 27, 28, 35, 36, 52, 60, 63):
        targets = np.full(len(fens), sq, dtype=np.int64)
        own_cnt, opp_cnt = attackers_on(tokens, targets, occ)
        for i, fen in enumerate(fens):
            board = chess.Board(fen)
            # In mover coordinates, when black is to move ranks are flipped (rank -> 7 - rank).
            chess_sq = sq if board.turn == chess.WHITE else (7 - sq // 8) * 8 + (sq % 8)
            exp_own = len(board.attackers(board.turn, chess_sq))
            exp_opp = len(board.attackers(not board.turn, chess_sq))
            assert int(own_cnt[i]) == exp_own, f"own mismatch on fen {i} sq {sq}"
            assert int(opp_cnt[i]) == exp_opp, f"opp mismatch on fen {i} sq {sq}"


def test_board_step_features_geometry_and_attacks():
    """Per-move board features compute exact material, pawn structure, recapture, and move-square attacks."""
    fen = "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5"
    tok = np.frombuffer(encode_fen(fen)[0], dtype=np.uint8)[None, :]
    # Mark move_from=f3 (21), move_to=e5 (36), last_from=c6 (42), last_to=e5 (36) -> recapture on e5!
    mark_names = ["en_passant", "last_from", "last_to", "move_from", "move_to"]
    marks = np.zeros((1, 64), dtype=np.uint16)
    marks[0, 42] |= np.uint16(1 << 1)
    marks[0, 36] |= np.uint16(1 << 2)
    marks[0, 21] |= np.uint16(1 << 3)
    marks[0, 36] |= np.uint16(1 << 4)

    feats, names = board_step_features(tok, marks, mark_names)
    assert names == list(BOARD_STEP_NAMES)
    assert feats.shape == (1, len(BOARD_STEP_NAMES))
    by_name = dict(zip(names, feats[0].tolist()))
    assert by_name["own_p"] == 8.0
    assert by_name["opp_p"] == 8.0
    assert by_name["own_bishop_pair"] == 1.0
    assert by_name["moved_n"] == 1.0
    assert by_name["captured_val"] == 1.0  # e5 pawn
    assert by_name["is_recapture"] == 1.0
    assert by_name["own_def_move_to"] == 1.0  # Nf3 attacks e5
    assert by_name["opp_atk_move_to"] == 1.0  # Nc6 defends e5


def test_temporal_features_respect_game_boundaries():
    """Temporal step features never leak opponent loss or deltas across game boundaries."""
    step_names = [
        "ply", "log_clock", "log_opponent_clock", "log_spent", "win_before", "loss",
        "legal_moves", "capture", "check", "castle_own_king", "castle_own_queen",
        "castle_opp_king", "castle_opp_queen",
    ]
    # Two games: game 0 has 2 moves, game 1 has 2 moves.
    steps = np.array(
        [
            # game 0
            [11, np.log1p(590), np.log1p(595), np.log1p(10), 50.0, 5.0, 30, 0, 0, 1, 1, 1, 1],
            [13, np.log1p(570), np.log1p(580), np.log1p(20), 60.0, 2.0, 28, 1, 0, 1, 1, 1, 1],
            # game 1
            [11, np.log1p(300), np.log1p(300), np.log1p(5), 50.0, 1.0, 25, 0, 0, 1, 1, 1, 1],
            [13, np.log1p(280), np.log1p(290), np.log1p(20), 40.0, 0.0, 25, 0, 0, 1, 1, 1, 1],
        ],
        dtype=np.float32,
    )
    first_step = np.array([0, 2], dtype=np.int64)
    step_count = np.array([2, 2], dtype=np.int64)
    clocks = np.array([600.0, 300.0], dtype=np.float32)
    increments = np.array([0.0, 0.0], dtype=np.float32)

    feats, names = temporal_features(steps, step_names, first_step, step_count, clocks, increments)
    assert names == list(TEMPORAL_NAMES)
    assert feats.shape == (4, len(TEMPORAL_NAMES))
    idx = {n: i for i, n in enumerate(names)}
    # Game 0 step 0: win_after = 45, next win_before = 60 -> opp_loss = +15!
    assert np.isclose(feats[0, idx["opp_loss"]], 15.0)
    assert feats[0, idx["has_next"]] == 1.0
    # Game 0 last step (index 1): MUST NOT see game 1's step 0!
    assert feats[1, idx["has_next"]] == 0.0
    assert feats[1, idx["opp_loss"]] == 0.0
    # Game 1 first step (index 2): delta_loss MUST be 0 (not leaking game 0's last step).
    assert feats[2, idx["delta_loss"]] == 0.0
    # Game 1 step 0: win_after = 49, next win_before = 40 -> opp_loss = 40 - 49 = -9.
    assert np.isclose(feats[2, idx["opp_loss"]], -9.0)

    own_feats, own_names = temporal_features(
        steps, step_names, first_step, step_count, clocks, increments, without_opponent=True
    )
    assert own_names == list(TEMPORAL_OWN_ONLY)
    assert own_feats.shape == (4, len(TEMPORAL_OWN_ONLY))


def test_replay_pair_preserves_solver_orientation():
    """Solution replay keeps black-to-move puzzles in black's flipped coordinate frame."""
    # Black to move: 1...Qxf2#
    fen = "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3"
    # Use a legal black move: c5f2 (Bxf2+) e1f2 (Kxf2)
    after1, end = replay_pair(fen, "c5f2 e1f2")
    a1 = np.frombuffer(after1, dtype=np.uint8)
    e = np.frombuffer(end, dtype=np.uint8)
    # In flipped coords (black plays up): f2 is rank 6 (7-1), file 5 -> index 6*8 + 5 = 53.
    assert a1[53] == 3  # solver's own bishop (token 3) on f2 after Bxf2+
    assert e[53] == 12  # opponent's king (token 12) on f2 after Kxf2


def test_step_body_and_game_body_padding_invariance_and_aux():
    """StepBody and upgraded GameBody are padding-invariant and support auxiliary outputs."""
    torch.manual_seed(0)
    step_body = StepBody(steps=16, context=4, dim=32, depth=2, heads=4, dropout=0.1, most=10, recurrent=True, pool="attention")
    net = BoardNet(step_body, outputs=1, aux_outputs=1)
    net.eval()

    x = torch.randn(2, 5, 16)
    ctx = torch.randn(2, 4)
    held = torch.tensor([[True, True, True, False, False], [True, True, True, True, True]])
    # Mutate padded positions on row 0 (indices 3, 4) — output must be identical.
    x2 = x.clone()
    x2[0, 3:] = 999.0
    empty = torch.empty(0)
    out1, aux1 = net.forward_with_aux(empty, empty, x, held, ctx)
    out2, aux2 = net.forward_with_aux(empty, empty, x2, held, ctx)
    assert out1.shape == (2,) and aux1.shape == (2,)
    assert torch.allclose(out1, out2, atol=1e-5)
    assert torch.allclose(aux1, aux2, atol=1e-5)

    # Upgraded GameBody with step_skip, BiGRU, and attention pooling.
    board = SquareConv(marks=5, context=13, dim=16, depth=2, dropout=0.1)
    game_body = GameBody(board, context=4, depth=1, heads=4, dropout=0.1, most=10, step_dim=13, recurrent=True, pool="attention")
    gnet = BoardNet(game_body, outputs=1)
    gnet.eval()
    tok = torch.randint(0, 13, (2, 4, 64))
    mrk = torch.zeros(2, 4, 64, 5)
    stp = torch.randn(2, 4, 13)
    held_g = torch.tensor([[True, True, False, False], [True, True, True, True]])
    g1 = gnet(tok, mrk, stp, held_g, ctx)
    stp2 = stp.clone()
    stp2[0, 2:] = -50.0
    g2 = gnet(tok, mrk, stp2, held_g, ctx)
    assert torch.allclose(g1, g2, atol=1e-5)


def test_extra_boards_and_asymmetric_loss():
    """SquareTransformer with extra_boards + attacks and ASL both run cleanly with valid gradients."""
    torch.manual_seed(0)
    body = SquareTransformer(marks=3, context=4, dim=32, depth=2, heads=4, dropout=0.1, extra_boards=2, attacks=True)
    net = BoardNet(body, outputs=10)
    tokens = torch.randint(0, 13, (4, 3, 64))  # [batch, 1 + extra_boards, 64]
    marks = torch.zeros(4, 64, 3)
    ctx = torch.randn(4, 4)
    logits = net(tokens, marks, ctx)
    assert logits.shape == (4, 10)
    targets = torch.zeros(4, 10)
    targets[0, 1] = 1.0
    targets[2, 7] = 1.0
    loss = _asymmetric_loss(logits, targets)
    assert torch.isfinite(loss) and loss.item() > 0
    loss.backward()
    assert body.extra_piece[0].weight.grad is not None
    assert body.extra_piece[1].weight.grad is not None


def test_by_candidate_summary_and_analysis_merge():
    """Rare-tag summary computes macro/rare PR-AUC cleanly and multi-machine analysis merge preserves remote runs."""
    from chess_coach_models import tasks
    from chess_coach_models.evals.analysis import _merge_existing
    from chess_coach_models.train.run import by_candidate, by_candidate_summary

    rng = np.random.default_rng(42)
    y = np.zeros((200, 3), dtype=np.uint8)
    y[:40, 0] = 1  # 20% common
    y[:2, 1] = 1   # 1% rare
    y[:3, 2] = 1   # 1.5% rare
    p = np.clip(y * 0.8 + rng.uniform(0.0, 0.2, size=y.shape), 1e-4, 1 - 1e-4)
    each = by_candidate(("fork", "interference", "epauletteMate"), y, p)
    summary = by_candidate_summary(each, rare_below=0.02)
    assert summary["rare_count"] == 2
    assert summary["macro_pr_auc"] > 0.9
    assert summary["rare_pr_auc"] > 0.9
    assert all("ece" in row for row in each.values())

    task = tasks.get("game-rating")
    fp = "abc123"
    existing = {
        "dataset": {"fingerprint": fp},
        "runs": ["conv-small", "gbm-hand"],
        "best": "conv-small",
        "challenger": "conv-small",
        "reliability": {"conv-small": [{"n": 10}], "gbm-hand": [{"n": 10}]},
        "against_reference": {"conv-small": {"correlation": 0.8}},
        "closeness": {"conv-small": {"median": 150.0}, "gbm-hand": {"median": 180.0}},
        "slices": [{"key": "band", "groups": [{"group": "<1100", "runs": {"conv-small": {"mae": 210.0}, "gbm-hand": {"mae": 250.0}}, "gain": {"gain": 40.0}}]}],
        "grids": [{"key": "rating-gap", "cells": [[{"runs": {"conv-small": 1400.0, "gbm-hand": 1420.0}}]]}],
        "pairs": [{"run": "transformer-medium-hand", "over": "transformer-medium", "gain": -14.0, "low": -17.0, "high": -11.0, "beyond_noise": True}],
        "examples": {"typical": [{"key": "k1"}]},
    }
    fresh = {
        "dataset": {"fingerprint": fp},
        "runs": ["steps-board", "gbm-hand"],
        "skipped": {"conv-small": "its test predictions are not on this machine"},
        "best": "steps-board",
        "challenger": "steps-board",
        "reliability": {"steps-board": [{"n": 10}], "gbm-hand": [{"n": 10}]},
        "against_reference": {"steps-board": {"correlation": 0.85}},
        "closeness": {"steps-board": {"median": 140.0}, "gbm-hand": {"median": 180.0}},
        "slices": [{"key": "band", "groups": [{"group": "<1100", "runs": {"steps-board": {"mae": 195.0}, "gbm-hand": {"mae": 250.0}}, "gain": {"gain": 55.0}}]}],
        "grids": [{"key": "rating-gap", "cells": [[{"runs": {"steps-board": 1390.0, "gbm-hand": 1420.0}}]]}],
        "pairs": [{"run": "transformer-medium-hand", "over": "transformer-medium", "gain": None}],
        "examples": {"typical": [{"key": "k2"}]},
    }
    merged = _merge_existing(fresh, existing, ["steps-board", "conv-small", "gbm-hand"], task, local_runs={"steps-board", "gbm-hand"})
    assert merged["runs"] == ["steps-board", "conv-small", "gbm-hand"]
    assert merged["best"] == "steps-board"
    assert "conv-small" not in merged["skipped"]
    assert merged["closeness"]["conv-small"]["median"] == 150.0
    assert merged["slices"][0]["groups"][0]["runs"]["conv-small"]["mae"] == 210.0
    assert merged["slices"][0]["groups"][0]["gain"]["gain"] == 55.0  # kept fresh gain for new local best!
    assert merged["pairs"][0]["gain"] == -14.0  # preserved remote pair gain!

