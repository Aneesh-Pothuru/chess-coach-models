#!/usr/bin/env python3
"""Run the fixed null addition with two workers and detached private logs."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid

from freeze_null import LAB, PROJECT, MANIFEST, MONTHS, verify_manifest

DIRECTORY = LAB / "private/rules-of-thumb/null"
STOP = threading.Event()
CHILDREN = {}
RUN_LOCK_FD = None
SIGNAL_RECEIVED = False


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def signal_stop(signum, _frame):
    global SIGNAL_RECEIVED
    SIGNAL_RECEIVED = SIGNAL_RECEIVED or signum is not None
    STOP.set()
    for process in list(CHILDREN.values()):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def stop_group(pgid):
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    until = time.monotonic() + 3
    while time.monotonic() < until:
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def event(data):
    data = {"at": datetime.now(timezone.utc).isoformat(), **data}
    with (DIRECTORY / "stage-events.jsonl").open("a") as out:
        out.write(json.dumps(data, separators=(",", ":")) + "\n")
    print(json.dumps(data), flush=True)


def score_complete(month, frozen):
    paths = [DIRECTORY / f"scored-{month}-{shard}-of-2.json" for shard in range(2)]
    if not all(path.exists() for path in paths):
        return False
    addition_hash = hashlib.sha256(MANIFEST.read_bytes()).hexdigest()
    for shard, path in enumerate(paths):
        meta = json.loads(path.read_text())
        if not meta.get("complete"):
            return False
        if (meta.get("datasetKind") != "null-addition" or meta.get("app") != frozen["app"]
                or meta.get("month") != month or meta.get("shard") != shard or meta.get("shards") != 2
                or meta.get("status") != "complete" or meta.get("scorerVersion") != frozen["newFiles"]["null-score.mjs"]
                or meta.get("additionManifestSha256") != addition_hash
                or type(meta.get("expectedRows")) is not int or meta["expectedRows"] < 0
                or meta.get("rows") != meta.get("expectedRows")):
            raise ValueError("completed null score shard has incompatible provenance or coverage")
        if not path.with_suffix(".jsonl").is_file():
            raise ValueError("completed null score journal is absent")
        with path.with_suffix(".jsonl").open("rb") as journal:
            if hashlib.file_digest(journal, "sha256").hexdigest() != meta.get("outputSha256"):
                raise ValueError("completed null score journal content changed")
    return True


def run_stage(stage, month=None):
    if STOP.is_set():
        raise InterruptedError("null driver received a stop signal")
    frozen = verify_manifest(verify_inputs=False)
    if stage == "score" and score_complete(month, frozen):
        event({"stage": stage, "month": month, "event": "already-complete"})
        return
    script = PROJECT / {"score": "null-score.mjs", "analysis": "analyze_null.py", "examples": "examples-null.mjs"}[stage]
    executable = LAB / ("bridge/run.sh" if script.suffix == ".mjs" else ".venv/bin/python")
    # nice is an adjustment: keep the score coordinator at the driver's
    # normal priority, and let it apply nice 10 exactly once to each worker.
    prefix = [] if stage == "score" else ["nice", "-n", "10"]
    command = [*prefix, str(executable), str(script), "--reviewed"]
    if stage == "score":
        command += ["--month", month, "--pool", "2"]
    # The lab's current pin may have moved. Every bridge job must use the
    # completed experiment's original cached app, without fetching it.
    env = dict(os.environ, CHESS_DIR=str(LAB / ".cache/chess" / frozen["app"]),
               CHESS_RECORDS_DIR=str(LAB / ".cache/chess" / frozen["records"]))
    attempt = str(uuid.uuid4())
    log = DIRECTORY / "logs" / f"{stage}-{month or 'all'}-{attempt}.log"
    start = time.monotonic()
    event({"stage": stage, "month": month, "event": "started", "attempt": attempt})
    with log.open("ab") as out:
        process = subprocess.Popen(command, cwd=LAB, env=env, stdin=subprocess.DEVNULL,
            stdout=out, stderr=subprocess.STDOUT, start_new_session=True,
            pass_fds=() if RUN_LOCK_FD is None else (RUN_LOCK_FD,))
        CHILDREN[process.pid] = process
        if STOP.is_set():
            os.killpg(process.pid, signal.SIGTERM)
        try:
            while True:
                try:
                    code = process.wait(timeout=0.5)
                    break
                except subprocess.TimeoutExpired:
                    if STOP.is_set():
                        stop_group(process.pid)
            if code:
                stop_group(process.pid)
        except BaseException:
            stop_group(process.pid)
            process.wait()
            raise
        finally:
            CHILDREN.pop(process.pid, None)
    event({"stage": stage, "month": month, "attempt": attempt,
           "event": "stopped" if code else "completed", "seconds": time.monotonic() - start,
           "exitCode": code, **({"stopReason": "signal" if SIGNAL_RECEIVED else "stage-failure"} if code else {})})
    if code:
        if STOP.is_set():
            raise InterruptedError("null driver received a stop signal")
        raise RuntimeError("null stage stopped; inspect private logs before resuming")


def run_pipeline():
    for month in MONTHS:
        run_stage("score", month)
    run_stage("analysis")
    run_stage("examples")


def launch_detached():
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log = DIRECTORY / "logs" / f"driver-{stamp}-{uuid.uuid4()}.log"
    with log.open("ab") as out:
        process = subprocess.Popen([str(LAB / ".venv/bin/python"),
            str(PROJECT / "run_null.py"), "--reviewed"], cwd=LAB, stdin=subprocess.DEVNULL,
            stdout=out, stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)
    for _ in range(600):
        path = DIRECTORY / "driver.json"
        if path.exists():
            status = json.loads(path.read_text())
            if status.get("pid") == process.pid:
                print(json.dumps({**status, "log": str(log.relative_to(LAB))}))
                return
        if process.poll() is not None:
            raise RuntimeError("detached null driver exited before readiness; inspect its private log")
        time.sleep(0.05)
    raise RuntimeError("null driver readiness not confirmed; inspect private logs before another launch")


def main(argv=None):
    global RUN_LOCK_FD
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    parser.add_argument("--detach", action="store_true")
    args = parser.parse_args(argv)
    if not args.reviewed:
        parser.error("--reviewed is required after the addition and its content manifest are committed")
    if os.getpriority(os.PRIO_PROCESS, 0) != 0:
        parser.error("launch the null driver at normal priority; its score workers receive nice 10 once")
    frozen = verify_manifest()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    (DIRECTORY / "logs").mkdir(exist_ok=True)
    if args.detach:
        launch_detached()
        return
    signal.signal(signal.SIGTERM, signal_stop)
    signal.signal(signal.SIGINT, signal_stop)
    with (DIRECTORY / "run.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        RUN_LOCK_FD = lock.fileno()
        status = {"pid": os.getpid(), "startedAt": datetime.now(timezone.utc).isoformat(),
                  "status": "running", "datasetKind": "null", "app": frozen["app"],
                  "additionManifestSha256": hashlib.sha256(MANIFEST.read_bytes()).hexdigest()}
        atomic_json(DIRECTORY / "driver.json", status)
        try:
            run_pipeline()
        except BaseException:
            signal_stop(None, None)
            atomic_json(DIRECTORY / "driver.json", {**status, "status": "stopped",
                "finishedAt": datetime.now(timezone.utc).isoformat(),
                "stopReason": "signal" if SIGNAL_RECEIVED else "stage-failure"})
            raise
        atomic_json(DIRECTORY / "driver.json", {**status, "status": "complete",
            "finishedAt": datetime.now(timezone.utc).isoformat()})
        print("Null addition and stored-evidence examples complete. The original verdicts and paper remain unchanged.", flush=True)


if __name__ == "__main__":
    main()
