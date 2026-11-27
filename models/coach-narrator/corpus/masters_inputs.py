"""The masters sample as the engine's input: each strong player's move, with the move a club player would
most likely have played there for the engine to weigh too.

usage: python masters_inputs.py OUT.parquet [--rating 1350] [--first N] [--corpus data/corpus]

Reads ``masters/sample.parquet`` and ``maia/masters.parquet`` (``maia_moves.py`` on the sample) and writes
``key``, ``fen``, ``move`` (the strong player's move) and ``also`` (Maia-2's likeliest move at the rating, when
it is another move). ``--first`` keeps the sample's first N rows, which a larger run holds as well.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import polars as pl

from chess_coach_models import paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target")
    parser.add_argument("--rating", type=int, default=1350)
    parser.add_argument("--first", type=int)
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus"))
    args = parser.parse_args()
    corpus = Path(args.corpus)
    sample = pl.read_parquet(corpus / "masters" / "sample.parquet", columns=["key", "fen", "move"])
    if args.first:
        sample = sample.head(args.first)
    column = f"maia_{args.rating}"
    maia = pl.read_parquet(corpus / "maia" / "masters.parquet", columns=["key", column])
    table = sample.join(maia, on="key", how="left").with_columns(
        pl.col(column).list.first().struct.field("move").alias("likely")
    ).with_columns(
        pl.when(pl.col("likely").is_not_null() & (pl.col("likely") != pl.col("move")))
        .then(pl.concat_list([pl.col("likely")]))
        .otherwise(pl.lit([], dtype=pl.List(pl.String)))
        .alias("also")
    ).select("key", "fen", "move", "also")
    table.write_parquet(args.target, compression="zstd")
    print(json.dumps({"rows": len(table), "with_another_likely_move": int((table["also"].list.len() > 0).sum())}, indent=2))


if __name__ == "__main__":
    main()
