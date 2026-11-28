"""Tests for coach-narrator truth filters and general PGN+FEN structured prompt/check/SFT pipeline."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import chess

ROOT = Path(__file__).resolve().parents[1]
COACH_EVAL = ROOT / "models" / "coach-narrator" / "coach-eval"
CORPUS = ROOT / "models" / "coach-narrator" / "corpus"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


narrate_sft = _load("narrate_sft", COACH_EVAL / "narrate_sft.py")
sys.path.insert(0, str(CORPUS))
narrator_prompts = _load("narrator_prompts", CORPUS / "narrator_prompts.py")
narrator_check = _load("narrator_check", CORPUS / "narrator_check.py")
narrator_sft = _load("narrator_sft", CORPUS / "narrator_sft.py")


def _sample_setup_facts() -> str:
    payload = {
        "you_play": "White",
        "your_opponent_plays": "Black",
        "player_rating": 1350,
        "move_played": "Bg5",
        "the_better_line": {
            "move": "Rxe8+",
            "line": [
                {"move": "Rxe8+", "by": "you"},
                {"move": "Qxe8", "by": "they", "forced": "only legal move"},
                {"move": "Nf6+", "by": "you", "tactic": ["fork: forks the king on g8 and queen on e8"]},
                {"move": "Kg7", "by": "they", "answers_the_check": "one of 2 legal answers, not forced"},
                {"move": "Nxe8+", "by": "you"},
            ],
            "the_point": ["fork: Nf6+ forks the king and queen"],
            "how_it_ends": "wins a queen for a rook",
        },
    }
    return "Facts:\n" + json.dumps(payload)


def test_narrate_sft_tactic_parity_misplaced_and_exchange_cost():
    facts = _sample_setup_facts()
    # Valid narration mentioning forced reply, fork on Nf6+, and explicit exchange cost.
    good = "Rxe8+ forces Qxe8, and then Nf6+ forks the king and queen to win the queen for a rook."
    assert narrate_sft.why_dropped(good, facts) is None

    # Calls unforced Kg7 forced -> dropped.
    bad_unforced = "Rxe8+ forces Qxe8, then Nf6+ forces Kg7 to win the queen for a rook."
    assert narrate_sft.why_dropped(bad_unforced, facts) == "calls a reply forced that the facts do not force"

    # Names unsupported deflection / decoy / trapped / intermezzo -> dropped.
    for word in ("deflects the queen", "a decoy on e8", "leaves the rook trapped", "plays an intermezzo"):
        bad = f"Rxe8+ {word}, and after Qxe8, Nf6+ wins the queen for a rook."
        assert narrate_sft.why_dropped(bad, facts) is not None

    # Places fork on the wrong move (Rxe8+ instead of Nf6+) -> dropped.
    bad_place = "Rxe8+ forks the king and queen. After Qxe8, Nf6+ wins the queen for a rook."
    assert "misplaces a tactic" in narrate_sft.why_dropped(bad_place, facts)

    # Omits the exchange cost ("wins the queen" without mentioning the rook or trade) -> dropped.
    bad_cost = "Rxe8+ forces Qxe8, and then Nf6+ forks the king and queen to win the queen."
    assert "omits exchange cost" in narrate_sft.why_dropped(bad_cost, facts)

    # Claims winning a bishop that never appears in facts -> dropped.
    bad_piece = "Rxe8+ forces Qxe8, and Nf6+ wins the bishop for a rook."
    assert "bishop" in narrate_sft.why_dropped(bad_piece, facts)


def test_corpus_walk_line_facts_tactics_forcedness_and_exchange():
    # Hanging piece detection on a real position: Black's knight on e5 is undefended and attacked by White's rook on e1.
    board = chess.Board("4k3/8/8/4n3/8/8/8/4R1K1 w - - 0 1")
    hang = narrator_prompts.hanging_pieces(board)
    assert any(h["side"] == "Black" and h["piece"] == "knight" and h["square"] == "e5" for h in hang)

    # Back-rank check + only legal move check: Black rook on d8, king on g8 -> Re8+ Rxe8 is the ONLY legal move.
    story = narrator_prompts.walk_line_facts("3r2k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "Re8+ Rxe8")
    assert story["line"][0]["move"] == "Re8+"
    assert story["line"][1]["forced"] == "only legal move"

    mate_story = narrator_prompts.walk_line_facts("6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", "Re8#")
    assert mate_story["line"][0]["mate"] is True
    assert "back-rank mate" in mate_story["line"][0]["tactic"]
    assert mate_story["how_it_ends"] == "delivers checkmate"

    # Knight fork detection: White Nf6+ forks Black king on g8 and queen on d7.
    fork_story = narrator_prompts.walk_line_facts("6k1/3q1ppp/8/8/4N3/8/5PPP/6K1 w - - 0 1", "Nf6+ gxf6")
    assert any(t.startswith("fork:") for t in fork_story["line"][0].get("tactic", []))
    assert "answers_the_check" in fork_story["line"][1]  # Kg8->f8/h8 or gxf6: not forced!

    # Exchange outcome preserves cost: wins a rook.
    ex_story = narrator_prompts.walk_line_facts("4k3/8/3r4/5N2/8/8/8/4K3 w - - 0 1", "Nxd6+ Kd7")
    assert ex_story["how_it_ends"] == "wins a rook"


def test_corpus_prompt_check_and_sft_end_to_end():
    moment = {
        "key": "masters:demo:1",
        "kind": "masters",
        "fen": "3r2k1/5ppp/8/8/1N6/8/5PPP/4R1K1 w - - 0 1",
        "history": "",
        "move_san": "Nd5",
        "engine": {
            "move_rank": 2,
            "move_loss": 18.0,
            "move_line": "Rxd5",
            "best": [{"move": "Nc6", "line": "Nc6 Rc8"}, {"move": "Re8+", "line": "Re8+ Rxe8"}],
            "others": [{"move": "Na2", "line": "Na2 Kf8"}],
        },
        "maia": {"1350": [{"move": "Re8+", "chance": 0.45}, {"move": "Nc6", "chance": 0.2}]},
        "features": {"material_imbalance": 3, "legal_checks": 1},
        "reference": "A classic textbook maneuver (must never be copied into target).",
        "source": "Lichess broadcast",
        "licence": "CC0",
        "attribution": "Lichess broadcast database",
    }
    prompt_row = narrator_prompts.prompt_of(moment, 1350)
    assert prompt_row is not None
    assert "only legal move" in prompt_row["prompt"]
    assert prompt_row["facts"]["best_lines"][1]["line"][1]["forced"] == "only legal move"

    # Good narration passes.
    good_text = "Nc6 attacks the rook on d8, and after Rc8 White keeps an active knight. Re8+ forces Rxe8, trading rooks."
    assert narrator_check.check_narration(good_text, prompt_row) == []

    # Bad narration with hallucinated piece placement, raw score, or hallucinated tactic fails.
    assert any("bishop on c4" in m for m in narrator_check.check_narration("Your bishop on c4 eyes f7 after Nc6.", prompt_row))
    assert any("raw engine score" in m for m in narrator_check.check_narration("Nc6 is +2.50 better after Rc8.", prompt_row))
    assert any("fork" in m for m in narrator_check.check_narration("Nc6 forks the rook on d8 and king on g8.", prompt_row))
    assert any("move(s) not in facts" in m for m in narrator_check.check_narration("Play Qg4 instead of Nc6.", prompt_row))

    # SFT builder keeps only verified narrations and preserves licence/source/attribution.
    kept, dropped = narrator_sft.build_sft(
        [prompt_row],
        [{"key": "masters:demo:1", "text": good_text}],
    )
    assert len(kept) == 1
    assert dropped == {}
    assert kept[0]["target"] == good_text
    assert kept[0]["source"] == "Lichess broadcast"
    assert kept[0]["licence"] == "CC0"
    assert kept[0]["attribution"] == "Lichess broadcast database"
    assert "textbook" not in kept[0]["target"]
