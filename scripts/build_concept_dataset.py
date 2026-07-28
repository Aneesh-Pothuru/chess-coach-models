#!/usr/bin/env python3
"""Sample the Lichess puzzle CSV stream into the concept-tagger dataset."""

from __future__ import annotations

import argparse
import io
import json
import sys
from pathlib import Path

from chess_coach_models.config import load_config
from chess_coach_models.concepts import build_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument(
        "--input", help="Decompressed puzzle CSV path; defaults to stdin."
    )
    args = parser.parse_args()
    config = load_config(args.config)
    if args.input:
        with Path(args.input).open("r", encoding="utf-8", errors="replace") as handle:
            metadata = build_dataset(handle, config)
    else:
        stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
        metadata = build_dataset(stdin, config)
    print(json.dumps({k: v for k, v in metadata.items() if k != "vocabulary"}, indent=2))


if __name__ == "__main__":
    main()
