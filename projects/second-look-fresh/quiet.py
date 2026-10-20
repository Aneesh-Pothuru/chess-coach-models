"""Wait for the prescribed quiet window before one new observed replay.

Call wait_quiet(private_log_path) immediately before starting that replay.
This helper starts no review, engine or test process. Its JSONL log contains
loads, clock readings, aggregate process counts and fixed reason codes only.
It never records scanned command lines, executable paths or environment data.
"""
from __future__ import annotations

import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shlex
import subprocess
import time
from datetime import datetime, timezone
from types import MappingProxyType


LAB = Path(__file__).resolve().parents[2]
PRIVATE = LAB / "private/second-look-fresh"
POLICY = MappingProxyType({
    "requiredQuietSeconds": 300,
    "load1StrictlyBelow": 6,
    "sampleIntervalSeconds": 5,
    "maximumSamplingGapSeconds": 15,
    "maximumClockDriftSeconds": 2,
    "processScanTimeoutSeconds": 10,
    "maximumSampleDurationSeconds": 2,
    "blockedProcesses": ("npm run verify:pr", "vitest"),
})
NODE_NAMES = {"node", "nodejs", "node.exe"}
NPM_NAMES = {"npm", "npm.cmd", "npm-cli.js"}
VITEST_NAMES = {"vitest", "vitest.mjs", "vitest.js", "vitest.cmd"}
NODE_VALUE_OPTIONS = {
    "-r", "--require", "--import", "--loader", "--experimental-loader",
    "--conditions", "-C", "--inspect-port", "--icu-data-dir", "--openssl-config",
}
NPM_VALUE_OPTIONS = {
    "--prefix", "--workspace", "-w", "--userconfig", "--globalconfig",
    "--cache", "--registry", "--script-shell", "--loglevel", "--location",
}


def _name(value: str) -> str:
    return value.replace("\\", "/").rsplit("/", 1)[-1]


def _npm_verify(arguments: list[str]) -> bool:
    index = 0
    while index < len(arguments) and arguments[index].startswith("-"):
        option = arguments[index]
        if option == "--":
            index += 1
            break
        index += 2 if option in NPM_VALUE_OPTIONS else 1
    if index >= len(arguments) or arguments[index] not in {"run", "run-script"}:
        return False
    index += 1
    while index < len(arguments) and arguments[index].startswith("-"):
        option = arguments[index]
        if option == "--":
            index += 1
            break
        index += 2 if option in NPM_VALUE_OPTIONS else 1
    return index < len(arguments) and arguments[index] == "verify:pr"


def command_kind(command: str) -> str | None:
    """Match launch arguments or known process titles, not arbitrary substrings.

    ps supplies a displayed argument vector. Quoted paths are parsed when
    present. Python/shell commands that merely contain these words, and Node
    eval/print commands, are not treated as npm or Vitest launches.
    """
    if re.fullmatch(r"(?:node|nodejs)\s+\(vitest(?:\s+\d+)?\)", command.strip()):
        return "vitest"
    try:
        arguments = shlex.split(command)
    except ValueError:
        # ps does not promise to escape literal quotes in arguments. Do not
        # ignore a real npm/Vitest process solely because a later arg has one.
        arguments = command.split()
    if not arguments:
        return None
    executable = _name(arguments[0])
    if executable in VITEST_NAMES:
        return "vitest"
    if executable in NPM_NAMES:
        return "npmVerifyPr" if _npm_verify(arguments[1:]) else None
    if executable not in NODE_NAMES:
        return None
    index = 1
    while index < len(arguments) and arguments[index].startswith("-"):
        option = arguments[index]
        if option in {"-e", "--eval", "-p", "--print"} or option.startswith(
                ("--eval=", "--print=")):
            return None
        if option == "--":
            index += 1
            break
        index += 2 if option in NODE_VALUE_OPTIONS else 1
    if index >= len(arguments):
        return None
    entry = arguments[index].replace("\\", "/")
    basename = _name(entry)
    if basename in VITEST_NAMES or (
            "/vitest/" in entry and basename in {"cli.js", "cli.mjs"}):
        return "vitest"
    if basename in NPM_NAMES:
        return "npmVerifyPr" if _npm_verify(arguments[index + 1:]) else None
    return None


def process_counts(output: str) -> dict[str, int]:
    """Parse only ps's PID, state and displayed arguments; return no identities."""
    counts = {"npmVerifyPr": 0, "vitest": 0}
    seen: set[int] = set()
    for line in output.splitlines():
        if not line.strip():
            continue
        fields = line.strip().split(None, 2)
        if len(fields) != 3 or not fields[0].isdecimal() or not fields[1]:
            raise ValueError("invalid process inventory")
        pid = int(fields[0])
        if pid in seen:
            raise ValueError("duplicate process inventory PID")
        seen.add(pid)
        if fields[1].startswith("Z"):
            continue
        kind = command_kind(fields[2])
        if kind is not None:
            counts[kind] += 1
    if not seen:
        raise ValueError("empty process inventory")
    return counts


def sample_machine() -> dict:
    started = time.monotonic()
    errors = []
    counts = None
    try:
        scanned = subprocess.run(
            ["/bin/ps", "-ww", "-axo", "pid=,stat=,args="],
            stdin=subprocess.DEVNULL, capture_output=True, text=True,
            timeout=POLICY["processScanTimeoutSeconds"], check=False,
        )
        if scanned.returncode != 0:
            raise ValueError("process scan failed")
        counts = process_counts(scanned.stdout)
    except (OSError, ValueError, UnicodeError, subprocess.TimeoutExpired):
        errors.append("process-scan-failed")
    load1 = None
    try:
        load1 = float(os.getloadavg()[0])
        if not math.isfinite(load1) or load1 < 0:
            raise ValueError("invalid load")
    except (OSError, ValueError, TypeError, IndexError):
        errors.append("load-read-failed")
        load1 = None
    if time.monotonic() - started > POLICY["maximumSampleDurationSeconds"]:
        errors.append("sample-collection-too-slow")
    return {
        "at": datetime.now(timezone.utc).isoformat(),
        "wallSeconds": time.time(),
        "monotonicSeconds": time.monotonic(),
        "load1": load1,
        "blockingProcesses": counts,
        "errors": errors,
    }


class QuietWindow:
    """Pure window accounting; synthetic samples can exercise resets."""
    def __init__(self) -> None:
        self.previous: dict | None = None
        self.samples: list[dict] = []

    def observe(self, sample: dict) -> dict:
        reasons = list(sample["errors"])
        mono, wall = sample["monotonicSeconds"], sample["wallSeconds"]
        if not all(isinstance(value, (int, float)) and not isinstance(value, bool)
                   and math.isfinite(value) for value in [mono, wall]):
            raise ValueError("invalid gate clock")
        counts = sample["blockingProcesses"]
        if (not isinstance(counts, dict) or set(counts) != {"npmVerifyPr", "vitest"}
                or any(type(value) is not int or value < 0 for value in counts.values())):
            reasons.append("process-inventory-unavailable")
        elif any(counts.values()):
            reasons.append("blocking-process-present")
        load1 = sample["load1"]
        if (not isinstance(load1, (int, float)) or isinstance(load1, bool)
                or not math.isfinite(load1) or load1 < 0):
            reasons.append("load-unavailable")
        elif load1 >= POLICY["load1StrictlyBelow"]:
            reasons.append("load-not-below-limit")
        if self.previous is not None:
            dm = mono - self.previous["monotonicSeconds"]
            dw = wall - self.previous["wallSeconds"]
            if dm <= 0 or dw <= 0:
                reasons.append("clock-did-not-advance")
            if max(dm, dw) > POLICY["maximumSamplingGapSeconds"]:
                reasons.append("sampling-gap")
            if abs(dw - dm) > POLICY["maximumClockDriftSeconds"]:
                reasons.append("clock-drift-or-suspension")
        self.previous = dict(sample)
        if reasons:
            self.samples = []
        else:
            self.samples.append(dict(sample))
        elapsed = mono - self.samples[0]["monotonicSeconds"] if self.samples else 0
        return {
            "resetReasons": sorted(set(reasons)),
            "quietSeconds": elapsed,
            "passed": bool(self.samples) and elapsed >= POLICY["requiredQuietSeconds"],
        }

    def receipt(self) -> dict:
        if (not self.samples or self.samples[-1]["monotonicSeconds"]
                - self.samples[0]["monotonicSeconds"] < POLICY["requiredQuietSeconds"]):
            raise RuntimeError("the quiet window has not passed")
        payload = {
            "schema": "second-look-fresh-quiet-receipt/1",
            "policy": dict(POLICY),
            "startedAt": self.samples[0]["at"],
            "endedAt": self.samples[-1]["at"],
            "quietSeconds": self.samples[-1]["monotonicSeconds"] - self.samples[0]["monotonicSeconds"],
            "readings": self.samples,
        }
        encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
        return {**payload, "payloadJson": encoded.decode(),
                "receiptSha256": hashlib.sha256(encoded).hexdigest()}


def wait_quiet(log_path: str | Path) -> dict:
    """Block until the fixed gate passes, log it, and return its hashed receipt.

    The caller must start only one new observed replay immediately afterward.
    A passed gate does not reserve machine resources or prevent a later process
    from starting. A new replay requires a new call and a new five-minute window.
    """
    log_path = Path(log_path)
    if not log_path.is_absolute():
        log_path = LAB / log_path
    if not log_path.is_relative_to(PRIVATE) or log_path.suffix != ".jsonl":
        raise ValueError("quiet log must be a project-private JSONL file")
    if PRIVATE.resolve() != PRIVATE:
        raise ValueError("project-private directory is redirected")
    if log_path.parent.resolve() != log_path.parent or log_path.is_symlink():
        raise ValueError("quiet log directory must not be redirected")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    window = QuietWindow()
    with log_path.open("a", encoding="utf-8") as stream:
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another quiet gate is using this log") from error
        while True:
            sample = sample_machine()
            status = window.observe(sample)
            stream.write(json.dumps({"event": "sample", **sample, **status}, allow_nan=False) + "\n")
            stream.flush()
            if status["passed"]:
                receipt = window.receipt()
                stream.write(json.dumps({"event": "passed", "receipt": receipt}, allow_nan=False) + "\n")
                stream.flush()
                os.fsync(stream.fileno())
                return receipt
            time.sleep(POLICY["sampleIntervalSeconds"])
