from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO

import chess
import chess.pgn
import polars as pl

from .bands import rating_band
from .config import load_config, project_path
from .winprob import (
    mover_loss_win_percent,
    mover_win_percent,
    parse_clock_comment,
    parse_eval_comment,
    win_percent,
)


@dataclass
class PipelineStats:
    games_read: int = 0
    games_kept_openings: int = 0
    games_with_evals: int = 0
    eval_positions: int = 0
    parse_errors: int = 0


def _int_header(headers: chess.pgn.Headers, key: str) -> int | None:
    try:
        return int(headers.get(key, ""))
    except (TypeError, ValueError):
        return None


def _is_standard_rated(headers: chess.pgn.Headers) -> bool:
    variant = headers.get("Variant", "Standard")
    event = headers.get("Event", "")
    return variant in {"Standard", "From Position"} and event.startswith("Rated")


def _game_id(game: chess.pgn.Game, index: int) -> str:
    site = game.headers.get("Site", "")
    if site:
        return site.rsplit("/", 1)[-1]
    identity = "|".join(
        [
            game.headers.get("UTCDate", game.headers.get("Date", "")),
            game.headers.get("UTCTime", ""),
            game.headers.get("White", ""),
            game.headers.get("Black", ""),
            str(index),
        ]
    )
    return hashlib.sha1(identity.encode("utf-8")).hexdigest()[:16]


def _result_scores(result: str) -> tuple[float, float] | None:
    return {
        "1-0": (1.0, 0.0),
        "0-1": (0.0, 1.0),
        "1/2-1/2": (0.5, 0.5),
    }.get(result)


def game_to_records(
    game: chess.pgn.Game,
    game_index: int,
    bands: list[dict[str, Any]],
    opening_plies: int,
    trap_max_ply: int,
    blunder_threshold: float,
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    headers = game.headers
    if not _is_standard_rated(headers):
        return None, []
    white_elo = _int_header(headers, "WhiteElo")
    black_elo = _int_header(headers, "BlackElo")
    white_band = rating_band(white_elo, bands)
    black_band = rating_band(black_elo, bands)
    scores = _result_scores(headers.get("Result", ""))
    if white_elo is None or black_elo is None or not white_band or not black_band or not scores:
        return None, []

    game_id = _game_id(game, game_index)
    board = game.board()
    moves_uci: list[str] = []
    moves_san: list[str] = []
    eval_records: list[dict[str, Any]] = []
    previous_cp_white: float | None = None
    pending: list[dict[str, Any]] = []

    for ply, node in enumerate(game.mainline(), start=1):
        move = node.move
        mover = board.turn
        mover_elo = white_elo if mover == chess.WHITE else black_elo
        opponent_elo = black_elo if mover == chess.WHITE else white_elo
        mover_band = white_band if mover == chess.WHITE else black_band
        fen_before = board.fen()
        uci = move.uci()
        try:
            san = board.san(move)
        except (ValueError, AssertionError):
            break
        if ply <= opening_plies:
            moves_uci.append(uci)
            moves_san.append(san)

        current_cp_white = parse_eval_comment(node.comment)
        clock_seconds = parse_clock_comment(node.comment)
        if previous_cp_white is not None and current_cp_white is not None:
            loss = mover_loss_win_percent(previous_cp_white, current_cp_white, mover)
            pending.append(
                {
                    "game_id": game_id,
                    "ply": ply,
                    "fen": fen_before,
                    "move_uci": uci,
                    "move_san": san,
                    "mover": "white" if mover == chess.WHITE else "black",
                    "mover_elo": mover_elo,
                    "opponent_elo": opponent_elo,
                    "rating_band": mover_band,
                    "eval_cp_white_before": previous_cp_white,
                    "eval_cp_white_after": current_cp_white,
                    "win_pct_mover_before": mover_win_percent(previous_cp_white, mover),
                    "win_pct_mover_after": mover_win_percent(current_cp_white, mover),
                    "loss_win_pct": loss,
                    "is_blunder": int(loss > blunder_threshold),
                    "clock_seconds": clock_seconds,
                    "time_control": headers.get("TimeControl", ""),
                    "eco": headers.get("ECO", ""),
                    "opening": headers.get("Opening", ""),
                    "early_ply": int(ply <= trap_max_ply),
                }
            )
        if current_cp_white is not None:
            previous_cp_white = current_cp_white
        board.push(move)

    if pending:
        eval_records = pending

    opening_record = {
        "game_id": game_id,
        "white_elo": white_elo,
        "black_elo": black_elo,
        "white_band": white_band,
        "black_band": black_band,
        "result": headers.get("Result", ""),
        "white_score": scores[0],
        "black_score": scores[1],
        "time_control": headers.get("TimeControl", ""),
        "eco": headers.get("ECO", ""),
        "opening": headers.get("Opening", ""),
        "moves_uci": " ".join(moves_uci),
        "moves_san": " ".join(moves_san),
        "plies_captured": len(moves_uci),
        "has_evals": bool(eval_records),
    }
    return opening_record, eval_records


def process_stream(
    handle: TextIO,
    config: dict[str, Any],
    *,
    write_outputs: bool = True,
) -> tuple[pl.DataFrame, pl.DataFrame, PipelineStats]:
    data_cfg = config["data"]
    bands = config["rating_bands"]
    max_eval = int(data_cfg["max_eval_positions"])
    max_openings = int(data_cfg["max_opening_games"])
    progress_every = int(data_cfg.get("progress_every_games", 10_000))
    stats = PipelineStats()
    opening_rows: list[dict[str, Any]] = []
    eval_rows: list[dict[str, Any]] = []
    started = time.monotonic()

    while len(eval_rows) < max_eval or len(opening_rows) < max_openings:
        try:
            game = chess.pgn.read_game(handle)
        except Exception as exc:  # malformed source game; keep streaming
            stats.parse_errors += 1
            print(f"warning: PGN parse error: {exc}", file=sys.stderr)
            continue
        if game is None:
            break
        stats.games_read += 1
        if game.errors:
            stats.parse_errors += len(game.errors)
        opening_record, positions = game_to_records(
            game,
            stats.games_read,
            bands,
            int(data_cfg["opening_plies"]),
            int(data_cfg["trap_max_ply"]),
            float(config["thresholds"]["blunder_loss_win_pct"]),
        )
        if opening_record is not None and len(opening_rows) < max_openings:
            opening_rows.append(opening_record)
            stats.games_kept_openings += 1
        if positions:
            stats.games_with_evals += 1
            remaining = max_eval - len(eval_rows)
            if remaining > 0:
                eval_rows.extend(positions[:remaining])
        stats.eval_positions = len(eval_rows)

        if progress_every and stats.games_read % progress_every == 0:
            elapsed = max(time.monotonic() - started, 0.001)
            print(
                f"read={stats.games_read:,} openings={len(opening_rows):,} "
                f"eval_positions={len(eval_rows):,} rate={stats.games_read / elapsed:,.0f} games/s",
                file=sys.stderr,
            )

    openings_df = pl.DataFrame(opening_rows, infer_schema_length=None)
    eval_df = pl.DataFrame(eval_rows, infer_schema_length=None)
    if write_outputs:
        opening_path = project_path(config, data_cfg["opening_games_path"])
        eval_path = project_path(config, data_cfg["eval_positions_path"])
        metadata_path = project_path(config, data_cfg["metadata_path"])
        for path in (opening_path, eval_path, metadata_path):
            path.parent.mkdir(parents=True, exist_ok=True)
        openings_df.write_parquet(opening_path, compression="zstd")
        eval_df.write_parquet(eval_path, compression="zstd")
        metadata = {
            **stats.__dict__,
            "month": data_cfg["month"],
            "source_url": data_cfg["url"],
            "max_eval_positions": max_eval,
            "max_opening_games": max_openings,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }
        metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return openings_df, eval_df, stats


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Filter a decompressed Lichess PGN stream.")
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--input", help="Decompressed PGN path; defaults to stdin.")
    args = parser.parse_args(argv)
    config = load_config(args.config)
    if args.input:
        with Path(args.input).open("r", encoding="utf-8", errors="replace") as handle:
            _, _, stats = process_stream(handle, config)
    else:
        stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
        _, _, stats = process_stream(stdin, config)
    print(json.dumps(stats.__dict__, indent=2))


if __name__ == "__main__":
    main()

