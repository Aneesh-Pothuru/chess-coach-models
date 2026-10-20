"""Launch the approved phase-two wrapper in a detached session with file logs.

    .venv/bin/python projects/second-look-fresh/launch.py --phase2

This does not add workers. The selected phase-two driver owns worker limits and nice.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
from datetime import datetime, timezone
from run import LAB, LOG_ROOT, amendment_identity, design_identity, ensure_no_existing_workers, exclusive_lock


def launch_logged(amended: bool = False) -> None:
    identity = design_identity()
    amendment_sha256 = amendment_identity(identity["designSha256"]) if amended else None
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%S.%fZ")
    log = LOG_ROOT / f"{stamp}-detached.log"
    metadata = LOG_ROOT / f"{stamp}-launcher.json"
    command = [str(LAB / ".venv/bin/python"), "-u", str(LAB / "projects/second-look-fresh/run.py"), "--phase2"]
    if amended:
        command.append("--amended")
    with log.open("xb") as stream:
        child = subprocess.Popen(command, cwd=LAB, stdin=subprocess.DEVNULL,
                                 stdout=stream, stderr=subprocess.STDOUT,
                                 start_new_session=True, close_fds=True)
        awake = subprocess.Popen(["/usr/bin/caffeinate", "-i", "-w", str(child.pid)],
                                 cwd=LAB, stdin=subprocess.DEVNULL,
                                 stdout=stream, stderr=subprocess.STDOUT,
                                 start_new_session=True, close_fds=True)
    record = {"schema": "second-look-fresh-launch/1", "pid": child.pid,
              "processGroup": child.pid, "startedAt": now.isoformat(),
              "awakeHelperPid": awake.pid,
              "command": [".venv/bin/python", "-u", "projects/second-look-fresh/run.py", "--phase2"],
              "log": log.name}
    if amended:
        record["command"].append("--amended")
        record["amendmentSha256"] = amendment_sha256
    temporary = metadata.with_name(f"{metadata.name}.{child.pid}.tmp")
    with temporary.open("x", encoding="utf-8") as stream:
        json.dump(record, stream, indent=2)
        stream.write("\n")
    temporary.replace(metadata)
    print(json.dumps({"pid": child.pid, "awakeHelperPid": awake.pid, "log": str(log.relative_to(LAB)),
                      "metadata": str(metadata.relative_to(LAB))}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.add_argument("--amended", action="store_true",
                        help="use the separately approved candidate routine acquisition amendment")
    arguments = parser.parse_args()
    if Path.cwd().resolve() != LAB:
        parser.error("run this launcher from its lab root")
    if LOG_ROOT.resolve() != LOG_ROOT:
        parser.error("the private log directory must not have redirected parents")
    LOG_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        # Serialize check-and-launch. The child separately holds .run.lock
        # for its full lifetime, including when run.py is invoked directly.
        with exclusive_lock(LOG_ROOT / ".launch.lock"):
            ensure_no_existing_workers()
            launch_logged(amended=arguments.amended)
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
