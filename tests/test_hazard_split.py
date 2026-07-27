import pandas as pd

from chess_coach_models.hazard_training import group_stratified_split


def test_game_split_has_no_position_leakage() -> None:
    frame = pd.DataFrame(
        {
            "game_id": [f"g{i}" for i in range(100) for _ in range(3)],
            "rating_band": [
                "1100-1400" if i < 50 else "1400-1700"
                for i in range(100)
                for _ in range(3)
            ],
        }
    )
    split = group_stratified_split(
        frame, seed=42, test_fraction=0.15, validation_fraction=0.15
    )
    joined = frame.assign(split=split)
    assert joined.groupby("game_id")["split"].nunique().max() == 1
    assert set(split) == {"train", "validation", "test"}

