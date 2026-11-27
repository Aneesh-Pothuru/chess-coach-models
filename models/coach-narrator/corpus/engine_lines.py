"""Stockfish's lines for a table of positions, and where the move that was played stands among them.

usage: python engine_lines.py IN.parquet OUT.parquet [--nodes 400000] [--multipv 4] [--workers 15]
                              [--pv-plies 12] [--limit N] [--resume]

IN has a ``key`` and a ``fen`` a row, and may have ``move``: the move played there, as UCI, and ``also``: a
list of other moves to weigh (what a club player would likely play there, say). OUT has a row a position,
in IN's order:

- ``lines``: the engine's best moves, best first, each with its score from the mover's side (``cp`` or
  ``mate``), its win/draw/loss chances per thousand and its principal variation as UCI.
- ``played_rank``: where the played move stands among ``lines`` (1 is the engine's choice), or null when it
  is not among them; the played move is then searched on its own (``played_*``), with the same nodes.
- ``best_win`` and ``played_win``: the mover's winning chances in percent through the lab's curve
  (``winprob.py``), and ``loss``, their difference.
- ``also_lines``: each move of ``also`` with its score, its line and its winning chances, taken from
  ``lines`` when it is there and searched on its own otherwise.

Every search is one thread, a fixed number of nodes and an empty hash, so the same binary gives the same
lines on any machine and in any order. A run that stops keeps what it wrote: ``--resume`` skips the keys
already in OUT's parts.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from multiprocessing import get_context
from pathlib import Path

import chess
import chess.engine
import polars as pl

from chess_coach_models.winprob import win_percent

ENGINE: chess.engine.SimpleEngine | None = None
SETTINGS: dict = {}
# Rows a part holds: a run that is stopped loses at most this many searches.
PART_ROWS = 2_000


def _start(binary: str, hash_mb: int, nodes: int, multipv: int, pv_plies: int) -> None:
    global ENGINE
    ENGINE = chess.engine.SimpleEngine.popen_uci(binary)
    ENGINE.configure({"Threads": 1, "Hash": hash_mb, "UCI_ShowWDL": True})
    SETTINGS.update(binary=binary, hash=hash_mb, nodes=nodes, multipv=multipv, pv_plies=pv_plies)


def _score(info: dict) -> dict:
    pov = info["score"].relative
    wdl = info.get("wdl")
    wdl = wdl.relative if wdl is not None else None
    mate = pov.mate()
    cp = None if mate is not None else pov.score()
    return {
        "cp": cp,
        "mate": mate,
        "win": wdl.wins if wdl is not None else None,
        "draw": wdl.draws if wdl is not None else None,
        "loss": wdl.losses if wdl is not None else None,
    }


def _mover_win(line: dict) -> float:
    if line["mate"] is not None:
        return 100.0 if line["mate"] > 0 else 0.0
    return win_percent(line["cp"])


def _single(board: chess.Board, move: chess.Move, limit: chess.engine.Limit, key: str) -> dict:
    """One move searched on its own: its score, its line and the mover's winning chances after it."""
    info = ENGINE.analyse(board, limit, root_moves=[move], game=f"{key}:{move.uci()}")
    score = _score(info)
    return {
        "move": move.uci(),
        **score,
        "pv": [step.uci() for step in info.get("pv", [])[: SETTINGS["pv_plies"]]],
        "mover_win": _mover_win(score),
    }


def _empty(key: str, problem: str) -> dict:
    return {"key": key, "depth": None, "seldepth": None, "nodes": None, "lines": [], "best_move": None, "best_win": None,
            "played_rank": None, "played_cp": None, "played_mate": None, "played_pv": None, "played_win": None,
            "loss": None, "also_lines": [], "problem": problem}


def _analyse(job: tuple[str, str, str | None, list[str] | None]) -> dict:
    """A position's lines; a position that is not legal, or that stops the engine, gives a row that says so,
    and a stopped engine is started again for the next position."""
    global ENGINE
    key = job[0]
    try:
        board = chess.Board(job[1])
    except ValueError:
        return _empty(key, "not a position")
    if not board.is_valid():
        return _empty(key, "not a legal position")
    try:
        return _search(job, board)
    except (chess.engine.EngineTerminatedError, chess.engine.EngineError) as error:
        try:
            ENGINE.quit()
        except Exception:
            pass
        _start(SETTINGS["binary"], SETTINGS["hash"], SETTINGS["nodes"], SETTINGS["multipv"], SETTINGS["pv_plies"])
        return _empty(key, f"the engine stopped: {type(error).__name__}")


def _search(job: tuple[str, str, str | None, list[str] | None], board: chess.Board) -> dict:
    key, _, played, also = job
    limit = chess.engine.Limit(nodes=SETTINGS["nodes"])
    infos = ENGINE.analyse(board, limit, multipv=SETTINGS["multipv"], game=key)
    lines = []
    for info in infos:
        if "pv" not in info or not info["pv"]:
            continue
        lines.append(
            {
                "move": info["pv"][0].uci(),
                **_score(info),
                "pv": [move.uci() for move in info["pv"][: SETTINGS["pv_plies"]]],
            }
        )
    first = infos[0] if infos else {}
    row = {
        "key": key,
        "depth": first.get("depth"),
        "seldepth": first.get("seldepth"),
        "nodes": first.get("nodes"),
        "lines": lines,
        "best_move": lines[0]["move"] if lines else None,
        "best_win": _mover_win(lines[0]) if lines else None,
        "played_rank": None,
        "played_cp": None,
        "played_mate": None,
        "played_pv": None,
        "played_win": None,
        "loss": None,
    }
    if played and lines:
        moves = [line["move"] for line in lines]
        if played in moves:
            index = moves.index(played)
            chosen = lines[index]
            row.update(played_rank=index + 1, played_cp=chosen["cp"], played_mate=chosen["mate"], played_pv=chosen["pv"])
            row["played_win"] = _mover_win(chosen)
        else:
            move = chess.Move.from_uci(played)
            if move in board.legal_moves:
                alone = _single(board, move, limit, key)
                row.update(played_cp=alone["cp"], played_mate=alone["mate"], played_pv=alone["pv"], played_win=alone["mover_win"])
        if row["played_win"] is not None:
            row["loss"] = row["best_win"] - row["played_win"]
    extra = []
    for uci in also or []:
        if not lines or uci == played:
            continue
        found = next((line for line in lines if line["move"] == uci), None)
        if found is not None:
            extra.append({**found, "mover_win": _mover_win(found)})
            continue
        move = chess.Move.from_uci(uci)
        if move in board.legal_moves:
            extra.append(_single(board, move, limit, key))
    row["also_lines"] = extra
    row["problem"] = None if lines else "no line"
    return row


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--nodes", type=int, default=400_000)
    parser.add_argument("--multipv", type=int, default=4)
    parser.add_argument("--pv-plies", type=int, default=12)
    parser.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 1))
    parser.add_argument("--hash", type=int, default=64)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--engine", default=shutil.which("stockfish") or "stockfish")
    args = parser.parse_args()

    table = pl.read_parquet(args.source, columns=None)
    if args.limit:
        table = table.head(args.limit)
    moves = table["move"].to_list() if "move" in table.columns else [None] * len(table)
    others = table["also"].to_list() if "also" in table.columns else [None] * len(table)
    jobs = list(zip(table["key"].to_list(), table["fen"].to_list(), moves, others))

    target = Path(args.target)
    parts_dir = target.with_suffix(".parts")
    parts_dir.mkdir(parents=True, exist_ok=True)
    done: set[str] = set()
    if args.resume:
        for part in sorted(parts_dir.glob("part-*.parquet")):
            done.update(pl.read_parquet(part, columns=["key"])["key"].to_list())
    else:
        for part in parts_dir.glob("part-*.parquet"):
            part.unlink()
    todo = [job for job in jobs if job[0] not in done]
    print(f"{len(jobs):,} positions, {len(done):,} already done, {len(todo):,} to search "
          f"({args.nodes:,} nodes, {args.multipv} lines, {args.workers} workers)", flush=True)

    version = chess.engine.SimpleEngine.popen_uci(args.engine)
    engine_name = version.id.get("name", "unknown")
    version.quit()

    started = time.time()
    buffer: list[dict] = []
    written = len(list(parts_dir.glob("part-*.parquet")))
    context = get_context("spawn")
    with context.Pool(
        args.workers,
        initializer=_start,
        initargs=(args.engine, args.hash, args.nodes, args.multipv, args.pv_plies),
    ) as pool:
        for count, row in enumerate(pool.imap(_analyse, todo, chunksize=8), start=1):
            buffer.append(row)
            if len(buffer) >= PART_ROWS:
                pl.DataFrame(buffer, infer_schema_length=None).write_parquet(parts_dir / f"part-{written:05d}.parquet")
                written += 1
                buffer = []
            if count % 2000 == 0 or count == len(todo):
                rate = count / max(1e-9, time.time() - started)
                left = (len(todo) - count) / max(rate, 1e-9)
                print(f"{count:,}/{len(todo):,} searched, {rate:.1f} a second, {left / 3600:.2f} h left", flush=True)
    if buffer:
        pl.DataFrame(buffer, infer_schema_length=None).write_parquet(parts_dir / f"part-{written:05d}.parquet")

    found = pl.concat([pl.read_parquet(part) for part in sorted(parts_dir.glob("part-*.parquet"))], how="diagonal_relaxed")
    found = found.unique(subset="key", keep="last")
    order = table.select("key").with_row_index("order")
    result = (
        order.join(found, on="key", how="left")
        .sort("order")
        .drop("order")
        .with_columns(
            pl.lit(engine_name).alias("engine"),
            pl.lit(args.nodes).alias("nodes_limit"),
            pl.lit(args.multipv).alias("multipv"),
        )
    )
    result.write_parquet(target, compression="zstd")
    print(f"wrote {target} ({len(result):,} rows) in {(time.time() - started) / 60:.1f} min", file=sys.stderr)


if __name__ == "__main__":
    main()
