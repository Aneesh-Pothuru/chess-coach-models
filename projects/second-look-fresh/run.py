"""Record and reproduce the approved phase-two command without changing it.

Launch from the lab root in a detached session with file output:
    .venv/bin/python projects/second-look-fresh/launch.py --phase2

Only private wrapper metadata and timestamped output logs are written here.
The selected phase-two driver owns the measurement, resumption and worker limits.
"""

from __future__ import annotations

import argparse
import codecs
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone


LAB = Path(__file__).resolve().parents[2]
LOG_ROOT = LAB / "private" / "second-look-fresh" / "run-log"
COMMAND = ["bash", "projects/second-look-fresh/phase2.sh", "--phase2"]
AMENDED_COMMAND = ["bash", "projects/second-look-fresh/phase2-amended.sh", "--phase2"]
WORKER_MARKERS = re.compile(
    r"(?:phase2(?:-amended(?:-body)?)?\.sh|second-look-fresh/run\.py|src/cli/coach\.ts|"
    r"second-look-fresh/(?:build|probe|reference)\.mjs|"
    r"second-look-fresh/amended-probe\.mjs|"
    r"second-look-fresh/acquisition-amended/[^ ]*probe[^ ]*\.mjs|"
    r"/node_modules/stockfish/bin/|maia[^\n]*worker)"
)


@contextmanager
def exclusive_lock(path: Path):
    """Hold an OS lock for the whole protected action, including direct runs."""
    with path.open("a") as stream:
        try:
            fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("another project launch or wrapper holds this lock") from error
        try:
            yield
        finally:
            fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def recorded_wrapper_active(record: dict) -> bool:
    found = subprocess.run(
        ["ps", "-p", str(record["pid"]), "-o", "pgid=,stat=,args="],
        capture_output=True, text=True, check=False,
    )
    fields = found.stdout.split(None, 2)
    if (found.returncode != 0 or len(fields) != 3
            or fields[0] != str(record["processGroup"]) or fields[1].startswith("Z")):
        return False
    arguments = fields[2].split()
    if arguments[-1:] == ["--amended"]:
        arguments = arguments[:-1]
    relative = "projects/second-look-fresh/run.py"
    if arguments[-2:] == [str(LAB / relative), "--phase2"]:
        return True
    if arguments[-2:] != [relative, "--phase2"]:
        return False
    # The already-running wrapper used a relative script argument. Inspect
    # only this recorded PID's cwd so another clone cannot match that spelling.
    cwd = subprocess.run(
        ["/usr/sbin/lsof", "-a", "-p", str(record["pid"]), "-d", "cwd", "-Fn"],
        capture_output=True, text=True, check=False, timeout=5,
    )
    if cwd.returncode != 0:
        raise RuntimeError("cannot verify the recorded wrapper's working directory")
    return f"n{LAB}" in cwd.stdout.splitlines()


def is_project_worker(arguments: str) -> bool:
    return f"{LAB}/" in arguments and WORKER_MARKERS.search(arguments) is not None


def ensure_no_existing_workers() -> None:
    # Recorded-PID checks also protect the live wrapper that predates locking.
    for path in LOG_ROOT.glob("*-launcher.json"):
        record = json.loads(path.read_text())
        if record.get("pid") != os.getpid() and recorded_wrapper_active(record):
            raise RuntimeError("a recorded detached wrapper is still running")
    processes = subprocess.check_output(["ps", "-axo", "pid=,args="], text=True)
    for line in processes.splitlines():
        fields = line.strip().split(None, 1)
        if (len(fields) == 2 and int(fields[0]) != os.getpid()
                and is_project_worker(fields[1])):
            raise RuntimeError("a project worker may already be running; inspect its log before resuming")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Interrupted(Exception):
    def __init__(self, signum: int):
        self.signum = signum


def interrupted(signum: int, _frame: object) -> None:
    raise Interrupted(signum)


def direct_children(pid: int) -> list[int]:
    """Read numeric child IDs of one already-owned PID, never a process list."""
    found = subprocess.run(
        ["pgrep", "-P", str(pid)], capture_output=True, text=True, check=False
    )
    if found.returncode == 1:
        return []
    if found.returncode != 0:
        raise RuntimeError("could not discover an owned process's children")
    values = found.stdout.split()
    if any(not value.isdecimal() or int(value) <= 0 for value in values):
        raise RuntimeError("child discovery returned a non-PID value")
    return [int(value) for value in values]


def terminate_tree(child: subprocess.Popen[str]) -> None:
    # Freeze our new root group first. CLI reviews detach into new groups, so
    # then follow only numeric children of owned PIDs, freezing each parent
    # before discovering its children. No stopped process can launch a new
    # worker while the recorded tree is terminated.
    if child.poll() is not None:
        return
    try:
        os.killpg(child.pid, signal.SIGSTOP)
    except ProcessLookupError:
        child.wait()
        return
    except PermissionError:
        # macOS can report an empty, just-exited process group as EPERM.
        if child.poll() is not None:
            return
        raise
    owned = []
    pending = [child.pid]
    seen = set()
    try:
        while pending:
            pid = pending.pop()
            if pid in seen:
                continue
            try:
                os.kill(pid, signal.SIGSTOP)
            except ProcessLookupError:
                continue
            seen.add(pid)
            owned.append(pid)
            pending.extend(direct_children(pid))
    finally:
        # Keep the tree stopped through termination: resuming its parents to
        # handle an interrupt could let a shell start its next stage. Atomic
        # completed outputs are kept; the app's resumable builds handle any
        # interrupted temporary output on the next invocation.
        # Also covers any same-group process created just before the first
        # stop. Kill this group while its frozen leader still exists; then
        # kill the recorded detached descendants individually.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        for pid in reversed(owned):
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait()


def write_final_metadata(path: Path, metadata: dict) -> None:
    temporary = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    with temporary.open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")
    temporary.replace(path)


def design_identity() -> dict:
    checked = subprocess.run(
        ["node", "--input-type=module", "-e",
         "import { verifyDesignCode } from './projects/second-look-fresh/provenance.mjs';"
         "process.stdout.write(JSON.stringify(verifyDesignCode()));"],
        cwd=LAB, check=True, capture_output=True, text=True,
    )
    identity = json.loads(checked.stdout)
    digest = identity.get("designSha256", "")
    if (len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest)
            or identity.get("measurementCodeUnchanged") is not True
            or identity.get("protocolUnchanged") is not True):
        raise RuntimeError("the committed design manifest did not validate")
    return identity


def amendment_identity(design_sha256: str) -> str:
    """Validate the separately approved acquisition text without running jobs."""
    path = LAB / "projects/second-look-fresh/amendment-manifest.json"
    raw = path.read_bytes()
    manifest = json.loads(raw)
    if (manifest.get("schema") != "second-look-fresh-acquisition-amendment/1"
            or manifest.get("designSha256") != design_sha256):
        raise RuntimeError("the acquisition amendment identifies a different design")
    protocol = manifest["protocol"]
    if (protocol["path"] != "projects/second-look-fresh/README.md"
            or protocol["start"] != "## Acquisition amendment, approved before the comparison\n"
            or protocol["end"] != "## Caveats\n"):
        raise RuntimeError("the acquisition amendment has unexpected protocol boundaries")
    text = (LAB / protocol["path"]).read_text()
    start = text.index(protocol["start"])
    end = text.index(protocol["end"], start)
    if hashlib.sha256(text[start:end].encode()).hexdigest() != protocol["sha256"]:
        raise RuntimeError("the approved acquisition amendment text changed")
    return hashlib.sha256(raw).hexdigest()


def tail_output(child: subprocess.Popen, raw_path: Path, output, started: float) -> int:
    """Timestamp a direct-to-file child log; no child output depends on a pipe."""
    decoder = codecs.getincrementaldecoder("utf-8")("replace")
    pending = ""

    def emit(line: str) -> None:
        row = {"at": utc_now(), "seconds": time.monotonic() - started, "line": line.rstrip("\r")}
        output.write(json.dumps(row) + "\n")
        output.flush()
        sys.stdout.write(line + "\n")
        sys.stdout.flush()

    with raw_path.open("rb") as raw:
        while True:
            chunk = raw.read(65536)
            if chunk:
                pending += decoder.decode(chunk)
                while "\n" in pending:
                    line, pending = pending.split("\n", 1)
                    emit(line)
                continue
            if child.poll() is not None:
                # The final read follows the observed child exit, so any bytes
                # written between the prior EOF and exit are included too.
                final = raw.read()
                pending += decoder.decode(final, final=True)
                while "\n" in pending:
                    line, pending = pending.split("\n", 1)
                    emit(line)
                if pending:
                    emit(pending)
                return child.wait()
            time.sleep(.2)


def run_logged(identity: dict, amended: bool = False) -> int:
    command = AMENDED_COMMAND if amended else COMMAND
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    metadata_path = LOG_ROOT / f"{stamp}-run.json"
    output_path = LOG_ROOT / f"{stamp}-output.jsonl"
    raw_path = LOG_ROOT / f"{stamp}-raw.log"
    started = time.monotonic()
    metadata = {"schema": "second-look-fresh-run/2", "command": command,
                "startedAt": utc_now(), "designSha256": identity["designSha256"], "status": "running"}
    if amended:
        metadata["amendmentSha256"] = amendment_identity(identity["designSha256"])
    with metadata_path.open("x", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")

    previous_handlers = {sig: signal.signal(sig, interrupted) for sig in (signal.SIGINT, signal.SIGTERM)}
    child = None
    exit_code = 1
    try:
        with output_path.open("x", encoding="utf-8") as output, raw_path.open("xb") as raw:
            child = subprocess.Popen(
                command,
                cwd=LAB,
                stdout=raw,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            exit_code = tail_output(child, raw_path, output, started)
    except Interrupted as error:
        exit_code = 128 + error.signum
        for sig in previous_handlers:
            signal.signal(sig, signal.SIG_IGN)
        if child is not None:
            terminate_tree(child)
    except BaseException:
        for sig in previous_handlers:
            signal.signal(sig, signal.SIG_IGN)
        if child is not None:
            terminate_tree(child)
        raise
    finally:
        metadata.update(status="finished", endedAt=utc_now(), seconds=time.monotonic() - started, exitCode=exit_code)
        write_final_metadata(metadata_path, metadata)
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.add_argument("--amended", action="store_true",
                        help="use the separately approved candidate routine acquisition amendment")
    arguments = parser.parse_args()
    if Path.cwd().resolve() != LAB:
        parser.error("run this wrapper from its lab root")
    if LOG_ROOT.resolve() != LOG_ROOT or not LOG_ROOT.is_relative_to(LAB):
        parser.error("the private log directory must remain inside this clone without redirected parents")
    identity = design_identity()
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        with exclusive_lock(LOG_ROOT / ".run.lock"):
            ensure_no_existing_workers()
            return run_logged(identity, amended=arguments.amended)
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    sys.exit(main())
