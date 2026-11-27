"""What players at a few ratings would likely play in a table of positions, by the published Maia-2.

usage: python maia_moves.py IN.parquet OUT.parquet [--ratings 1100,1350,1700,2100] [--top 3] [--type rapid]

IN has ``key`` and ``fen`` a row. OUT has a row a position, in IN's order, with, for each rating R (both
players rated R, on Lichess's scale, which the model was trained on): ``maia_R``, its ``--top`` likeliest
moves as UCI with their chances, and ``maia_R_win``, the model's chance that the mover wins. Set beside the
moves strong players chose and the engine's lines, it says what a player at a level would probably play
instead, which is what a coach at that level has to talk about.
"""

from __future__ import annotations

import argparse
import time

import chess
import numpy as np
import polars as pl
import torch

from chess_coach_models.train.learners.maia import published

AT_ONCE = 512


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--ratings", default="1100,1350,1700,2100")
    parser.add_argument("--top", type=int, default=3)
    parser.add_argument("--type", default="rapid")
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    from maia2 import inference
    from maia2.utils import mirror_move

    torch.set_num_threads(args.threads)
    ratings = [int(value) for value in args.ratings.split(",")]
    table = pl.read_parquet(args.source, columns=["key", "fen"])

    def playable(fen: str) -> bool:
        try:
            board = chess.Board(fen)
        except ValueError:
            return False
        return board.is_valid() and any(board.legal_moves)

    # Maia-2 reads only a legal position with a move to make; any other row is given no moves.
    usable = [playable(fen) for fen in table["fen"].to_list()]
    full = table
    table = table.filter(pl.Series(usable))
    fens = table["fen"].to_list()
    net = published(args.type, "cpu")
    known, elo_dict, reverse = inference.prepare()
    started = time.time()
    columns: dict[str, list] = {}
    for rating in ratings:
        picks: list[list[dict]] = []
        wins: list[float] = []
        for start in range(0, len(fens), AT_ONCE):
            chunk = fens[start:start + AT_ONCE]
            prepared = [inference.preprocessing(fen, rating, rating, elo_dict, known) for fen in chunk]
            legal = torch.stack([one[3] for one in prepared]).bool()
            with torch.no_grad():
                logits, _, value = net(
                    torch.stack([one[0] for one in prepared]),
                    torch.tensor([one[1] for one in prepared]),
                    torch.tensor([one[2] for one in prepared]),
                )
            chances = torch.softmax(logits.double().masked_fill(~legal, float("-inf")), dim=1)
            best = torch.topk(chances, k=args.top, dim=1)
            # The network sees every position from the mover's side, so its value is the mover's.
            mover_wins = (value.double().reshape(-1) / 2 + 0.5).clamp(0, 1)
            for row, fen in enumerate(chunk):
                black = fen.split(" ")[1] == "b"
                moves = []
                for chance, index in zip(best.values[row].tolist(), best.indices[row].tolist()):
                    if not np.isfinite(chance) or chance <= 0:
                        continue
                    uci = reverse[index]
                    moves.append({"move": mirror_move(uci) if black else uci, "chance": round(chance, 4)})
                picks.append(moves)
                wins.append(round(float(mover_wins[row]), 4))
        columns[f"maia_{rating}"] = picks
        columns[f"maia_{rating}_win"] = wins
        print(f"rating {rating}: {len(fens):,} positions, {(time.time() - started) / 60:.1f} min so far", flush=True)
    out = table.select("key").with_columns([pl.Series(name, values) for name, values in columns.items()])
    out = full.select("key").join(out, on="key", how="left", maintain_order="left")
    out = out.with_columns(pl.lit(f"maia2 {args.type}").alias("maia_model"))
    out.write_parquet(args.target, compression="zstd")
    print(f"wrote {args.target}")


if __name__ == "__main__":
    main()
