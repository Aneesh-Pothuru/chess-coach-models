#!/usr/bin/env python3
"""Tag a position with concept probabilities from the trained tagger."""

from __future__ import annotations

import argparse
import json

from chess_coach_models.concepts import concepts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fen", required=True)
    parser.add_argument("--top-n", type=int, default=8)
    parser.add_argument("--config", default="configs/config.yaml")
    args = parser.parse_args()
    from chess_coach_models.config import load_config

    probabilities = concepts(args.fen, load_config(args.config))
    top = dict(list(probabilities.items())[: args.top_n])
    print(json.dumps(top, indent=2))


if __name__ == "__main__":
    main()
