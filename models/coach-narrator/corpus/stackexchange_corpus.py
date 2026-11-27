"""Chess Stack Exchange's questions about positions, with their answers (CC BY-SA 3.0 and 4.0).

usage: python stackexchange_corpus.py DUMP_DIR OUT.parquet

``DUMP_DIR`` is the site's data dump unpacked (``chess.stackexchange.com.7z`` from the Internet
Archive's ``stackexchange`` item, 2024-04): ``Posts.xml`` and ``Users.xml``. A question gives a row when it
shows at least one board and has an answer that scored at least one vote or was accepted. A board is the
site's ``[FEN "..."]`` block with the moves after it, read as far as they are legal; the row keeps each
board's start, its moves and where they lead. The texts keep their own words, with each board replaced by
a ``[board N]`` mark. Each post names its licence (the site's posts before May 2018 are CC BY-SA 3.0, later
ones 4.0), its author and its address, for attribution.
"""

from __future__ import annotations


import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

import chess
import polars as pl

BOARD = re.compile(r"\[FEN\s+\"([^\"]*)\"\]\s*(.*)", re.S)
LOOSE_FEN = re.compile(r"((?:[rnbqkpRNBQKP1-8]{1,8}/){7}[rnbqkpRNBQKP1-8]{1,8})(\s+[wb](?:\s+(?:-|[KQkq]{1,4}))?(?:\s+(?:-|[a-h][36]))?(?:\s+\d+\s+\d+)?)?")
MOVE = re.compile(r"(\d+)\s*\.(\s*\.\.\.?|\.\.)?|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?[+#]?|O-O-O|O-O)[!?]*")


class Text(HTMLParser):
    """An answer's HTML as text, with each code block that draws a board kept apart."""

    def __init__(self) -> None:
        super().__init__()
        self.out: list[str] = []
        self.code: list[str] | None = None
        self.boards: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "pre":
            self.code = []
        elif tag in ("p", "br", "li", "h1", "h2", "h3", "blockquote", "tr"):
            self.out.append("\n")
        if tag == "li":
            self.out.append("- ")

    def handle_endtag(self, tag):
        if tag == "pre" and self.code is not None:
            block = "".join(self.code)
            if "[FEN" in block:
                self.boards.append(block)
                self.out.append(f"\n[board {len(self.boards)}]\n")
            else:
                self.out.append("\n" + block + "\n")
            self.code = None
        elif tag in ("p", "blockquote"):
            self.out.append("\n")

    def handle_data(self, data):
        if self.code is not None:
            self.code.append(data)
        else:
            self.out.append(data)

    def text(self) -> str:
        lines = [" ".join(line.split()) for line in "".join(self.out).splitlines()]
        return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def read_html(body: str) -> tuple[str, list[str]]:
    parser = Text()
    parser.feed(body)
    parser.close()
    return parser.text(), parser.boards


def board_of(block: str) -> dict | None:
    found = BOARD.search(block)
    if not found:
        return None
    fen = found.group(1).strip()
    try:
        board = chess.Board(fen) if fen else chess.Board()
    except ValueError:
        return None
    start = board.fen()
    sans = []
    expect_black = None
    for token in MOVE.finditer(found.group(2)):
        number, dots, san = token.groups()
        if number is not None:
            expect_black = bool(dots)
            if expect_black != (board.turn == chess.BLACK):
                break
            if not sans:
                # A block's moves may be numbered as in the game it came from, not from the FEN's count.
                board.fullmove_number = int(number)
            elif int(number) != board.fullmove_number:
                break
            continue
        try:
            move = board.parse_san(san)
        except ValueError:
            break
        sans.append(board.san(move))
        board.push(move)
    return {"fen_start": start, "moves": " ".join(sans), "fen_end": board.fen()}


def loose_boards(text: str) -> list[dict]:
    """FENs written in a post's prose, outside the site's board blocks."""
    found = []
    for match in LOOSE_FEN.finditer(text):
        fen = match.group(1) + (match.group(2) or " w")
        parts = fen.split()
        while len(parts) < 6:
            parts.append({2: "-", 3: "-", 4: "0", 5: "1"}[len(parts)])
        try:
            board = chess.Board(" ".join(parts[:6]))
        except ValueError:
            continue
        if board.is_valid():
            found.append({"fen_start": board.fen(), "moves": "", "fen_end": board.fen()})
    return found


def main() -> None:
    dump, target = Path(sys.argv[1]), sys.argv[2]
    names = {}
    for _, element in ET.iterparse(dump / "Users.xml"):
        if element.tag == "row":
            names[element.get("Id")] = element.get("DisplayName", "")
        element.clear()
    questions: dict[str, dict] = {}
    answers: dict[str, list[dict]] = {}
    for _, element in ET.iterparse(dump / "Posts.xml"):
        if element.tag != "row":
            continue
        kind = element.get("PostTypeId")
        body = element.get("Body") or ""
        author_id = element.get("OwnerUserId") or ""
        post = {
            "id": element.get("Id"),
            "score": int(element.get("Score") or 0),
            "licence": element.get("ContentLicense") or "CC BY-SA",
            "author": names.get(author_id, element.get("OwnerDisplayName") or ""),
            "author_url": f"https://chess.stackexchange.com/users/{author_id}" if author_id else "",
            "created": element.get("CreationDate"),
        }
        text, blocks = read_html(body)
        post["text"] = text
        post["boards"] = [board for board in (board_of(block) for block in blocks) if board]
        if kind == "1":
            post.update(
                title=element.get("Title") or "",
                tags=re.findall(r"<([^>]+)>", element.get("Tags") or "") or [tag for tag in (element.get("Tags") or "").split("|") if tag],
                accepted=element.get("AcceptedAnswerId"),
            )
            if not post["boards"]:
                post["boards"] = loose_boards(text)
            questions[post["id"]] = post
        elif kind == "2":
            answers.setdefault(element.get("ParentId"), []).append(post)
        element.clear()
    rows = []
    for qid, question in questions.items():
        replies = []
        for answer in sorted(answers.get(qid, []), key=lambda post: -post["score"]):
            accepted = answer["id"] == question["accepted"]
            if answer["score"] < 1 and not accepted:
                continue
            replies.append({
                "id": answer["id"],
                "score": answer["score"],
                "accepted": accepted,
                "licence": answer["licence"],
                "author": answer["author"],
                "author_url": answer["author_url"],
                "url": f"https://chess.stackexchange.com/a/{answer['id']}",
                "text": answer["text"],
                "boards": answer["boards"],
            })
        if not question["boards"] or not replies:
            continue
        main_board = question["boards"][0]
        rows.append({
            "key": f"se:{qid}",
            "source": "chess-stackexchange",
            "licence": question["licence"],
            "url": f"https://chess.stackexchange.com/q/{qid}",
            "title": question["title"],
            "tags": question["tags"],
            "score": question["score"],
            "author": question["author"],
            "author_url": question["author_url"],
            "created": question["created"],
            "question": question["text"],
            "boards": question["boards"],
            "fen": main_board["fen_end"],
            "answers": replies,
            "attribution": f"Chess Stack Exchange, question {qid} by {question['author'] or 'a user'} and its answers' authors, {question['licence']}",
        })
    frame = pl.DataFrame(rows, infer_schema_length=None)
    frame.write_parquet(target, compression="zstd")
    print(json.dumps({
        "questions": len(questions),
        "rows": len(frame),
        "answers_kept": int(frame["answers"].list.len().sum()),
        "boards": int(frame["boards"].list.len().sum()),
        "licences": dict(frame.group_by("licence").len().iter_rows()),
    }, indent=2))


if __name__ == "__main__":
    main()
