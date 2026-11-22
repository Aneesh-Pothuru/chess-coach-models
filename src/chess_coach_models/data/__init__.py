"""Datasets from open sources.

A dataset is built from its recipe, ``datasets/<name>.yaml``: an open source,
filters, a fixed sample and a split by game. The recipe names its builder, and
a builder gives the rows, the encoded boards and a manifest (``store.py``
writes them down).

A recipe can be a larger build of another: ``of: puzzles`` with a larger
sample, more games or more files, and everything else the same. It holds every
row of the other and more, split the same way, and is there for training only:
a run names it with ``data: {train_on: puzzles-all}`` and is still scored on
the valid and test rows of its task's own dataset (``train/run.py``).
"""

from __future__ import annotations

from collections.abc import Callable
from importlib import import_module
from typing import Any

import yaml

from .. import paths


# A recipe's ``builder`` and the module here that builds it.
BUILDERS = {
    "puzzles": "puzzles",
    "game_positions": "positions",
    "game_sides": "sides",
    "tactics": "tactics",
    "evaluations": "evaluations",
}


def recipe(dataset: str, *, smoke: bool = False) -> dict[str, Any]:
    """A dataset's recipe; a smoke build takes its ``smoke`` overrides and its own name."""
    with (paths.recipes() / f"{dataset}.yaml").open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    overrides = loaded.pop("smoke", {})
    if smoke:
        loaded.update(overrides)
        loaded["name"] = f"{loaded['name']}-smoke"
    return loaded


# What a larger build of a recipe may change: how much of the source it keeps. Its name is its own, and
# ``of`` names the recipe it is a larger build of.
SIZES = ("sample", "games", "files", "source_rows")


def larger_of(dataset: str, *, smoke: bool = False) -> str | None:
    """The recipe a dataset is a larger build of, or nothing for a dataset of its own.

    A larger build must hold the other's rows as they are and split them the same way, so the two recipes
    may differ only in how much of the source they keep. Anything else that differs is refused here, before
    a build or a run reads a row.
    """
    plan = recipe(dataset, smoke=smoke)
    other = plan.get("of")
    if other is None:
        return None
    base = recipe(other, smoke=smoke)
    if "of" in base:
        raise ValueError(f"{dataset} is a larger build of {other}, which is itself a larger build of {base['of']}: name that one")
    apart = sorted(key for key in set(plan) | set(base) if key not in ("name", "of", *SIZES) and plan.get(key) != base.get(key))
    if apart:
        raise ValueError(
            f"{dataset} is a larger build of {other} and differs from it in {', '.join(apart)}: "
            f"a larger build changes only {', '.join(SIZES)}"
        )
    return other


def builder(name: str) -> Callable[..., Any]:
    """The function that builds a recipe: it is given the recipe and returns rows, tokens, marks and a manifest."""
    if name not in BUILDERS:
        raise ValueError(f"no builder named {name!r}: the lab has {', '.join(sorted(BUILDERS))}")
    return import_module(f".{BUILDERS[name]}", __name__).build
