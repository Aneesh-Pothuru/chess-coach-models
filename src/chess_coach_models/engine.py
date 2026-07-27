from __future__ import annotations

import shutil
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

import chess
import chess.engine


def stockfish_path(configured: str = "auto") -> str:
    if configured != "auto":
        path = Path(configured).expanduser()
        if not path.exists():
            raise FileNotFoundError(f"Configured Stockfish not found: {path}")
        return str(path)
    found = shutil.which("stockfish")
    if found:
        return found
    homebrew = Path("/opt/homebrew/bin/stockfish")
    if homebrew.exists():
        return str(homebrew)
    raise FileNotFoundError(
        "Stockfish not found. Install it with `brew install stockfish` or set stockfish.path."
    )


@contextmanager
def open_stockfish(config: dict[str, Any]) -> Iterator[chess.engine.SimpleEngine]:
    cfg = config["stockfish"]
    engine = chess.engine.SimpleEngine.popen_uci(stockfish_path(str(cfg["path"])))
    try:
        engine.configure(
            {
                "Threads": int(cfg.get("threads", 2)),
                "Hash": int(cfg.get("hash_mb", 256)),
            }
        )
        yield engine
    finally:
        engine.quit()


def score_cp_white(score: chess.engine.PovScore, mate_cp: int = 10_000) -> float:
    value = score.white().score(mate_score=mate_cp)
    if value is None:
        return 0.0
    return float(value)


def analyse(
    engine: chess.engine.SimpleEngine,
    board: chess.Board,
    config: dict[str, Any],
    *,
    multipv: int | None = None,
) -> list[dict[str, Any]]:
    cfg = config["stockfish"]
    count = int(multipv if multipv is not None else cfg.get("multipv", 1))
    limit = chess.engine.Limit(
        time=float(cfg["time_limit_seconds"])
        if cfg.get("time_limit_seconds")
        else None,
        depth=int(cfg["depth"]) if cfg.get("depth") else None,
    )
    result = engine.analyse(board, limit, multipv=max(1, count))
    return result if isinstance(result, list) else [result]

