"""Runs the chess app's own TypeScript from the lab.

An eval that compares the lab with the app, or measures a candidate change
before it is ported, imports the app's code instead of re-implementing it, so
the number it reports is about the code the app runs. bridge/chess.json pins
the app's commit; bridge/checkout.sh fetches it once with its npm
dependencies; bridge/run.sh runs a script under the app's tsx.
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
    """The app's repository and the full commit every eval runs against."""
    pin = json.loads(Path(path).read_text())
    repo, commit = pin.get("repo"), pin.get("commit")
    if not isinstance(repo, str) or not repo.startswith("https://"):
        raise ValueError(f"{path}: repo must be an https URL")
    # A branch or a short sha would let the measured code move under the pin.
    if not isinstance(commit, str) or not COMMIT_RE.match(commit):
        raise ValueError(f"{path}: commit must be a full 40-character sha")
    return {"repo": repo, "commit": commit}


def chess_dir() -> Path:
    """The app checkout evals run against: CHESS_DIR, else the pinned commit."""
    override = os.environ.get("CHESS_DIR")
    if override:
        return Path(override)
    # The first checkout runs npm ci; its progress goes to our stderr.
    out = subprocess.run(
        [str(ROOT / "bridge" / "checkout.sh")],
        check=True,
        stdout=subprocess.PIPE,
        text=True,
    )
    return Path(out.stdout.strip())


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
