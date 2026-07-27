from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Protocol

import chess
import chess.engine
import chess.pgn

from .bands import rating_band, representative_elo
from .config import load_config
from .engine import analyse, open_stockfish, score_cp_white
from .maia import MaiaPolicy
from .winprob import mover_loss_win_percent


class PolicyProvider(Protocol):
    def policy(self, fen: str, elo_self: int, elo_oppo: int) -> dict[str, float]: ...


def _header_elo(headers: chess.pgn.Headers, key: str, default: int = 1500) -> int:
    try:
        return int(headers.get(key, default))
    except (TypeError, ValueError):
        return default


def punishment_probability(
    policy_provider: PolicyProvider | None,
    fen_after: str,
    punishing_reply: str | None,
    opponent_elo: int,
    player_elo: int,
) -> float | None:
    if policy_provider is None or punishing_reply is None:
        return None
    policy = policy_provider.policy(fen_after, opponent_elo, player_elo)
    return float(policy.get(punishing_reply, 0.0))


def score_game(
    game: chess.pgn.Game,
    engine: chess.engine.SimpleEngine,
    config: dict[str, Any],
    policy_provider: PolicyProvider | None = None,
) -> list[dict[str, Any]]:
    board = game.board()
    candidates: list[dict[str, Any]] = []
    threshold = float(config["thresholds"]["candidate_loss_win_pct"])
    mate_cp = int(config["thresholds"]["mate_cp"])
    current = analyse(engine, board, config, multipv=1)[0]
    cp_before = score_cp_white(current["score"], mate_cp)
    headers = game.headers

    for ply, move in enumerate(game.mainline_moves(), start=1):
        mover = board.turn
        player_elo = _header_elo(
            headers, "WhiteElo" if mover == chess.WHITE else "BlackElo"
        )
        opponent_header_elo = _header_elo(
            headers,
            "BlackElo" if mover == chess.WHITE else "WhiteElo",
            player_elo,
        )
        band = rating_band(player_elo, config["rating_bands"]) or "1400-1700"
        base_elo = representative_elo(band, config["rating_bands"])
        san = board.san(move)
        fen_before = board.fen()
        board.push(move)
        after_infos = analyse(
            engine, board, config, multipv=int(config["stockfish"]["multipv"])
        )
        cp_after = score_cp_white(after_infos[0]["score"], mate_cp)
        loss = mover_loss_win_percent(cp_before, cp_after, mover)

        if loss > threshold:
            pv = after_infos[0].get("pv", [])
            reply = pv[0].uci() if pv else None
            fen_after = board.fen()
            at_band = punishment_probability(
                policy_provider, fen_after, reply, base_elo, player_elo
            )
            at_plus_200 = punishment_probability(
                policy_provider, fen_after, reply, base_elo + 200, player_elo
            )
            candidates.append(
                {
                    "ply": ply,
                    "mover": "white" if mover == chess.WHITE else "black",
                    "player_elo": player_elo,
                    "opponent_header_elo": opponent_header_elo,
                    "rating_band": band,
                    "fen_before": fen_before,
                    "move_uci": move.uci(),
                    "move_san": san,
                    "objective_cost_win_pct": round(loss, 3),
                    "punishing_reply_uci": reply,
                    "punishment_probability_at_band": (
                        round(at_band, 4) if at_band is not None else None
                    ),
                    "punishment_probability_plus_200": (
                        round(at_plus_200, 4) if at_plus_200 is not None else None
                    ),
                }
            )
        cp_before = cp_after
    return candidates


def score_pgn(
    pgn_path: str | Path,
    config: dict[str, Any],
    *,
    use_maia: bool = True,
) -> dict[str, Any]:
    path = Path(pgn_path)
    provider = MaiaPolicy(config) if use_maia and config["maia2"]["enabled"] else None
    games: list[dict[str, Any]] = []
    with open_stockfish(config) as engine, path.open(
        "r", encoding="utf-8", errors="replace"
    ) as handle:
        while game := chess.pgn.read_game(handle):
            games.append(
                {
                    "site": game.headers.get("Site"),
                    "white": game.headers.get("White"),
                    "black": game.headers.get("Black"),
                    "candidates": score_game(game, engine, config, provider),
                }
            )
    return {
        "source_pgn": str(path),
        "threshold_win_pct": config["thresholds"]["candidate_loss_win_pct"],
        "maia_enabled": provider is not None,
        "games": games,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Annotate objective mistakes by punishability.")
    parser.add_argument("pgn")
    parser.add_argument("--config", default="configs/config.yaml")
    parser.add_argument("--output", default="-")
    parser.add_argument("--no-maia", action="store_true")
    args = parser.parse_args(argv)
    result = score_pgn(args.pgn, load_config(args.config), use_maia=not args.no_maia)
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output == "-":
        print(rendered, end="")
    else:
        Path(args.output).write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
