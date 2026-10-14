"""Runs the chess app's own TypeScript from the lab.

An eval that compares the lab with the app, or measures a candidate change
before it is ported, imports the app's code instead of re-implementing it, so
the number it reports is about the code the app runs. bridge/chess.json pins
the app's commit, and the commit holding the research records that stay in
the app's private repository; bridge/checkout.sh fetches either once;
bridge/run.sh runs a script under the app's tsx.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
PIN = ROOT / "bridge" / "chess.json"
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")


def load_pin(path: Path = PIN) -> dict[str, str]:
    """The app's repository, the commit every eval runs against, and the
    commit holding the private research records."""
    pin = json.loads(Path(path).read_text())
    repo = pin.get("repo")
    if not isinstance(repo, str) or not repo.startswith("https://"):
        raise ValueError(f"{path}: repo must be an https URL")
    out = {"repo": repo}
    for field in ("commit", "records"):
        value = pin.get(field)
        # A branch or a short sha would let what is read move under the pin.
        if not isinstance(value, str) or not COMMIT_RE.match(value):
            raise ValueError(f"{path}: {field} must be a full 40-character sha")
        out[field] = value
    return out


def _checkout(which: str, override: str) -> Path:
    if os.environ.get(override):
        return Path(os.environ[override])
    # The app's first checkout runs npm ci; its progress goes to our stderr.
    out = subprocess.run(
        [str(ROOT / "bridge" / "checkout.sh"), which],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return Path(out.stdout.strip())


def chess_dir() -> Path:
    """The app checkout evals run against: CHESS_DIR, else the pinned commit."""
    return _checkout("app", "CHESS_DIR")


def records_dir() -> Path:
    """The private research records: CHESS_RECORDS_DIR, else the pinned commit."""
    return _checkout("records", "CHESS_RECORDS_DIR")


def chess_commit(directory: Path) -> str | None:
    """The commit a checkout holds, so a report names what it measured."""
    out = subprocess.run(
        ["git", "-C", str(directory), "rev-parse", "HEAD"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return out.stdout.strip() if out.returncode == 0 else None


def run_eval(script: str | Path, payload: Any, directory: Path | None = None) -> Any:
    """Runs an eval script against the app: JSON in on stdin, JSON out on stdout."""
    env = {**os.environ, "CHESS_DIR": str(directory or chess_dir())}
    out = subprocess.run(
        [str(ROOT / "bridge" / "run.sh"), str(script)],
        input=json.dumps(payload),
        env=env,
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return json.loads(out.stdout)
