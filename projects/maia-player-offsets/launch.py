"""Start the resumable coordinator in its own session with private log files."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import subprocess

lab = Path(__file__).resolve().parents[2]
home = lab / "private/maia-player-offsets"
if os.getpriority(os.PRIO_PROCESS, 0) != 0:
    raise SystemExit("launch the lightweight coordinator without nice; it gives workers nice 10")
home.mkdir(parents=True, exist_ok=True)
started = datetime.now(timezone.utc)
log = home / f"phase2-supervisor-{started.strftime('%Y%m%dT%H%M%S%fZ')}.log"
with log.open("ab", buffering=0) as output:
    child = subprocess.Popen(
        [str(lab / "bridge/run.sh"), "projects/maia-player-offsets/run-phase2.mjs", "--run"],
        cwd=lab, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT,
        close_fds=True, start_new_session=True,
    )
record = {
    "startedAt": started.isoformat(), "pid": child.pid,
    "log": str(log.relative_to(lab)), "independentSession": True,
}
try:
    record["pgid"] = os.getpgid(child.pid)
    record["pidStarted"] = subprocess.check_output(
        ["ps", "-p", str(child.pid), "-o", "lstart="], text=True
    ).strip()
except (ProcessLookupError, subprocess.CalledProcessError):
    record["exitedDuringLaunch"] = True
target = home / "phase2-launch.json"
temporary = target.with_suffix(f".{os.getpid()}.tmp")
temporary.write_text(json.dumps(record, indent=2) + "\n")
temporary.replace(target)
print(json.dumps(record))
