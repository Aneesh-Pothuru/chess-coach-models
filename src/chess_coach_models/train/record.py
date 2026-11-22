"""What a run record says about where it was made: the processor, the library versions, the weights' hashes."""

from __future__ import annotations

import hashlib
import os
import platform
from importlib import metadata
from pathlib import Path
from typing import Any


SOFTWARE = ("numpy", "polars", "lightgbm", "torch")


def saved_weights(directory: Path, predictions: Path) -> list[dict[str, Any]]:
    """What a learner saved beside its predictions, by name, size and hash.

    Weights are not committed, so the record says which file it is the record of.
    """
    return [
        {"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        for path in sorted(directory.iterdir())
        if path.is_file() and path != predictions
    ]


def machine() -> dict[str, Any]:
    """The hardware a run used, without the machine's name."""
    processor = platform.processor()
    try:
        for line in Path("/proc/cpuinfo").read_text(encoding="utf-8").splitlines():
            if line.startswith("model name"):
                processor = line.split(":", 1)[1].strip()
                break
    except OSError:
        pass
    return {"processor": processor, "threads": os.cpu_count(), "system": platform.system()}


def software() -> dict[str, str]:
    """The versions a run was made with: Python, and each library a dataset or a learner rests on that is installed."""
    versions = {"python": platform.python_version()}
    for name in SOFTWARE:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            continue
    return versions
