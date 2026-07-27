from __future__ import annotations

import hashlib

import pandas as pd


def _stable_unit_interval(value: str, seed: int) -> float:
    digest = hashlib.sha256(f"{seed}:{value}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(2**64)


def group_stratified_split(
    frame: pd.DataFrame,
    *,
    seed: int,
    test_fraction: float,
    validation_fraction: float,
) -> pd.Series:
    """Deterministic game split applied within each game's rating-band stratum."""
    game_strata = (
        frame.groupby("game_id")["rating_band"]
        .agg(lambda values: "|".join(sorted(set(values.astype(str)))))
        .to_dict()
    )
    assignments: dict[str, str] = {}
    for game_id, stratum in game_strata.items():
        value = _stable_unit_interval(f"{stratum}:{game_id}", seed)
        if value < test_fraction:
            split = "test"
        elif value < test_fraction + validation_fraction:
            split = "validation"
        else:
            split = "train"
        assignments[str(game_id)] = split
    return frame["game_id"].astype(str).map(assignments)
