#!/usr/bin/env python3
"""Detached, resumable two-worker stages, awake and outside the UTC pause.

The timing route can scan/select July and write timings only. Full scoring
requires --reviewed and the committed freeze. Neither route fetches an app,
installs a package or downloads a model.
The full long run requires AC power and an open lid. The bounded July timing
slice also requires an open lid, but may run on battery; it records that
source and keeps caffeinate's idle-sleep assertion active. A requested
system-sleep assertion is not evidence that it is effective on battery.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import threading
import time
import uuid

from freeze import APP, LAB, PROJECT, MANIFEST, MONTHS, atomic_json, digest, read_json, require, verify_manifest

PRIVATE = LAB / "private/tiebreak-rules"
DIRECTORY = PRIVATE / "full"
STOP = threading.Event()
POWER_DONE = threading.Event()
CHILDREN = {}
STOP_REASON = None
LOCK_FD = None
TIMING = False
LIMIT = None
POWER_DIRECTORY = None
ASSERTION_PID = None
CUTOFF_SECONDS = 13 * 3600 - 10
RESUME_SECONDS = 15 * 3600 + 30 * 60
SCHEDULED_EXIT = 75


def utc_now():
    return datetime.now(timezone.utc)


def blocked_at(at):
    require(at.tzinfo is not None, "blackout clock must have a timezone")
    at = at.astimezone(timezone.utc)
    seconds = at.hour * 3600 + at.minute * 60 + at.second + at.microsecond / 1_000_000
    return CUTOFF_SECONDS <= seconds < RESUME_SECONDS


def resume_at(at):
    require(at.tzinfo is not None, "blackout clock must have a timezone")
    return at.astimezone(timezone.utc).replace(hour=15, minute=30, second=0, microsecond=0)


def event(data):
    item = {"at": utc_now().isoformat(), **data}
    with (DIRECTORY / "stage-events.jsonl").open("a") as stream:
        stream.write(json.dumps(item, separators=(",", ":")) + "\n")
    print(json.dumps(item), flush=True)


def request_stop(reason):
    global STOP_REASON
    STOP_REASON = STOP_REASON or reason
    STOP.set()
    for process in list(CHILDREN.values()):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def signal_stop(signum, _frame):
    request_stop("signal")


def stop_group(pgid, grace=3):
    try:
        os.killpg(pgid, signal.SIGTERM)
    except ProcessLookupError:
        return
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
        if STOP.wait(0.5):
            raise InterruptedError("driver stopped while waiting")
    if waiting:
        event({"event": "blackout-ended"})
    require(not STOP.is_set(), "driver has a stop request")


def power_reading():
    battery = subprocess.check_output(["/usr/bin/pmset", "-g", "batt"], text=True, timeout=5)
    raw_lid = subprocess.check_output(["/usr/sbin/ioreg", "-r", "-k", "AppleClamshellState", "-d", "4"], text=True, timeout=5)
    lid = "\n".join(line for line in raw_lid.splitlines() if '"AppleClamshellState"' in line)
    source = re.search(r"Now drawing from '(AC Power|Battery Power)'", battery)
    state = re.search(r'"AppleClamshellState"\s*=\s*(Yes|No)', lid)
    require(source is not None and state is not None, "power source or lid state is unreadable")
    return {"at": utc_now().isoformat(), "battery": battery, "lid": lid,
            "onAC": source is not None and source[1] == "AC Power",
            "lidOpen": state is not None and state[1] == "No"}


def record_power(reading):
    if POWER_DIRECTORY is not None:
        with (POWER_DIRECTORY / "snapshots.jsonl").open("a") as stream:
            stream.write(json.dumps(reading, separators=(",", ":")) + "\n")


def safe_power(reading, timing):
    return reading["lidOpen"] and (reading["onAC"] or timing)


def require_safe_power():
    reading = power_reading()
    record_power(reading)
    require(safe_power(reading, TIMING), "an open lid is required; AC power is also required for the full run; no stage started")
    return reading


def caffeinate_child(rows, driver_pid):
    """macOS caffeinate execs the command and leaves its assertion as a child."""
    candidates = []
    for line in rows.splitlines():
        fields = line.strip().split(None, 2)
        if len(fields) != 3 or not fields[0].isdigit() or not fields[1].isdigit():
            continue
        command = fields[2].split()
        if (int(fields[1]) == driver_pid and command and Path(command[0]).name == "caffeinate"
                and "-s" in command and "-i" in command and str(PROJECT / "run.py") in command):
            candidates.append(int(fields[0]))
    require(len(candidates) == 1, "exactly one owned caffeinate assertion child is required")
    return candidates[0]


def require_caffeinate_child():
    rows = subprocess.check_output(["ps", "-axo", "pid=,ppid=,command="], text=True)
    return caffeinate_child(rows, os.getpid())


def assertion_alive():
    if ASSERTION_PID is None:
        return False
    try:
        return require_caffeinate_child() == ASSERTION_PID
    except (ValueError, OSError, subprocess.SubprocessError):
        return False


def monitor_power():
    while not POWER_DONE.wait(30):
        try:
            reading = power_reading()
            record_power(reading)
            safe = safe_power(reading, TIMING)
        except (ValueError, OSError, subprocess.SubprocessError):
            safe = False
        if not safe:
            event({"event": "power-stop-requested", "reason": "required power/lid state unavailable"})
            request_stop("power-unsafe")
            return
        if not assertion_alive():
            event({"event": "awake-stop-requested", "reason": "owned assertion process is absent"})
            request_stop("awake-assertion-missing")
            return


def require_no_orphans():
    marker = PRIVATE / "active-stage.json"
    if marker.exists():
        pgid = read_json(marker).get("pgid")
        require(type(pgid) is int and pgid > 1, "invalid saved stage process group")
        try:
            os.killpg(pgid, 0)
        except ProcessLookupError:
            pass
        else:
            raise RuntimeError("a previous stage group is alive; inspect it before resuming")
    names = [str(PROJECT / name) for name in ("scan.mjs", "select.mjs", "score.mjs", "analyze.py", "examples.mjs")]
    for line in subprocess.check_output(["ps", "-axo", "pid=,command="], text=True).splitlines():
        fields = line.strip().split(None, 1)
        if len(fields) == 2 and int(fields[0]) != os.getpid() and any(name in fields[1].split() for name in names):
            raise RuntimeError("a project stage process is alive; inspect it before resuming")


def stage_complete(stage, month, frozen):
    # Coordinators also verify their resume prefixes. Skipping here requires
    # completed metadata and the exact journal bytes, without parsing rows.
    if stage not in ("scan", "select", "score"):
        return False
    prefix = {"scan": "scan", "select": "positions", "score": "scored"}[stage]
    paths = ([DIRECTORY / f"{prefix}-{month}-{shard}-of-2.json" for shard in range(2)]
             if stage != "select" else [DIRECTORY / f"{prefix}-{month}.json"])
    if not all(path.exists() for path in paths):
        return False
    for shard, path in enumerate(paths):
        meta = read_json(path)
        if meta.get("complete") is not True:
            return False
        expected = {"schema": 1, "datasetKind": "tiebreak-rules", "app": APP, "month": month, "status": "complete",
                    "stage": prefix, "timing": TIMING, "limit": LIMIT,
                    "contentManifestSha256": digest(MANIFEST), "sourceInputsSha256": frozen["inputs"]["sha256"],
                    "sourceSha256": frozen["files"][f"{stage}.mjs"], "run": DIRECTORY.name}
        require(all(meta.get(k) == v for k, v in expected.items()), "completed stage provenance differs")
        require(type(meta.get("rows")) is int and meta["rows"] >= 0 and meta["rows"] == meta.get("expectedRows"),
                "completed stage coverage differs")
        if stage != "select":
            require(meta.get("shard") == shard and meta.get("shards") == 2
                    and isinstance(meta.get("keysSha256"), str) and re.fullmatch(r"[0-9a-f]{64}", meta["keysSha256"]),
                    "completed shard identity differs")
        if stage == "scan":
            games = read_json(PROJECT / frozen["inputs"]["path"])["months"][month]
            count = LIMIT if TIMING else games["games"]
            require(meta["rows"] == (count + 1 - shard) // 2 and meta.get("inputSha256") == games["outputSha256"],
                    "completed scan input or count differs")
        elif stage == "select":
            source = [read_json(DIRECTORY / f"scan-{month}-{s}-of-2.json")["outputSha256"] for s in range(2)]
            import hashlib
            require(meta.get("inputSha256") == hashlib.sha256("\n".join(source).encode()).hexdigest(),
                    "completed selection source differs")
        else:
            selection = read_json(DIRECTORY / f"positions-{month}.json")
            require(meta["rows"] == (selection["rows"] + 1 - shard) // 2
                    and meta.get("inputSha256") == selection["outputSha256"], "completed score source differs")
        require(digest(path.with_suffix(".jsonl")) == meta.get("outputSha256"), "completed journal bytes changed")
    return True


def stage_command(stage, month):
    script = {"scan": "scan.mjs", "select": "select.mjs", "score": "score.mjs",
              "analysis": "analyze.py", "examples": "examples.mjs", "timing": "timing.py"}[stage]
    executable = LAB / ("bridge/run.sh" if script.endswith(".mjs") else ".venv/bin/python")
    command = ([] if stage in ("scan", "score") else ["nice", "-n", "10"]) + [str(executable), str(PROJECT / script)]
    if TIMING:
        require(stage in ("scan", "select", "timing") and month in (None, "2026-07"), "timing route cannot score or read another month")
        command += ["--timing", "--limit", str(LIMIT)]
    else:
        command += ["--reviewed"]
    if month:
        command += ["--month", month]
    if stage in ("scan", "score"):
        command += ["--pool", "2"]
    return command


def run_stage(stage, month=None):
    while True:
        await_open_window()
        frozen = verify_manifest(require_committed=not TIMING, verify_inputs=False)
        if stage_complete(stage, month, frozen):
            event({"event": "already-complete", "stage": stage, "month": month})
            return
        require_safe_power()
        require(not STOP.is_set(), "driver has a stop request")
        if blocked_at(utc_now()):
            continue
        attempt = str(uuid.uuid4())
        log = DIRECTORY / "logs" / f"{stage}-{month or 'all'}-{attempt}.log"
        started = time.monotonic()
        event({"event": "started", "stage": stage, "month": month, "attempt": attempt})
        scheduled = False
        with log.open("ab") as output:
            process = subprocess.Popen(stage_command(stage, month), cwd=LAB,
                env=dict(os.environ, CHESS_DIR=str(LAB / ".cache/chess" / APP)),
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                start_new_session=True, pass_fds=() if LOCK_FD is None else (LOCK_FD,))
            CHILDREN[process.pid] = process
            atomic_json(PRIVATE / "active-stage.json", {"pgid": process.pid, "driverPid": os.getpid(),
                "run": DIRECTORY.name, "stage": stage, "month": month, "attempt": attempt, "startedAt": utc_now().isoformat()})
            try:
                while True:
                    if STOP.is_set():
                        stop_group(process.pid)
                    elif blocked_at(utc_now()):
                        if not scheduled:
                            event({"event": "blackout-stop-requested", "stage": stage, "month": month, "attempt": attempt})
                        scheduled = True
                        stop_group(process.pid)
                    try:
                        code = process.wait(timeout=0.5)
                        break
                    except subprocess.TimeoutExpired:
                        continue
                stop_group(process.pid, grace=0 if code == 0 else 3)
                scheduled = scheduled or code == SCHEDULED_EXIT
            except BaseException:
                stop_group(process.pid); process.wait()
                raise
            finally:
                CHILDREN.pop(process.pid, None)
                (PRIVATE / "active-stage.json").unlink(missing_ok=True)
        terminal = "completed" if code == 0 else "paused" if scheduled and not STOP.is_set() else "stopped"
        reason = STOP_REASON or ("scheduled-blackout" if scheduled else "stage-failure")
        event({"event": terminal, "stage": stage, "month": month, "attempt": attempt,
               "seconds": time.monotonic() - started, "exitCode": code,
               **({"stopReason": reason} if code else {})})
        require(not STOP.is_set(), "driver received a stop request")
        if code == 0:
            return
        if not scheduled:
            raise RuntimeError("stage stopped; review its private log before resuming")


def run_pipeline():
    if TIMING:
        run_stage("scan", "2026-07")
        run_stage("select", "2026-07")
        run_stage("timing")
        return
    for month in MONTHS:
        run_stage("scan", month)
        run_stage("select", month)
    for month in MONTHS:
        run_stage("score", month)
    run_stage("analysis")
    run_stage("examples")


def launch_detached():
    token = str(uuid.uuid4())
    log = DIRECTORY / "logs" / f"driver-{token}.log"
    args = ["--driver", "--launch-token", token]
    args += ["--timing", "--limit", str(LIMIT)] if TIMING else ["--reviewed"]
    with log.open("ab") as output:
        wrapper = subprocess.Popen(["/usr/bin/caffeinate", "-s", "-i", str(LAB / ".venv/bin/python"), "-B",
                                    str(PROJECT / "run.py"), *args], cwd=LAB,
                                   stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
                                   start_new_session=True, close_fds=True)
    for _ in range(600):
        path = DIRECTORY / "driver.json"
        if path.exists():
            state = read_json(path)
            if state.get("launchToken") == token:
                print(json.dumps({"pid": state["pid"], "assertionPid": state["assertionPid"],
                                  "status": state["status"], "log": str(log.relative_to(LAB))}))
                return
        if wrapper.poll() is not None:
            raise RuntimeError("detached driver exited before readiness; inspect its private log")
        time.sleep(0.05)
    raise RuntimeError("driver readiness unknown; inspect its log before another launch")


def main(argv=None):
    global DIRECTORY, TIMING, LIMIT, LOCK_FD, POWER_DIRECTORY, ASSERTION_PID
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reviewed", action="store_true")
    parser.add_argument("--timing", action="store_true")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--detach", action="store_true")
    parser.add_argument("--driver", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--launch-token", help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    if args.timing:
        if args.reviewed or args.limit is None or not 1 <= args.limit <= 600:
            parser.error("timing requires --limit 1..600 and cannot enable --reviewed")
    elif not args.reviewed or args.limit is not None:
        parser.error("full scoring requires --reviewed and no timing limit")
    if os.getpriority(os.PRIO_PROCESS, 0) != 0:
        parser.error("launch at nice 0; heavy workers receive nice 10 once")
    TIMING, LIMIT = args.timing, args.limit
    DIRECTORY = PRIVATE / (f"timing-july-{LIMIT}" if TIMING else "full")
    frozen = verify_manifest(require_committed=not TIMING)
    require_safe_power()
    (DIRECTORY / "logs").mkdir(parents=True, exist_ok=True)
    if not args.driver:
        launch_detached()
        return
    require(args.launch_token and not args.detach, "driver launch must be detached under caffeinate")
    ASSERTION_PID = require_caffeinate_child()
    signal.signal(signal.SIGTERM, signal_stop)
    signal.signal(signal.SIGINT, signal_stop)
    with (PRIVATE / "run.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        LOCK_FD = lock.fileno()
        require_no_orphans()
        POWER_DIRECTORY = DIRECTORY / "power" / args.launch_token
        POWER_DIRECTORY.mkdir(parents=True)
        require_safe_power()
        for name, command in (("before.log", ["/usr/bin/pmset", "-g", "log"]),
                              ("assertions-before.log", ["/usr/bin/pmset", "-g", "assertions"])):
            with (POWER_DIRECTORY / name).open("w") as output:
                subprocess.run(command, stdout=output, stderr=subprocess.STDOUT, timeout=10, check=True)
        state = {"pid": os.getpid(), "assertionPid": ASSERTION_PID, "launchToken": args.launch_token,
                 "startedAt": utc_now().isoformat(), "status": "running", "datasetKind": "tiebreak-rules",
                 "run": DIRECTORY.name, "app": APP, "contentManifestSha256": digest(MANIFEST),
                 "powerPolicy": {"requiresAC": not TIMING, "requiresOpenLid": True, "sampleSeconds": 30}}
        atomic_json(DIRECTORY / "driver.json", state)
        monitor = threading.Thread(target=monitor_power, daemon=True)
        monitor.start()
        try:
            run_pipeline()
        except BaseException:
            request_stop(STOP_REASON or "stage-failure")
            atomic_json(DIRECTORY / "driver.json", {**state, "status": "stopped", "finishedAt": utc_now().isoformat(), "stopReason": STOP_REASON})
            raise
        else:
            atomic_json(DIRECTORY / "driver.json", {**state, "status": "complete", "finishedAt": utc_now().isoformat()})
        finally:
            POWER_DONE.set(); monitor.join(timeout=12)
            for process in list(CHILDREN.values()):
                stop_group(process.pid)
            try:
                record_power(power_reading())
                with (POWER_DIRECTORY / "after.log").open("w") as output:
                    subprocess.run(["/usr/bin/pmset", "-g", "log"], stdout=output, stderr=subprocess.STDOUT, timeout=10, check=True)
            finally:
                atomic_json(POWER_DIRECTORY / "window.json", {"startedAt": state["startedAt"], "finishedAt": utc_now().isoformat(),
                    "driverPid": os.getpid(), "assertionPid": ASSERTION_PID, "assertion": "caffeinate -s -i", "status": "finished"})


if __name__ == "__main__":
    main()
