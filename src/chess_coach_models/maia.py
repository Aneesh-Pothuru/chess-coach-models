from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import pandas as pd

from .config import project_path


class MaiaPolicy:
    """Lazy maia2 adapter so v0 workflows never download weights unnecessarily."""

    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.model = None
        self.prepared = None

    def _load(self) -> None:
        if self.model is not None:
            return
        from maia2.inference import prepare
        from maia2.model import from_pretrained

        cfg = self.config["maia2"]
        save_root = project_path(self.config, cfg["weights_dir"])
        save_root.mkdir(parents=True, exist_ok=True)
        self.model = from_pretrained(
            str(cfg.get("model_type", "rapid")),
            device=str(cfg.get("device", "auto")),
            save_root=str(save_root),
        )
        self.prepared = prepare()

    def policy(self, fen: str, elo_self: int, elo_oppo: int) -> dict[str, float]:
        self._load()
        from maia2.inference import inference_each

        move_probs, _ = inference_each(
            self.model, self.prepared, fen, int(elo_self), int(elo_oppo)
        )
        return {str(move): float(probability) for move, probability in move_probs.items()}

    def batch_policy(
        self, rows: list[dict[str, Any]], *, batch_size: int | None = None
    ) -> list[dict[str, float]]:
        if not rows:
            return []
        self._load()
        from maia2.inference import inference_batch

        frame = pd.DataFrame(rows, columns=["board", "move", "active_elo", "opponent_elo"])
        result, _ = inference_batch(
            frame,
            self.model,
            verbose=False,
            batch_size=int(batch_size or self.config["maia2"]["batch_size"]),
            num_workers=0,
        )
        return [
            {str(move): float(probability) for move, probability in policy.items()}
            for policy in result["move_probs"].tolist()
        ]


def policy_summary(
    policy: dict[str, float],
    *,
    played_move: str | None = None,
    best_move: str | None = None,
) -> dict[str, float | str | None]:
    probabilities = [max(0.0, float(value)) for value in policy.values()]
    entropy = -sum(value * math.log(value) for value in probabilities if value > 0)
    top_move = next(iter(policy), None)
    return {
        "maia_entropy": entropy,
        "maia_top1_probability": float(policy.get(top_move, 0.0)) if top_move else 0.0,
        "maia_top1_move": top_move,
        "maia_played_move_probability": (
            float(policy.get(played_move, 0.0)) if played_move else None
        ),
        "maia_stockfish_best_probability": (
            float(policy.get(best_move, 0.0)) if best_move else None
        ),
    }

