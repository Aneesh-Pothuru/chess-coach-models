#!/usr/bin/env python3
import argparse
import json

from chess_coach_models.config import load_config
from chess_coach_models.hazard_training import train_hazard


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--with-maia", action="store_true")
    parser.add_argument(
        "--input", default=None, help="Defaults to eval_positions[_maia].parquet"
    )
    args = parser.parse_args()
    input_path = args.input
    if args.with_maia and input_path is None:
        input_path = "data/processed/eval_positions_maia.parquet"
    metrics = train_hazard(
        load_config(args.config), include_maia=args.with_maia, input_path=input_path
    )
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()

