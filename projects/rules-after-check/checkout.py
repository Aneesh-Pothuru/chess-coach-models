#!/usr/bin/env python3
"""Prepare the second pinned app without installing packages or moving a pin.

The bridge accepts this checkout through CHESS_DIR. The second app uses the
already installed dependency tree of the measured app. This helper never
invokes npm, pip, brew, or the study's row readers.
"""
import argparse
import json
from pathlib import Path
import subprocess

PROJECT = Path(__file__).resolve().parent
LAB = PROJECT.parents[1]


def prepare(fetch=False):
    pins = json.loads((PROJECT / "app-pins.json").read_text())
    source = LAB / ".cache/chess" / pins["score"]
    target = LAB / ".cache/chess" / pins["check"]
    if not (source / "node_modules/.bin/tsx").is_file():
        raise ValueError("the measured app's installed dependencies are absent")
    if not target.exists():
        if not fetch:
            raise ValueError("second app absent; explicit --fetch prepares only its source")
        target.mkdir(parents=True)
        subprocess.run(["git", "init", "-q", str(target)], check=True)
    head = subprocess.run(["git", "-C", str(target), "rev-parse", "HEAD"],
                          text=True, capture_output=True)
    if head.returncode:
        if not fetch:
            raise ValueError("second app checkout incomplete")
        subprocess.run(["git", "-C", str(target), "fetch", "--depth", "1", pins["repo"], pins["check"]], check=True)
        subprocess.run(["git", "-C", str(target), "-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], check=True)
    actual = subprocess.check_output(["git", "-C", str(target), "rev-parse", "HEAD"], text=True).strip()
    if actual != pins["check"]:
        raise ValueError("second app has the wrong pin; it is not changed automatically")
    if (target / "package-lock.json").read_bytes() != (source / "package-lock.json").read_bytes():
        raise ValueError("dependency locks differ; no packages are installed automatically")
    dependencies = target / "node_modules"
    if not dependencies.exists():
        dependencies.symlink_to(source / "node_modules", target_is_directory=True)
    if dependencies.resolve() != (source / "node_modules").resolve():
        raise ValueError("unexpected second-app dependencies")
    print(target)
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true")
    prepare(parser.parse_args().fetch)
