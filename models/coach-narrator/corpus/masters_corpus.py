"""The moves strong players make in classical over-the-board games, from the Lichess broadcast database.

usage: python masters_corpus.py [--months 2025-01,2025-02] [--workers 15] [--out data/corpus/masters]

Reads every month of ``data/raw/lichess-broadcasts`` (``desktop/wsl_masters_download.sh`` fetches them;
CC BY-SA 4.0) and writes, under ``--out``:

- ``games/<month>/part-*.parquet``: every finished standard game at a classical pace, a row a game: the event,
  both players (name, FIDE title, rating, FIDE id, world champion or not), the result, the time control
  and how it was read, and the moves as SAN with each move's clock, Lichess's evaluation and glyph.
- ``positions/<month>/part-*.parquet``: a row for every move a strong player made in those games
  (``broadcasts.is_strong``: GM, IM, FM, CM, NM or WGM, or rated 2200 and up): the position before it
  as FEN, the move as UCI and SAN, the mover and the opponent, both clocks before the move, the seconds
  it took, Lichess's evaluation before and after it as the mover's winning chances and what it lost, the
  game's result for the mover, and the board's hand features (``encode/hand.py``).
- ``manifest.json``: what was read and kept, and the world champions' FIDE ids as matched.

A game relayed twice (two broadcasts of one event) is kept once: ``dedupe`` drops the later copies'
games and positions after every month is read.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import Counter
from datetime import datetime, timezone
from multiprocessing import get_context
from pathlib import Path

import polars as pl

from chess_coach_models import paths
from chess_coach_models.data import broadcasts as bc
from chess_coach_models.data.lichess import game_blocks, open_zst
from chess_coach_models.encode.hand import POSITION_FEATURES

PART_ROWS = 60_000
AMPLE_SECONDS = bc.AMPLE_SECONDS

_TEXT, _INT, _FLOAT, _BOOL = pl.String, pl.Int32, pl.Float64, pl.Boolean
_PLAYER = {"name": _TEXT, "title": _TEXT, "elo": _INT, "fide_id": _TEXT, "strong": _BOOL, "champion": _TEXT}
GAME_SCHEMA = {
    **{name: _TEXT for name in ("game_id", "dup_key", "source", "licence", "month", "broadcast", "event", "round",
                                "site", "date", "game_url", "broadcast_url", "eco", "opening")},
    **{f"white_{key}": kind for key, kind in _PLAYER.items()},
    **{f"black_{key}": kind for key, kind in _PLAYER.items()},
    "result": _TEXT,
    "white_score": _FLOAT,
    "time_control": _TEXT,
    "base": _INT,
    "increment": _INT,
    "control_read_from": _TEXT,
    "clock_start": _FLOAT,
    "plies": _INT,
    "sans": pl.List(_TEXT),
    "ucis": pl.List(_TEXT),
    "clocks": pl.List(_FLOAT),
    "evals": pl.List(_FLOAT),
    "glyphs": pl.List(_INT),
    "comments": pl.List(_TEXT),
    "has_clocks": _BOOL,
    "has_evals": _BOOL,
    "final_fen": _TEXT,
}
POSITION_SCHEMA = {
    **{name: _TEXT for name in ("key", "game_id")},
    "ply": _INT,
    **{name: _TEXT for name in ("fen", "last_move", "move", "san", "side", "mover_name", "mover_title")},
    "mover_elo": _INT,
    "mover_fide_id": _TEXT,
    "mover_champion": _TEXT,
    "opponent_title": _TEXT,
    "opponent_elo": _INT,
    "base": _INT,
    "increment": _INT,
    **{name: _FLOAT for name in ("clock", "opponent_clock", "spent")},
    "ample_clock": _BOOL,
    **{name: _FLOAT for name in ("eval_before", "eval_after", "win_before", "win_after", "loss")},
    "glyph": _INT,
    "comment": _TEXT,
    "mover_score": _FLOAT,
    "game_plies": _INT,
    **{name: _FLOAT for name in POSITION_FEATURES},
}


def _frame(rows: list[dict], schema: dict) -> pl.DataFrame:
    return pl.DataFrame(rows, schema=schema, strict=False)


def _game(headers: dict[str, str], movetext: str, month: str, counts: Counter) -> tuple[dict, list[dict]] | None:
    counts["read"] += 1
    game, why = bc.classical_game(headers, movetext)
    if game is None:
        counts[why] += 1
        return None
    plies = game.plies
    row = {
        "game_id": game.game_id,
        "dup_key": game.copy_key,
        "source": bc.SOURCE,
        "licence": bc.LICENCE,
        "month": month,
        "broadcast": headers.get("BroadcastName", ""),
        "event": headers.get("Event", ""),
        "round": headers.get("Round", ""),
        "site": headers.get("Site", ""),
        "date": headers.get("UTCDate") or headers.get("Date", ""),
        "game_url": headers.get("GameURL", ""),
        "broadcast_url": headers.get("BroadcastURL", ""),
        "eco": headers.get("ECO", ""),
        "opening": headers.get("Opening", ""),
        **{f"white_{key}": value for key, value in _player_fields(game.white).items()},
        **{f"black_{key}": value for key, value in _player_fields(game.black).items()},
        "result": game.result,
        "white_score": game.white_score,
        "time_control": headers.get("TimeControl", ""),
        "base": game.base,
        "increment": game.increment,
        "control_read_from": game.control_read_from,
        "clock_start": game.clock_start,
        "plies": len(plies),
        "sans": game.sans,
        "ucis": game.ucis,
        "clocks": [ply.clock for ply in plies],
        "evals": [ply.eval_cp_white for ply in plies],
        "glyphs": [ply.glyph for ply in plies],
        "comments": [ply.comment for ply in plies] if any(ply.comment for ply in plies) else None,
        "has_clocks": game.has_clocks,
        "has_evals": sum(ply.eval_cp_white is not None for ply in plies) >= 0.9 * len(plies),
        "final_fen": game.final_fen,
    }
    counts["games kept"] += 1
    rows = bc.strong_moves(game)
    counts["positions kept"] += len(rows)
    return row, rows


def _player_fields(someone: bc.Player) -> dict:
    return {
        "name": someone.name,
        "title": someone.title,
        "elo": someone.elo,
        "fide_id": someone.fide_id,
        "strong": bc.is_strong(someone),
        "champion": bc.world_champion(someone),
    }


GAMES_A_PART = 4000


class _Parts:
    """Rows written to numbered parquet files as they come, so a month never sits whole in memory."""

    def __init__(self, folder: Path, schema: dict, size: int) -> None:
        self.folder, self.schema, self.size = folder, schema, size
        folder.mkdir(parents=True, exist_ok=True)
        for old in folder.glob("part-*.parquet"):
            old.unlink()
        self.rows: list[dict] = []
        self.count = 0

    def add(self, rows: list[dict]) -> None:
        self.rows.extend(rows)
        if len(self.rows) >= self.size:
            self.flush()

    def flush(self) -> None:
        if self.rows:
            _frame(self.rows, self.schema).write_parquet(self.folder / f"part-{self.count:03d}.parquet", compression="zstd")
            self.count += 1
            self.rows = []


def _month(job: tuple[str, str]) -> dict:
    month, out = job
    out_dir = Path(out)
    games = _Parts(out_dir / "games" / month, GAME_SCHEMA, GAMES_A_PART)
    positions = _Parts(out_dir / "positions" / month, POSITION_SCHEMA, PART_ROWS)
    counts: Counter = Counter()
    started = time.time()
    with open_zst(bc.month_source(month)) as text:
        for headers, movetext in game_blocks(text):
            found = _game(headers, movetext, month, counts)
            if found is None:
                continue
            game, rows = found
            games.add([game])
            positions.add(rows)
    games.flush()
    positions.flush()
    return {"month": month, "seconds": round(time.time() - started, 1), **counts}


GAME_PARTS = ("games", "*", "part-*.parquet")
POSITION_PARTS = ("positions", "*", "part-*.parquet")


def _glob(out_dir: Path, parts: tuple[str, ...]) -> str:
    return str(out_dir.joinpath(*parts))


def dedupe(out_dir: Path) -> dict:
    """Keeps one copy of a game relayed twice: the first by month, then by game id."""
    ranked = (
        pl.scan_parquet(_glob(out_dir, GAME_PARTS))
        .select("game_id", "dup_key", "month")
        .sort("month", "game_id")
        .with_columns(pl.int_range(pl.len()).over("dup_key").alias("copy"))
        .collect()
    )
    dropped = ranked.filter(pl.col("copy") > 0)["game_id"].unique().to_list()
    for path in sorted(out_dir.glob("/".join(GAME_PARTS))) + sorted(out_dir.glob("/".join(POSITION_PARTS))):
        frame = pl.read_parquet(path)
        kept = frame.filter(~pl.col("game_id").is_in(dropped))
        if len(kept) != len(frame):
            kept.write_parquet(path, compression="zstd")
    return {"copies dropped": len(dropped)}


def summary(out_dir: Path) -> dict:
    games = pl.scan_parquet(_glob(out_dir, GAME_PARTS))
    positions = pl.scan_parquet(_glob(out_dir, POSITION_PARTS))
    game_counts = games.select(
        pl.len().alias("games"),
        pl.col("has_clocks").sum().alias("games_with_clocks"),
        pl.col("has_evals").sum().alias("games_with_evals"),
        (pl.col("white_strong") | pl.col("black_strong")).sum().alias("games_with_a_strong_player"),
        (pl.col("white_strong") & pl.col("black_strong")).sum().alias("games_between_strong_players"),
    ).collect().to_dicts()[0]
    position_counts = positions.select(
        pl.len().alias("positions"),
        pl.col("ample_clock").sum().alias("positions_with_ample_clock"),
        pl.col("loss").is_not_null().sum().alias("positions_with_evaluation"),
        (pl.col("mover_champion") != "").sum().alias("positions_by_world_champions"),
    ).collect().to_dicts()[0]
    titles = positions.group_by("mover_title").agg(pl.len().alias("positions")).sort("positions", descending=True).collect()
    champions = (
        positions.filter(pl.col("mover_champion") != "")
        .group_by("mover_champion", "mover_fide_id")
        .agg(pl.len().alias("positions"), pl.col("game_id").n_unique().alias("games"))
        .sort("positions", descending=True)
        .collect()
    )
    return {
        **game_counts,
        **position_counts,
        "positions_by_title": {row["mover_title"] or "untitled 2200+": row["positions"] for row in titles.to_dicts()},
        "world_champions": champions.to_dicts(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--months", help="comma-separated months; every local month when left out")
    parser.add_argument("--workers", type=int, default=15)
    parser.add_argument("--out", default=str(paths.ROOT / "data" / "corpus" / "masters"))
    args = parser.parse_args()
    months = args.months.split(",") if args.months else bc.local_months()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    sizes = {month: Path(bc.month_source(month)).stat().st_size if not bc.month_source(month).startswith("http") else 0 for month in months}
    order = sorted(months, key=lambda month: -sizes[month])
    started = time.time()
    reports = []
    with get_context("spawn").Pool(args.workers) as pool:
        for report in pool.imap_unordered(_month, [(month, str(out_dir)) for month in order]):
            reports.append(report)
            print(json.dumps(report), flush=True)
    copies = dedupe(out_dir)
    # A run over some months keeps what the manifest says of the others, so the counts are of every month read.
    previous = out_dir / "manifest.json"
    per_month = json.loads(previous.read_text(encoding="utf-8")).get("per_month", {}) if previous.exists() else {}
    per_month.update({report["month"]: report for report in reports})
    totals = Counter()
    for report in per_month.values():
        totals.update({key: value for key, value in report.items() if isinstance(value, int)})
    manifest = {
        "corpus": "masters",
        "source": bc.LIST_URL,
        "licence": bc.LICENCE,
        "months": sorted(per_month),
        "per_month": dict(sorted(per_month.items())),
        "strong": {"titles": list(bc.STRONG_TITLES), "or_rating_at_least": bc.STRONG_ELO},
        "classical_seconds_at_least": bc.CLASSICAL_SECONDS,
        "ample_clock_seconds_at_least": AMPLE_SECONDS,
        "hand": list(POSITION_FEATURES),
        "counts": dict(totals),
        **copies,
        "summary": summary(out_dir),
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "minutes": round((time.time() - started) / 60, 1),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(manifest["summary"], indent=2, default=str))


if __name__ == "__main__":
    main()
