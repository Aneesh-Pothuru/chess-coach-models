#!/usr/bin/env python3
import argparse
import json

from chess_coach_models.config import load_config
from chess_coach_models.maia_features import add_maia_features


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default="configs/config.yaml")
    args = parser.parse_args()
    print(json.dumps(add_maia_features(load_config(args.config)), indent=2))


if __name__ == "__main__":
    main()

