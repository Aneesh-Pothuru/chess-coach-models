"""What strong players choose in positions they reach again and again: the masters corpus as an opening
explorer.

usage: python masters_explorer.py [--corpus data/corpus/masters] [--least 5] [--ample]

Reads the corpus's positions (``masters_corpus.py``) and writes ``explorer.parquet`` beside them: for every
position strong players moved from at least ``--least`` times (a position is its placement, side to move,
castling rights and en passant square, the move counters left out), each move they chose there, how often,
its share of the position's moves, the movers' mean rating, their mean score from the game, and what the move
lost on average by Lichess's evaluation where the games have one. ``--ample`` counts only moves made with at
least ten minutes on the clock.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import polars as pl

from chess_coach_models import paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus" / "masters"))
    parser.add_argument("--least", type=int, default=5)
    parser.add_argument("--ample", action="store_true")
    args = parser.parse_args()
    corpus = Path(args.corpus)
    positions = pl.scan_parquet(str(corpus / "positions" / "*" / "part-*.parquet"))
    if args.ample:
        positions = positions.filter(pl.col("ample_clock"))
    positions = positions.with_columns(
        pl.col("fen").str.split(" ").list.slice(0, 4).list.join(" ").alias("epd")
    ).with_columns(pl.col("epd").hash(seed=7).alias("epd_hash"))
    common = (
        positions.group_by("epd_hash")
        .agg(pl.len().alias("total"))
        .filter(pl.col("total") >= args.least)
        .collect(engine="streaming")
    )
    table = (
        positions.join(common.lazy(), on="epd_hash", how="inner")
        .group_by("epd", "move")
        .agg(
            pl.len().alias("count"),
            pl.col("san").first().alias("san"),
            pl.col("total").first().alias("total"),
            pl.col("ply").median().alias("ply"),
            pl.col("mover_elo").mean().alias("mean_elo"),
            pl.col("mover_score").mean().alias("score"),
            pl.col("loss").mean().alias("loss_mean"),
            pl.col("loss").count().alias("with_evaluation"),
            pl.col("ample_clock").mean().alias("ample_share"),
            (pl.col("mover_title") == "GM").sum().alias("by_grandmasters"),
            (pl.col("mover_champion") != "").sum().alias("by_world_champions"),
        )
        .with_columns((pl.col("count") / pl.col("total")).alias("share"))
        .sort(["total", "count"], descending=True)
        .collect(engine="streaming")
    )
    name = "explorer-ample.parquet" if args.ample else "explorer.parquet"
    table.write_parquet(corpus / name, compression="zstd")
    print(json.dumps({
        "positions": table["epd"].n_unique(),
        "moves": len(table),
        "games_moves_counted": int(table["count"].sum()),
        "least": args.least,
        "ample_only": args.ample,
        "file": str(corpus / name),
    }, indent=2))


if __name__ == "__main__":
    main()
