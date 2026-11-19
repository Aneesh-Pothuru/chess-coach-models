#!/usr/bin/env python3
"""Writes each moment's explanation with one candidate model, on a GPU.

Reads prompts files (prompts.mjs: one line a moment with its chat messages)
and writes one line a moment: {"id", "writer", "model", "text", "raw",
"tokens"}. The candidates are the open weights of models Cloudflare's Workers
AI serves (README). Decoding is greedy, so the same weights and vLLM version
write the same texts. Each writer runs in its own process, so the GPU is free
again when it ends, and loads its weights once for all the files it is given:
each file's texts go to texts-<file name>-<writer>.jsonl in --out-dir.

    python projects/review-writer/write.py --prompts prompts-train-v3.jsonl bare-train-200-v1.jsonl --writer qwen3-30b-a3b --out-dir texts
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

WRITERS = {
    "llama-3.1-8b": {"model": "RedHatAI/Meta-Llama-3.1-8B-Instruct-FP8", "template": {}},
    "qwen3-30b-a3b": {"model": "Qwen/Qwen3-30B-A3B-FP8", "template": {"enable_thinking": False}},
    "gpt-oss-20b": {"model": "openai/gpt-oss-20b", "template": {"reasoning_effort": "low"}},
    "gemma-4-26b-a4b": {"model": "google/gemma-4-26B-A4B-it", "template": {}},
    # Workers AI runs LoRA adapters on it, so it is the base a fine-tune would use;
    # read here as it ships. Unsloth's copy is Meta's weights without the gate.
    "llama-3.2-3b": {"model": "unsloth/Llama-3.2-3B-Instruct", "template": {}},
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
    ap.add_argument("--prompts", required=True, nargs="+")
    ap.add_argument("--writer", required=True, choices=sorted(WRITERS))
    ap.add_argument("--out-dir", default=".")
    ap.add_argument("--max-tokens", type=int, default=800)
    ap.add_argument("--lora", help="a LoRA adapter's folder (finetune.py) to apply to the writer's weights")
    ap.add_argument("--quantization", help="vLLM's quantization of the writer's weights, such as fp8, when the GPU cannot hold them in full precision")
    args = ap.parse_args()

    from vllm import LLM, SamplingParams

    writer = WRITERS[args.writer]
    name = f"{args.writer}+{Path(args.lora).name}" if args.lora else args.writer
    files = []
    for path in args.prompts:
        with open(path, encoding="utf-8") as f:
            files.append((Path(path).stem, [json.loads(line) for line in f if line.strip()]))
    rows = [row for _, file_rows in files for row in file_rows]
    lora_kwargs = {"enable_lora": True, "max_lora_rank": 32} if args.lora else {}
    llm = LLM(model=writer["model"], max_model_len=8192, gpu_memory_utilization=0.9, seed=0, quantization=args.quantization, **lora_kwargs)
    params = SamplingParams(temperature=0.0, max_tokens=args.max_tokens)
    started = time.time()
    kwargs = {"chat_template_kwargs": writer["template"]} if writer["template"] else {}
    if args.lora:
        from vllm.lora.request import LoRARequest

        kwargs["lora_request"] = LoRARequest(Path(args.lora).name, 1, str(Path(args.lora).resolve()))
    conversations = [r["messages"] for r in rows]
    try:
        outputs = llm.chat(conversations, params, use_tqdm=True, **kwargs)
    except Exception as e:
        if "system" not in str(e).lower():
            raise
        outputs = llm.chat([merged(c) for c in conversations], params, use_tqdm=True, **kwargs)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    at = 0
    for task, file_rows in files:
        with open(out_dir / f"texts-{task}-{name}.jsonl", "w", encoding="utf-8") as f:
            for row, out in zip(file_rows, outputs[at:at + len(file_rows)], strict=True):
                raw = out.outputs[0].text
                f.write(json.dumps({"id": row["id"], "writer": name, "model": writer["model"],
                                    "text": final_text(raw), "raw": raw, "tokens": len(out.outputs[0].token_ids)}) + "\n")
        at += len(file_rows)
    print(json.dumps({"writer": name, "model": writer["model"], "moments": len(rows),
                      "files": len(files), "seconds": round(time.time() - started)}), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
