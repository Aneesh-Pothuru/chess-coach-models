#!/usr/bin/env python3
"""LoRA-tunes a writer on teacher texts, on a GPU.

Each example is a train moment's prompt as prompts.mjs writes it (the system
prompt and the fact sheet) and, as the answer to learn, a stronger writer's text
for it that passed the truth check (sft.mjs). Only the answer's tokens carry the
loss. The adapter keeps to Workers AI's LoRA limits: the attention projections
only, rank 16, well under 300 MB, saved as adapter_model.safetensors and
adapter_config.json with model_type set, so the app could serve it on the same
base. write.py --lora reads it back.

    python models/coach-narrator/review-writer/finetune.py --data sft-train.jsonl --out coach-lora
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True, help="sft.mjs's file: {id, messages, target} a line")
    ap.add_argument("--base", default="unsloth/Llama-3.2-3B-Instruct")
    ap.add_argument("--model-type", default="llama", help="Workers AI's architecture name for the base")
    ap.add_argument("--out", required=True)
    ap.add_argument("--epochs", type=float, default=2.0)
    ap.add_argument("--lr", type=float, default=2e-4)
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--batch", type=int, default=8)
    ap.add_argument("--accum", type=int, default=2)
    args = ap.parse_args()

    import torch
    from datasets import Dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from trl import SFTConfig, SFTTrainer

    rows = [json.loads(line) for line in open(args.data, encoding="utf-8") if line.strip()]
    data = Dataset.from_list([
        {"prompt": r["messages"], "completion": [{"role": "assistant", "content": r["target"]}]} for r in rows
    ])
    tokenizer = AutoTokenizer.from_pretrained(args.base)
    try:
        model = AutoModelForCausalLM.from_pretrained(args.base, dtype=torch.bfloat16)
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(args.base, torch_dtype=torch.bfloat16)
    steps = math.ceil(len(rows) / (args.batch * args.accum)) * args.epochs
    config = SFTConfig(
        output_dir=f"{args.out}-run",
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        gradient_accumulation_steps=args.accum,
        gradient_checkpointing=True,
        lr_scheduler_type="cosine",
        warmup_steps=max(1, int(0.05 * steps)),
        logging_steps=10,
        save_strategy="no",
        bf16=torch.cuda.is_available(),
        max_length=4096,
        completion_only_loss=True,
        report_to=[],
        seed=0,
    )
    lora = LoraConfig(r=args.rank, lora_alpha=2 * args.rank, lora_dropout=0.05,
                      target_modules=["q_proj", "k_proj", "v_proj", "o_proj"], task_type="CAUSAL_LM")
    trainer = SFTTrainer(model=model, args=config, train_dataset=data, processing_class=tokenizer, peft_config=lora)
    started = time.time()
    result = trainer.train()
    trainer.model.save_pretrained(args.out)
    config_path = Path(args.out) / "adapter_config.json"
    adapter_config = json.loads(config_path.read_text())
    adapter_config["model_type"] = args.model_type
    config_path.write_text(json.dumps(adapter_config, indent=2) + "\n")
    weights = Path(args.out) / "adapter_model.safetensors"
    losses = [h["loss"] for h in trainer.state.log_history if "loss" in h]
    print(json.dumps({
        "base": args.base, "examples": len(rows), "epochs": args.epochs, "lr": args.lr, "rank": args.rank,
        "steps": result.global_step, "train_loss": round(result.training_loss, 4),
        "first_loss": losses[0] if losses else None, "last_loss": losses[-1] if losses else None,
        "adapter_mb": round(weights.stat().st_size / 2**20, 1), "seconds": round(time.time() - started),
    }), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
