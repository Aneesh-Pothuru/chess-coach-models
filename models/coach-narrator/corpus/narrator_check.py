"""Deterministic truth checker for general PGN+FEN coaching narrations.

Checks a narration against the checked ``facts`` emitted by ``narrator_prompts.py``:
- Every SAN move named must appear in the checked facts' moves.
- Every board square named must appear in the checked facts' squares or moves.
- Every piece-on-square claim ("knight on f3", "their rook on d8") must hold in at least one
  walked position of the moment's lines (verified with python-chess).
- Every forcedness claim ("forced", "must", "only move") must refer to a reply marked
  ``forced: "only legal move"`` (never ``answers_the_check`` or ``forced: false``).
- Every tactic named must appear in the checked facts, and when placed on a specific move,
  must match that move's ply.
- Every check or mate claim must match a check (``+``/``#``) or mate (``#``) in the facts.
- Exchange costs in ``wins X for Y`` outcomes must not be omitted.
- Raw engine scores, centipawns, and win percentages are forbidden.
- Markdown headings/lists and excessive length (> 120 words) are rejected.

usage:
    python narrator_check.py --prompts prompts.jsonl --texts texts.jsonl [--out checked.jsonl]
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import chess

SAN = re.compile(r"(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?")
SQUARE = re.compile(r"\b[a-h][1-8]\b")
PIECE_ON = re.compile(r"\b(king|queen|rook|bishop|knight|pawn)\s+(?:on|at)\s+([a-h][1-8])\b", re.I)
FORCED = re.compile(
    r"\b(?:forced|forces|forcing|must|has to|have to|only (?:legal )?(?:move|answer|response|reply)|"
    r"no (?:other )?choice|because (?:it is|it's|of the) (?:a )?check)\b",
    re.I,
)
RAW_SCORE = re.compile(r"(?:[+-]\d+\.\d+|\b\d+\s*(?:cp|centipawns?)\b|\b\d{1,3}(?:\.\d+)?\s*%)", re.I)
MARKDOWN = re.compile(r"(?:^|\n)\s*(?:#{1,6}\s|[-*]\s|\d+\.\s)|\*\*")

TACTIC_PATTERNS = {
    "fork": re.compile(r"\bfork(?:s|ed|ing)?\b", re.I),
    "pin": re.compile(r"\bpin(?:s|ned|ning)?\b", re.I),
    "skewer": re.compile(r"\bskewer(?:s|ed|ing)?\b", re.I),
    "discovered": re.compile(r"\bdiscovered\s+(?:attack|check)\b", re.I),
    "trapped": re.compile(r"\btrapped\b", re.I),
    "sacrifice": re.compile(r"\bsacrific(?:e|es|ed|ing)\b", re.I),
    "deflection": re.compile(r"\bdeflect(?:s|ed|ing|ion)?\b", re.I),
    "decoy": re.compile(r"\b(?:decoy|decoys|lure|lures|lured|luring|attraction)\b", re.I),
    "doubleCheck": re.compile(r"\bdouble[- ]check(?:s)?\b", re.I),
    "smothered": re.compile(r"\bsmother(?:s|ed|ing)?\b", re.I),
    "backRank": re.compile(r"\bback[- ]rank\b", re.I),
    "promotion": re.compile(r"\bpromot(?:e|es|ed|ing|ion)\b", re.I),
    "removingTheDefender": re.compile(r"\bremov(?:e|es|ed|ing) the defender\b", re.I),
    "intermezzo": re.compile(r"\b(?:intermezzo|zwischenzug)\b", re.I),
}
LATER = re.compile(
    r"\b(?:sets? up|setting up|leads? to|led to|leading to|prepares?|preparing|allows?|allowed|allowing|"
    r"threat(?:s|en|ens|ened)?|for (?:a|the)|into (?:a|the)|with (?:a|the)|so that|then|next|after that|"
    r"later|eventually|will|opens? up|paves?|a line (?:where|in which))\b",
    re.I,
)
BACK = re.compile(r"^(?:this|that|it|which|the move|the check|the capture|the sacrifice)\b", re.I)
EXCHANGE_IN_FACTS = re.compile(r"\b(?:wins?|winning|gains?)\s+([^.,;]+?)\s+for\s+([^.,;]+)", re.I)
COST_WORDS = re.compile(r"\b(?:for|cost(?:s|ing)?|gives? up|giving up|sacrific(?:e|es|ed|ing)|trad(?:e|es|ed|ing)|exchang(?:e|es|ed|ing)|in return for)\b", re.I)
PIECE_WORDS = ("queen", "rook", "bishop", "knight", "pawn", "exchange")
PIECE_NAME_TO_TYPE = {
    "pawn": chess.PAWN,
    "knight": chess.KNIGHT,
    "bishop": chess.BISHOP,
    "rook": chess.ROOK,
    "queen": chess.QUEEN,
    "king": chess.KING,
}


def _bare(san: str) -> str:
    return san.rstrip("+#!?")


def _all_stories(facts: dict[str, Any]) -> list[dict[str, Any]]:
    stories = []
    for s in facts.get("best_lines") or []:
        stories.append(s)
    if facts.get("played_line"):
        stories.append(facts["played_line"])
    for s in facts.get("other_lines") or []:
        stories.append(s)
    return stories


def _walked_piece_squares(facts: dict[str, Any]) -> set[tuple[str, str]]:
    """All ``(piece_name, square_name)`` pairs that exist in the start board or along any checked line."""
    seen: set[tuple[str, str]] = set()
    fen = facts.get("fen")
    if not fen:
        return seen

    def record(board: chess.Board) -> None:
        for sq in chess.SQUARES:
            p = board.piece_at(sq)
            if p is not None:
                name = chess.piece_name(p.piece_type)
                seen.add((name, chess.square_name(sq)))

    start = chess.Board(fen)
    record(start)
    for story in _all_stories(facts):
        b = chess.Board(fen)
        line = story.get("line") or []
        # played_line may start after move_discussed; try pushing move_discussed if first SAN isn't legal from fen.
        if line:
            try:
                b.parse_san(line[0]["move"])
            except ValueError:
                md = facts.get("move_discussed")
                if md:
                    try:
                        b.push_san(md)
                        record(b)
                    except ValueError:
                        continue
        for ply in line:
            try:
                b.push_san(ply["move"])
                record(b)
            except ValueError:
                break
    return seen


def check_narration(text: str, prompt_row: dict[str, Any], *, max_words: int = 120) -> list[str]:
    """Return a list of factual/formatting misses (empty list means pass)."""
    text = (text or "").strip()
    if not text:
        return ["empty narration"]

    misses: list[str] = []
    words = text.split()
    if len(words) > max_words:
        misses.append(f"too long ({len(words)} words > {max_words})")
    if RAW_SCORE.search(text):
        misses.append("leaks raw engine score or percentage")
    if MARKDOWN.search(text):
        misses.append("contains markdown formatting or list")

    facts = prompt_row.get("facts") or {}
    facts_text = json.dumps(facts)
    facts_low = facts_text.lower()
    low = text.lower()

    allowed_moves: set[str] = set()
    allowed_squares: set[str] = set()
    replies: dict[str, dict[str, Any]] = {}
    tactic_places: dict[str, dict[str, set[str]]] = {}
    has_check = False
    has_mate = False
    endings: list[str] = []

    if facts.get("move_discussed"):
        allowed_moves.add(_bare(facts["move_discussed"]))
    for m in facts.get("maia") or []:
        if m.get("move"):
            allowed_moves.add(_bare(m["move"]))
    for h in facts.get("hanging") or []:
        if h.get("square"):
            allowed_squares.add(h["square"])

    for story in _all_stories(facts):
        if story.get("move"):
            allowed_moves.add(_bare(story["move"]))
        if isinstance(story.get("how_it_ends"), str):
            endings.append(story["how_it_ends"])
        for ply in story.get("line") or []:
            mv = ply.get("move", "")
            bmv = _bare(mv)
            if bmv:
                allowed_moves.add(bmv)
            for key in ("from", "to"):
                if ply.get(key):
                    allowed_squares.add(ply[key])
            if ply.get("check") or "+" in mv:
                has_check = True
            if ply.get("mate") or "#" in mv:
                has_mate = True
                has_check = True
            if "forced" in ply or "answers_the_check" in ply:
                is_forced = isinstance(ply.get("forced"), str) and ply["forced"].startswith("only legal")
                replies[bmv] = {"forced": is_forced, "to": ply.get("to")}
            for tac_text in ply.get("tactic") or []:
                for sq in SQUARE.findall(tac_text):
                    allowed_squares.add(sq)
                for tname, pat in TACTIC_PATTERNS.items():
                    if pat.search(tac_text):
                        slot = tactic_places.setdefault(tname, {"moves": set(), "squares": set()})
                        slot["moves"].add(bmv)
                        if ply.get("to"):
                            slot["squares"].add(ply["to"])

    for mv in list(allowed_moves):
        for sq in SQUARE.findall(mv):
            allowed_squares.add(sq)

    # 1. Moves and squares must appear in the checked facts.
    bad_moves = sorted({m for m in SAN.findall(text) if _bare(m) not in allowed_moves})
    if bad_moves:
        misses.append(f"names move(s) not in facts: {', '.join(bad_moves)}")
    bad_squares = sorted({sq for sq in SQUARE.findall(text) if sq not in allowed_squares})
    if bad_squares:
        misses.append(f"names square(s) not in facts: {', '.join(bad_squares)}")

    # 2. Piece-on-square claims verified against walked python-chess boards.
    valid_pieces = _walked_piece_squares(facts)
    if valid_pieces:
        for match in PIECE_ON.finditer(text):
            piece_word, sq = match.group(1).lower(), match.group(2).lower()
            if (piece_word, sq) not in valid_pieces:
                misses.append(f"places {piece_word} on {sq} which never stands there in the checked lines")

    # 3. Forcedness claims must match a reply marked 'only legal move'.
    any_forced = any(r["forced"] for r in replies.values())
    if FORCED.search(text) and not any_forced:
        misses.append("calls a reply forced where the facts force none")
    else:
        for sentence in re.split(r"(?<=[.!?])\s+", text):
            before: list[str] = []
            for clause in re.split(r",|;|\band\b|\bbut\b", sentence):
                named = [_bare(m) for m in SAN.findall(clause)]
                squares = SQUARE.findall(clause)
                moves = named or (before if re.match(r"\s*(?:which|that|it)\b", clause, re.I) else [])
                if FORCED.search(clause):
                    hits = [m for m, r in replies.items() if m in moves or (r["to"] and r["to"] in squares)]
                    if hits and not any(replies[m]["forced"] for m in hits):
                        misses.append(f"calls unforced reply forced: {', '.join(hits)}")
                if named:
                    before = named

    # 4. Tactics named must appear in facts and (when attached to a move) match its ply.
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for tname, pat in TACTIC_PATTERNS.items():
        if not pat.search(text):
            continue
        if tname not in tactic_places and not pat.search(facts_low):
            misses.append(f"names {tname} not present in facts")
            continue
        if tname in tactic_places:
            slot = tactic_places[tname]
            for idx, sentence in enumerate(sentences):
                if LATER.search(sentence) or not pat.search(sentence):
                    continue
                named = [_bare(m) for m in SAN.findall(sentence)]
                if not named:
                    continue
                prev = sentences[idx - 1] if idx > 0 else ""
                moves = named + ([_bare(m) for m in SAN.findall(prev)] if BACK.match(sentence.strip()) else [])
                sqs = SQUARE.findall(sentence)
                if not (any(m in slot["moves"] for m in moves) or any(q in slot["squares"] for q in sqs)):
                    misses.append(f"places {tname} on {', '.join(named)} instead of {', '.join(sorted(slot['moves']))}")

    # 5. Check and mate claims.
    if re.search(r"\bmate\b|checkmate", low) and not has_mate and "mate" not in facts_low:
        misses.append("names a mate not present in facts")
    if re.search(r"\bchecks?\b", low) and not has_check:
        misses.append("names a check not present in facts")

    # 6. Exchange-cost omission check.
    for ending in endings:
        for match in EXCHANGE_IN_FACTS.finditer(ending):
            gained, cost = match.group(1).lower(), match.group(2).lower()
            gained_pieces = [pw for pw in PIECE_WORDS if pw in gained]
            cost_pieces = [pw for pw in PIECE_WORDS if pw in cost]
            if not gained_pieces or not cost_pieces:
                continue
            claimed = any(re.search(rf"\b(?:wins?|winning|gains?)\b[^.!?]{{0,35}}\b{pw}s?\b", low) for pw in gained_pieces)
            if claimed and not COST_WORDS.search(low) and not any(re.search(rf"\b{pw}s?\b", low) for pw in cost_pieces):
                misses.append(f"claims winning {gained.strip()} while omitting exchange cost ({cost.strip()})")

    return misses


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prompts", required=True)
    parser.add_argument("--texts", required=True)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    prompts = {row["key"]: row for row in _read_jsonl(Path(args.prompts))}
    texts = _read_jsonl(Path(args.texts))
    checked = []
    passed = 0
    for row in texts:
        key = row.get("key") or row.get("id")
        prompt = prompts.get(key)
        if prompt is None:
            continue
        misses = check_narration(row.get("text", ""), prompt)
        ok = len(misses) == 0
        passed += int(ok)
        checked.append({"key": key, "pass": ok, "misses": misses})
    if args.out:
        Path(args.out).write_text("".join(json.dumps(r) + "\n" for r in checked), encoding="utf-8")
    rate = round(passed / len(checked), 4) if checked else 0.0
    print(json.dumps({"checked": len(checked), "passed": passed, "pass_rate": rate}, indent=2))


if __name__ == "__main__":
    main()
