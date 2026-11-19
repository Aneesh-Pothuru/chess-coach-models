#!/usr/bin/env python3
"""Writes each moment's explanation with one candidate model, on a GPU.

Reads a prompts file (prompts.mjs: one line a moment with its chat messages)
and writes one line a moment: {"id", "writer", "model", "text", "raw",
"tokens"}. The candidates are the open weights of models Cloudflare's Workers
AI serves (README). Decoding is greedy, so the same weights and vLLM version
write the same texts. Each writer runs in its own process, so the GPU is free
again when it ends.

    python projects/review-writer/write.py --prompts prompts-train.jsonl --writer qwen3-30b-a3b --out texts-train-qwen3-30b-a3b.jsonl
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time

WRITERS = {
    "llama-3.1-8b": {"model": "RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8", "template": {}},
    "qwen3-30b-a3b": {"model": "Qwen/Qwen3-30B-A3B-FP8", "template": {"enable_thinking": False}},
    "gpt-oss-20b": {"model": "openai/gpt-oss-20b", "template": {"reasoning_effort": "low"}},
    "gemma-4-26b-a4b": {"model": "google/gemma-4-26B-A4B-it", "template": {}},
    # Not a candidate (Workers AI serves it, but it costs several times the others):
    # the strongest open writer, read as a ceiling and as a source of fine-tuning texts.
    "gpt-oss-120b": {"model": "openai/gpt-oss-120b", "template": {"reasoning_effort": "low"}},
}

# gpt-oss writes its reasoning before a final channel; Qwen3 may wrap thinking in tags.
FINAL = re.compile(r"assistantfinal|<\|channel\|>final<\|message\|>")
THINK = re.compile(r"<think>.*?</think>", re.S)


def final_text(text: str) -> str:
    parts = FINAL.split(text)
    out = parts[-1] if len(parts) > 1 else text
    return THINK.sub("", out).strip()


def merged(messages: list[dict]) -> list[dict]:
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    rest = [dict(m) for m in messages if m["role"] != "system"]
    if system and rest:
        rest[0]["content"] = f"{system}\n\n{rest[0]['content']}"
    return rest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompts", required=True)
    ap.add_argument("--writer", required=True, choices=sorted(WRITERS))
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-tokens", type=int, default=800)
    args = ap.parse_args()

    from vllm import LLM, SamplingParams

    writer = WRITERS[args.writer]
    with open(args.prompts, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    llm = LLM(model=writer["model"], max_model_len=8192, gpu_memory_utilization=0.9, seed=0)
    params = SamplingParams(temperature=0.0, max_tokens=args.max_tokens)
    started = time.time()
    kwargs = {"chat_template_kwargs": writer["template"]} if writer["template"] else {}
    conversations = [r["messages"] for r in rows]
    try:
        outputs = llm.chat(conversations, params, use_tqdm=True, **kwargs)
    except Exception as e:
        if "system" not in str(e).lower():
            raise
        outputs = llm.chat([merged(c) for c in conversations], params, use_tqdm=True, **kwargs)
    with open(args.out, "w", encoding="utf-8") as f:
        for row, out in zip(rows, outputs, strict=True):
            raw = out.outputs[0].text
            f.write(json.dumps({"id": row["id"], "writer": args.writer, "model": writer["model"],
                                "text": final_text(raw), "raw": raw, "tokens": len(out.outputs[0].token_ids)}) + "\n")
    print(json.dumps({"writer": args.writer, "model": writer["model"], "moments": len(rows),
                      "seconds": round(time.time() - started)}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
