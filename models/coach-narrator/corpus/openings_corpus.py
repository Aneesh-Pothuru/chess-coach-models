"""Wikibooks' chess opening theory as positions with what the book says about them (CC BY-SA 4.0).

usage: python openings_corpus.py PAGES.jsonl OUT.parquet

``wiki_fetch.py`` gives the pages. A page of the book is named by the moves that reach its position
("Chess Opening Theory/1. e4/1...e5/2. Nf3"), so each page becomes a position: the moves as SAN, the
position before the last move and after it, the opening's name and ECO code from the page's header, and
the page's prose cut into its sections. A section whose heading or first words name a reply from this
position ("3...a6, the Morphy defence") is kept with that move, so a row can say why a candidate move is
played. Every row names its page, revision and licence for attribution.
"""

from __future__ import annotations

import json
import re
import sys

import chess
import polars as pl

import wikitext

LICENCE = "CC BY-SA 4.0"
PREFIX = "Chess Opening Theory/"
SKIP_SECTIONS = re.compile(r"^(references|theory table|statistics|further reading|external links|see also|notes|sources|bibliography|footnotes|all possible replies|replies)$", re.I)
SEGMENT = re.compile(r"^\s*(\d+)\s*\.(\.\.)?\s*(?:\.\.\.)?\s*(\S+)\s*$")
MOVE_IN_TEXT = re.compile(r"\b(\d+)\s*\.(\s*\.\.\.?|\.\.)?\s*([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|O-O-O|O-O)")


def moves_of(title: str) -> list[str] | None:
    if not title.startswith(PREFIX):
        return None
    sans = []
    for segment in title[len(PREFIX):].split("/"):
        found = SEGMENT.match(segment)
        if not found:
            return None
        sans.append(found.group(3))
    return sans or None


def header(content: str) -> dict:
    for start, end in wikitext.templates(content):
        chunk = content[start:end]
        if wikitext.template_name(chunk).startswith("chess opening theory/position"):
            args = wikitext.split_args(chunk[2:-2])
            named = {}
            unnamed = []
            for arg in args[1:]:
                key, equals, value = arg.partition("=")
                if equals and re.fullmatch(r"\s*[a-z_]+\s*", key):
                    named[key.strip()] = value
                else:
                    unnamed.append(arg)
            return {
                "name": wikitext.plain(unnamed[0]) if unnamed else "",
                "eco": wikitext.plain(named.get("eco", "")),
            }
    return {"name": "", "eco": ""}


def first_move(text: str, board: chess.Board) -> chess.Move | None:
    """The first move written in a text that is legal in the position, by its number and side."""
    for found in MOVE_IN_TEXT.finditer(text[:300]):
        number, dots, san = int(found.group(1)), found.group(2), found.group(3)
        black = bool(dots)
        if number != board.fullmove_number or black != (board.turn == chess.BLACK):
            continue
        try:
            return board.parse_san(san)
        except ValueError:
            continue
    return None


def rows_of(page: dict) -> list[dict]:
    sans = moves_of(page["title"])
    if not sans:
        return []
    board = chess.Board()
    played = []
    try:
        for san in sans:
            move = board.parse_san(san)
            played.append(move)
            board.push(move)
    except ValueError:
        return []
    before = board.copy()
    before.pop()
    meta = header(page["content"])
    prose = wikitext.plain(page["content"])
    url = "https://en.wikibooks.org/wiki/" + page["title"].replace(" ", "_")
    base = {
        "source": "wikibooks-opening-theory",
        "licence": LICENCE,
        "title": page["title"],
        "url": url,
        "revid": page["revid"],
        "attribution": f"Wikibooks contributors, \"{page['title']}\", revision {page['revid']}, {LICENCE}",
        "moves": " ".join(sans),
        "ply": len(sans),
        "opening": meta["name"],
        "eco": meta["eco"],
        "fen_before": before.fen(),
        "last_move": played[-1].uci(),
        "last_san": sans[-1],
        "fen": board.fen(),
    }
    rows = []
    for heading, text in wikitext.sections(prose):
        if SKIP_SECTIONS.match(heading.strip()) or len(text) < 40:
            continue
        reply = first_move(heading + " " + text, board)
        rows.append(
            {
                **base,
                "section": heading,
                "text": text,
                "candidate": reply.uci() if reply else None,
                "candidate_san": board.san(reply) if reply else None,
            }
        )
    return rows


def main() -> None:
    source, target = sys.argv[1], sys.argv[2]
    rows = []
    pages = 0
    with open(source, encoding="utf-8") as handle:
        for line in handle:
            page = json.loads(line)
            pages += 1
            rows += rows_of(page)
    frame = pl.DataFrame(rows, infer_schema_length=None)
    frame = frame.with_row_index("row").with_columns(
        pl.format("wb:{}:{}", pl.col("ply"), pl.col("row")).alias("key")
    ).drop("row")
    frame.write_parquet(target, compression="zstd")
    print(json.dumps({
        "pages": pages,
        "pages_with_rows": frame["title"].n_unique(),
        "rows": len(frame),
        "rows_with_candidate": int(frame["candidate"].is_not_null().sum()),
        "words": int(frame["text"].str.split(" ").list.len().sum()),
        "max_ply": int(frame["ply"].max()),
    }, indent=2))


if __name__ == "__main__":
    main()
