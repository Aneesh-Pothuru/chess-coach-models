#!/usr/bin/env python3
"""Run reviewed checks and scores in detached sessions outside the UTC blackout."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
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

from freeze import LAB, PROJECT, MANIFEST, MONTHS, verify_manifest

DIRECTORY = LAB / "private/rules-after-check/full"
STOP = threading.Event()
CHILDREN = {}
RUN_LOCK_FD = None
SIGNAL_RECEIVED = False
CUTOFF_SECONDS = 13 * 3600 - 10
RESUME_SECONDS = 15 * 3600 + 30 * 60
SCHEDULED_EXIT = 75


def utc_now():
    return datetime.now(timezone.utc)


def blocked_at(at):
    require_aware(at)
    value = at.astimezone(timezone.utc)
    seconds = value.hour * 3600 + value.minute * 60 + value.second + value.microsecond / 1_000_000
    return CUTOFF_SECONDS <= seconds < RESUME_SECONDS


def require_aware(at):
    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError("the blackout requires an aware UTC clock")


def resume_at(at):
    require_aware(at)
    value = at.astimezone(timezone.utc)
    return value.replace(hour=15, minute=30, second=0, microsecond=0)


def atomic_json(path, data):
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(data, indent=2) + "\n")
    temporary.replace(path)


def event(data):
    data = {"at": utc_now().isoformat(), **data}
    with (DIRECTORY / "stage-events.jsonl").open("a") as stream:
        stream.write(json.dumps(data, separators=(",", ":")) + "\n")
    print(json.dumps(data), flush=True)


def signal_stop(signum, _frame):
    global SIGNAL_RECEIVED
    SIGNAL_RECEIVED = SIGNAL_RECEIVED or signum is not None
    STOP.set()
    for process in list(CHILDREN.values()):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def stop_group(pgid, grace=3):
    """Terminate the entire owned stage, including engines behind wrappers."""
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
    # Poll UTC too: the Python monotonic clock can omit machine suspension.
    deadline = time.monotonic() + grace
    wall_deadline = utc_now() + timedelta(seconds=grace)
    while time.monotonic() < deadline and utc_now() < wall_deadline:
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            return
        time.sleep(0.05)
    try:
        os.killpg(pgid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def await_open_window():
    waiting = False
    while blocked_at(utc_now()):
        if not waiting:
            event({"event": "blackout-wait", "resumeAt": resume_at(utc_now()).isoformat()})
            waiting = True
        if STOP.wait(timeout=0.5):
            raise InterruptedError("driver received a stop signal")
    if waiting:
        event({"event": "blackout-ended"})
    if STOP.is_set():
        raise InterruptedError("driver received a stop signal")


def file_hash(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def require_no_orphans():
    """Refuse overlap; never kill a process merely because its PID is saved."""
    marker = DIRECTORY / "active-stage.json"
    if marker.is_file():
        saved = json.loads(marker.read_text())
        pgid = saved.get("pgid")
        if type(pgid) is not int or pgid <= 1:
            raise ValueError("saved stage process group is invalid")
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            pass
        else:
            raise RuntimeError("a previous stage process group is still alive; inspect it before resuming")
    # A coordinator can die after creating children but before its marker is
    # written. Match only this project's stage entry paths, not other studies
    # that use the same app engine. Refusal keeps ownership review explicit.
    entries = [str(PROJECT / name) for name in ("board.mjs", "score.mjs", "analyze.py", "examples.mjs")]
    rows = subprocess.check_output(["ps", "-axo", "pid=,command="], text=True).splitlines()
    for row in rows:
        fields = row.strip().split(None, 1)
        if len(fields) == 2 and int(fields[0]) != os.getpid() and any(entry in fields[1].split() for entry in entries):
            raise RuntimeError("a project stage process is still alive; inspect it before resuming")


def checked_hash(month):
    values = [json.loads((DIRECTORY / f"checked-{month}-{shard}-of-2.json").read_text())["outputSha256"]
              for shard in range(2)]
    return hashlib.sha256("\n".join(values).encode()).hexdigest()


def stage_complete(stage, month, frozen):
    if stage not in ("checked", "scored"):
        return False
    paths = [DIRECTORY / f"{stage}-{month}-{shard}-of-2.json" for shard in range(2)]
    if not all(path.is_file() for path in paths):
        return False
    source = "board.mjs" if stage == "checked" else "score.mjs"
    for shard, path in enumerate(paths):
        meta = json.loads(path.read_text())
        if not meta.get("complete"):
            return False
        expected = {"schema": 1, "datasetKind": "rules-after-check", "stage": stage,
                    "status": "complete", "run": "full", "month": month, "shard": shard, "shards": 2,
                    "boardApp": frozen["boardApp"], "refereeApp": frozen["refereeApp"], "records": frozen["records"],
                    "contentManifestSha256": file_hash(MANIFEST), "sourceInputsSha256": frozen["inputs"]["sha256"],
                    "sourceSha256": frozen["files"][source]}
        if any(meta.get(key) != value for key, value in expected.items()):
            raise ValueError("completed stage has incompatible frozen provenance")
        if (type(meta.get("expectedRows")) is not int or meta["expectedRows"] < 0
                or meta.get("rows") != meta["expectedRows"] or not isinstance(meta.get("keysSha256"), str)):
            raise ValueError("completed stage has incompatible coverage")
        if stage == "scored":
            board = json.loads((DIRECTORY / f"checked-{month}-{shard}-of-2.json").read_text())
            if meta.get("boardInputSha256") != checked_hash(month) or meta["keysSha256"] != board["keysSha256"]:
                raise ValueError("completed scoring does not match its board pass")
        if not path.with_suffix(".jsonl").is_file() or file_hash(path.with_suffix(".jsonl")) != meta.get("outputSha256"):
            raise ValueError("completed stage journal content changed")
    return True


def run_stage(stage, month=None):
    while True:
        await_open_window()
        frozen = verify_manifest(verify_inputs=False)
        if stage_complete(stage, month, frozen):
            event({"stage": stage, "month": month, "event": "already-complete"})
            return
        scripts = {"checked": "board.mjs", "scored": "score.mjs", "analysis": "analyze.py", "examples": "examples.mjs"}
        script = PROJECT / scripts[stage]
        executable = LAB / ("bridge/run.sh" if script.suffix == ".mjs" else ".venv/bin/python")
        # The coordinators do no heavy work. Each applies nice 10 once to
        # its two workers. The later single-process stages receive it here.
        prefix = [] if stage in ("checked", "scored") else ["nice", "-n", "10"]
        command = [*prefix, str(executable), str(script), "--reviewed"]
        if stage in ("checked", "scored"):
            command += ["--month", month, "--pool", "2"]
        app = frozen["boardApp"] if stage == "checked" else frozen["refereeApp"]
        env = dict(os.environ, CHESS_DIR=str(LAB / ".cache/chess" / app),
                   CHESS_RECORDS_DIR=str(LAB / ".cache/chess" / frozen["records"]))
        # Hashing or validation could have crossed the cutoff.
        if blocked_at(utc_now()):
            continue
        attempt = str(uuid.uuid4())
        log = DIRECTORY / "logs" / f"{stage}-{month or 'all'}-{attempt}.log"
        start = time.monotonic()
        event({"stage": stage, "month": month, "event": "started", "attempt": attempt})
        scheduled = False
        with log.open("ab") as out:
            process = subprocess.Popen(command, cwd=LAB, env=env, stdin=subprocess.DEVNULL,
                stdout=out, stderr=subprocess.STDOUT, start_new_session=True,
                pass_fds=() if RUN_LOCK_FD is None else (RUN_LOCK_FD,))
            CHILDREN[process.pid] = process
            atomic_json(DIRECTORY / "active-stage.json", {"pgid": process.pid, "driverPid": os.getpid(),
                "stage": stage, "month": month, "attempt": attempt, "startedAt": utc_now().isoformat()})
            try:
                while True:
                    if STOP.is_set():
                        stop_group(process.pid)
                    elif blocked_at(utc_now()):
                        if not scheduled:
                            event({"stage": stage, "month": month, "event": "blackout-stop-requested", "attempt": attempt})
                        scheduled = True
                        stop_group(process.pid)
                    try:
                        code = process.wait(timeout=0.5)
                        break
                    except subprocess.TimeoutExpired:
                        continue
                if code:
                    stop_group(process.pid)
                # Even after a successful wrapper exits, no descendants may
                # carry on into the next stage or the blackout.
                else:
                    stop_group(process.pid, grace=0)
                scheduled = scheduled or code == SCHEDULED_EXIT
            except BaseException:
                stop_group(process.pid)
                process.wait()
                raise
            finally:
                CHILDREN.pop(process.pid, None)
                (DIRECTORY / "active-stage.json").unlink(missing_ok=True)
        reason = "signal" if SIGNAL_RECEIVED else "scheduled-blackout" if scheduled else "stage-failure"
        terminal = "completed" if code == 0 else "paused" if scheduled and not STOP.is_set() else "stopped"
        event({"stage": stage, "month": month, "attempt": attempt, "event": terminal,
               "seconds": time.monotonic() - start, "exitCode": code,
               **({"stopReason": reason} if code else {})})
        if STOP.is_set():
            raise InterruptedError("driver received a stop signal")
        if code == 0:
            return
        if scheduled:
            # A scheduled stop preserves completed rows and deliberately
            # resumes this same stage, never skipping its pending work.
            continue
        raise RuntimeError("stage stopped; inspect its private log before resuming")


def run_pipeline():
    for stage in ("checked", "scored"):
        for month in MONTHS:
            run_stage(stage, month)
    run_stage("analysis")
    run_stage("examples")


def launch_detached():
    stamp = utc_now().strftime("%Y%m%dT%H%M%SZ")
    log = DIRECTORY / "logs" / f"driver-{stamp}-{uuid.uuid4()}.log"
    with log.open("ab") as out:
        process = subprocess.Popen([str(LAB / ".venv/bin/python"), str(PROJECT / "run.py"), "--reviewed"],
            cwd=LAB, stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True)
    for _ in range(600):
        path = DIRECTORY / "driver.json"
        if path.is_file():
            status = json.loads(path.read_text())
            if status.get("pid") == process.pid:
                print(json.dumps({**status, "log": str(log.relative_to(LAB))}))
                return
        if process.poll() is not None:
            raise RuntimeError("detached driver exited before readiness; inspect its private log")
        time.sleep(0.05)
    raise RuntimeError("driver readiness is unknown; inspect logs before another launch")


def main(argv=None):
    global RUN_LOCK_FD
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    parser.add_argument("--detach", action="store_true")
    args = parser.parse_args(argv)
    # This check precedes all reads of this run's private state. Phase one
    # writes hashes and runs synthetic tests; it never invokes this gate.
    if not args.reviewed:
        parser.error("--reviewed is required after phase-one review authorizes reading positions")
    if os.getpriority(os.PRIO_PROCESS, 0) != 0:
        parser.error("launch the driver at nice 0; heavy workers receive nice 10 once")
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
        require_no_orphans()
        status = {"pid": os.getpid(), "startedAt": utc_now().isoformat(), "status": "running",
                  "datasetKind": "rules-after-check", "apps": frozen["apps"], "contentManifestSha256": file_hash(MANIFEST)}
        atomic_json(DIRECTORY / "driver.json", status)
        try:
            run_pipeline()
        except BaseException:
            signal_stop(None, None)
            atomic_json(DIRECTORY / "driver.json", {**status, "status": "stopped", "finishedAt": utc_now().isoformat(),
                "stopReason": "signal" if SIGNAL_RECEIVED else "stage-failure"})
            raise
        atomic_json(DIRECTORY / "driver.json", {**status, "status": "complete", "finishedAt": utc_now().isoformat()})
        print("Reviewed checks, scores, analysis and examples complete. The paper awaits review.", flush=True)


if __name__ == "__main__":
    main()
