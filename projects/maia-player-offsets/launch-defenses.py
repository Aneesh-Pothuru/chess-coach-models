"""Detach two resumable defense workers. --status reads aggregate process state.

Run with this clone's .venv/bin/python after defenses.mts --prepare.
The caller runs defenses.mts --report after a successful attempt. No retries.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import sys
import time
from datetime import datetime, timezone
from uuid import uuid4


LAB = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).resolve()
DEFENSE_DIR = LAB / "private/maia-player-offsets/defenses"
RUNS = DEFENSE_DIR / "launch"
INPUTS = DEFENSE_DIR / "inputs.json"
MANIFEST = SCRIPT.parent / "defenses-manifest.json"
WORKER = "projects/maia-player-offsets/defenses.mts"
SOURCE_FILES = [str(SCRIPT.relative_to(LAB)), WORKER, "bridge/run.sh", "bridge/chess.json"]


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(path.read_text())


def atomic(path, value):
    tmp = path.with_name(path.name + f".{os.getpid()}.tmp")
    with tmp.open("x") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    tmp.replace(path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot():
    if not INPUTS.is_file() or not MANIFEST.is_file():
        raise RuntimeError("run defenses.mts --prepare before launching")
    return {"sources": {file: digest(LAB / file) for file in SOURCE_FILES},
            "inputsSha256": digest(INPUTS), "manifestSha256": digest(MANIFEST)}


def marker(pid):
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="],
                            capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else None


def exists(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def identity():
    pid = os.getpid()
    started = marker(pid)
    if not started or os.getpgrp() != pid:
        raise RuntimeError("detached process identity could not be established")
    return {"pid": pid, "pidStarted": started, "pgid": pid}


def process_state(record):
    if not record:
        return "gone"
    pid = record.get("pid")
    if not isinstance(pid, int) or pid < 2 or record.get("pgid") != pid or not record.get("pidStarted"):
        raise RuntimeError("ambiguous recorded process identity; inspect private launch state")
    if exists(pid):
        started = marker(pid)
        if not started:
            if not exists(pid):
                return "orphan-group" if exists(-pid) else "gone"
            raise RuntimeError("live process start marker could not be read")
        if started == record["pidStarted"]:
            return "live"
        # PID reuse never authorizes signaling. A group with that number may
        # be unrelated, but refusing a restart is safer than assuming it gone.
        return "orphan-group" if exists(-pid) else "gone"
    return "orphan-group" if exists(-pid) else "gone"


def attempt_dir(token):
    if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        raise RuntimeError("invalid launch token")
    return RUNS / token


def acquire_lock():
    RUNS.mkdir(parents=True, exist_ok=True)
    fd = os.open(RUNS / "coordinator.lock", os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise RuntimeError("a defense coordinator or worker still holds the launch lock") from None
    return fd


def require_stopped():
    for directory in RUNS.iterdir():
        if not directory.is_dir():
            continue
        for path in [directory / "attempt.json", *directory.glob("worker-*.json")]:
            if not path.exists():
                continue
            record = read(path)
            if process_state(record.get("process")) != "gone":
                raise RuntimeError("a recorded defense process or orphan group survives; no restart")


def worker(token, slot, gate, lock):
    directory = attempt_dir(token)
    path = directory / f"worker-{slot}.json"
    # The inherited lock also blocks relaunch if the coordinator disappears.
    os.fstat(lock)
    ready, _, _ = select.select([gate], [], [], 30)
    allowed = bool(ready) and os.read(gate, 1) == b"1"
    os.close(gate)
    if not allowed:
        return 1  # No heavy child can start before its durable registration.
    record = read(path)
    if record["process"] != identity() or snapshot() != read(directory / "attempt.json")["snapshot"]:
        raise RuntimeError("worker registration or prepared sources changed")
    record.update(status="running", startedAt=now())
    atomic(path, record)
    started = time.monotonic()
    command = ["nice", "-n", "10", str(LAB / "bridge/run.sh"), WORKER, "--worker", f"{slot}/2"]
    child = subprocess.Popen(command, cwd=LAB, stdin=subprocess.DEVNULL, close_fds=True)
    code = child.wait()
    record.update(status="complete" if code == 0 else "failed", returncode=code,
                  finishedAt=now(), elapsedSeconds=time.monotonic() - started)
    atomic(path, record)
    return 0 if code == 0 else 1


def coordinator(token, lock):
    os.fstat(lock)
    directory = attempt_dir(token)
    path = directory / "attempt.json"
    record = read(path)
    if snapshot() != record["snapshot"]:
        raise RuntimeError("prepared inputs or sources changed before launch")
    record.update(status="running", process=identity(), startedAt=now())
    atomic(path, record)
    children = []
    try:
        for slot in range(2):
            worker_path = directory / f"worker-{slot}.json"
            item = {"slot": slot, "status": "pending", "process": None}
            atomic(worker_path, item)
            gate_read, gate_write = os.pipe()
            try:
                with (directory / f"worker-{slot}.log").open("ab", buffering=0) as log:
                    child = subprocess.Popen(
                        [sys.executable, str(SCRIPT), "--worker-internal", token, str(slot), str(gate_read), str(lock)],
                        cwd=LAB, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                        close_fds=True, pass_fds=(gate_read, lock), start_new_session=True)
                children.append((slot, child))
                started = marker(child.pid)
                if not started or os.getpgid(child.pid) != child.pid:
                    raise RuntimeError("worker exited before registration")
                item.update(status="registered", process={"pid": child.pid, "pidStarted": started, "pgid": child.pid})
                atomic(worker_path, item)
                os.write(gate_write, b"1")
            finally:
                os.close(gate_read)
                os.close(gate_write)
        results = []
        for slot, child in children:
            code = child.wait()
            # A surviving engine group prevents a later duplicate launch.
            for _ in range(50):
                if not exists(-child.pid):
                    break
                time.sleep(0.1)
            results.append({"slot": slot, "returncode": code, "groupSurvives": exists(-child.pid)})
        ok = all(r["returncode"] == 0 and not r["groupSurvives"] for r in results)
        record.update(status="complete" if ok else "failed", finishedAt=now(), workers=results)
        atomic(path, record)
        return 0 if ok else 1
    except Exception:
        record.update(status="failed", finishedAt=now(), error="operational failure; inspect private coordinator log")
        atomic(path, record)
        # Existing workers retain the lock. Never launch replacements here.
        raise


def launch():
    lock = acquire_lock()
    try:
        require_stopped()
        bound = snapshot()
        token = uuid4().hex
        directory = attempt_dir(token)
        directory.mkdir()
        atomic(directory / "attempt.json", {"schema": "maia-player-offsets-defense-launch/1",
               "status": "starting", "createdAt": now(), "process": None, "snapshot": bound,
               "maximumHeavyWorkers": 2, "workerNiceIncrement": 10, "coordinatorPriority": 0})
        atomic(RUNS / "latest.json", {"attempt": token})
        with (directory / "coordinator.log").open("ab", buffering=0) as log:
            child = subprocess.Popen([sys.executable, str(SCRIPT), "--coordinator", token, str(lock)],
                                     cwd=LAB, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                     close_fds=True, pass_fds=(lock,), start_new_session=True)
        print(json.dumps({"status": "launched", "coordinatorPid": child.pid,
                          "attempt": token, "logs": str(directory.relative_to(LAB))}))
    finally:
        os.close(lock)


def status():
    if not (RUNS / "latest.json").exists():
        print(json.dumps({"status": "not-launched"}))
        return
    directory = attempt_dir(read(RUNS / "latest.json")["attempt"])
    record = read(directory / "attempt.json")
    workers = [read(p) for p in sorted(directory.glob("worker-*.json"))]
    live = [process_state(w.get("process")) for w in workers]
    coordinator_state = process_state(record.get("process"))
    state = record["status"]
    if coordinator_state == "gone" and any(s != "gone" for s in live):
        state = "workers-survive-coordinator"
    elif coordinator_state == "gone" and state in ("starting", "running"):
        state = "interrupted"
    print(json.dumps({"status": state, "coordinator": coordinator_state,
                      "workerGroupsPresent": sum(s != "gone" for s in live),
                      "completedWorkers": sum(w["status"] == "complete" for w in workers),
                      "failedWorkers": sum(w["status"] == "failed" for w in workers),
                      "reportRequired": state == "complete"}))


def main():
    if Path(sys.prefix).resolve() != (LAB / ".venv").resolve():
        raise RuntimeError("use this clone's .venv/bin/python")
    args = sys.argv[1:]
    if args == ["--status"]:
        status()
        return 0
    if os.getpriority(os.PRIO_PROCESS, 0) != 0:
        raise RuntimeError("start the coordinator without nice; it lowers only worker priority")
    if not args:
        launch()
        return 0
    if len(args) == 3 and args[0] == "--coordinator":
        return coordinator(args[1], int(args[2]))
    if len(args) == 5 and args[0] == "--worker-internal" and args[2] in ("0", "1"):
        return worker(args[1], int(args[2]), int(args[3]), int(args[4]))
    raise RuntimeError("usage: .venv/bin/python projects/maia-player-offsets/launch-defenses.py [--status]")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        # Worker output is private; never echo it in the aggregate status.
        print(json.dumps({"status": "stopped", "reason": str(error) if isinstance(error, RuntimeError)
                          else "operational failure; inspect private launch logs"}), file=sys.stderr)
        raise SystemExit(1)
