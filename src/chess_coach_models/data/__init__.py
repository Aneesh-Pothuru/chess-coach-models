"""Datasets from open sources.

A dataset is built from its recipe, ``datasets/<name>.yaml``: an open source,
filters, a fixed sample and a split by game. The recipe names its builder, and
a builder gives the rows, the encoded boards and a manifest (``store.py``
writes them down).
"""

from __future__ import annotations

from collections.abc import Callable
from importlib import import_module
from typing import Any

import yaml

from .. import paths


# A recipe's ``builder`` and the module here that builds it.
BUILDERS = {"puzzles": "puzzles", "game_positions": "positions", "tactics": "tactics"}


def recipe(dataset: str, *, smoke: bool = False) -> dict[str, Any]:
    """A dataset's recipe; a smoke build takes its ``smoke`` overrides and its own name."""
    with (paths.recipes() / f"{dataset}.yaml").open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    overrides = loaded.pop("smoke", {})
    if smoke:
        loaded.update(overrides)
        loaded["name"] = f"{loaded['name']}-smoke"
    return loaded


def builder(name: str) -> Callable[..., Any]:
    """The function that builds a recipe: it is given the recipe and returns rows, tokens, marks and a manifest."""
    if name not in BUILDERS:
        raise ValueError(f"no builder named {name!r}: the lab has {', '.join(sorted(BUILDERS))}")
    return import_module(f".{BUILDERS[name]}", __name__).build
