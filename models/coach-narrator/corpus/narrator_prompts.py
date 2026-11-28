"""Coaching moments as structured, verifiable prompts for a general PGN+FEN narrator.

usage: python narrator_prompts.py [--moments data/corpus/coach-moments/moments.jsonl] [--rating 1350]
                                  [--out data/corpus/coach-moments/prompts.jsonl]

A prompt holds only checked facts — never unverified prose or raw engine scores:
- the game so far and current position (FEN);
- exact hanging pieces by piece name and square (computed deterministically with python-chess);
- the move discussed (or strong player's choice) and its word grade (never centipawns);
- each engine line (best moves, played-move refutation, Maia-2 likely moves) walked ply-by-ply:
  exact piece moved/captured, exact reply forcedness (``only legal move`` vs ``answers the check,
  not forced`` vs ``not forced``), deterministic ply-linked tactics (fork, pin, skewer, discovered
  check, double check, back-rank mate, smothered mate, promotion), and settled material exchange
  with explicit exchange cost (e.g. ``wins two rooks for a queen``).

A text people wrote about the position stays apart as ``reference`` and is never used as a training
target. Every row preserves ``source``, ``licence``, and ``attribution``.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import chess

from chess_coach_models import paths

# A move searched on its own can score a little above the engine's first line, so the last bar has no floor.
BARS = ((30, "a blunder"), (20, "a mistake"), (10, "an inaccuracy"), (3, "a playable move"), (float("-inf"), "a good move"))

PIECE_NAMES = {
    chess.PAWN: "pawn",
    chess.KNIGHT: "knight",
    chess.BISHOP: "bishop",
    chess.ROOK: "rook",
    chess.QUEEN: "queen",
    chess.KING: "king",
}
PIECE_VALUES = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 100,
}


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


def _side_word(color: chess.Color) -> str:
    return "White" if color == chess.WHITE else "Black"


def hanging_pieces(board: chess.Board) -> list[dict[str, str]]:
    """Deterministically list pieces on ``board`` that stand undefended under attack or attacked by a lesser piece."""
    out: list[dict[str, str]] = []
    for sq in chess.SQUARES:
        piece = board.piece_at(sq)
        if piece is None or piece.piece_type == chess.KING:
            continue
        attackers = board.attackers(not piece.color, sq)
        if not attackers:
            continue
        defenders = board.attackers(piece.color, sq)
        min_atk = min(PIECE_VALUES[board.piece_at(a).piece_type] for a in attackers if board.piece_at(a) is not None)
        sq_name = chess.square_name(sq)
        p_name = PIECE_NAMES[piece.piece_type]
        if not defenders:
            out.append(
                {
                    "side": _side_word(piece.color),
                    "piece": p_name,
                    "square": sq_name,
                    "reason": "undefended and attacked",
                }
            )
        elif min_atk < PIECE_VALUES[piece.piece_type]:
            out.append(
                {
                    "side": _side_word(piece.color),
                    "piece": p_name,
                    "square": sq_name,
                    "reason": "attacked by a lesser piece",
                }
            )
    return out


def _ray_pin_or_skewer(board: chess.Board, mover: chess.Color, from_sq: int, piece_type: int) -> list[str]:
    """Check rays from ``from_sq`` for a direct pin or skewer against ``not mover``."""
    if piece_type not in (chess.BISHOP, chess.ROOK, chess.QUEEN):
        return []
    dirs: list[tuple[int, int]] = []
    if piece_type in (chess.BISHOP, chess.QUEEN):
        dirs += [(1, 1), (1, -1), (-1, 1), (-1, -1)]
    if piece_type in (chess.ROOK, chess.QUEEN):
        dirs += [(1, 0), (-1, 0), (0, 1), (0, -1)]
    f0, r0 = chess.square_file(from_sq), chess.square_rank(from_sq)
    found: list[str] = []
    enemy = not mover
    for df, dr in dirs:
        f, r = f0 + df, r0 + dr
        first: tuple[int, chess.Piece] | None = None
        second: tuple[int, chess.Piece] | None = None
        while 0 <= f < 8 and 0 <= r < 8:
            sq = chess.square(f, r)
            p = board.piece_at(sq)
            if p is not None:
                if first is None:
                    if p.color != enemy:
                        break
                    first = (sq, p)
                else:
                    if p.color == enemy:
                        second = (sq, p)
                    break
            f += df
            r += dr
        if first is None or second is None:
            continue
        sq1, p1 = first
        sq2, p2 = second
        v1, v2 = PIECE_VALUES[p1.piece_type], PIECE_VALUES[p2.piece_type]
        if v1 < v2 and (p2.piece_type == chess.KING or v2 >= 5):
            found.append(f"pin: pins the {PIECE_NAMES[p1.piece_type]} on {chess.square_name(sq1)} to the {PIECE_NAMES[p2.piece_type]} on {chess.square_name(sq2)}")
        elif v1 > v2 and (p1.piece_type == chess.KING or v1 >= 5) and v2 >= 3:
            found.append(f"skewer: skewers the {PIECE_NAMES[p1.piece_type]} on {chess.square_name(sq1)} to the {PIECE_NAMES[p2.piece_type]} on {chess.square_name(sq2)}")
    return found


def _ply_tactics(board_before: chess.Board, board_after: chess.Board, move: chess.Move, mover: chess.Color) -> list[str]:
    """Deterministic board-code tactics carried out by ``move``."""
    tactics: list[str] = []
    moved = board_after.piece_at(move.to_square)
    if moved is None:
        return tactics
    enemy = not mover
    if move.promotion is not None:
        tactics.append(f"promotion: promotes to a {PIECE_NAMES[move.promotion]} on {chess.square_name(move.to_square)}")
    checkers = board_after.checkers()
    if len(checkers) >= 2:
        tactics.append("double check")
    elif len(checkers) == 1 and move.to_square not in checkers:
        tactics.append("discovered check")
    # Fork: moved piece attacks >= 2 valuable or undefended enemy targets.
    if moved.piece_type != chess.KING:
        targets = []
        moved_val = PIECE_VALUES[moved.piece_type]
        for sq in board_after.attacks(move.to_square):
            target = board_after.piece_at(sq)
            if target is None or target.color != enemy:
                continue
            t_val = PIECE_VALUES[target.piece_type]
            if target.piece_type == chess.KING or t_val > moved_val or (t_val >= 3 and not board_after.attackers(enemy, sq)):
                targets.append(f"{PIECE_NAMES[target.piece_type]} on {chess.square_name(sq)}")
        if len(targets) >= 2:
            tactics.append(f"fork: forks the {targets[0]} and {targets[1]}")
    # Direct pin / skewer by sliders.
    tactics.extend(_ray_pin_or_skewer(board_after, mover, move.to_square, moved.piece_type))
    # Mate patterns on checkmate.
    if board_after.is_checkmate():
        ek_sq = board_after.king(enemy)
        if ek_sq is not None:
            ek_rank = chess.square_rank(ek_sq)
            back_rank = 7 if enemy == chess.BLACK else 0
            shield_rank = 6 if enemy == chess.BLACK else 1
            if moved.piece_type == chess.KNIGHT:
                adj = [s for s in board_after.attacks(ek_sq)]
                if adj and all((board_after.piece_at(s) is not None and board_after.piece_at(s).color == enemy) for s in adj):
                    tactics.append("smothered mate")
            elif moved.piece_type in (chess.ROOK, chess.QUEEN) and ek_rank == back_rank and chess.square_rank(move.to_square) == back_rank:
                ef = chess.square_file(ek_sq)
                front = [chess.square(f, shield_rank) for f in range(max(0, ef - 1), min(7, ef + 1) + 1)]
                if front and all((board_after.piece_at(s) is not None and board_after.piece_at(s).color == enemy and board_after.piece_at(s).piece_type == chess.PAWN) for s in front):
                    tactics.append("back-rank mate")
    return tactics


def _format_pieces(pieces: list[str]) -> str:
    if not pieces:
        return ""
    counts = Counter(pieces)
    order = ("queen", "rook", "bishop", "knight", "pawn")
    parts = []
    for name in order:
        c = counts.get(name, 0)
        if c == 1:
            parts.append(f"a {name}")
        elif c == 2:
            parts.append(f"two {name}s")
        elif c > 2:
            parts.append(f"{c} {name}s")
    return " and ".join(parts)


def _settled_outcome(gained: list[str], lost: list[str], ends_in_mate: bool, mate_by_starter: bool) -> str:
    """Explicit settled material summary that always preserves exchange costs."""
    if ends_in_mate:
        return "delivers checkmate" if mate_by_starter else "allows checkmate"
    g_cnt, l_cnt = Counter(gained), Counter(lost)
    # Cancel identical piece trades so "Q for Q" cancels while "two rooks for a queen" stays explicit!
    net_g: list[str] = []
    net_l: list[str] = []
    for p in ("queen", "rook", "bishop", "knight", "pawn"):
        common = min(g_cnt[p], l_cnt[p])
        net_g.extend([p] * (g_cnt[p] - common))
        net_l.extend([p] * (l_cnt[p] - common))
    if not net_g and not net_l:
        if gained:
            return f"trades {_format_pieces(gained)}"
        return "no net material change"
    if net_g and not net_l:
        return f"wins {_format_pieces(net_g)}"
    if net_l and not net_g:
        return f"loses {_format_pieces(net_l)}"
    g_val = sum(PIECE_VALUES[getattr(chess, p.upper())] for p in net_g)
    l_val = sum(PIECE_VALUES[getattr(chess, p.upper())] for p in net_l)
    if g_val >= l_val:
        return f"wins {_format_pieces(net_g)} for {_format_pieces(net_l)}"
    return f"gives up {_format_pieces(net_l)} for {_format_pieces(net_g)}"


def walk_line_facts(fen: str, line_str: str, *, max_plies: int = 6) -> dict[str, Any]:
    """Play out a SAN engine line in python-chess and return deterministic, checked ply facts."""
    board = chess.Board(fen)
    starter = board.turn
    tokens = [tok for tok in line_str.split() if tok and not tok.endswith(".")]
    plies: list[dict[str, Any]] = []
    gained: list[str] = []
    lost: list[str] = []
    ends_in_mate = False
    mate_by_starter = False

    for idx, tok in enumerate(tokens[:max_plies]):
        try:
            move = board.parse_san(tok)
        except ValueError:
            break
        san = board.san(move)
        mover = board.turn
        legal_count = board.legal_moves.count()
        was_in_check = board.is_check()
        captured_piece = None
        if board.is_capture(move):
            if board.is_en_passant(move):
                captured_piece = "pawn"
            else:
                cap = board.piece_at(move.to_square)
                captured_piece = PIECE_NAMES[cap.piece_type] if cap is not None else None
        moved_piece = PIECE_NAMES[board.piece_at(move.from_square).piece_type]
        board_before = board.copy(stack=False)
        board.push(move)
        tactics = _ply_tactics(board_before, board, move, mover)
        if captured_piece:
            if mover == starter:
                gained.append(captured_piece)
            else:
                lost.append(captured_piece)

        entry: dict[str, Any] = {
            "ply": idx + 1,
            "by": _side_word(mover),
            "move": san,
            "piece": moved_piece,
            "from": chess.square_name(move.from_square),
            "to": chess.square_name(move.to_square),
        }
        if captured_piece:
            entry["captures"] = captured_piece
        if board.is_checkmate():
            entry["mate"] = True
            ends_in_mate = True
            mate_by_starter = mover == starter
        elif board.is_check():
            entry["check"] = True
        if idx > 0 and mover != starter:
            if legal_count == 1:
                entry["forced"] = "only legal move"
            elif was_in_check:
                entry["answers_the_check"] = f"one of {legal_count} legal answers, not forced"
            else:
                entry["forced"] = False
        if tactics:
            entry["tactic"] = tactics
        plies.append(entry)
        if ends_in_mate:
            break

    return {
        "line": plies,
        "how_it_ends": _settled_outcome(gained, lost, ends_in_mate, mate_by_starter),
    }


def _describe_line(story: dict[str, Any]) -> str:
    parts = []
    for p in story["line"]:
        bits = [p["move"]]
        if p.get("forced") and isinstance(p["forced"], str):
            bits.append(f"({p['forced']})")
        elif p.get("answers_the_check"):
            bits.append(f"({p['answers_the_check']})")
        if p.get("captures"):
            bits.append(f"captures {p['captures']}")
        if p.get("tactic"):
            bits.append("; ".join(p["tactic"]))
        parts.append(" ".join(bits))
    joined = " -> ".join(parts)
    return f"{joined} [{story['how_it_ends']}]" if joined else ""


def board_words(features: dict, board: chess.Board | None = None) -> list[str]:
    words = []
    balance = features.get("material_imbalance", 0)
    if abs(balance) >= 1:
        words.append(f"the side to move is {'up' if balance > 0 else 'down'} about {abs(balance):g} points of material")
    else:
        words.append("material is level")
    if board is not None:
        hang = hanging_pieces(board)
        if hang:
            desc = ", ".join(f"{h['side']}'s {h['piece']} on {h['square']} ({h['reason']})" for h in hang)
            words.append(f"hanging or loose pieces: {desc}")
    else:
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
    fen = moment["fen"]
    board = chess.Board(fen)
    side = _side_word(board.turn)
    hanging = hanging_pieces(board)

    best_stories = []
    for line in engine["best"]:
        story = walk_line_facts(fen, line["line"])
        best_stories.append({"move": line["move"], **story})

    played_story = None
    if moment.get("move_san") and engine.get("move_line") and engine.get("move_rank") != 1:
        # engine["move_line"] may start with move_san or with the opponent's reply after move_san.
        toks = engine["move_line"].split()
        if toks and toks[0].rstrip("+#") == moment["move_san"].rstrip("+#"):
            played_story = walk_line_facts(fen, engine["move_line"])
        else:
            after = board.copy(stack=False)
            try:
                after.push_san(moment["move_san"])
                played_story = walk_line_facts(after.fen(), engine["move_line"])
            except ValueError:
                played_story = None

    other_stories = []
    for other in engine.get("others", []) or []:
        toks = (other.get("line") or "").split()
        if toks and toks[0].rstrip("+#") == other["move"].rstrip("+#"):
            story = walk_line_facts(fen, other["line"])
        else:
            story = walk_line_facts(fen, f"{other['move']} {other.get('line', '')}".strip())
        other_stories.append({"move": other["move"], **story})

    lines = [
        f"You coach a chess player rated about {rating}. Use ONLY the checked facts below. "
        "Name only moves, squares, pieces, checks, mates, and tactics present in the facts. "
        "Call a reply forced ONLY when marked 'only legal move'; never call a reply marked 'not forced' forced. "
        "If a line wins material at a cost ('wins X for Y'), state both what is won and what is given up. "
        "Never quote engine scores, centipawns, or percentages, and do not use markdown or bullet lists.",
        "",
    ]
    if moment.get("history"):
        lines.append(f"Game so far: {numbered(moment['history'])}")
    lines.append(f"Position (FEN): {fen}")
    lines.append(f"{side} to move.")
    if moment.get("move_san"):
        who = "A strong player chose" if moment["kind"] == "masters" else "The move discussed is"
        rank = engine.get("move_rank")
        lines.append(f"{who} {moment['move_san']}: {grade(engine.get('move_loss'), rank)}.")
        if played_story and played_story["line"]:
            lines.append(f"  After it: {_describe_line(played_story)}")
    lines.append("The engine's best moves (checked move by move):")
    for index, story in enumerate(best_stories, start=1):
        lines.append(f"  {index}. {story['move']}: {_describe_line(story)}")
    maia = (moment.get("maia") or {}).get(str(rating)) or (moment.get("maia") or {}).get("1350")
    if maia:
        likely = "; ".join(f"{pick['move']} ({how_often(pick['chance'])})" for pick in maia)
        lines.append(f"What players at this level would likely play: {likely}.")
    for story in other_stories:
        if story["line"]:
            lines.append(f"  If a player chose {story['move']}: {_describe_line(story)}")
    lines.append("On the board: " + "; ".join(board_words(moment.get("features") or {}, board)) + ".")
    lines.append("")
    lines.append("In two to four plain sentences, tell the player what is good to do here and why, at their level.")

    facts = {
        "fen": fen,
        "side_to_move": side,
        "rating": rating,
        "move_discussed": moment.get("move_san"),
        "grade": grade(engine.get("move_loss"), engine.get("move_rank")) if moment.get("move_san") else None,
        "hanging": hanging,
        "best_lines": best_stories,
        "played_line": played_story,
        "other_lines": other_stories,
        "maia": maia or [],
    }
    prompt_text = "\n".join(lines)
    system_prompt = (
        "You are a chess coach explaining a position to a club player. "
        "Use only the checked facts given in the prompt. Never invent moves, squares, pieces, checks, "
        "mates, or tactics. Call a reply forced only when marked 'only legal move'. State exchange costs "
        "whenever material is traded. Write two to four plain sentences with no markdown or engine numbers."
    )
    return {
        "id": moment["key"],
        "key": moment["key"],
        "kind": moment["kind"],
        "rating": rating,
        "prompt": prompt_text,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt_text},
        ],
        "facts": facts,
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
