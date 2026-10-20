"""Run the approved gated acquisition, then its registered reference and analysis."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from quiet import wait_quiet
from run import (
    LAB, LOG_ROOT as ORIGINAL_LOG_ROOT, Interrupted, ensure_no_existing_workers, exclusive_lock, interrupted,
    terminate_tree, write_final_metadata,
)


ROOT = LAB / "private/second-look-fresh/second-acquisition"
EXECUTION_ROOT = ROOT / "execution-root"
LOG_ROOT = ROOT / "run-log"
DRIVER = LAB / "projects/second-look-fresh/second-run.py"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def recorded_second_wrapper_active(record: dict) -> bool:
    found = subprocess.run(
        ["ps", "-p", str(record["pid"]), "-o", "pgid=,stat=,args="],
        capture_output=True, text=True, check=False,
    )
    fields = found.stdout.split(None, 2)
    return (found.returncode == 0 and len(fields) == 3
            and fields[0] == str(record["processGroup"])
            and not fields[1].startswith("Z")
            and fields[2].split()[-2:] == [str(DRIVER), "--phase2"])


def ensure_no_second_workers() -> None:
    ensure_no_existing_workers()
    for path in LOG_ROOT.glob("*-launcher.json"):
        record = json.loads(path.read_text())
        if record.get("pid") != os.getpid() and recorded_second_wrapper_active(record):
            raise RuntimeError("a second-acquisition wrapper is still active")
    processes = subprocess.check_output(["ps", "-axo", "pid=,args="], text=True)
    for line in processes.splitlines():
        fields = line.strip().split(None, 1)
        if len(fields) != 2 or int(fields[0]) == os.getpid():
            continue
        arguments = fields[1]
        if (str(LAB) + "/" in arguments
                and (str(DRIVER) in arguments
                     or ("/second-acquisition/" in arguments
                         and any(marker in arguments for marker in [
                             "probe", "reference.mjs", "analyze.mjs",
                             "stockfish", "maia",
                         ])))):
            raise RuntimeError("a second-acquisition worker may still be active")


def check_local_directories() -> None:
    if Path.cwd().resolve() != LAB:
        raise RuntimeError("run this driver from its lab root")
    if ROOT.resolve() != ROOT or LOG_ROOT.resolve() != LOG_ROOT:
        raise RuntimeError("second-acquisition logs must remain in this clone")
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    ORIGINAL_LOG_ROOT.mkdir(parents=True, exist_ok=True)


class LoggedChildren:
    """Own-session children with regular-file output and scoped cleanup."""
    def __init__(self, event_file: Path, started: float) -> None:
        self.events = event_file.open("x", encoding="utf-8")
        self.started = started
        self.active: list[tuple[subprocess.Popen, object, str, float]] = []

    def event(self, event: str, **fields) -> None:
        row = {"event": event, "at": utc_now(),
               "seconds": time.monotonic() - self.started, **fields}
        self.events.write(json.dumps(row, allow_nan=False) + "\n")
        self.events.flush()

    def start(self, stage: str, command: list[str], log: Path,
              *, cwd: Path = LAB, env: dict | None = None) -> subprocess.Popen:
        stream = log.open("xb")
        started = time.monotonic()
        try:
            child = subprocess.Popen(
                command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                stdout=stream, stderr=subprocess.STDOUT,
                start_new_session=True, close_fds=True,
            )
        except BaseException:
            stream.close()
            raise
        self.active.append((child, stream, stage, started))
        self.event("child-started", stage=stage, pid=child.pid,
                   processGroup=child.pid, log=log.name, command=command)
        return child

    def finish(self, child: subprocess.Popen) -> int:
        while child.poll() is None:
            time.sleep(.2)
        row = next(item for item in self.active if item[0] is child)
        _, stream, stage, started = row
        stream.close()
        self.active.remove(row)
        self.event("child-finished", stage=stage, pid=child.pid,
                   exitCode=child.returncode, elapsedSeconds=time.monotonic() - started)
        return child.returncode

    def close(self) -> None:
        for child, stream, stage, started in list(self.active):
            terminate_tree(child)
            stream.close()
            self.event("child-terminated", stage=stage, pid=child.pid,
                       exitCode=child.returncode, elapsedSeconds=time.monotonic() - started)
        self.active.clear()
        self.events.close()


def run_acquisition() -> int:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    started = time.monotonic()
    metadata_path = LOG_ROOT / f"{stamp}-run.json"
    project = LAB / "projects/second-look-fresh"
    sources = {name: hashlib.sha256((project / name).read_bytes()).hexdigest()
               for name in ["second-run.py", "second-launch.py", "quiet.py", "run.py"]}
    metadata = {
        "schema": "second-look-fresh-second-run/1", "status": "running",
        "startedAt": utc_now(), "sourceSha256": sources,
        "command": [".venv/bin/python", "projects/second-look-fresh/second-run.py", "--phase2"],
    }
    with metadata_path.open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")
    children = LoggedChildren(LOG_ROOT / f"{stamp}-events.jsonl", started)
    previous_handlers = {sig: signal.signal(sig, interrupted)
                         for sig in (signal.SIGINT, signal.SIGTERM)}
    sequence = 0
    exit_code = 1
    environment = dict(os.environ)
    for key in ["CHESS_DIR", "CHESS_RECORDS_DIR", "CHESS_CACHE",
                "SECOND_LOOK_ORDINAL", "SECOND_LOOK_ATTEMPT", "SECOND_LOOK_QUIET_RECEIPT"]:
        environment.pop(key, None)

    def launch(stage: str, command: list[str], *, cwd: Path = EXECUTION_ROOT,
               env: dict | None = None) -> tuple[subprocess.Popen, Path]:
        nonlocal sequence
        sequence += 1
        log = LOG_ROOT / f"{stamp}-{sequence:03d}-{stage}.log"
        child = children.start(stage, command, log, cwd=cwd,
                               env=environment if env is None else env)
        return child, log

    def helper(action: str, *arguments: str, expect_json: bool = False):
        pin = json.loads((EXECUTION_ROOT / "bridge/chess.json").read_text())
        helper_env = {**environment, "CHESS_DIR": str(EXECUTION_ROOT / ".cache/chess" / pin["commit"])}
        child, log = launch(action, ["bridge/run.sh", "projects/second-look-fresh/second-amendment.mjs",
                                    action, *arguments], env=helper_env)
        code = children.finish(child)
        if code != 0:
            raise RuntimeError(f"acquisition helper {action} stopped with exit {code}; inspect its private log")
        if expect_json:
            try:
                result = json.loads(log.read_text())
            except (ValueError, OSError) as error:
                raise RuntimeError(f"acquisition helper {action} returned no valid JSON") from error
            if not isinstance(result, dict):
                raise RuntimeError(f"acquisition helper {action} returned no object")
            return result
        return None

    try:
        child, _ = launch("frozen-runtime",
                          ["node", "projects/second-look-fresh/frozen-runtime.mjs", "prepare"], cwd=LAB)
        if children.finish(child) != 0:
            raise RuntimeError("frozen execution preparation failed")
        helper("prepare")
        attempts = ROOT / "driver-attempts"
        quiet = ROOT / "quiet"
        for path in [attempts, quiet]:
            if path.resolve() != path:
                raise RuntimeError("driver receipt directories must not be redirected")
            path.mkdir(parents=True, exist_ok=True)
        while True:
            result = helper("next", expect_json=True)
            if set(result) != {"next"}:
                raise RuntimeError("next helper returned unexpected fields")
            item = result["next"]
            if item is None:
                break
            if (not isinstance(item, dict) or set(item) != {"ordinal", "attempt"}
                    or type(item["ordinal"]) is not int or not 1 <= item["ordinal"] <= 60
                    or type(item["attempt"]) is not int or item["attempt"] not in {1, 2}):
                raise RuntimeError("next helper returned an invalid prescribed attempt")
            ordinal, attempt = item["ordinal"], item["attempt"]
            label = f"game-{ordinal:02d}-attempt-{attempt}"
            marker = attempts / f"{label}-started.json"
            receipt_path = quiet / f"{label}-receipt.json"
            if marker.exists() or receipt_path.exists():
                raise RuntimeError("this prescribed attempt already started or has a receipt; inspect before resuming")
            children.event("quiet-started", ordinal=ordinal, attempt=attempt)
            receipt = wait_quiet(quiet / f"{label}-samples.jsonl")
            with receipt_path.open("x", encoding="utf-8") as stream:
                json.dump(receipt, stream, indent=2, allow_nan=False)
                stream.write("\n")
            children.event("quiet-passed", ordinal=ordinal, attempt=attempt,
                           receiptSha256=receipt["receiptSha256"],
                           quietSeconds=receipt["quietSeconds"])
            # Exclusive start marker precedes Popen. A crash around launch
            # cannot silently turn an unfinished attempt into a fresh search.
            start_record = {
                "schema": "second-look-fresh-replay-start/1",
                "ordinal": ordinal, "attempt": attempt, "startedAt": utc_now(),
                "quietReceiptSha256": receipt["receiptSha256"],
                "runMetadata": metadata_path.name,
            }
            with marker.open("x", encoding="utf-8") as stream:
                json.dump(start_record, stream, indent=2)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            if time.monotonic() - receipt["readings"][-1]["monotonicSeconds"] > 5:
                raise RuntimeError("the quiet receipt became stale before replay launch; inspect before resuming")
            probe_env = {
                **environment,
                "CHESS_DIR": str(EXECUTION_ROOT / ".cache/chess/candidates/second-look-fresh"),
                "SECOND_LOOK_ORDINAL": str(ordinal), "SECOND_LOOK_ATTEMPT": str(attempt),
                "SECOND_LOOK_QUIET_RECEIPT": str(receipt_path),
            }
            child, _ = launch(label, [
                "nice", "-n", "10", "bridge/run.sh",
                "projects/second-look-fresh/second-probe.mjs",
                "--all", "--phase2", "--variant", "candidate", "--profile", "routine",
            ], env=probe_env)
            probe_exit = children.finish(child)
            # A rejected produced output can exit nonzero. The frozen helper
            # must find its journal and classify it; absence is a hard stop.
            classified = helper("classify", "--ordinal", str(ordinal), "--attempt", str(attempt),
                                expect_json=True)
            if classified.get("outcome") not in {"accepted", "infrastructure-failure"}:
                raise RuntimeError("classifier returned an unexpected outcome")
            children.event("replay-classified", ordinal=ordinal, attempt=attempt,
                           probeExitCode=probe_exit, outcome=classified["outcome"])
            completed = {**start_record, "finishedAt": utc_now(),
                         "probeExitCode": probe_exit, "classification": classified}
            with (attempts / f"{label}-finished.json").open("x", encoding="utf-8") as stream:
                json.dump(completed, stream, indent=2)
                stream.write("\n")
        helper("check-complete")
        references = [
            launch(f"reference-{shard}", ["nice", "-n", "10", "bridge/run.sh",
                   "projects/second-look-fresh/reference.mjs", "--phase2", "--shard", f"{shard}/2"])[0]
            for shard in [0, 1]
        ]
        reference_codes = [children.finish(child) for child in references]
        if any(code != 0 for code in reference_codes):
            raise RuntimeError("a registered reference shard failed; analysis did not start")
        helper("check-complete")
        child, _ = launch("analysis", ["nice", "-n", "10", "bridge/run.sh",
                                     "projects/second-look-fresh/analyze.mjs", "--phase2"])
        exit_code = children.finish(child)
    except Interrupted as error:
        exit_code = 128 + error.signum
        children.event("wrapper-interrupted", signal=error.signum)
    except Exception as error:
        children.event("wrapper-stopped", errorType=type(error).__name__, reason=str(error))
        print(f"Second acquisition stopped: {error}", flush=True)
    finally:
        for sig in previous_handlers:
            signal.signal(sig, signal.SIG_IGN)
        try:
            children.close()
        finally:
            metadata.update(status="finished", endedAt=utc_now(),
                            seconds=time.monotonic() - started, exitCode=exit_code)
            write_final_metadata(metadata_path, metadata)
            for sig, handler in previous_handlers.items():
                signal.signal(sig, handler)
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.parse_args()
    try:
        check_local_directories()
        with exclusive_lock(ORIGINAL_LOG_ROOT / ".run.lock"):
            with exclusive_lock(LOG_ROOT / ".run.lock"):
                ensure_no_second_workers()
                return run_acquisition()
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    sys.exit(main())
