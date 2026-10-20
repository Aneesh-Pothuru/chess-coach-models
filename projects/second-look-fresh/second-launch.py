"""Start the second-acquisition driver detached, with regular-file output."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys


DRIVER_PATH = Path(__file__).with_name("second-run.py")
spec = importlib.util.spec_from_file_location("second_acquisition_run", DRIVER_PATH)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def launch() -> None:
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%S.%fZ")
    log = driver.LOG_ROOT / f"{stamp}-detached.log"
    metadata = driver.LOG_ROOT / f"{stamp}-launcher.json"
    command = [str(driver.LAB / ".venv/bin/python"), "-u", str(driver.DRIVER), "--phase2"]
    with log.open("xb") as stream:
        child = subprocess.Popen(
            command, cwd=driver.LAB, stdin=subprocess.DEVNULL,
            stdout=stream, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
        try:
            awake = subprocess.Popen(
                ["/usr/bin/caffeinate", "-i", "-w", str(child.pid)],
                cwd=driver.LAB, stdin=subprocess.DEVNULL,
                stdout=stream, stderr=subprocess.STDOUT,
                start_new_session=True, close_fds=True,
            )
        except BaseException:
            driver.terminate_tree(child)
            raise
    record = {
        "schema": "second-look-fresh-second-launch/1",
        "pid": child.pid, "processGroup": child.pid, "awakeHelperPid": awake.pid,
        "startedAt": now.isoformat(), "log": log.name,
        "command": [".venv/bin/python", "-u", "projects/second-look-fresh/second-run.py", "--phase2"],
    }
    temporary = metadata.with_name(f"{metadata.name}.{os.getpid()}.tmp")
    with temporary.open("x", encoding="utf-8") as stream:
        json.dump(record, stream, indent=2)
        stream.write("\n")
    temporary.replace(metadata)
    print(json.dumps({"pid": child.pid, "awakeHelperPid": awake.pid,
                      "log": str(log.relative_to(driver.LAB)),
                      "metadata": str(metadata.relative_to(driver.LAB))}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.parse_args()
    try:
        driver.check_local_directories()
        with driver.exclusive_lock(driver.ORIGINAL_LOG_ROOT / ".launch.lock"):
            with driver.exclusive_lock(driver.LOG_ROOT / ".launch.lock"):
                driver.ensure_no_second_workers()
                launch()
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
