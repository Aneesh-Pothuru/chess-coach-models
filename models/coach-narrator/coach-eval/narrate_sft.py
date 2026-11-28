"""Builds a fine-tuning set for the narration task from a teacher's narrations.

Each --texts file holds the teacher's narrations of the prompts file at the same place
in --prompts. With --current, a narration is kept only where its prompt is the current
version's prompt for that moment, so narrations written for an earlier version carry
over where the prompt did not change. A narration is dropped when it names a move the
facts do not hold, calls a reply forced that the rules do not force (as coach-check.mjs
reads it), or names a tactic, a check or a mate that the facts never give, so the
student does not learn those claims.

    python narrate_sft.py --prompts a.jsonl b.jsonl --texts ta.jsonl tb.jsonl [--current c.jsonl ...] [--open-only] --out sft.jsonl

With --open-only, a moment that comes from a course puzzle (its id starts with
"course:") is left out, so the set holds positions from open data only: the set a
model whose weights are published is trained on.

Writes review-writer/finetune.py's rows: {id, messages, target}.
"""
import argparse
import collections
import json
import re

SAN = re.compile(r"(?<![A-Za-z0-9])(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?")
SQUARE = re.compile(r"\b[a-h][1-8]\b")
FORCED = re.compile(r"\b(?:forced|forces|forcing|must|has to|have to|only (?:legal )?(?:move|answer|response|reply)|no (?:other )?choice|because (?:it is|it's|of the) (?:a )?check)\b", re.I)
TACTICS = {
    "fork": ("fork",),
    "pin": ("pin",),
    "skewer": ("skewer",),
    "discover": ("discover",),
    "trapped": ("trapped", "trap"),
    "sacrific": ("sacrific", "gives up"),
    "deflect": ("deflect",),
    "decoy": ("decoy", "lure", "attraction"),
    "lure": ("decoy", "lure", "attraction"),
    "attraction": ("decoy", "lure", "attraction"),
    "promot": ("promot", "="),
    "smother": ("smother",),
    "back rank": ("back-rank", "back rank"),
    "back-rank": ("back-rank", "back rank"),
    "double check": ("double check", "double-check"),
    "double-check": ("double check", "double-check"),
    "removing the defender": ("removing the defender", "remove the defender", "removes the defender", "removed the defender"),
    "intermezzo": ("intermezzo", "zwischenzug"),
    "zwischenzug": ("intermezzo", "zwischenzug"),
}

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
MATE_SHAPES = {"backRank", "smothered"}
EXCHANGE_IN_FACTS = re.compile(r"\b(?:wins?|winning|gains?)\s+([^.,;]+?)\s+for\s+([^.,;]+)", re.I)
COST_WORDS = re.compile(r"\b(?:for|cost(?:s|ing)?|gives? up|giving up|sacrific(?:e|es|ed|ing)|trad(?:e|es|ed|ing)|exchang(?:e|es|ed|ing)|in return for)\b", re.I)
PIECE_WORDS = ("queen", "rook", "bishop", "knight", "pawn", "exchange")
WIN_PIECE_CLAIM = re.compile(r"\b(?:wins?|winning|picks? up)\s+(?:a|an|the|their|your|two|both)\s+(queen|rook|bishop|knight)s?\b", re.I)


def _parse_facts(facts):
    try:
        return json.loads(facts.split("\n", 1)[1])
    except Exception:
        return {}


def replies_of(facts):
    """A narrated line's replies: whether the rules force each, and the square it goes to."""
    f = _parse_facts(facts)
    out = {}
    for key in ("the_better_line", "the_line_your_move_allowed"):
        line = (f.get(key) or {}).get("line") or []
        for p in line:
            if p["by"] == line[0]["by"]:
                continue
            move = p["move"].rstrip("+#")
            squares = re.findall(r"[a-h][1-8]", move)
            out[move] = {"forced": p.get("how_forced", "").startswith("forced") or bool(p.get("forced")), "to": squares[-1] if squares else None}
    return out


def tactic_places_of(facts):
    """Where the facts place each tactic (moves and landing squares) plus mating moves."""
    f = _parse_facts(facts)
    places = {}
    mates = set()
    for key in ("the_better_line", "the_line_your_move_allowed"):
        for p in (f.get(key) or {}).get("line") or []:
            if p.get("move", "").endswith("#"):
                mates.add(p["move"].rstrip("+#"))

    def place(text, owner):
        named = [m.rstrip("+#") for m in SAN.findall(text)]
        at = named or ([owner.rstrip("+#")] if owner else [])
        if not at:
            return
        for name, pat in TACTIC_PATTERNS.items():
            if not pat.search(text):
                continue
            entry = places.setdefault(name, {"moves": set(), "squares": set()})
            for m in at:
                entry["moves"].add(m)
                sqs = re.findall(r"[a-h][1-8]", m)
                if sqs:
                    entry["squares"].add(sqs[-1])

    def visit(x, owner):
        if isinstance(x, str):
            place(x, owner)
        elif isinstance(x, list):
            for y in x:
                visit(y, owner)
        elif isinstance(x, dict):
            next_owner = x["move"] if isinstance(x.get("move"), str) else owner
            for k, y in x.items():
                if k != "move":
                    visit(y, next_owner)

    visit(f, None)
    return places, mates


def misplaced_tactic(text, facts):
    """A tactic a sentence places on the wrong move (mirrors coach-check.mjs's misplacedTactics)."""
    places, mates = tactic_places_of(facts)
    if not places:
        return None
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    for idx, sentence in enumerate(sentences):
        if LATER.search(sentence):
            continue
        named = [m.rstrip("+#") for m in SAN.findall(sentence)]
        if not named:
            continue
        prev = sentences[idx - 1] if idx > 0 else ""
        moves = named + ([m.rstrip("+#") for m in SAN.findall(prev)] if BACK.match(sentence.strip()) else [])
        squares = SQUARE.findall(sentence)
        for name, pat in TACTIC_PATTERNS.items():
            p = places.get(name)
            if not p or not pat.search(sentence):
                continue
            if any(m in p["moves"] for m in moves) or any(q in p["squares"] for q in squares):
                continue
            if name in MATE_SHAPES and any(m in mates for m in moves):
                continue
            return f"{name} placed at {', '.join(named)}"
    return None


def omitted_exchange_cost(text, facts):
    """Catch 'wins two rooks' when the facts say 'wins two rooks for the queen' (v5 audit failure mode)."""
    f = _parse_facts(facts)
    endings = []
    for key in ("the_better_line", "the_line_your_move_allowed"):
        story = f.get(key) or {}
        if isinstance(story.get("how_it_ends"), str):
            endings.append(story["how_it_ends"])
        for pt in story.get("the_point") or []:
            if isinstance(pt, str):
                endings.append(pt)
    low = text.lower()
    for ending in endings:
        for match in EXCHANGE_IN_FACTS.finditer(ending):
            gained, cost = match.group(1).lower(), match.group(2).lower()
            gained_pieces = [pw for pw in PIECE_WORDS if pw in gained]
            cost_pieces = [pw for pw in PIECE_WORDS if pw in cost]
            if not gained_pieces or not cost_pieces:
                continue
            # Only fires if the narration explicitly claims to win one of the gained pieces
            # without mentioning any exchange/cost word or any of the given-up pieces.
            claimed_gain = any(re.search(rf"\b(?:wins?|winning|gains?)\b[^.!?]{{0,35}}\b{pw}s?\b", low) for pw in gained_pieces)
            if claimed_gain and not COST_WORDS.search(low) and not any(re.search(rf"\b{pw}s?\b", low) for pw in cost_pieces):
                return f"omits exchange cost ({cost.strip()})"
    return None


def unsupported_piece_gain(text, facts):
    """Catch claiming to win a major/minor piece that the facts never mention winning or capturing."""
    flow = facts.lower()
    for match in WIN_PIECE_CLAIM.finditer(text):
        piece = match.group(1).lower()
        if piece not in flow:
            return f"claims winning a {piece} the facts never name"
    return None


def unforced_claim(text, facts):
    """A reply the narration calls forced that the facts do not force, as coach-check.mjs reads it."""
    replies = replies_of(facts)
    for sentence in re.split(r"(?<=[.!?])\s+", text.strip()):
        before = []
        for clause in re.split(r",|;|\band\b|\bbut\b", sentence):
            named = [m.rstrip("+#") for m in SAN.findall(clause)]
            squares = SQUARE.findall(clause)
            moves = named or (before if re.match(r"\s*(?:which|that|it)\b", clause, re.I) else [])
            if FORCED.search(clause):
                hits = [m for m, r in replies.items() if m in moves or (r["to"] and r["to"] in squares)]
                if hits and not any(replies[m]["forced"] for m in hits):
                    return ", ".join(hits)
            if named:
                before = named
    return None


def why_dropped(text, facts):
    if not text:
        return "empty"
    if any(m.rstrip("+#") not in facts for m in SAN.findall(text)):
        return "names a move the facts do not hold"
    if FORCED.search(text) and not re.search(r'"forced":|"how_forced": "forced', facts):
        return "calls a reply forced where the facts force none"
    if unforced_claim(text, facts):
        return "calls a reply forced that the facts do not force"
    low, flow = text.lower(), facts.lower()
    for word, marks in TACTICS.items():
        if re.search(rf"\b{re.escape(word)}", low) and not any(m in flow for m in marks):
            return f"names {word} the facts never give"
    bad_place = misplaced_tactic(text, facts)
    if bad_place:
        return f"misplaces a tactic: {bad_place}"
    bad_cost = omitted_exchange_cost(text, facts)
    if bad_cost:
        return bad_cost
    bad_gain = unsupported_piece_gain(text, facts)
    if bad_gain:
        return bad_gain
    if re.search(r"\bmate\b|checkmate", low) and "#" not in facts and "mate" not in flow:
        return "names a mate the facts never give"
    if re.search(r"\bchecks?\b", low) and "+" not in facts and "#" not in facts:
        return "names a check the facts never give"
    return None


def read(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompts", nargs="+", required=True)
    ap.add_argument("--texts", nargs="+", required=True)
    ap.add_argument("--current", nargs="*", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--open-only", action="store_true", help="keep only moments from open data: drop every moment that comes from a course puzzle")
    args = ap.parse_args()
    if len(args.prompts) != len(args.texts):
        raise SystemExit("--prompts and --texts must pair up")
    current = {r["id"]: r["messages"][1]["content"] for p in args.current for r in read(p)}
    rows, dropped = {}, collections.Counter()
    for prompts, texts in zip(args.prompts, args.texts):
        told = {t["id"]: t["text"].strip() for t in read(texts)}
        for r in read(prompts):
            if args.open_only and str(r["id"]).startswith("course:"):
                dropped["from a course puzzle"] += 1
                continue
            facts = r["messages"][1]["content"]
            if current and current.get(r["id"]) != facts:
                dropped["not the current prompt"] += 1
                continue
            why = why_dropped(told.get(r["id"], ""), facts)
            if why:
                dropped[why] += 1
                continue
            rows[r["id"]] = {"id": r["id"], "messages": r["messages"], "target": told[r["id"]]}
    with open(args.out, "w", encoding="utf-8") as f:
        f.writelines(json.dumps(x) + "\n" for x in rows.values())
    print(json.dumps({"rows": len(rows), "dropped": dict(dropped)}))


if __name__ == "__main__":
    main()
