"""A sample of the masters corpus's moves for the engine to read: the moments a coach would talk about.

usage: python masters_sample.py OUT.parquet [--positions 100000] [--per-game 3] [--corpus data/corpus/masters]

From the corpus's positions (``masters_corpus.py``) it keeps moves made with at least ten minutes on the
clock, from the 16th ply to the 100th, in positions Lichess's evaluation calls undecided (within four pawns)
and with at least ten legal moves, at most ``--per-game`` from a game, chosen by a hash of the game and the
ply, and stops at ``--positions``. A fifth of the sample is moves that lost ten points of winning chances or
more by Lichess's evaluation, so the narrator also sees strong players go wrong. The sample is the same on
any machine and a larger one holds a smaller one.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import polars as pl

from chess_coach_models import paths

SALT = "masters-sample-v1"
ERRORS = 0.2


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("target")
    parser.add_argument("--positions", type=int, default=100_000)
    parser.add_argument("--per-game", type=int, default=3)
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus" / "masters"))
    args = parser.parse_args()
    corpus = Path(args.corpus)
    pool = (
        pl.scan_parquet(str(corpus / "positions" / "*" / "part-*.parquet"))
        .filter(
            pl.col("ample_clock")
            & pl.col("ply").is_between(16, 100)
            & pl.col("eval_before").is_not_null()
            & (pl.col("eval_before").abs() <= 400)
            & pl.col("loss").is_not_null()
            & (pl.col("legal_moves") >= 10)
        )
        .with_columns(
            (pl.col("loss") >= 10).alias("error"),
            pl.concat_str([pl.lit(SALT), pl.col("game_id"), pl.col("ply").cast(pl.String)], separator=":").hash(seed=11).alias("order"),
        )
        .sort("order")
        .with_columns(pl.int_range(pl.len()).over("game_id").alias("in_game"))
        .filter(pl.col("in_game") < args.per_game)
        .select("key", "game_id", "ply", "fen", "move", "san", "mover_elo", "mover_title", "loss", "error", "order")
        .collect(engine="streaming")
    )
    errors = pool.filter(pl.col("error")).head(int(args.positions * ERRORS))
    rest = pool.filter(~pl.col("error")).head(args.positions - len(errors))
    sample = pl.concat([errors, rest]).sort("order").drop("order")
    sample.write_parquet(args.target, compression="zstd")
    print(json.dumps({
        "pool": len(pool),
        "pool_errors": int(pool["error"].sum()),
        "sample": len(sample),
        "sample_errors": int(sample["error"].sum()),
        "games": sample["game_id"].n_unique(),
        "titles": dict(sample.group_by("mover_title").len().sort("len", descending=True).iter_rows()),
    }, indent=2))


if __name__ == "__main__":
    main()
