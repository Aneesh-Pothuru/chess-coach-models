import chess
import pytest

from chess_coach_models.winprob import eval_to_cp, mover_win_percent, win_percent


def test_win_percent_reference_points() -> None:
    assert win_percent(0) == pytest.approx(50.0)
    assert win_percent(1000) > 97.0
    assert win_percent(10_000) == pytest.approx(win_percent(1000))
    assert win_percent(-1000) < 3.0


def test_an_evaluation_in_pawns_is_centipawns_and_a_mate_is_the_clamp() -> None:
    assert eval_to_cp("0.35") == pytest.approx(35.0)
    assert eval_to_cp(-120) == -120.0
    assert eval_to_cp("#4") == 10_000
    assert eval_to_cp("#+4") == 10_000
    assert eval_to_cp("#-4") == -10_000


def test_black_perspective_is_flipped() -> None:
    assert mover_win_percent(200, chess.BLACK) == pytest.approx(100 - win_percent(200))
