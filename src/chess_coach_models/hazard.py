from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import chess
import chess.pgn
import joblib
import pandas as pd

from .config import load_config, project_path
from .engine import analyse, open_stockfish, score_cp_white
from .features import board_features


def _header_elo(headers: chess.pgn.Headers, key: str, default: int = 1500) -> int:
    try:
        return int(headers.get(key, default))
    except (TypeError, ValueError):
        return default


class HazardPredictor:
    def __init__(self, config: dict[str, Any], model_path: str | Path | None = None):
        self.config = config
        path = project_path(
            config, model_path or config["hazard"]["model_path"]
        )
        if not path.exists():
            raise FileNotFoundError(f"Hazard model not found: {path}. Run `make train`.")
        artifact = joblib.load(path)
        if artifact.get("include_maia"):
            raise ValueError("The product predictor currently expects the deployed v0 model.")
        self.model = artifact["model"]
        self.probability_calibrator = artifact.get("probability_calibrator")
        self.feature_names = artifact["feature_names"]
        self.bands = artifact["rating_bands"]

    def predict_board(
        self,
        board: chess.Board,
        elo: int,
        *,
        eval_cp_white: float,
    ) -> float:
        values = board_features(board, elo, eval_cp_white, self.bands)
        frame = pd.DataFrame(
            [{name: values[name] for name in self.feature_names}],
            columns=self.feature_names,
        )
        raw = float(self.model.predict_proba(frame)[0, 1])
        if self.probability_calibrator is None:
            return raw
        import math

        bounded = min(max(raw, 1e-6), 1 - 1e-6)
        logit = math.log(bounded / (1.0 - bounded))
        return float(
            self.probability_calibrator.predict_proba([[logit]])[0, 1]
        )


def hazard(
    fen: str,
    elo: int,
    *,
    config_path: str | Path = "configs/config.yaml",
    model_path: str | Path | None = None,
) -> float:
    config = load_config(config_path)
    predictor = HazardPredictor(config, model_path)
    board = chess.Board(fen)
    with open_stockfish(config) as engine:
        info = analyse(engine, board, config, multipv=1)[0]
        cp_white = score_cp_white(info["score"], int(config["thresholds"]["mate_cp"]))
    return predictor.predict_board(board, elo, eval_cp_white=cp_white)


def mine_pgn(
    pgn_path: str | Path,
    config: dict[str, Any],
    *,
    top_n: int = 20,
) -> list[dict[str, Any]]:
    predictor = HazardPredictor(config)
    positions: list[dict[str, Any]] = []
    with open_stockfish(config) as engine, Path(pgn_path).open(
        encoding="utf-8", errors="replace"
    ) as handle:
        game_index = 0
        while game := chess.pgn.read_game(handle):
            game_index += 1
            board = game.board()
            for ply, move in enumerate(game.mainline_moves(), start=1):
                mover = board.turn
                elo = _header_elo(
                    game.headers,
                    "WhiteElo" if mover == chess.WHITE else "BlackElo",
                )
                info = analyse(engine, board, config, multipv=1)[0]
                cp = score_cp_white(
                    info["score"], int(config["thresholds"]["mate_cp"])
                )
                probability = predictor.predict_board(board, elo, eval_cp_white=cp)
                positions.append(
                    {
                        "game": game_index,
                        "ply": ply,
                        "fen": board.fen(),
                        "elo": elo,
                        "played_move_uci": move.uci(),
                        "played_move_san": board.san(move),
                        "hazard_probability": round(probability, 6),
                    }
                )
                board.push(move)
    return sorted(
        positions, key=lambda row: row["hazard_probability"], reverse=True
    )[:top_n]


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Predict or mine blunder hazard.")
    parser.add_argument("--config", default="configs/config.yaml")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--fen")
    group.add_argument("--pgn")
    parser.add_argument("--elo", type=int, default=1500)
    parser.add_argument("--top-n", type=int, default=20)
    parser.add_argument("--output", default="-")
    args = parser.parse_args(argv)
    if args.fen:
        result: Any = {
            "fen": args.fen,
            "elo": args.elo,
            "hazard_probability": hazard(args.fen, args.elo, config_path=args.config),
        }
    else:
        result = mine_pgn(args.pgn, load_config(args.config), top_n=args.top_n)
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output == "-":
        print(rendered, end="")
    else:
        Path(args.output).write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
