"""Wikitext as plain prose, and the chess diagrams it holds as positions.

Only what the narrator's corpora need: templates are dropped except the few that carry words a reader
sees (a glossary term, a no-break span), links keep their visible text, references, tables, files and
categories go, and headings stay as ``## heading`` lines so a page can be cut into sections.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

import chess

# Templates whose last unnamed argument is text a reader sees in the sentence.
INLINE = {"chessgloss", "nowrap", "nobr", "small", "lang", "em", "strong", "i", "b", "chessgloss2", "anchor_text",
          "transl", "notatypo", "sic", "nobold", "noitalic", "abbr", "ill", "chess", "chesspunc", "chessmove"}
# Templates that stand for a piece in running text: {{wk}} is a white king, {{bn}} a black knight, ...
PIECE_WORDS = {"k": "king", "q": "queen", "r": "rook", "b": "bishop", "n": "knight", "p": "pawn"}
DIAGRAM_NAMES = ("chess diagram", "chess diagram small", "chessboard", "chess position")


def templates(text: str) -> list[tuple[int, int]]:
    """The spans of the outermost ``{{...}}`` of a text, nesting counted."""
    spans = []
    depth = 0
    start = 0
    index = 0
    while index < len(text) - 1:
        pair = text[index:index + 2]
        if pair == "{{":
            if depth == 0:
                start = index
            depth += 1
            index += 2
            continue
        if pair == "}}" and depth:
            depth -= 1
            index += 2
            if depth == 0:
                spans.append((start, index))
            continue
        index += 1
    return spans


def split_args(body: str) -> list[str]:
    """A template's arguments, split on the ``|`` that are not inside a nested template or link."""
    parts, depth, current = [], 0, []
    index = 0
    while index < len(body):
        pair = body[index:index + 2]
        if pair in ("{{", "[["):
            depth += 1
            current.append(pair)
            index += 2
            continue
        if pair in ("}}", "]]") and depth:
            depth -= 1
            current.append(pair)
            index += 2
            continue
        if body[index] == "|" and depth == 0:
            parts.append("".join(current))
            current = []
        else:
            current.append(body[index])
        index += 1
    parts.append("".join(current))
    return parts


def template_name(span_text: str) -> str:
    return split_args(span_text[2:-2])[0].strip().lower().replace("_", " ")


def _inline(span_text: str) -> str:
    args = split_args(span_text[2:-2])
    name = args[0].strip().lower()
    if len(name) == 2 and name[0] in "wb" and name[1] in PIECE_WORDS:
        return ("white " if name[0] == "w" else "black ") + PIECE_WORDS[name[1]]
    if name in INLINE:
        unnamed = [arg for arg in args[1:] if "=" not in arg.split("|")[0][:20]]
        return unnamed[-1].strip() if unnamed else ""
    if name in ("pad", "spaces", "nbsp", "sp"):
        return " "
    return ""


def drop_templates(text: str) -> str:
    out = []
    last = 0
    for start, end in templates(text):
        out.append(text[last:start])
        out.append(drop_templates(_inline(text[start:end])))
        last = end
    out.append(text[last:])
    return "".join(out)


def plain(text: str) -> str:
    """Wikitext as prose a reader sees, with ``## heading`` lines for its headings."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>/]*/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    text = re.sub(r"\{\|.*?\|\}", "", text, flags=re.S)
    text = re.sub(r"<(gallery|math|syntaxhighlight|score|timeline|imagemap)[^>]*>.*?</\1>", "", text, flags=re.S)
    text = drop_templates(text)
    text = re.sub(r"\[\[(?:File|Image|Category|Media):[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]", "", text, flags=re.I)
    text = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[(?:https?:)?//[^\s\]]+\s+([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[(?:https?:)?//[^\s\]]+\]", "", text)
    text = re.sub(r"'{2,}", "", text)
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</?[a-zA-Z][^>]*>", "", text)
    text = re.sub(r"^(=+)\s*(.*?)\s*\1\s*$", lambda match: f"\n\x00{match.group(2).strip()}\n", text, flags=re.M)
    text = re.sub(r"^[*#:;]+\s*", "- ", text, flags=re.M)
    text = text.replace("\x00", "## ")
    text = text.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—").replace("&minus;", "−")
    lines = [" ".join(line.split()) for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if not line or line == "-":
            if out and out[-1] != "":
                out.append("")
            continue
        out.append(line)
    return "\n".join(out).strip()


def sections(prose: str) -> list[tuple[str, str]]:
    """The ``## heading`` sections of prose from ``plain``, the text before the first one under ''."""
    found: list[tuple[str, str]] = []
    heading = ""
    body: list[str] = []
    for line in prose.splitlines():
        if line.startswith("## "):
            found.append((heading, "\n".join(body).strip()))
            heading, body = line[3:].strip(), []
        else:
            body.append(line)
    found.append((heading, "\n".join(body).strip()))
    return [(heading, text) for heading, text in found if text]


@dataclass
class Diagram:
    start: int
    end: int
    placement: str
    title: str
    caption: str
    marks: int


def diagrams(text: str) -> list[Diagram]:
    """The 8x8 chess diagrams of a page: the placement as the first field of a FEN, the diagram's title
    and caption as prose, and how many of its squares carry a mark (a cross, a dot, an arrow) rather
    than a piece or nothing."""
    found = []
    for start, end in templates(text):
        chunk = text[start:end]
        name = template_name(chunk)
        if name not in ("chess diagram", "chess diagram small"):
            continue
        args = split_args(chunk[2:-2])
        unnamed = [arg for arg in args[1:] if not re.match(r"^\s*[a-z_]+\s*=", arg)]
        if len(unnamed) < 66:
            continue
        squares = [cell.strip() for cell in unnamed[2:66]]
        caption = "|".join(unnamed[66:]).strip()
        rows = []
        marks = 0
        for rank in range(8):
            row, empty = "", 0
            for cell in squares[rank * 8:(rank + 1) * 8]:
                if len(cell) == 2 and cell[0] in "kqrbnp" and cell[1] in "ld":
                    if empty:
                        row += str(empty)
                        empty = 0
                    row += cell[0].upper() if cell[1] == "l" else cell[0]
                else:
                    if cell:
                        marks += 1
                    empty += 1
            if empty:
                row += str(empty)
            rows.append(row)
        found.append(Diagram(start, end, "/".join(rows), plain(unnamed[1]), plain(caption), marks))
    return found


TURN_RE = [
    (re.compile(r"\bwhite (?:to (?:move|play)|moves|plays|is to move|on move)\b", re.I), chess.WHITE),
    (re.compile(r"\bblack (?:to (?:move|play)|moves|plays|is to move|on move)\b", re.I), chess.BLACK),
]


def turn_from(caption: str) -> bool | None:
    """Whose move a caption says it is, or ``None`` when it does not say."""
    hits = {colour for pattern, colour in TURN_RE if pattern.search(caption)}
    if len(hits) == 1:
        return hits.pop()
    after = re.search(r"\b(?:after|following)\s+(\d+)\s*\.(\.\.)?\s*(?:\.\.\.)?\s*([KQRBNO][^\s,;.]*|[a-h][^\s,;.]*)", caption, re.I)
    if after:
        black_moved = bool(after.group(2)) or "..." in caption[after.start():after.end()]
        return chess.WHITE if black_moved else chess.BLACK
    return None


def board_of(placement: str, turn: bool) -> chess.Board | None:
    """A position from a diagram's placement, with castling rights where king and rook stand on their
    first squares, or ``None`` when it is not a legal position with that side to move."""
    try:
        board = chess.Board(f"{placement} {'w' if turn == chess.WHITE else 'b'} - - 0 1")
    except ValueError:
        return None
    rights = ""
    if board.piece_at(chess.E1) == chess.Piece(chess.KING, chess.WHITE):
        rights += "K" if board.piece_at(chess.H1) == chess.Piece(chess.ROOK, chess.WHITE) else ""
        rights += "Q" if board.piece_at(chess.A1) == chess.Piece(chess.ROOK, chess.WHITE) else ""
    if board.piece_at(chess.E8) == chess.Piece(chess.KING, chess.BLACK):
        rights += "k" if board.piece_at(chess.H8) == chess.Piece(chess.ROOK, chess.BLACK) else ""
        rights += "q" if board.piece_at(chess.A8) == chess.Piece(chess.ROOK, chess.BLACK) else ""
    board.set_castling_fen(rights or "-")
    return board if board.is_valid() else None
