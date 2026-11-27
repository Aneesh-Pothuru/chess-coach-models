"""A first look at a month of the Lichess broadcast database: which headers its games carry and how often.

usage: python -I broadcast_peek.py FILE.pgn.zst [--games N]
"""

from __future__ import annotations

import re
import sys
from collections import Counter

from chess_coach_models.data.lichess import game_blocks, open_zst

CLOCK = re.compile(r"\[%clk ")
EVAL = re.compile(r"\[%eval ")
COMMENT = re.compile(r"\{([^}]*)\}")
COMMAND = re.compile(r"\[%[^\]]*\]")
AUTO = re.compile(r"^(Inaccuracy|Mistake|Blunder)\. .* was best\.$|^Lost forced checkmate sequence|^Checkmate is now unavoidable")


def main() -> None:
    path = sys.argv[1]
    limit = int(sys.argv[sys.argv.index("--games") + 1]) if "--games" in sys.argv else None
    keys = Counter()
    titles = Counter()
    controls = Counter()
    events = Counter()
    results = Counter()
    variants = Counter()
    with_clock = with_eval = with_human = games = 0
    human_examples = []
    with open_zst(path) as text:
        blocks = list(game_blocks(text)) if limit is None else [block for _, block in zip(range(limit), game_blocks(text))]
    for headers, movetext in blocks:
        games += 1
        keys.update(headers.keys())
        titles.update([headers.get("WhiteTitle", "-"), headers.get("BlackTitle", "-")])
        controls[headers.get("TimeControl", "-")] += 1
        events[headers.get("BroadcastName", "-").split("|")[0].strip()[:60]] += 1
        results[headers.get("Result", "-")] += 1
        variants[headers.get("Variant", "-")] += 1
        with_clock += bool(CLOCK.search(movetext))
        with_eval += bool(EVAL.search(movetext))
        human = [
            text
            for text in (COMMAND.sub("", body).strip() for body in COMMENT.findall(movetext))
            if text and not AUTO.match(text)
        ]
        if human:
            with_human += 1
            if len(human_examples) < 12:
                human_examples.append((headers.get("BroadcastName", "")[:50], human[:3]))
        if limit and games >= limit:
            break
    print(f"games {games:,}; with clocks {with_clock:,}; with evals {with_eval:,}; with other comments {with_human:,}")
    print("headers:", ", ".join(f"{key} {count:,}" for key, count in keys.most_common()))
    print("titles:", titles.most_common(20))
    print("time controls:", controls.most_common(15))
    print("results:", results.most_common())
    print("variants:", variants.most_common())
    print("broadcasts:", events.most_common(25))
    for name, texts in human_examples:
        print("COMMENT", name, "|", " || ".join(text[:120] for text in texts))


if __name__ == "__main__":
    main()
