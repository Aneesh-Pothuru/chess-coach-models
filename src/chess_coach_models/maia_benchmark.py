"""Independent Maia2 move-match benchmark (issue #1).

Unlike the committed smoke test, this benchmark samples moves from *all* rated
standard games of the configured speed in a month chosen to postdate Maia2's
training window. It does not require inline evals, so it avoids the
"analysis was requested" selection bias of eval-annotated games, and it applies
the published Maia evaluation filters: the first plies of each game are
excluded, as are moves made in low-clock time pressure.
"""

from __future__ import annotations

import json
import random
import sys
import time
from dataclasses import dataclass, field
from io import StringIO
from typing import Any, Iterator, TextIO

import chess
import chess.pgn

from .bands import rating_band
from .config import project_path
from .repertoire import wilson_interval
from .winprob import parse_clock_comment


SPEED_CUTOFFS = (
    # Lichess speed classification over estimated duration = base + 40 * increment.
    ("ultrabullet", 30),
    ("bullet", 180),
    ("blitz", 480),
    ("rapid", 1500),
)


def classify_speed(time_control: str) -> str | None:
    """Map a PGN TimeControl header to the Lichess speed category."""
    if not time_control or time_control in {"-", "?"}:
        return None
    base, _, increment = time_control.partition("+")
    try:
        estimated = int(base) + 40 * int(increment or 0)
    except ValueError:
        return None
    for name, cutoff in SPEED_CUTOFFS:
        if estimated < cutoff:
            return name
    return "classical"


@dataclass
class SamplingStats:
    games_seen: int = 0
    games_parsed: int = 0
    games_used: int = 0
    parse_errors: int = 0
    frame_anomalies: int = 0
    eligible_by_band: dict[str, int] = field(default_factory=dict)
    sampled_by_band: dict[str, int] = field(default_factory=dict)


def read_raw_games(handle: TextIO) -> Iterator[tuple[dict[str, str], str]]:
    """Yield (headers, full PGN text) per game from a Lichess monthly export.

    Lichess exports frame every game as a header block, a blank line, a
    movetext block, and a blank line. Header values are parsed with a plain
    split so that non-qualifying games never pay python-chess parsing costs.
    """
    headers: dict[str, str] = {}
    header_lines: list[str] = []
    movetext_lines: list[str] = []
    in_movetext = False
    for line in handle:
        stripped = line.strip()
        if not in_movetext and stripped.startswith("[") and stripped.endswith("]"):
            key, _, remainder = stripped[1:-1].partition(" ")
            headers[key] = remainder.strip().strip('"')
            header_lines.append(line)
            continue
        if stripped:
            in_movetext = True
            movetext_lines.append(line)
            continue
        if in_movetext:
            yield headers, "".join(header_lines) + "\n" + "".join(movetext_lines)
            headers, header_lines, movetext_lines = {}, [], []
            in_movetext = False
    if movetext_lines:
        yield headers, "".join(header_lines) + "\n" + "".join(movetext_lines)


def _headers_qualify(
    headers: dict[str, str], bands: list[dict[str, Any]], speed: str
) -> bool:
    if headers.get("Variant", "Standard") not in {"", "Standard"}:
        return False
    if not headers.get("Event", "").startswith("Rated"):
        return False
    # Bot accounts play rated games; a human benchmark must not include them.
    if "BOT" in {headers.get("WhiteTitle"), headers.get("BlackTitle")}:
        return False
    if classify_speed(headers.get("TimeControl", "")) != speed:
        return False
    try:
        white_elo = int(headers.get("WhiteElo", ""))
        black_elo = int(headers.get("BlackElo", ""))
    except ValueError:
        return False
    return bool(rating_band(white_elo, bands)) and bool(rating_band(black_elo, bands))


def game_eligible_moves(
    game: chess.pgn.Game,
    bands: list[dict[str, Any]],
    *,
    min_ply: int,
    min_clock_seconds: float,
) -> list[dict[str, Any]]:
    """Benchmark-eligible moves following the published Maia2 protocol.

    The first ``min_ply - 1`` plies are excluded, and so is any position where
    *either* player's last ``[%clk]`` annotation (remaining time after their
    latest move) is missing or under ``min_clock_seconds``.
    """
    headers = game.headers
    try:
        white_elo = int(headers.get("WhiteElo", ""))
        black_elo = int(headers.get("BlackElo", ""))
    except ValueError:
        return []
    white_band = rating_band(white_elo, bands)
    black_band = rating_band(black_elo, bands)
    if not white_band or not black_band:
        return []
    site = headers.get("Site", "")
    game_id = site.rsplit("/", 1)[-1] if site else ""
    board = game.board()
    records: list[dict[str, Any]] = []
    clocks: dict[bool, float | None] = {chess.WHITE: None, chess.BLACK: None}
    for ply, node in enumerate(game.mainline(), start=1):
        move = node.move
        mover = board.turn
        fen_before = board.fen()
        piece_count = len(board.piece_map())
        try:
            board.push(move)
        except (ValueError, AssertionError):
            break
        clocks[mover] = parse_clock_comment(node.comment)
        if ply < min_ply:
            continue
        clock_seconds = clocks[mover]
        opponent_clock = clocks[not mover]
        if clock_seconds is None or clock_seconds < min_clock_seconds:
            continue
        if opponent_clock is None or opponent_clock < min_clock_seconds:
            continue
        records.append(
            {
                "game_id": game_id,
                "ply": ply,
                "fen": fen_before,
                "move_uci": move.uci(),
                "mover": "white" if mover == chess.WHITE else "black",
                "mover_elo": white_elo if mover == chess.WHITE else black_elo,
                "opponent_elo": black_elo if mover == chess.WHITE else white_elo,
                "rating_band": white_band if mover == chess.WHITE else black_band,
                "clock_seconds": clock_seconds,
                "opponent_clock_seconds": opponent_clock,
                "piece_count": piece_count,
                "time_control": headers.get("TimeControl", ""),
            }
        )
    return records


def sample_stream(
    handle: TextIO, config: dict[str, Any]
) -> tuple[list[dict[str, Any]], SamplingStats]:
    """Per-band seeded reservoir sample of eligible moves from a PGN stream.

    Each (game, color) contributes at most ``max_moves_per_game`` moves so no
    single player-game dominates a band. The stream stops once every band has
    seen ``min_eligible_per_band`` eligible moves (reservoirs well mixed) or
    after ``max_games`` games.
    """
    cfg = config["maia_benchmark"]
    bands = config["rating_bands"]
    target = int(cfg["moves_per_band"])
    per_game_cap = int(cfg["max_moves_per_game"])
    min_eligible = int(cfg["min_eligible_per_band"])
    max_games = int(cfg["max_games"])
    speed = str(cfg["speed"])
    progress_every = int(cfg.get("progress_every_games", 20_000))
    rng = random.Random(int(config["seed"]))
    band_names = [str(band["name"]) for band in bands]
    reservoirs: dict[str, list[dict[str, Any]]] = {name: [] for name in band_names}
    seen: dict[str, int] = {name: 0 for name in band_names}
    stats = SamplingStats()
    started = time.monotonic()

    for headers, raw_game in read_raw_games(handle):
        if stats.games_seen >= max_games:
            break
        if all(count >= min_eligible for count in seen.values()):
            break
        stats.games_seen += 1
        if "Event" not in headers:
            stats.frame_anomalies += 1
            continue
        if not _headers_qualify(headers, bands, speed):
            continue
        try:
            game = chess.pgn.read_game(StringIO(raw_game))
        except Exception:
            stats.parse_errors += 1
            continue
        if game is None:
            stats.parse_errors += 1
            continue
        if game.errors:
            stats.parse_errors += len(game.errors)
            continue
        stats.games_parsed += 1
        moves = game_eligible_moves(
            game,
            bands,
            min_ply=int(cfg["min_ply"]),
            min_clock_seconds=float(cfg["min_clock_seconds"]),
        )
        if not moves:
            continue
        stats.games_used += 1
        by_color: dict[str, list[dict[str, Any]]] = {"white": [], "black": []}
        for record in moves:
            by_color[record["mover"]].append(record)
        for color_moves in by_color.values():
            if len(color_moves) > per_game_cap:
                color_moves = rng.sample(color_moves, per_game_cap)
            for record in color_moves:
                band = record["rating_band"]
                seen[band] += 1
                reservoir = reservoirs[band]
                if len(reservoir) < target:
                    reservoir.append(record)
                    continue
                replacement = rng.randrange(seen[band])
                if replacement < target:
                    reservoir[replacement] = record

        if progress_every and stats.games_seen % progress_every == 0:
            elapsed = max(time.monotonic() - started, 0.001)
            filled = {name: len(reservoirs[name]) for name in band_names}
            print(
                f"seen={stats.games_seen:,} rate={stats.games_seen / elapsed:,.0f} games/s "
                f"eligible={seen} sampled={filled}",
                file=sys.stderr,
            )

    stats.eligible_by_band = dict(seen)
    stats.sampled_by_band = {name: len(reservoirs[name]) for name in band_names}
    sampled = [record for name in band_names for record in reservoirs[name]]
    return sampled, stats


def _bootstrap_interval(
    outcomes_by_game: dict[str, list[int]],
    *,
    resamples: int,
    seed: int,
) -> tuple[float, float]:
    """Percentile CI for accuracy under game-level cluster resampling."""
    games = sorted(outcomes_by_game)
    rng = random.Random(seed)
    estimates: list[float] = []
    for _ in range(resamples):
        correct = total = 0
        for _ in range(len(games)):
            outcomes = outcomes_by_game[games[rng.randrange(len(games))]]
            correct += sum(outcomes)
            total += len(outcomes)
        estimates.append(correct / total if total else 0.0)
    estimates.sort()
    lower = estimates[int(0.025 * (len(estimates) - 1))]
    upper = estimates[int(0.975 * (len(estimates) - 1))]
    return lower, upper


def _accuracy_block(rows: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(rows)
    correct = sum(int(row["maia_top1_move"] == row["move_uci"]) for row in rows)
    accuracy = correct / n if n else 0.0
    low, high = wilson_interval(correct, n)
    return {
        "n": n,
        "correct": correct,
        "top1_move_match_accuracy": round(accuracy, 4),
        "wilson95_low": round(low, 4),
        "wilson95_high": round(high, 4),
        "mean_maia_top1_probability": (
            round(sum(float(row["maia_top1_probability"]) for row in rows) / n, 4)
            if n
            else 0.0
        ),
        "mean_played_move_probability": (
            round(sum(float(row["maia_played_probability"]) for row in rows) / n, 4)
            if n
            else 0.0
        ),
    }


def _bucket(value: int, edges: list[tuple[str, int]]) -> str:
    for label, upper in edges:
        if value <= upper:
            return label
    return edges[-1][0]


PLY_BUCKETS = [("11-20", 20), ("21-40", 40), ("41+", 10_000)]
PIECE_BUCKETS = [("<=10", 10), ("11-20", 20), ("21-32", 32)]
# The Maia2 paper reports Cross-skill accuracy in these three groups.
PAPER_SKILL_GROUPS = [("<1600", 1599), ("1600-2000", 1999), (">2000", 10_000)]


def summarize_benchmark(
    rows: list[dict[str, Any]],
    config: dict[str, Any],
    *,
    device: str,
    sampling_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cfg = config["maia_benchmark"]
    band_order = [str(band["name"]) for band in config["rating_bands"]]
    by_band: dict[str, list[dict[str, Any]]] = {name: [] for name in band_order}
    for row in rows:
        by_band[str(row["rating_band"])].append(row)

    bands_summary: dict[str, Any] = {}
    for name in band_order:
        band_rows = by_band[name]
        block = _accuracy_block(band_rows)
        outcomes: dict[str, list[int]] = {}
        for row in band_rows:
            outcomes.setdefault(str(row["game_id"]), []).append(
                int(row["maia_top1_move"] == row["move_uci"])
            )
        boot_low, boot_high = _bootstrap_interval(
            outcomes,
            resamples=int(cfg["bootstrap_resamples"]),
            seed=int(config["seed"]),
        )
        block["games"] = len(outcomes)
        block["cluster_bootstrap95_low"] = round(boot_low, 4)
        block["cluster_bootstrap95_high"] = round(boot_high, 4)
        block["by_ply_bucket"] = {
            label: _accuracy_block(
                [row for row in band_rows if _bucket(int(row["ply"]), PLY_BUCKETS) == label]
            )
            for label, _ in PLY_BUCKETS
        }
        block["by_piece_bucket"] = {
            label: _accuracy_block(
                [
                    row
                    for row in band_rows
                    if _bucket(int(row["piece_count"]), PIECE_BUCKETS) == label
                ]
            )
            for label, _ in PIECE_BUCKETS
        }
        bands_summary[name] = block

    summary = {
        "protocol": {
            "month": cfg["month"],
            "source_url": cfg["url"],
            "speed": cfg["speed"],
            "model_type": config["maia2"]["model_type"],
            "min_ply": int(cfg["min_ply"]),
            "min_clock_seconds": float(cfg["min_clock_seconds"]),
            "max_moves_per_game": int(cfg["max_moves_per_game"]),
            "moves_per_band_target": int(cfg["moves_per_band"]),
            "seed": int(config["seed"]),
            "device": device,
        },
        "sampling": sampling_metadata or {},
        "overall": _accuracy_block(rows),
        "move_match_by_band": bands_summary,
        "paper_skill_groups": {
            label: _accuracy_block(
                [
                    row
                    for row in rows
                    if _bucket(int(row["mover_elo"]), PAPER_SKILL_GROUPS) == label
                ]
            )
            for label, _ in PAPER_SKILL_GROUPS
        },
    }
    return summary


def write_metrics(config: dict[str, Any], summary: dict[str, Any]) -> None:
    path = project_path(config, config["maia_benchmark"]["metrics_path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
