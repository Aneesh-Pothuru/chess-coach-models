"""The trained weights a run starts from, on a machine that did not train them.

A run that starts from another run's body (``learner.init``) reads that run's ``model.pt`` among the
artifacts. On the machine that trained the body it is there. Anywhere else it is fetched:
``models/<model>/published.yaml`` says where a run's weights are published, how large they are and what
their hash is. A file of another size or another hash is refused, so a run started from a fetched body
starts from the very weights the body's record names.

A check on a small sample (``--smoke``) starts from the body its own small sample trained when that is
there, and from the trained body otherwise: it reads that file and writes nothing beside it.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any, Callable
from urllib.request import urlopen

import yaml

from .. import paths


CHUNK = 1 << 20


def published(model: str) -> dict[str, dict[str, Any]]:
    """Each run of a model whose weights are published: where, how many bytes and which hash."""
    path = paths.model(model) / "published.yaml"
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def start_weights(init: dict[str, Any], *, smoke: bool) -> Path:
    """The file a run reads the body it starts from. A check on a small sample reads the body that check
    trained, and the trained body where the check has trained none."""
    own = paths.run_files(init["model"], init["run"], smoke=smoke) / "model.pt"
    if own.exists() or not smoke:
        return own
    trained = paths.run_files(init["model"], init["run"]) / "model.pt"
    return trained if trained.exists() else own


def fetch(model: str, run: str, *, log: Callable[[str], None] = print, opener: Callable[..., Any] = urlopen) -> Path | None:
    """Fetches a run's published weights to where a run that starts from them reads them, and returns that
    file. Nothing is returned for a run that has none published or whose file cannot be reached, and the
    run that asked then waits as it would have. A file that is not the one the lab published is an error."""
    entry = published(model).get(run)
    if entry is None:
        return None
    target = paths.run_files(model, run) / "model.pt"
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + ".part")
    digest, size = hashlib.sha256(), 0
    try:
        with opener(entry["url"]) as response, partial.open("wb") as out:
            while chunk := response.read(CHUNK):
                digest.update(chunk)
                size += len(chunk)
                out.write(chunk)
    except OSError as error:
        partial.unlink(missing_ok=True)
        log(f"{model}/{run}: its published weights could not be fetched from {entry['url']} ({error})")
        return None
    if size != int(entry["bytes"]) or digest.hexdigest() != entry["sha256"]:
        partial.unlink()
        raise ValueError(
            f"{model}/{run}: the file at {entry['url']} is not the weights the lab published "
            f"({size:,} bytes with sha256 {digest.hexdigest()}, for {int(entry['bytes']):,} bytes with sha256 {entry['sha256']})"
        )
    os.replace(partial, target)
    log(f"{model}/{run}: its published weights fetched, {size:,} bytes, sha256 {entry['sha256']}")
    return target


def fetch_start(config: dict[str, Any], *, smoke: bool, log: Callable[[str], None] = print) -> None:
    """Before a run is asked whether it can train here: the body it starts from is fetched when this machine
    has none and the lab has published it."""
    init = config.get("learner", {}).get("init")
    if init and not start_weights(init, smoke=smoke).exists():
        fetch(init["model"], init["run"], log=log)
