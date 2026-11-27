"""Annotated games from public-domain chess books: each move of a game with the author's words after it.

usage: python book_games_corpus.py BOOK.txt OUT.parquet --book-name NAME --source URL --licence TEXT

Old books (Project Gutenberg's, for one) print a game as numbered rows of moves in descriptive notation,
White's in one column and Black's in the other, with the author's notes between the rows:

            6. B × B                  Q × B
            7. B - Q 3

    P × P is preferable for reasons that we shall soon see.

            7. ........               Kt × Kt

Each game that starts at move 1 is played on a board (``descriptive.py``) until a move cannot be read.
Descriptive notation is not always exact ("B - R 4" when either bishop could go to a rook's fourth): a
move that fits more than one legal move is first narrowed to those after which the game's next printed
moves can still be read, and if that leaves more than one, Stockfish chooses among them, as a reader
would choose the sensible move; such a move is marked. The notes between two rows become a row: the
position after the last move read, that move, the game's moves so far as SAN, and the note as printed,
which keeps the book's notation. The game's heading and players are kept with it.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil

import chess
import chess.engine
import polars as pl

from descriptive import Reader, matches

ROW = re.compile(r"^\s{3,}(\d+)\.\s+(\.{3,}|\S.*?)(?:\s{3,}(\S.*?))?\s*$")
PAGE = re.compile(r"\{\d+\}")
HEADING = re.compile(r"^(GAME\s+\d+\..*|EXAMPLE\s+\d+.*)$")
PLAYERS = re.compile(r"White:\s*(.+?)\.\s*Black:\s*(.+?)\.?\s*$")
LOOKAHEAD = 8


def scan(text: str) -> list[dict]:
    """The book's games as printed: each a heading, the players and a list of moves and notes in order."""
    found: list[dict] = []
    current: dict | None = None
    heading, players = "", ("", "")
    for raw in PAGE.sub("", text).splitlines():
        line = raw.replace("[Illustration]", "").rstrip()
        if HEADING.match(line.strip()):
            heading, players, current = line.strip(), ("", ""), None
            continue
        who = PLAYERS.search(line)
        if who:
            players = (who.group(1).strip(), who.group(2).strip())
        row = ROW.match(line)
        if row and (re.search(r"[A-Z]", row.group(2)) or row.group(2).startswith("...")):
            number, white, black = int(row.group(1)), row.group(2), row.group(3)
            if number == 1 and not white.startswith("..."):
                current = {"heading": heading, "white": players[0], "black": players[1], "items": []}
                found.append(current)
            if current is None:
                continue
            if not white.startswith("..."):
                current["items"].append({"kind": "move", "number": number, "colour": chess.WHITE, "text": white})
            if black:
                current["items"].append({"kind": "move", "number": number, "colour": chess.BLACK, "text": black.split("  ")[0]})
            continue
        if current is not None:
            current["items"].append({"kind": "note", "text": line.strip()})
    return found


def _reads_on(reader: Reader, moves: list[dict]) -> int:
    """How many of the next printed moves can be read in turn after a candidate, taking the first fit."""
    count = 0
    for item in moves[:LOOKAHEAD]:
        if reader.board.fullmove_number != item["number"] or reader.board.turn != item["colour"]:
            break
        found = matches(reader.board, reader.origin, item["text"])
        if not found:
            break
        reader.push(found[0])
        count += 1
    return count


def _clone(reader: Reader) -> Reader:
    copy = Reader()
    copy.board = reader.board.copy()
    copy.origin = dict(reader.origin)
    return copy


def play(game: dict, engine: chess.engine.SimpleEngine) -> list[dict]:
    """The game's moves read from the start, each with the notes printed after it, until one cannot be read."""
    reader = Reader()
    moves: list[dict] = []
    printed = [item for item in game["items"] if item["kind"] == "move"]
    position = 0
    for item in game["items"]:
        if item["kind"] == "note":
            if moves:
                moves[-1]["note"].append(item["text"])
            continue
        position += 1
        if reader.board.fullmove_number != item["number"] or reader.board.turn != item["colour"]:
            break
        found = matches(reader.board, reader.origin, item["text"])
        chosen_by = "notation"
        if len(found) > 1:
            later = printed[position:]
            reach = {move: _reads_on(_clone_with(reader, move), later) for move in found}
            best = max(reach.values())
            found = [move for move in found if reach[move] == best]
            chosen_by = "the moves after it"
            if len(found) > 1:
                info = engine.analyse(reader.board, chess.engine.Limit(nodes=200_000), multipv=len(found), root_moves=found)
                found = [info[0]["pv"][0]]
                chosen_by = "the engine"
        if len(found) != 1:
            break
        move = found[0]
        before = reader.board.fen()
        san = reader.board.san(move)
        reader.push(move)
        moves.append({"text": item["text"], "move": move.uci(), "san": san, "fen_before": before,
                      "fen": reader.board.fen(), "note": [], "read_by": chosen_by})
    return moves


def _clone_with(reader: Reader, move: chess.Move) -> Reader:
    copy = _clone(reader)
    copy.push(move)
    return copy


def note_text(lines: list[str]) -> str:
    paragraphs, current = [], []
    for line in lines:
        if line:
            current.append(line)
        elif current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    return "\n\n".join(" ".join(paragraph.split()) for paragraph in paragraphs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("book")
    parser.add_argument("target")
    parser.add_argument("--book-name", required=True)
    parser.add_argument("--source", required=True)
    parser.add_argument("--licence", required=True)
    parser.add_argument("--encoding", default="utf-8")
    args = parser.parse_args()
    text = open(args.book, encoding=args.encoding, errors="replace").read()
    engine = chess.engine.SimpleEngine.popen_uci(shutil.which("stockfish") or "stockfish")
    rows, report = [], []
    try:
        for index, game in enumerate(scan(text)):
            moves = play(game, engine)
            printed = sum(item["kind"] == "move" for item in game["items"])
            if len(moves) < 6:
                continue
            report.append({"heading": game["heading"][:60], "printed": printed, "read": len(moves),
                           "by_engine": sum(move["read_by"] == "the engine" for move in moves)})
            sans: list[str] = []
            for ply, move in enumerate(moves, start=1):
                sans.append(move["san"])
                note = note_text(move["note"])
                if not note:
                    continue
                rows.append({
                    "key": f"pd:{args.book_name}:{index}:{ply}",
                    "source": "public-domain-book",
                    "licence": args.licence,
                    "title": args.book_name,
                    "url": args.source,
                    "attribution": f"{args.book_name} ({args.source}), {args.licence}",
                    "game": index,
                    "heading": game["heading"],
                    "white": game["white"],
                    "black": game["black"],
                    "ply": ply,
                    "moves": " ".join(sans),
                    "fen_before": move["fen_before"],
                    "move": move["move"],
                    "move_san": move["san"],
                    "move_as_printed": move["text"],
                    "read_by": move["read_by"],
                    "fen": move["fen"],
                    "comment": note,
                    "notation": "descriptive",
                })
    finally:
        engine.quit()
    pl.DataFrame(rows, infer_schema_length=None).write_parquet(args.target, compression="zstd")
    print(json.dumps({"games": len(report), "moves_printed": sum(r["printed"] for r in report),
                      "moves_read": sum(r["read"] for r in report), "annotated_moves": len(rows),
                      "chosen_by_engine": sum(r["by_engine"] for r in report), "per_game": report}, indent=1))


if __name__ == "__main__":
    main()
