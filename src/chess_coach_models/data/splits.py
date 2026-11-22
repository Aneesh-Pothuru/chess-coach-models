"""Deterministic sampling and splits from a hash of a row's group.

A row lands in the same split on every machine and in every rebuild, and every
row of one game lands together, so a model never sees a test game in training.
"""

from __future__ import annotations

import hashlib


def unit_hash(key: str, salt: str) -> float:
    """A number in [0, 1) fixed by the key and the salt."""
    digest = hashlib.sha256(f"{salt}:{key}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big") / float(2**64)


def keep(key: str, salt: str, fraction: float) -> bool:
    """Whether a deterministic sample of this fraction keeps the key."""
    return fraction >= 1.0 or unit_hash(key, f"{salt}:sample") < fraction


def split_of(key: str, salt: str, *, valid: float, test: float) -> str:
    """``train``, ``valid`` or ``test`` for the group this key names."""
    value = unit_hash(key, f"{salt}:split")
    if value < test:
        return "test"
    if value < test + valid:
        return "valid"
    return "train"
