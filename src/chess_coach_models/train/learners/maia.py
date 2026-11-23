"""Maia-2 as its authors published it, as a run of a model that predicts the move played.

Nothing is trained here. The published network reads a row's position and the
two players' ratings, as its own code prepares them, and gives every move it
knows a logit. Its chances over the moves the position allows are then laid on
the row's candidates (``encode/moves.py``), so it is scored on the same rows,
by the same scores, as the runs trained here. It sees a position from the
mover's side, as the lab's networks do, and it tells a promotion's four
choices apart where a row has one candidate, so those four chances are added.

The ``maia2`` package and its weights are not part of the lab: a run asks for
the package (``docs/compute.md`` says how it is installed beside Torch), and
the package fetches its weights once into ``artifacts/maia2/``.

A run reads each rating from a column of the dataset, or is told one number
for every row:

    learner: {kind: maia2, type: rapid, player: mover_elo, against: opponent_elo}
    learner: {kind: maia2, type: rapid, player: 1500, against: 1500}
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Sequence
from importlib import metadata
from typing import Any

import numpy as np
import yaml

from ... import paths
from ...encode.moves import PAIRS, pair_of
from .base import Fitted, Prepared


NEEDS = (
    "a maia2 run needs the maia2 package beside Torch: "
    "`pip install --no-deps maia2 && pip install einops gdown pyzstd`"
)
# Positions read at a time.
AT_ONCE = 1024


def published(which: str = "rapid", device: str | None = None):
    """The published model of one kind of game (``rapid`` or ``blitz``), fetched once into ``artifacts/maia2/``."""
    try:
        from maia2 import model
    except ImportError as error:
        raise RuntimeError(NEEDS) from error
    return model.from_pretrained(type=which, device=device or "auto", save_root=str(paths.artifacts() / "maia2")).eval()


def read(net, fens: Sequence[str], own: Sequence[int], other: Sequence[int], candidates: np.ndarray) -> np.ndarray:
    """The published model's chance for each candidate of each position, ``[positions, most]`` with no number
    where a position has no candidate. ``own`` and ``other`` are the mover's rating and the opponent's, and
    ``candidates`` each position's legal moves as pairs of squares (``encode/moves.py``)."""
    import torch
    from maia2 import inference

    on = next(net.parameters()).device
    known, ratings, _ = inference.prepare()
    # Each move Maia-2 knows, as its pair of squares: its board is the mover's, as a row's candidates are.
    pair = torch.tensor([pair_of(uci, True) for uci in sorted(known, key=known.get)], device=on)
    out = np.full(candidates.shape, np.nan)
    for start in range(0, len(fens), AT_ONCE):
        rows = range(start, min(start + AT_ONCE, len(fens)))
        prepared = [inference.preprocessing(fens[row], own[row], other[row], ratings, known) for row in rows]
        legal = torch.stack([one[3] for one in prepared]).to(on).bool()
        with torch.no_grad():
            logits, _, _ = net(
                torch.stack([one[0] for one in prepared]).to(on),
                torch.tensor([one[1] for one in prepared], device=on),
                torch.tensor([one[2] for one in prepared], device=on),
            )
        chances = torch.softmax(logits.double().masked_fill(~legal, float("-inf")), dim=1)
        # A promotion's four choices are four of its moves and one candidate of the row: their chances add.
        by_pair = chances.new_zeros(len(rows), PAIRS + 1).index_add_(1, pair, chances)
        by_pair[:, PAIRS] = float("nan")
        places = torch.from_numpy(candidates[start : start + len(rows)].astype(np.int64)).to(on)
        laid = by_pair.gather(1, torch.where(places < 0, PAIRS, places)).cpu().numpy()
        if not np.allclose(np.nansum(laid, axis=1), 1.0, atol=1e-6):
            raise ValueError("the moves Maia-2 allows in a position are not the position's candidates")
        out[start : start + len(rows)] = laid
    return out


def fit(prepared: Prepared, config: dict[str, Any], *, log, device: str | None = None) -> Fitted:
    """The published model's chance for each legal move of the valid and the test rows."""
    task, learner = prepared.task, config["learner"]
    if task.kind != "moves":
        raise ValueError(f"{task.name}: Maia-2 gives each legal move a chance, and only a task that predicts the move played can ask it")
    which = learner.get("type", "rapid")
    started = time.time()
    net = published(which, device)
    rows = prepared.dataset.rows
    fens = rows["fen"].to_list()

    def rating(told: str | int) -> list[int]:
        """A rating for every row: a column of the dataset, or the one number a run tells the model."""
        return rows[told].to_list() if isinstance(told, str) else [int(told)] * len(rows)

    own, other = rating(learner["player"]), rating(learner["against"])

    def said(index: np.ndarray) -> np.ndarray:
        picked = index.tolist()
        return read(net, [fens[row] for row in picked], [own[row] for row in picked], [other[row] for row in picked], prepared.moves[index])

    valid, test = said(prepared.valid), said(prepared.test)
    folder = paths.artifacts() / "maia2"
    settings = yaml.safe_load((folder / "config.yaml").read_text(encoding="utf-8"))
    on = next(net.parameters()).device
    log(f"maia2: the published {which} model read {len(valid) + len(test):,} positions on {on.type}")
    import torch

    return Fitted(
        valid=valid,
        test=test,
        details={
            "published": {
                "package": f"maia2 {metadata.version('maia2')}",
                "model": which,
                "weights_sha256": hashlib.sha256((folder / f"{which}_model.pt").read_bytes()).hexdigest(),
                "games_from": f"{settings['start_year']}-{settings['start_month']:02d}",
                "games_to": f"{settings['end_year']}-{settings['end_month']:02d}",
            },
            "reads": [learner["player"], learner["against"]],
            "parameters": sum(parameter.numel() for parameter in net.parameters()),
            "device": torch.cuda.get_device_name(0) if on.type == "cuda" else "cpu",
            "fit_seconds": round(time.time() - started, 1),
        },
    )
