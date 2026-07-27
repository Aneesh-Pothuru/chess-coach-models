from __future__ import annotations

from collections.abc import Iterable
from typing import Any


DEFAULT_BANDS = (
    {"name": "<1100", "min": 0, "max": 1099, "representative_elo": 1000},
    {"name": "1100-1400", "min": 1100, "max": 1399, "representative_elo": 1250},
    {"name": "1400-1700", "min": 1400, "max": 1699, "representative_elo": 1550},
    {"name": "1700-2000", "min": 1700, "max": 1999, "representative_elo": 1850},
    {"name": "2000+", "min": 2000, "max": 4000, "representative_elo": 2150},
)


def rating_band(
    elo: int | float | None, bands: Iterable[dict[str, Any]] = DEFAULT_BANDS
) -> str | None:
    if elo is None:
        return None
    rating = int(elo)
    for band in bands:
        if int(band["min"]) <= rating <= int(band["max"]):
            return str(band["name"])
    return None


def representative_elo(
    band_name: str, bands: Iterable[dict[str, Any]] = DEFAULT_BANDS
) -> int:
    for band in bands:
        if band["name"] == band_name:
            return int(band["representative_elo"])
    raise KeyError(f"Unknown rating band: {band_name}")

