"""The app's own lessons as concepts and boards: the words the narrator should coach in.

usage: python concepts_corpus.py [--app ~/chess-lab/chess-main] [--out private/coach-narrator/concepts]

The app teaches its ideas in its own words, lesson by lesson (``study-videos/lessons/<slug>/article.json``
in the app's repository). This reads every lesson and writes, under ``--out``:

- ``concepts.parquet``: every glossary term with its definition and the lessons that define it, and the
  lesson's tags;
- ``boards.parquet``: every diagram of a lesson with its caption, the paragraphs that follow it up to the
  next diagram, the section's questions with their answers and its takeaways, the position (whose move it
  is when the words or the rules say so), and the lesson's tags as the concepts the board shows;
- ``points.parquet``: each lesson's objectives and takeaways, the shortest statements of what it teaches.

The app's repository is private, so the output goes under ``private/`` and is never committed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import chess
import polars as pl

import wikitext
from chess_coach_models import paths


def boards_of(lesson: dict, meta: dict) -> list[dict]:
    rows = []
    for section_index, section in enumerate(lesson.get("sections", [])):
        blocks = section.get("blocks", [])
        questions = [f"{block['prompt']} {block['answer']}" for block in blocks if block.get("kind") == "question"]
        takeaways = [block["text"] for block in blocks if block.get("kind") == "takeaway"]
        for index, block in enumerate(blocks):
            if block.get("kind") != "diagram" or not block.get("placement"):
                continue
            following = []
            for later in blocks[index + 1:]:
                if later.get("kind") == "diagram":
                    break
                if later.get("kind") == "text":
                    following.append(later["text"])
            caption = block.get("caption", "")
            words = " ".join([caption, *following])
            turn = wikitext.turn_from(words)
            how = "words" if turn is not None else None
            board = wikitext.board_of(block["placement"], turn) if turn is not None else None
            if board is None:
                legal = [colour for colour in (chess.WHITE, chess.BLACK) if wikitext.board_of(block["placement"], colour)]
                if len(legal) == 1:
                    board, how = wikitext.board_of(block["placement"], legal[0]), "rules"
                elif turn is None and block.get("orientation") in ("white", "black") and legal:
                    # A board drawn from one side is usually that side's move in these lessons.
                    side = chess.WHITE if block["orientation"] == "white" else chess.BLACK
                    board, how = (wikitext.board_of(block["placement"], side), "orientation") if side in legal else (None, None)
            rows.append({
                "key": f"app:{meta['id']}:{section_index}:{index}",
                "lesson": meta["id"],
                "title": meta["title"],
                "section": section.get("heading", ""),
                "tags": lesson.get("tags", []),
                "placement": block["placement"],
                "orientation": block.get("orientation"),
                "turn_from": how,
                "fen": board.fen() if board is not None else None,
                "caption": caption,
                "text": "\n\n".join(following),
                "questions": questions,
                "takeaways": takeaways,
            })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--app", default=str(Path.home() / "chess-lab" / "chess-main"))
    parser.add_argument("--out", default=str(paths.ROOT / "private" / "coach-narrator" / "concepts"))
    args = parser.parse_args()
    lessons_dir = Path(args.app) / "study-videos" / "lessons"
    terms: dict[str, dict] = {}
    boards: list[dict] = []
    points: list[dict] = []
    for article_path in sorted(lessons_dir.glob("*/article.json")):
        lesson = json.loads(article_path.read_text(encoding="utf-8"))
        meta_path = article_path.with_name("lesson.json")
        meta_raw = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
        meta = {"id": lesson.get("id") or meta_raw.get("id") or article_path.parent.name,
                "title": meta_raw.get("displayTitle") or meta_raw.get("title") or article_path.parent.name}
        for entry in lesson.get("glossary", []):
            term = entry["term"].strip()
            found = terms.setdefault(term.lower(), {"term": term, "definitions": [], "lessons": [], "tags": set()})
            if entry["definition"] not in found["definitions"]:
                found["definitions"].append(entry["definition"])
            found["lessons"].append(meta["id"])
            found["tags"].update(lesson.get("tags", []))
        for kind in ("objectives", "takeaways"):
            for text in lesson.get(kind, []):
                points.append({"lesson": meta["id"], "title": meta["title"], "kind": kind[:-1], "text": text,
                               "tags": lesson.get("tags", [])})
        boards += boards_of(lesson, meta)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    concepts = pl.DataFrame([{**entry, "tags": sorted(entry["tags"])} for entry in terms.values()])
    concepts.write_parquet(out / "concepts.parquet", compression="zstd")
    pl.DataFrame(boards, infer_schema_length=None).write_parquet(out / "boards.parquet", compression="zstd")
    pl.DataFrame(points).write_parquet(out / "points.parquet", compression="zstd")
    frame = pl.DataFrame(boards, infer_schema_length=None)
    print(json.dumps({
        "lessons": len({row["lesson"] for row in boards}),
        "terms": len(concepts),
        "boards": len(frame),
        "boards_with_position": int(frame["fen"].is_not_null().sum()),
        "points": len(points),
        "out": str(out),
    }, indent=2))


if __name__ == "__main__":
    main()
