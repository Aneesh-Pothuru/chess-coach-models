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
    "sacrific": ("sacrific", "gives up"),
    "promot": ("promot", "="),
    "smother": ("smother",),
    "back rank": ("back-rank", "back rank"),
    "double check": ("double check",),
}


def replies_of(facts):
    """A narrated line's replies: whether the rules force each, and the square it goes to."""
    f = json.loads(facts.split("\n", 1)[1])
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
        if word in low and not any(m in flow for m in marks):
            return f"names {word} the facts never give"
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
