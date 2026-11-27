"""Wikipedia's chess diagrams as positions with the words written about them (CC BY-SA 4.0).

usage: python diagrams_corpus.py PAGES.jsonl [PAGES.jsonl ...] OUT.parquet

Each ``{{Chess diagram}}`` of a page becomes a row: the position, whose move it is when the caption or
the text after the diagram says so, the moves the caption gives as a line from the position (only as far
as they are legal), the caption, the paragraph that follows the diagram, the section it sits in and the
page's categories, which name the idea (a fork, the Lucena position, the Sicilian Defence). Every row
names its page, revision and licence for attribution.
"""

from __future__ import annotations

import json
import re
import sys

import chess
import polars as pl

import wikitext

LICENCE = "CC BY-SA 4.0"
TOKEN = re.compile(r"(\d+)\s*\.(\s*\.\.\.?|\.\.)?|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?[+#]?|O-O-O|O-O|0-0-0|0-0)[!?]*")


def line_from(board: chess.Board, text: str, *, first_number: int | None = None) -> list[chess.Move]:
    """The moves a text gives from a position, read in order and kept while each is legal where it falls.

    A move number says whose move the next one is, so a text that starts at Black's move ("1...Kg8") is
    read from Black; reading stops at the first move that is not legal at its place.
    """
    walk = board.copy(stack=False)
    moves: list[chess.Move] = []
    expect_black: bool | None = None
    for found in TOKEN.finditer(text):
        number, dots, san = found.groups()
        if number is not None:
            expect_black = bool(dots)
            if not moves:
                if expect_black != (walk.turn == chess.BLACK):
                    return []
                if first_number is not None and int(number) != first_number:
                    return []
                # The diagram's own numbering is unknown: the text's first number sets it.
                walk.fullmove_number = int(number)
                continue
            # A number that is not the next move's own starts another line ("If 33.d5, ..."): stop there.
            if int(number) != walk.fullmove_number or expect_black != (walk.turn == chess.BLACK):
                break
            continue
        if san is None:
            continue
        if not moves and expect_black is None:
            continue
        try:
            move = walk.parse_san(san.replace("0", "O") if san.startswith("0") else san)
        except ValueError:
            break
        moves.append(move)
        walk.push(move)
    return moves


def replayed(placement: str, text: str) -> chess.Board | None:
    """The position a text's moves from the start of a game reach, when the diagram shows it.

    An opening's diagram is usually captioned with the moves that reach it ("1.e4 c5 2.Nf3"); played from
    the start, they give whose move it is, the castling rights and the en passant square as well.
    """
    start = re.search(r"\b1\s*\.\s*[a-hNBRQKO]", text)
    if not start:
        return None
    moves = line_from(chess.Board(), text[start.start():])
    walk = chess.Board()
    found = None
    for move in moves:
        walk.push(move)
        if walk.board_fen() == placement:
            found = walk.copy(stack=False)
    return found


def context_after(content: str, end: int) -> str:
    """The prose that follows a diagram up to the next diagram or heading, first paragraph first."""
    rest = content[end:end + 6000]
    stop = len(rest)
    for marker in ("{{Chess diagram", "{{chess diagram", "\n=="):
        at = rest.find(marker)
        if at != -1:
            stop = min(stop, at)
    text = wikitext.plain(rest[:stop])
    paragraphs = [part for part in text.split("\n\n") if len(part) > 40]
    return "\n\n".join(paragraphs[:2])


def section_at(content: str, start: int) -> str:
    headings = list(re.finditer(r"^(=+)\s*(.*?)\s*\1\s*$", content[:start], flags=re.M))
    return wikitext.plain(headings[-1].group(2)) if headings else ""


def rows_of(page: dict) -> list[dict]:
    content = page["content"]
    url = "https://en.wikipedia.org/wiki/" + page["title"].replace(" ", "_")
    rows = []
    for index, diagram in enumerate(wikitext.diagrams(content)):
        context = context_after(content, diagram.end)
        board = replayed(diagram.placement, diagram.caption) or replayed(diagram.placement, diagram.title)
        turn = board.turn if board is not None else None
        turn_from = "moves from the start" if board is not None else None
        if board is None:
            turn = wikitext.turn_from(diagram.caption)
            turn_from = "caption" if turn is not None else None
        if turn is None:
            turn = wikitext.turn_from(context[:400])
            turn_from = "text" if turn is not None else None
        if board is None:
            board = wikitext.board_of(diagram.placement, turn) if turn is not None else None
        if board is None and turn is None:
            legal = [colour for colour in (chess.WHITE, chess.BLACK) if wikitext.board_of(diagram.placement, colour)]
            if len(legal) == 1:
                turn, turn_from = legal[0], "legality"
                board = wikitext.board_of(diagram.placement, turn)
        line: list[chess.Move] = []
        sans: list[str] = []
        if board is not None:
            # A position reached from the start has its own move number, and a line from it must start there.
            numbered = board.fullmove_number if turn_from == "moves from the start" else None
            line = line_from(board, diagram.caption, first_number=numbered) or line_from(board, context[:600], first_number=numbered)
            walk = board.copy(stack=False)
            for move in line:
                sans.append(walk.san(move))
                walk.push(move)
        rows.append(
            {
                "key": f"wp:{page['pageid']}:{index}",
                "source": "wikipedia",
                "licence": LICENCE,
                "title": page["title"],
                "url": url,
                "revid": page["revid"],
                "attribution": f"Wikipedia contributors, \"{page['title']}\", revision {page['revid']}, {LICENCE}",
                "categories": page.get("categories", []),
                "section": section_at(content, diagram.start),
                "diagram": index,
                "diagram_title": diagram.title,
                "caption": diagram.caption,
                "context": context,
                "placement": diagram.placement,
                "marks": diagram.marks,
                "turn_known": turn_from,
                "fen": board.fen() if board is not None else None,
                "legal": board is not None,
                "line": [move.uci() for move in line],
                "line_san": " ".join(sans),
            }
        )
    return rows


def main() -> None:
    *sources, target = sys.argv[1:]
    rows = []
    pages = 0
    for source in sources:
        with open(source, encoding="utf-8") as handle:
            for raw in handle:
                page = json.loads(raw)
                pages += 1
                rows += rows_of(page)
    frame = pl.DataFrame(rows, infer_schema_length=None).unique(subset="key", keep="first", maintain_order=True)
    frame.write_parquet(target, compression="zstd")
    print(json.dumps({
        "pages": pages,
        "pages_with_diagrams": frame["title"].n_unique(),
        "diagrams": len(frame),
        "legal_with_turn": int(frame["legal"].sum()),
        "with_caption": int((frame["caption"].str.len_chars() > 0).sum()),
        "with_line": int((frame["line"].list.len() > 0).sum()),
        "turn_from": dict(frame.group_by("turn_known").len().iter_rows()),
    }, indent=2, default=str))


if __name__ == "__main__":
    main()
