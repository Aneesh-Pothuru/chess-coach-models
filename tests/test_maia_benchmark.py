from pathlib import Path

import pytest

from chess_coach_models.config import load_config
from chess_coach_models.maia_benchmark import (
    classify_speed,
    read_raw_games,
    sample_stream,
    summarize_benchmark,
)


FIXTURE = Path(__file__).parent / "fixtures" / "benchmark_games.pgn"


def _benchmark_config(**overrides):
    config = load_config()
    config["maia_benchmark"].update(
        {"moves_per_band": 100, "min_eligible_per_band": 1000, "max_games": 100},
        **overrides,
    )
    return config


def test_classify_speed_matches_lichess_categories() -> None:
    assert classify_speed("600+5") == "rapid"
    assert classify_speed("900+10") == "rapid"
    assert classify_speed("180+0") == "blitz"
    assert classify_speed("300+3") == "blitz"
    assert classify_speed("60+0") == "bullet"
    assert classify_speed("15+0") == "ultrabullet"
    assert classify_speed("1500+0") == "classical"
    assert classify_speed("600") == "rapid"
    assert classify_speed("-") is None
    assert classify_speed("abc") is None


def test_raw_game_framing_preserves_all_games() -> None:
    with FIXTURE.open(encoding="utf-8") as handle:
        games = list(read_raw_games(handle))
    assert len(games) == 6
    assert [headers["Site"].rsplit("/", 1)[-1] for headers, _ in games] == [
        "bench001",
        "bench002",
        "bench003",
        "bench004",
        "bench006",
        "bench005",
    ]
    assert all("1. e4" in raw for _, raw in games)


def test_sampling_applies_protocol_filters() -> None:
    config = _benchmark_config()
    with FIXTURE.open(encoding="utf-8") as handle:
        sampled, stats = sample_stream(handle, config)

    # Only bench001 qualifies: bench002 is blitz, bench003 casual, bench004
    # unrated, bench006 involves a BOT, bench005 is too short for min-ply.
    assert stats.games_seen == 6
    assert stats.games_used == 1
    assert stats.parse_errors == 0
    # Plies 11-20 survive: at ply 20 Black still had 9:36 *at the position*
    # (the clock filter must never read the predicted move's own think time).
    # White's ply-21 move is excluded because the opponent is under 30s.
    assert stats.sampled_by_band == {
        "<1100": 0,
        "1100-1400": 5,
        "1400-1700": 5,
        "1700-2000": 0,
        "2000+": 0,
    }
    for record in sampled:
        assert record["ply"] >= config["maia_benchmark"]["min_ply"]
        assert record["clock_seconds"] >= 30
        assert record["opponent_clock_seconds"] >= 30
        assert record["game_id"] == "bench001"
    assert max(record["ply"] for record in sampled) == 20
    ply_20 = next(record for record in sampled if record["ply"] == 20)
    assert ply_20["clock_seconds"] == 9 * 60 + 36
    white_moves = [row for row in sampled if row["mover"] == "white"]
    assert all(row["mover_elo"] == 1250 for row in white_moves)
    first = min(sampled, key=lambda row: row["ply"])
    assert first["ply"] == 11
    assert first["fen"].split()[1] == "w"
    assert first["fen"].split()[5] == "6"


def test_truncated_stream_raises_with_require_caps() -> None:
    config = _benchmark_config()
    with FIXTURE.open(encoding="utf-8") as handle:
        with pytest.raises(RuntimeError, match="before configured caps"):
            sample_stream(handle, config, require_caps=True)


def test_sampling_is_deterministic_and_capped_per_game() -> None:
    runs = []
    for _ in range(2):
        with FIXTURE.open(encoding="utf-8") as handle:
            sampled, _ = sample_stream(handle, _benchmark_config())
        runs.append(sampled)
    assert runs[0] == runs[1]

    with FIXTURE.open(encoding="utf-8") as handle:
        capped, _ = sample_stream(
            handle, _benchmark_config(max_moves_per_game=2)
        )
    per_band = {}
    for row in capped:
        per_band[row["rating_band"]] = per_band.get(row["rating_band"], 0) + 1
    assert per_band == {"1100-1400": 2, "1400-1700": 2}
    for row in capped:
        assert row["mover"] == ("white" if row["rating_band"] == "1100-1400" else "black")


def test_summary_reports_wilson_and_cluster_intervals() -> None:
    config = _benchmark_config(bootstrap_resamples=200)
    rows = []
    for index in range(40):
        correct = index % 2 == 0
        rows.append(
            {
                "game_id": f"game{index // 4}",
                "ply": 11 + index,
                "fen": "irrelevant",
                "move_uci": "e2e4",
                "mover_elo": 1250,
                "rating_band": "1100-1400",
                "piece_count": 32 - index // 2,
                "maia_top1_move": "e2e4" if correct else "d2d4",
                "maia_top1_probability": 0.5,
                "maia_played_probability": 0.4 if correct else 0.1,
            }
        )
    summary = summarize_benchmark(rows, config, device="cpu")
    band = summary["move_match_by_band"]["1100-1400"]
    assert band["n"] == 40
    assert band["top1_move_match_accuracy"] == 0.5
    assert band["wilson95_low"] < 0.5 < band["wilson95_high"]
    assert band["cluster_bootstrap95_low"] <= 0.5 <= band["cluster_bootstrap95_high"]
    assert band["games"] == 10
    assert summary["overall"]["n"] == 40
    assert summary["protocol"]["speed"] == "rapid"
    ply_counts = {
        bucket: values["n"] for bucket, values in band["by_ply_bucket"].items()
    }
    assert sum(ply_counts.values()) == 40
    assert summary["paper_skill_groups"]["<1600"]["n"] == 40
    assert summary["paper_skill_groups"][">2000"]["n"] == 0

    repeat = summarize_benchmark(rows, config, device="cpu")
    assert repeat == summary
