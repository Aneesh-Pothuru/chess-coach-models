"""A trained run filed as its config files it now.

A run that changes one thing in another is tried as a run of the model's own,
and it is kept as one only when it beats the run it changed on valid and on
test beyond the noise. One that does not is still a measurement: it says what
the change is worth. Its config then names the run it changed as its ``base``
and what it measured as its ``study``, and ``lab file`` writes those two names
into its record. From there on it is a study run like any other: a leaderboard
lists it apart, under its study, and the closer look sets it against its base.

Nothing a run was trained with changes on the way. A record whose settings are
not its config's is refused: a run with other settings is another run, and it
has to be trained. A study run kept no weights, so a record cannot be filed
back as a run of the model's own.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .. import paths
from .run import run_config


# What says where a run is filed, and is no setting it was trained with.
FILING = ("base", "study")


def _settings(config: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in config.items() if key not in FILING}


def _differing(ours: dict[str, Any], theirs: dict[str, Any], above: str = "") -> list[str]:
    """Every setting two configs disagree on, by its dotted name."""
    found: list[str] = []
    for key in sorted(set(ours) | set(theirs)):
        one, other = ours.get(key), theirs.get(key)
        if isinstance(one, dict) and isinstance(other, dict):
            found += _differing(one, other, f"{above}{key}.")
        elif one != other:
            found.append(f"{above}{key}")
    return found


def file_run(model: str, run: str, *, smoke: bool = False) -> str | None:
    """Writes into a run's record where its config files it now, and returns that in words, or nothing for a
    record that is filed so already."""
    path = paths.results(model, smoke=smoke) / f"{run}.json"
    if not path.exists():
        raise FileNotFoundError(f"{model}/{run} has no record yet: a run is filed once it is trained")
    record = json.loads(path.read_text(encoding="utf-8"))
    config = run_config(model, run, smoke=smoke)
    differing = _differing(_settings(config), _settings(record["config"]))
    if differing:
        raise ValueError(
            f"{model}/{run}: its config no longer says what its record was trained with ({', '.join(differing)}). "
            "A run with other settings is another run, and it has to be trained"
        )
    was, now = ({key: one.get(key) for key in FILING} for one in (record["config"], config))
    if was == now:
        return None
    if was["study"] is not None and now["study"] is None:
        raise ValueError(
            f"{model}/{run}: its record is a study run's, which kept no weights, and its config names no study. "
            "Train it as a run of the model's own"
        )
    if now["study"] is not None and now["base"] is None:
        raise ValueError(f"{model}/{run}: a study run is set against the run it changes, and its config names no base")
    record["config"] = {**_settings(record["config"]), **{key: now[key] for key in FILING if now[key] is not None}}
    record["filed"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if now["study"] is None:
        return f"filed as a run of the model's own that changes {now['base']}"
    return f"filed under the study {now['study']}, against {now['base']}"
