"""Coaching moments as prompts for a narrator: the facts of a position in words, for a teacher model to
narrate and a student to learn from.

usage: python narrator_prompts.py [--moments data/corpus/coach-moments/moments.jsonl] [--rating 1350]
                                  [--out data/corpus/coach-moments/prompts.jsonl]

A prompt holds only checked facts: the game so far and the position, the move it is about and how the
engine grades it, the engine's best moves with their lines, what players at the player's rating would
likely play there (Maia-2), what the board shows (material, pieces that hang, checks, passed pawns, attacks
near each king), and, for a strong player's move, what that player chose. Grades are words, never numbers:
the engine's lost winning chances, read with Lichess's bars (10, 20 and 30 points for an inaccuracy, a
mistake and a blunder), and Maia-2's chances as how many players at the level choose the move.

A text people wrote about the position comes with the prompt as ``reference``, kept apart: it may name an
idea worth teaching, and it may also say things no fact here holds (history, a judgment of its own), so a
narration is checked against the facts and never trained on the reference as it stands.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from chess_coach_models import paths

# A move searched on its own can score a little above the engine's first line, so the last bar has no floor.
BARS = ((30, "a blunder"), (20, "a mistake"), (10, "an inaccuracy"), (3, "a playable move"), (float("-inf"), "a good move"))


def grade(loss: float | None, rank: int | None) -> str:
    if rank == 1:
        return "the engine's first choice"
    if loss is None:
        return "not graded"
    return next(word for bar, word in BARS if loss >= bar)


def how_often(chance: float) -> str:
    if chance >= 0.4:
        return "most players at this level"
    if chance >= 0.15:
        return "many players at this level"
    if chance >= 0.05:
        return "some players at this level"
    return "few players at this level"


def numbered(history: str) -> str:
    """Moves from the start of a game as SAN with their numbers: ``1. e4 e5 2. Nf3``."""
    sans = history.split()
    out = []
    for index, san in enumerate(sans):
        if index % 2 == 0:
            out.append(f"{index // 2 + 1}. {san}")
        else:
            out.append(san)
    return " ".join(out)


def board_words(features: dict) -> list[str]:
    words = []
    balance = features.get("material_imbalance", 0)
    if abs(balance) >= 1:
        words.append(f"the side to move is {'up' if balance > 0 else 'down'} about {abs(balance):g} points of material")
    else:
        words.append("material is level")
    if features.get("hanging_own"):
        words.append(f"{int(features['hanging_own'])} of the mover's pieces can be taken for less than they are worth or stand undefended under attack")
    if features.get("hanging_opponent"):
        words.append(f"{int(features['hanging_opponent'])} of the opponent's pieces can be taken for less than they are worth or stand undefended under attack")
    if features.get("legal_checks"):
        words.append(f"the mover has {int(features['legal_checks'])} checking moves")
    if features.get("passed_pawns_own") or features.get("passed_pawns_opponent"):
        words.append(f"passed pawns: the mover {int(features.get('passed_pawns_own', 0))}, the opponent {int(features.get('passed_pawns_opponent', 0))}")
    words.append(f"attacks on the squares around the kings: the mover's king {int(features.get('attackers_near_own_king', 0))}, the opponent's {int(features.get('attackers_near_opponent_king', 0))}")
    return words


def prompt_of(moment: dict, rating: int) -> dict | None:
    engine = moment.get("engine")
    if not engine or not engine.get("best"):
        return None
    side = "White" if moment["fen"].split()[1] == "w" else "Black"
    lines = [
        f"You coach a chess player rated about {rating}. Use only the facts below, and say nothing about the position they do not hold.",
        "",
    ]
    if moment.get("history"):
        lines.append(f"Game so far: {numbered(moment['history'])}")
    lines.append(f"Position (FEN): {moment['fen']}")
    lines.append(f"{side} to move.")
    if moment.get("move_san"):
        who = "A strong player chose" if moment["kind"] == "masters" else "The move discussed is"
        rank = engine.get("move_rank")
        lines.append(f"{who} {moment['move_san']}: {grade(engine.get('move_loss'), rank)}.")
        if engine.get("move_line") and rank != 1:
            lines.append(f"  After it the engine expects: {engine['move_line']}")
    lines.append("The engine's best moves:")
    for index, line in enumerate(engine["best"], start=1):
        lines.append(f"  {index}. {line['move']}, line {line['line']}")
    maia = (moment.get("maia") or {}).get(str(rating)) or (moment.get("maia") or {}).get("1350")
    if maia:
        likely = "; ".join(f"{pick['move']} ({how_often(pick['chance'])})" for pick in maia)
        lines.append(f"What players at this level would likely play: {likely}.")
    for other in engine.get("others", []) or []:
        lines.append(f"  If a player here chose {other['move']}, the engine expects: {other['line']}")
    lines.append("On the board: " + "; ".join(board_words(moment.get("features") or {})) + ".")
    lines.append("")
    lines.append("In two to four sentences, tell the player what is good to do here and why, in plain words for their level.")
    return {
        "key": moment["key"],
        "kind": moment["kind"],
        "rating": rating,
        "prompt": "\n".join(lines),
        "reference": moment.get("reference") or "",
        "source": moment["source"],
        "licence": moment["licence"],
        "attribution": moment.get("attribution", ""),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    corpus = paths.ROOT / "data" / "corpus" / "coach-moments"
    parser.add_argument("--moments", default=str(corpus / "moments.jsonl"))
    parser.add_argument("--rating", type=int, default=1350)
    parser.add_argument("--out", default=str(corpus / "prompts.jsonl"))
    args = parser.parse_args()
    written = skipped = 0
    with open(args.moments, encoding="utf-8") as source, Path(args.out).open("w", encoding="utf-8") as target:
        for raw in source:
            prompt = prompt_of(json.loads(raw), args.rating)
            if prompt is None:
                skipped += 1
                continue
            target.write(json.dumps(prompt, ensure_ascii=False) + "\n")
            written += 1
    print(json.dumps({"prompts": written, "without_engine_lines": skipped, "out": args.out}, indent=2))


if __name__ == "__main__":
    main()
