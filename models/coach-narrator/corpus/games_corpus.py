"""Wikipedia's annotated games: each move of a game's main line with the words written after it (CC BY-SA 4.0).

usage: python games_corpus.py PAGES.jsonl [PAGES.jsonl ...] OUT.parquet

Wikipedia's articles on famous games and on world championship matches write a game's main line in bold
("'''3. d4 Bg4?'''") with the commentary after it, often naming the better moves and the lines behind them.
Each bold block that carries on the game from where the last one stopped is played on a board; a block
that starts at move 1 starts a new game. The commentary up to the next block or heading becomes a row: the
position after the block, the block's last move, the moves of the game so far, the glyph the article gave
the move, and the words. Every row names its page, revision and licence for attribution.
"""

from __future__ import annotations

import json
import re
import sys

import chess
import polars as pl

import wikitext

LICENCE = "CC BY-SA 4.0"
BOLD = re.compile(r"'''(.+?)'''", re.S)
TOKEN = re.compile(r"(\d+)\s*\.(\s*\.\.\.?|\.\.)?|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?[+#]?|O-O-O|O-O|0-0-0|0-0)([!?]*)")
GLYPHS = {"!": 1, "?": 2, "!!": 3, "??": 4, "!?": 5, "?!": 6}


def block_moves(board: chess.Board, text: str) -> tuple[list[chess.Move], str] | None:
    """The moves a bold block plays from ``board``, and the glyph of its last move, when the block carries
    on from there (its first number is the next move's own); ``None`` otherwise."""
    walk = board.copy(stack=False)
    moves: list[chess.Move] = []
    glyph = ""
    started = False
    for found in TOKEN.finditer(text):
        number, dots, san, marks = found.groups()
        if number is not None:
            black = bool(dots)
            if int(number) != walk.fullmove_number or black != (walk.turn == chess.BLACK):
                return (moves, glyph) if moves else None
            started = True
            continue
        if not started:
            return None
        try:
            move = walk.parse_san(san.replace("0", "O") if san.startswith("0") else san)
        except ValueError:
            return (moves, glyph) if moves else None
        moves.append(move)
        glyph = marks
        walk.push(move)
    return (moves, glyph) if moves else None


def rows_of(page: dict) -> list[dict]:
    content = page["content"]
    url = "https://en.wikipedia.org/wiki/" + page["title"].replace(" ", "_")
    headings = [match.start() for match in re.finditer(r"^=+[^=\n]+=+\s*$", content, flags=re.M)]
    blocks = [match for match in BOLD.finditer(content) if re.match(r"\s*1?\d{0,2}\s*\.", wikitext.drop_templates(match.group(1)))]
    rows: list[dict] = []
    board = chess.Board()
    history: list[str] = []
    game = 0
    for index, block in enumerate(blocks):
        text = wikitext.drop_templates(block.group(1))
        if re.match(r"\s*1\s*\.\s*[a-hNBRQKO]", text) and board.move_stack:
            board, history, game = chess.Board(), [], game + 1
        played = block_moves(board, text)
        if played is None:
            continue
        moves, marks = played
        sans = []
        for move in moves:
            sans.append(board.san(move))
            board.push(move)
        history += sans
        end = blocks[index + 1].start() if index + 1 < len(blocks) else len(content)
        heading = next((at for at in headings if block.end() <= at < end), None)
        comment = wikitext.plain(content[block.end():heading if heading is not None else end])
        comment = re.sub(r"^\s*-\s*", "", comment).strip()
        if len(comment) < 20:
            continue
        last = board.pop()
        before = board.fen()
        board.push(last)
        rows.append({
            "key": f"wpg:{page['pageid']}:{game}:{len(board.move_stack)}",
            "source": "wikipedia-games",
            "licence": LICENCE,
            "title": page["title"],
            "url": url,
            "revid": page["revid"],
            "attribution": f"Wikipedia contributors, \"{page['title']}\", revision {page['revid']}, {LICENCE}",
            "categories": page.get("categories", []),
            "game": game,
            "ply": len(board.move_stack),
            "moves": " ".join(history),
            "fen_before": before,
            "move": last.uci(),
            "move_san": sans[-1],
            "glyph": GLYPHS.get(marks),
            "fen": board.fen(),
            "comment": comment,
        })
    return rows


def main() -> None:
    *sources, target = sys.argv[1:]
    rows = []
    pages = 0
    for source in sources:
        with open(source, encoding="utf-8") as handle:
            for raw in handle:
                pages += 1
                rows += rows_of(json.loads(raw))
    frame = pl.DataFrame(rows, infer_schema_length=None).unique(subset="key", keep="first", maintain_order=True)
    frame.write_parquet(target, compression="zstd")
    print(json.dumps({
        "pages": pages,
        "pages_with_games": frame["title"].n_unique(),
        "games": frame.select("title", "game").n_unique(),
        "annotated_moves": len(frame),
        "words": int(frame["comment"].str.split(" ").list.len().sum()),
    }, indent=2))


if __name__ == "__main__":
    main()
