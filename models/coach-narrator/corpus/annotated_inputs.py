"""The positions of the annotated corpora in one table, for the engine and Maia-2 to read.

usage: python annotated_inputs.py [--corpus data/corpus] OUT.parquet

A row a position, keyed as its corpus keys it, with the move its text is about when there is one: the reply
a Wikibooks section discusses, the first move of a Wikipedia diagram's line, the move a Wikipedia game's
commentary follows (read in the position before it, so the engine says what the move gave away). A Stack
Exchange question's board has no move of its own.
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
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus"))
    args = parser.parse_args()
    annotated = Path(args.corpus) / "annotated"
    parts = []
    if (annotated / "openings.parquet").exists():
        parts.append(pl.read_parquet(annotated / "openings.parquet").select("key", "fen", pl.col("candidate").alias("move"), pl.lit("openings").alias("corpus")))
    if (annotated / "diagrams.parquet").exists():
        parts.append(
            pl.read_parquet(annotated / "diagrams.parquet")
            .filter(pl.col("legal"))
            .select("key", "fen", pl.col("line").list.first().alias("move"), pl.lit("diagrams").alias("corpus"))
        )
    if (annotated / "games.parquet").exists():
        parts.append(pl.read_parquet(annotated / "games.parquet").select("key", pl.col("fen_before").alias("fen"), "move", pl.lit("games").alias("corpus")))
    if (annotated / "stackexchange.parquet").exists():
        parts.append(pl.read_parquet(annotated / "stackexchange.parquet").select("key", "fen", pl.lit(None, dtype=pl.String).alias("move"), pl.lit("stackexchange").alias("corpus")))
    table = pl.concat(parts, how="vertical_relaxed").filter(pl.col("fen").is_not_null()).unique(subset="key", keep="first", maintain_order=True)
    table.write_parquet(args.target, compression="zstd")
    print(json.dumps(dict(table.group_by("corpus").len().sort("corpus").iter_rows()), indent=2))


if __name__ == "__main__":
    main()
