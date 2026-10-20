"""Start the fourth-acquisition driver detached with regular-file output."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import subprocess


DRIVER_PATH = Path(__file__).with_name("fourth-run.py")
spec = importlib.util.spec_from_file_location("fourth_acquisition_run", DRIVER_PATH)
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)


def launch() -> None:
    now = datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%dT%H%M%S.%fZ")
    log = driver.LOG_ROOT / f"{stamp}-detached.log"
    metadata = driver.LOG_ROOT / f"{stamp}-launcher.json"
    command = [str(driver.LAB / ".venv/bin/python"), "-B", "-u", str(driver.DRIVER), "--phase2"]
    with log.open("xb") as stream:
        child = subprocess.Popen(
            command, cwd=driver.LAB, stdin=subprocess.DEVNULL,
            stdout=stream, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    record = {
        "schema": "second-look-fresh-fourth-launch/1",
        "pid": child.pid, "processGroup": child.pid, "startedAt": now.isoformat(), "log": log.name,
        "command": [".venv/bin/python", "-B", "-u", "projects/second-look-fresh/fourth-run.py", "--phase2"],
        "awakeAssertions": "driver-owned -i -s assertions, verified before work",
    }
    temporary = metadata.with_name(f"{metadata.name}.{os.getpid()}.tmp")
    driver.write_once(temporary, record)
    temporary.replace(metadata)
    print(json.dumps({"pid": child.pid, "log": str(log.relative_to(driver.LAB)),
                      "metadata": str(metadata.relative_to(driver.LAB))}))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase2", action="store_true", required=True)
    parser.parse_args()
    try:
        driver.check_local_directories()
        with driver.exclusive_lock(driver.ORIGINAL_LOG_ROOT / ".launch.lock"):
            with driver.exclusive_lock(driver.LOG_ROOT / ".launch.lock"):
                driver.ensure_no_fourth_workers()
                launch()
    except RuntimeError as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
