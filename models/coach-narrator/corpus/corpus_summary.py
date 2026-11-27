"""What the corpora under ``data/corpus`` hold, counted, for the card to point to: ``results/corpora.json``.

usage: python corpus_summary.py [--corpus data/corpus]

Counts only: rows, sources, licences, how many rows carry each kind of fact. No text and no position is
written, so the file can be committed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import polars as pl

from chess_coach_models import paths

HERE = Path(__file__).resolve().parent


def _rows(path: Path) -> int:
    return pl.scan_parquet(str(path)).select(pl.len()).collect().item() if path.exists() else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", default=str(paths.ROOT / "data" / "corpus"))
    args = parser.parse_args()
    corpus = Path(args.corpus)
    summary: dict = {}
    manifest = corpus / "masters" / "manifest.json"
    if manifest.exists():
        loaded = json.loads(manifest.read_text(encoding="utf-8"))
        summary["masters"] = {
            key: loaded[key]
            for key in ("source", "licence", "months", "strong", "classical_seconds_at_least", "ample_clock_seconds_at_least",
                        "counts", "copies dropped", "summary", "built")
            if key in loaded
        }
        summary["masters"]["months"] = f"{loaded['months'][0]} to {loaded['months'][-1]} ({len(loaded['months'])} files)"
        for name in ("explorer.parquet", "explorer-ample.parquet", "sample.parquet"):
            path = corpus / "masters" / name
            if path.exists():
                summary["masters"][name.removesuffix(".parquet")] = {"rows": _rows(path)}
    annotated = {}
    names = ["openings", "diagrams", "stackexchange", "games"]
    names += sorted(path.stem for path in (corpus / "annotated").glob("book-games-*.parquet"))
    for name in names:
        path = corpus / "annotated" / f"{name}.parquet"
        if not path.exists():
            continue
        frame = pl.read_parquet(path)
        entry = {"rows": len(frame), "licences": dict(frame.group_by("licence").len().sort("licence").iter_rows())}
        if "title" in frame.columns:
            entry["pages_or_questions"] = frame["title"].n_unique()
        if "fen" in frame.columns:
            entry["with_position"] = int(frame["fen"].is_not_null().sum())
        if "candidate" in frame.columns:
            entry["with_a_move_discussed"] = int(frame["candidate"].is_not_null().sum())
        if "line" in frame.columns:
            entry["with_a_line"] = int((frame["line"].list.len() > 0).sum())
        if "answers" in frame.columns:
            entry["answers"] = int(frame["answers"].list.len().sum())
        annotated[name] = entry
    summary["annotated"] = annotated
    for folder in ("engine", "maia"):
        found = {}
        for path in sorted((corpus / folder).glob("*.parquet")):
            frame = pl.read_parquet(path)
            entry = {"rows": len(frame)}
            if folder == "engine":
                entry.update(
                    engine=frame["engine"].drop_nulls().unique().to_list(),
                    nodes=frame["nodes_limit"].drop_nulls().unique().to_list(),
                    lines=frame["multipv"].drop_nulls().unique().to_list(),
                    median_depth=frame["depth"].median(),
                    played_move_first=int((frame["played_rank"] == 1).sum()) if "played_rank" in frame.columns else None,
                )
            found[path.stem] = entry
        summary[folder] = found
    moments = corpus / "coach-moments" / "moments.parquet"
    if moments.exists():
        frame = pl.read_parquet(moments)
        summary["coach-moments"] = frame.group_by("kind").agg(
            pl.len().alias("moments"),
            (pl.col("engine") != "null").sum().alias("with_engine"),
            (pl.col("maia") != "null").sum().alias("with_maia"),
            (pl.col("reference").str.len_chars() > 0).sum().alias("with_text"),
        ).sort("kind").to_dicts()
    target = HERE / "results" / "corpora.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(summary, indent=2, default=str) + "\n", encoding="utf-8")
    print(target)


if __name__ == "__main__":
    main()
