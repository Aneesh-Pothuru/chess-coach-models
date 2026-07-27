import pytest

from chess_coach_models.scorer import punishment_probability


class FakePolicy:
    def policy(self, fen: str, elo_self: int, elo_oppo: int) -> dict[str, float]:
        assert fen == "test-fen"
        return {"e7e5": elo_self / 10_000, "c7c5": 0.1}


def test_punishment_probability_uses_requested_opponent_elo() -> None:
    probability = punishment_probability(
        FakePolicy(), "test-fen", "e7e5", opponent_elo=1400, player_elo=1200
    )
    assert probability == pytest.approx(0.14)


def test_punishment_probability_handles_missing_reply_or_model() -> None:
    assert punishment_probability(None, "x", "e7e5", 1200, 1200) is None
    assert punishment_probability(FakePolicy(), "test-fen", None, 1200, 1200) is None

