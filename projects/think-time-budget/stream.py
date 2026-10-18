#!/usr/bin/env python3
"""Stream a file-order prefix of a Lichess month, keeping only study games.

The archive is never stored. Each complete zstd frame commits one gzip member
and an atomic checkpoint. A restart uses HTTP Range at that frame boundary;
an incomplete gzip tail is truncated to the checkpoint before resuming.
All games, names, ids and parser state stay under private/think-time-budget.
This script reads PGN tags, not chess positions or outcomes.
"""
from __future__ import annotations

import argparse
import fcntl
import gzip
import io
import json
import math
import os
import re
import signal
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import zstandard

LAB = Path(__file__).resolve().parents[2]
PRIVATE = LAB / "private" / "think-time-budget"
URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"
SCHEMA = 1
MIN_PLIES = 20
MAX_RATING_GAP = 300
SLOW_MIN_BASE = 600
SLOW_MIN_BUDGET = 900
TERMINATIONS = {"Normal", "Time forfeit"}
TOKEN = re.compile(r"\{([^}]*)\}|(\S+)")
EV = re.compile(r"\[%eval\s+([^\]\s]+)\]")
CLK = re.compile(r"\[%clk\s+\d+:\d+:\d+(?:\.\d+)?\]")
MOVE_NUMBER = re.compile(r"^\d+\.+")
IGNORE = re.compile(r"^(1-0|0-1|1/2-1/2|\*|\$\d+)$")


def atomic_json(path: Path, value: dict) -> None:
    tmp = path.with_name(path.name + ".partial")
    with tmp.open("w") as out:
        json.dump(value, out, separators=(",", ":"))
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())
    tmp.replace(path)


def budget_of(tc: str) -> tuple[str, int, int] | None:
    match = re.fullmatch(r"(\d+)\+(\d+)", tc)
    if not match:
        return None
    base, increment = map(int, match.groups())
    if base == 600 and increment == 0:
        return "fast", base, increment
    if base >= SLOW_MIN_BASE and base + 40 * increment >= SLOW_MIN_BUDGET:
        return "slow", base, increment
    return None


def annotation_count(movetext: str) -> tuple[int, bool]:
    """Count PGN moves and require both tags on each, including a final mate.

    This is only a tag-completeness check. The bridge reader interprets the
    tags, replays the game, grades moves and supplies every chess fact.
    """
    plies = 0
    evaluation = clock = False
    complete = True
    for match in TOKEN.finditer(movetext):
        comment, token = match.groups()
        if comment is not None:
            if plies:
                tag = EV.search(comment)
                if tag:
                    value = tag[1]
                    try:
                        # Only validity is checked, never a numeric chess
                        # evaluation. The imported reader rejects mate zero.
                        evaluation |= (int(value[1:]) != 0 if value.startswith("#")
                                       else math.isfinite(float(value)))
                    except ValueError:
                        pass
                clock |= CLK.search(comment) is not None
            continue
        token = MOVE_NUMBER.sub("", token)
        if not token or IGNORE.fullmatch(token):
            continue
        if plies:
            complete &= evaluation and clock
        plies += 1
        evaluation = clock = False
    return plies, bool(plies and complete and evaluation and clock)


def initial_state(month: str) -> dict:
    return {
        "schema": SCHEMA, "month": month, "url": URL.format(month=month),
        "compressedOffset": 0, "outputBytes": 0, "frames": 0,
        "archiveBytes": None, "etag": None, "complete": False,
        "seconds": 0.0, "networkBytesRead": 0,
        "counts": {"gamesRead": 0, "rapidGames": 0, "budgetGames": 0,
                   "kept": {"fast": 0, "slow": 0}, "timeControls": {}, "skipped": {}},
        "parser": {"tail": "", "headers": {}, "movetext": []},
        "filters": {"eventPrefix": "Rated Rapid", "fast": "600+0", "slowMinBase": SLOW_MIN_BASE,
                    "slowMinBasePlus40Increment": SLOW_MIN_BUDGET, "minPlies": MIN_PLIES,
                    "maxRatingGap": MAX_RATING_GAP, "everyMoveEvalAndClock": True,
                    "evalTagsParseable": True},
    }


def aggregate_state(state: dict) -> dict:
    """No parser, game or player fields may enter an aggregate report."""
    return {key: value for key, value in state.items() if key != "parser"}


class Parser:
    def __init__(self, state: dict):
        self.state = state
        self.parser = state["parser"]
        self.counts = state["counts"]
        self.rows: list[dict] = []

    def skip(self, reason: str) -> None:
        counts = self.counts["skipped"]
        counts[reason] = counts.get(reason, 0) + 1

    def finish_game(self) -> None:
        headers = self.parser["headers"]
        movetext = " ".join(self.parser["movetext"])
        self.parser["headers"] = {}
        self.parser["movetext"] = []
        if not headers:
            return
        self.counts["gamesRead"] += 1
        if not headers.get("Event", "").startswith("Rated Rapid"):
            return
        self.counts["rapidGames"] += 1
        budget = budget_of(headers.get("TimeControl", ""))
        if budget is None:
            return
        self.counts["budgetGames"] += 1
        if headers.get("Termination") not in TERMINATIONS:
            self.skip("termination")
            return
        if "[%eval" not in movetext or "[%clk" not in movetext:
            self.skip("no eval or clock tags")
            return
        try:
            white_elo, black_elo = int(headers["WhiteElo"]), int(headers["BlackElo"])
        except (KeyError, ValueError):
            self.skip("rating missing")
            return
        if abs(white_elo - black_elo) > MAX_RATING_GAP:
            self.skip("rating gap")
            return
        white, black = headers.get("White", "").casefold(), headers.get("Black", "").casefold()
        if not white or not black or white in {"?", "anonymous"} or black in {"?", "anonymous"}:
            self.skip("player missing")
            return
        plies, complete = annotation_count(movetext)
        if plies < MIN_PLIES:
            self.skip("too short")
            return
        if not complete:
            self.skip("a move lacks eval or clock")
            return
        label, base, increment = budget
        self.counts["kept"][label] += 1
        tc = headers["TimeControl"]
        controls = self.counts["timeControls"]
        controls[tc] = controls.get(tc, 0) + 1
        self.rows.append({
            "id": headers.get("Site", "").rsplit("/", 1)[-1], "month": self.state["month"],
            "white": white, "black": black, "whiteElo": white_elo, "blackElo": black_elo,
            "tc": tc, "budget": label, "base": base, "increment": increment, "plies": plies,
            "result": headers.get("Result", ""), "termination": headers.get("Termination", ""),
            "movetext": movetext,
        })

    def consume(self, data: bytes, final: bool = False) -> None:
        # ASCII headers and SAN make UTF-8 boundaries immaterial to selected
        # fields; carry complete bytes until a newline before decoding.
        raw = bytes.fromhex(self.parser.pop("tailHex", "")) + data
        parts = raw.split(b"\n")
        tail = parts.pop()
        self.parser["tailHex"] = tail.hex()
        self.parser.pop("tail", None)
        for raw_line in parts:
            line = raw_line.decode("utf-8", errors="replace").strip()
            if line.startswith("[Event ") and self.parser["headers"]:
                self.finish_game()
            if line.startswith("["):
                if not line.startswith("[Event ") and not self.parser["headers"].get("Event", "").startswith("Rated Rapid"):
                    continue
                key, _, rest = line[1:].partition(" ")
                self.parser["headers"][key] = rest.rstrip("]").strip('"')
            elif line:
                self.parser["movetext"].append(line)
            elif self.parser["movetext"]:
                self.finish_game()
        if final:
            if tail:
                self.parser["movetext"].append(tail.decode("utf-8", errors="replace"))
                self.parser["tailHex"] = ""
            self.finish_game()


def stream(month: str, max_frames: int = 0, max_games: int = 0) -> int:
    PRIVATE.mkdir(parents=True, exist_ok=True)
    checkpoint = PRIVATE / f"stream-{month}.checkpoint.json"
    summary_path = PRIVATE / f"games-{month}.json"
    output_path = PRIVATE / f"games-{month}.jsonl.gz"
    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else initial_state(month)
    if state["schema"] != SCHEMA or state["filters"] != initial_state(month)["filters"]:
        raise RuntimeError("checkpoint schema or filters differ; use a fresh project-private destination")
    if state["complete"]:
        print(json.dumps(aggregate_state(state)), file=sys.stderr)
        return 0
    stop = False

    def request_stop(_signum, _frame):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    invocation_started = time.perf_counter()
    previous_seconds = state["seconds"]
    first_frame = state["frames"]
    attempts = 0
    output_path.touch(exist_ok=True)
    while not stop:
        # A crash can leave output beyond the last committed checkpoint.
        with output_path.open("r+b") as output:
            if output.seek(0, io.SEEK_END) < state["outputBytes"]:
                raise RuntimeError("committed gzip bytes are missing")
            output.truncate(state["outputBytes"])
            output.seek(state["outputBytes"])
            parser = Parser(state)
            offset = state["compressedOffset"]
            request = urllib.request.Request(state["url"], headers={
                "User-Agent": "chess-coach-models", "Range": f"bytes={offset}-",
                **({"If-Range": state["etag"]} if state["etag"] else {}),
            })
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    if offset and (response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {offset}-")):
                        raise RuntimeError("server did not honor the checkpoint's byte range")
                    etag = response.headers.get("ETag")
                    if state["etag"] and etag != state["etag"]:
                        raise RuntimeError("archive changed since checkpoint")
                    state["etag"] = etag
                    content_range = response.headers.get("Content-Range")
                    state["archiveBytes"] = int(content_range.rsplit("/", 1)[-1]) if content_range else int(response.headers["Content-Length"])
                    decoder = zstandard.ZstdDecompressor(max_window_size=2**31).decompressobj()
                    while True:
                        pending = response.read(1 << 20)
                        if not pending:
                            if offset != state["compressedOffset"] or offset != state["archiveBytes"]:
                                raise EOFError("connection ended before the complete archive")
                            state["complete"] = True
                            state["seconds"] = round(previous_seconds + time.perf_counter() - invocation_started, 3)
                            atomic_json(checkpoint, state)
                            atomic_json(summary_path, aggregate_state(state))
                            stop = True
                            break
                        state["networkBytesRead"] += len(pending)
                        while pending:
                            decoded = decoder.decompress(pending)
                            used = len(pending) - len(decoder.unused_data)
                            offset += used
                            parser.consume(decoded)
                            pending = decoder.unused_data
                            if not decoder.eof:
                                break
                            if offset == state["archiveBytes"]:
                                parser.consume(b"", final=True)
                            if parser.rows:
                                payload = "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in parser.rows).encode()
                                output.write(gzip.compress(payload, compresslevel=5, mtime=0))
                                parser.rows.clear()
                                output.flush()
                                os.fsync(output.fileno())
                            state["outputBytes"] = output.tell()
                            state["compressedOffset"] = offset
                            state["frames"] += 1
                            state["seconds"] = round(previous_seconds + time.perf_counter() - invocation_started, 3)
                            state["complete"] = offset == state["archiveBytes"]
                            atomic_json(checkpoint, state)
                            atomic_json(summary_path, aggregate_state(state))
                            if state["frames"] % 25 == 0 or state["complete"]:
                                print(json.dumps(aggregate_state(state)), file=sys.stderr, flush=True)
                            if (stop or state["complete"] or (max_frames and state["frames"] - first_frame >= max_frames)
                                    or (max_games and state["counts"]["gamesRead"] >= max_games)):
                                stop = True
                                break
                            decoder = zstandard.ZstdDecompressor(max_window_size=2**31).decompressobj()
                        if stop:
                            break
                attempts = 0
            except (OSError, EOFError, urllib.error.URLError, zstandard.ZstdError) as error:
                attempts += 1
                # Re-read the committed state: the parser and counts may have
                # advanced into a frame that failed before it was committed.
                state = json.loads(checkpoint.read_text()) if checkpoint.exists() else initial_state(month)
                if attempts >= 5 or stop:
                    raise RuntimeError(f"stream stopped after {attempts} connection failures: {type(error).__name__}") from None
                print(f"retry {attempts} at committed byte {state['compressedOffset']} ({type(error).__name__})", file=sys.stderr, flush=True)
                time.sleep(min(attempts * 2, 10))
    print(json.dumps(aggregate_state(state)), file=sys.stderr, flush=True)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", required=True)
    ap.add_argument("--max-frames", type=int, default=0, help="stop after this many additional frames; resume on the next run")
    ap.add_argument("--max-games", type=int, default=0, help="stop at first frame ending at or past this total read count")
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}", args.month):
        ap.error("month must be YYYY-MM")
    PRIVATE.mkdir(parents=True, exist_ok=True)
    with (PRIVATE / f"stream-{args.month}.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("this month's stream is already running") from None
        return stream(args.month, args.max_frames, args.max_games)


if __name__ == "__main__":
    sys.exit(main())
