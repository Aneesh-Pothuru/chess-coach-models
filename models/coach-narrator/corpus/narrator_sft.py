"""Build an SFT dataset for the general PGN+FEN coaching narrator from teacher narrations.

Filters every teacher narration through ``narrator_check.py`` so only 100%-verified narrations
enter fine-tuning. Never uses ``reference`` texts as training targets, and preserves ``source``,
``licence``, and ``attribution`` on every output row.

usage:
    python narrator_sft.py --prompts prompts.jsonl --texts teacher.jsonl --out sft.jsonl
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
from typing import Any

from narrator_check import check_narration

SYSTEM_PROMPT = (
    "You are a chess coach explaining a position to a club player. "
    "Use only the checked facts given in the prompt. Never invent moves, squares, pieces, checks, "
    "mates, or tactics. Call a reply forced only when marked 'only legal move'. State exchange costs "
    "whenever material is traded. Write two to four plain sentences with no markdown or engine numbers."
)


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def build_sft(
    prompts: list[dict[str, Any]],
    texts: list[dict[str, Any]],
    *,
    max_words: int = 120,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Filter teacher narrations through ``check_narration`` and format rows for ``review-writer/finetune.py``."""
    by_key = {(t.get("key") or t.get("id")): t.get("text", "").strip() for t in texts}
    kept: dict[str, dict[str, Any]] = {}
    dropped: collections.Counter[str] = collections.Counter()

    for prompt in prompts:
        key = prompt["key"]
        text = by_key.get(key, "")
        misses = check_narration(text, prompt, max_words=max_words)
        if misses:
            dropped[misses[0]] += 1
            continue
        kept[key] = {
            "id": key,
            "kind": prompt.get("kind", ""),
            "rating": prompt.get("rating", 1350),
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt["prompt"]},
            ],
            "target": text,
            "source": prompt.get("source", ""),
            "licence": prompt.get("licence", ""),
            "attribution": prompt.get("attribution", ""),
        }
    return list(kept.values()), dict(dropped)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--prompts", nargs="+", required=True)
    parser.add_argument("--texts", nargs="+", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--max-words", type=int, default=120)
    args = parser.parse_args()
    if len(args.prompts) != len(args.texts):
        raise SystemExit("--prompts and --texts must pair up")

    all_prompts, all_texts = [], []
    for p_path, t_path in zip(args.prompts, args.texts):
        all_prompts.extend(_read_jsonl(Path(p_path)))
        all_texts.extend(_read_jsonl(Path(t_path)))

    rows, dropped = build_sft(all_prompts, all_texts, max_words=args.max_words)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(json.dumps({"rows": len(rows), "dropped": dropped, "out": str(out_path)}, indent=2))


if __name__ == "__main__":
    main()
