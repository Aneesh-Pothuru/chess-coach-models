"""Power evidence and the unchanged quiet window for one prescribed replay."""
from __future__ import annotations

from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time

from quiet import LAB, PRIVATE, POLICY, QuietWindow, sample_machine


def clocks() -> dict:
    return {"at": datetime.now(timezone.utc).isoformat(),
            "wallSeconds": time.time(), "monotonicSeconds": time.monotonic()}


def hashed(payload: dict) -> dict:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"),
                         allow_nan=False)
    return {**payload, "payloadJson": encoded,
            "receiptSha256": hashlib.sha256(encoded.encode()).hexdigest()}


def command_capture(command: list[str]) -> dict:
    """Retain raw, bounded power-command output and both Python clocks."""
    begin = clocks()
    code, stdout, stderr, error = None, "", "", None
    child = None
    try:
        child = subprocess.Popen(command, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, start_new_session=True, close_fds=True)
        try:
            stdout, stderr = child.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            stdout, stderr = child.communicate()
            error = "command-timeout"
        code = child.returncode
        if len(stdout.encode()) > 1024 * 1024 or len(stderr.encode()) > 65536:
            stdout, stderr = stdout[:1024 * 1024], stderr[:65536]
            error = "command-output-limit"
    except (OSError, UnicodeError) as problem:
        error = type(problem).__name__
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
    end = clocks()
    return {"command": command, "started": begin, "ended": end,
            "calendarSeconds": end["wallSeconds"] - begin["wallSeconds"],
            "monotonicSeconds": end["monotonicSeconds"] - begin["monotonicSeconds"],
            "exitCode": code, "stdout": stdout, "stderr": stderr, "error": error}


def parse_power(battery: dict, lid: dict) -> dict:
    failures = []
    for name, capture in [("battery", battery), ("lid", lid)]:
        if capture.get("exitCode") != 0 or capture.get("error") is not None:
            failures.append(f"{name}-command-failed")
    sources = re.findall(r"^Now drawing from '([^']+)'\s*$",
                         battery.get("stdout", ""), re.MULTILINE)
    ac = sources == ["AC Power"]
    if not ac:
        failures.append("ac-power-not-established")
    states = re.findall(r'"AppleClamshellState"\s*=\s*(\S+)',
                        lid.get("stdout", ""))
    opened = bool(states) and all(state in {"No", "false", "0"} for state in states)
    if not opened:
        failures.append("open-lid-not-established")
    return {"acPower": ac, "lidOpen": opened,
            "ready": not failures, "failures": failures}


def capture_power() -> dict:
    battery = command_capture(["/usr/bin/pmset", "-g", "batt"])
    lid = command_capture(["/usr/sbin/ioreg", "-r", "-k", "AppleClamshellState"])
    return {"schema": "second-look-fresh-power-reading/1", "captured": clocks(),
            "battery": battery, "lid": lid, **parse_power(battery, lid)}


def private_path(path: str | Path, suffix: str) -> Path:
    path = Path(path)
    if not path.is_absolute():
        path = LAB / path
    if (not path.is_relative_to(PRIVATE) or path.suffix != suffix
            or PRIVATE.resolve() != PRIVATE or path.parent.resolve() != path.parent
            or path.is_symlink()):
        raise ValueError("power evidence must remain in the project-private directory")
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def log_line(stream, row: dict, *, sync: bool = False) -> None:
    stream.write(json.dumps(row, allow_nan=False) + "\n")
    stream.flush()
    if sync:
        os.fsync(stream.fileno())


def wait_power_quiet(quiet_log_path: str | Path, power_log_path: str | Path,
                     assert_alive=lambda: None) -> dict:
    """Power before the fixed quiet window, then power immediately after it.

    A failed final power reading or stale quiet receipt discards the window.
    QuietWindow, its observations, policy and receipt are used unchanged.
    """
    quiet_path = private_path(quiet_log_path, ".jsonl")
    power_path = private_path(power_log_path, ".jsonl")
    with quiet_path.open("a", encoding="utf-8") as quiet_log, \
            power_path.open("a", encoding="utf-8") as power_log:
        for stream in [quiet_log, power_log]:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        while True:
            assert_alive()
            before = capture_power()
            log_line(power_log, {"event": "before-quiet", "reading": before})
            if not before["ready"]:
                time.sleep(POLICY["sampleIntervalSeconds"])
                continue
            window = QuietWindow()
            while True:
                assert_alive()
                sample = sample_machine()
                status = window.observe(sample)
                log_line(quiet_log, {"event": "sample", **sample, **status})
                if status["passed"]:
                    quiet_receipt = window.receipt()
                    assert_alive()
                    final = capture_power()
                    assert_alive()
                    age = time.monotonic() - sample["monotonicSeconds"]
                    log_line(power_log, {"event": "before-launch", "reading": final,
                                         "quietAgeSeconds": age})
                    if not final["ready"] or not math.isfinite(age) or not 0 <= age <= 5:
                        log_line(quiet_log, {"event": "power-gate-reset",
                                             "at": clocks()["at"],
                                             "reason": "final-power-failed-or-quiet-stale"})
                        break
                    receipt = hashed({
                        "schema": "second-look-fresh-power-receipt/1",
                        "quietReceiptSha256": quiet_receipt["receiptSha256"],
                        "beforeQuiet": before, "beforeLaunch": final,
                    })
                    log_line(quiet_log, {"event": "passed", "receipt": quiet_receipt}, sync=True)
                    log_line(power_log, {"event": "passed", "receipt": receipt}, sync=True)
                    return {"quiet": quiet_receipt, "power": receipt}
                time.sleep(POLICY["sampleIntervalSeconds"])


TIMESTAMP = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)? [+-]\d{4})\s+(.*)$")


def power_log_line(line: str) -> dict | None:
    match = TIMESTAMP.match(line)
    if not match:
        return None
    stamp = datetime.fromisoformat(match[1])
    text = match[2]
    # "Wake Requests" is a different event column, not evidence of a wake.
    event = re.match(r"(DarkWake|Sleep|Wake)[ \t]{2,}", text)
    kind = event[1] if event else "other"
    duration = re.search(r"\b(\d+)\s*(?:us|usec|microseconds)\b", text)
    return {"at": stamp.isoformat(), "event": kind,
            "durationMicroseconds": int(duration[1]) if duration else None, "raw": line}


def capture_power_log(started_at: str, ended_at: str, assert_alive=lambda: None) -> dict:
    """Stream the system log; retain only lines inside this replay's window."""
    start = datetime.fromisoformat(started_at)
    end = datetime.fromisoformat(ended_at)
    if start.tzinfo is None or end.tzinfo is None or end < start:
        raise ValueError("invalid replay power-log interval")
    retained_start = start.replace(microsecond=0)
    begin = clocks()
    command = ["/usr/bin/pmset", "-g", "log"]
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, start_new_session=True, close_fds=True)
    selector = selectors.DefaultSelector()
    for name, pipe in [("stdout", child.stdout), ("stderr", child.stderr)]:
        os.set_blocking(pipe.fileno(), False)
        selector.register(pipe, selectors.EVENT_READ, name)
    buffer, stderr = b"", bytearray()
    events, lines = [], []
    retained_bytes = 0
    keep_continuation = False
    error = None

    def consume(raw: bytes) -> None:
        nonlocal retained_bytes, keep_continuation
        line = raw.decode("utf-8", errors="strict")
        parsed = power_log_line(line)
        if parsed is not None:
            stamp = datetime.fromisoformat(parsed["at"])
            keep_continuation = retained_start <= stamp <= end
            if keep_continuation:
                events.append(parsed)
        if keep_continuation:
            retained_bytes += len(raw) + 1
            if retained_bytes > 4 * 1024 * 1024:
                raise ValueError("selected-power-log-output-limit")
            lines.append(line)

    try:
        while selector.get_map():
            assert_alive()
            if time.monotonic() - begin["monotonicSeconds"] > 30:
                raise TimeoutError("power-log-timeout")
            for key, _ in selector.select(timeout=.2):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                if key.data == "stderr":
                    stderr.extend(chunk)
                    if len(stderr) > 65536:
                        raise ValueError("power-log-stderr-limit")
                    continue
                buffer += chunk
                if len(buffer) > 1024 * 1024:
                    raise ValueError("power-log-line-limit")
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    consume(line)
        if buffer:
            consume(buffer)
        child.wait(timeout=5)
    except (OSError, UnicodeError, ValueError, TimeoutError, subprocess.TimeoutExpired) as problem:
        error = str(problem)
    finally:
        selector.close()
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
        child.stdout.close()
        child.stderr.close()
    finish = clocks()
    return hashed({
        "schema": "second-look-fresh-replay-power-log/1",
        "command": command, "window": {"startedAt": started_at, "endedAt": ended_at},
        "retainedWindow": {"startedAt": retained_start.isoformat(), "endedAt": ended_at},
        "timestampResolutionSeconds": 1,
        "started": begin, "ended": finish,
        "calendarSeconds": finish["wallSeconds"] - begin["wallSeconds"],
        "monotonicSeconds": finish["monotonicSeconds"] - begin["monotonicSeconds"],
        "exitCode": child.returncode, "error": error,
        "stderr": stderr.decode("utf-8", errors="replace"),
        "events": events, "rawLines": lines,
    })
