import chess
import pytest

from chess_coach_models.winprob import (
    eval_to_cp,
    mover_loss_win_percent,
    mover_win_percent,
    parse_clock_comment,
    parse_eval_comment,
    win_percent,
)


def test_win_percent_reference_points() -> None:
    assert win_percent(0) == pytest.approx(50.0)
    assert win_percent(1000) > 97.0
    assert win_percent(10_000) == pytest.approx(win_percent(1000))
    assert win_percent(-1000) < 3.0


def test_mate_scores_map_to_saturated_cp() -> None:
    assert eval_to_cp("#4") == 10_000
    assert eval_to_cp("#+4") == 10_000
    assert eval_to_cp("#-4") == -10_000
    assert parse_eval_comment("note [%eval #-3] [%clk 0:01:02]") == -10_000


def test_black_perspective_is_flipped() -> None:
    assert mover_win_percent(200, chess.BLACK) == pytest.approx(
        100 - win_percent(200)
    )
    # White eval rising from 0 to +4 is a large loss for Black.
    assert mover_loss_win_percent(0, 400, chess.BLACK) > 20
    # The same transition is an improvement, not a loss, for White.
    assert mover_loss_win_percent(0, 400, chess.WHITE) < 0


def test_clock_parsing() -> None:
    assert parse_clock_comment("[%clk 1:02:03]") == 3723
    assert parse_clock_comment("[%clk 02:03]") == 123
    assert parse_clock_comment("no clock") is None

