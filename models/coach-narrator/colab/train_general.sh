#!/usr/bin/env bash
# General PGN+FEN coaching narrator pipeline on a Colab A100.
#
# Takes structured prompts built locally by models/coach-narrator/corpus/narrator_prompts.py
# (checked facts + chat messages + attribution + licence; reference texts never used as targets),
# narrates them with Gemma 4 26B-A4B via review-writer/write.py, filters every narration through
# narrator_check.py via narrator_sft.py, LoRA fine-tunes Llama 3.2 3B Instruct with
# review-writer/finetune.py, evaluates on an optional held-out prompts file, and zips everything
# before the Colab runtime is deleted.
#
# Usage (from /content with chess-coach-models cloned and prompts uploaded):
#   bash chess-coach-models/models/coach-narrator/colab/train_general.sh prompts-train.jsonl [prompts-heldout.jsonl] [version]
set -euo pipefail

TRAIN_PROMPTS="${1:?usage: train_general.sh <train-prompts.jsonl> [heldout-prompts.jsonl] [version]}"
HELDOUT_PROMPTS="${2:-}"
V="${3:-g1}"

REPO="${REPO:-/content/chess-coach-models}"
L="$REPO/models/coach-narrator"
WORK="/content/general-narrator-$V"
NAME="Llama-3.2-3B-coach-general-$V"
mkdir -p "$WORK/teacher" "$WORK/heldout"

MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1)
QUANT=""
[ "$MEM" -lt 79000 ] && QUANT="--quantization fp8"

TRAIN_STEM=$(basename "$TRAIN_PROMPTS" .jsonl)
TEACHER_OUT="$WORK/teacher/texts-${TRAIN_STEM}-gemma-4-26b-a4b.jsonl"

echo "[1/4] Teacher generation (gemma-4-26b-a4b $QUANT) on $TRAIN_PROMPTS"
python "$L/review-writer/write.py" \
  --prompts "$TRAIN_PROMPTS" \
  --writer gemma-4-26b-a4b \
  $QUANT \
  --max-tokens 256 \
  --out-dir "$WORK/teacher" > "$WORK/teacher.log" 2>&1
tail -n 2 "$WORK/teacher.log"

echo "[2/4] Deterministic truth filtering (narrator_sft.py)"
python "$L/corpus/narrator_sft.py" \
  --prompts "$TRAIN_PROMPTS" \
  --texts "$TEACHER_OUT" \
  --out "$WORK/sft-$V.jsonl" | tee "$WORK/sft-$V.json"

echo "[3/4] LoRA fine-tune (llama-3.2-3b)"
python "$L/review-writer/finetune.py" \
  --data "$WORK/sft-$V.jsonl" \
  --out "$WORK/$NAME" \
  --epochs 2 \
  --rank 16 \
  --lr 2e-4 > "$WORK/train.log" 2>&1
tail -n 3 "$WORK/train.log"

if [ -n "$HELDOUT_PROMPTS" ] && [ -f "$HELDOUT_PROMPTS" ]; then
  echo "[4/4] Held-out generation and truth audit on $HELDOUT_PROMPTS"
  HELDOUT_STEM=$(basename "$HELDOUT_PROMPTS" .jsonl)
  python "$L/review-writer/write.py" \
    --prompts "$HELDOUT_PROMPTS" \
    --writer llama-3.2-3b \
    --lora "$WORK/$NAME" \
    --max-tokens 256 \
    --out-dir "$WORK/heldout" > "$WORK/eval.log" 2>&1
  tail -n 2 "$WORK/eval.log"
  python "$L/corpus/narrator_check.py" \
    --prompts "$HELDOUT_PROMPTS" \
    --texts "$WORK/heldout/texts-${HELDOUT_STEM}-llama-3.2-3b+${NAME}.jsonl" \
    | tee "$WORK/heldout-audit-$V.json"
fi

ZIP="/content/$NAME.zip"
rm -f "$ZIP"
(cd "$WORK" && zip -q -r "$ZIP" "$NAME" "sft-$V.jsonl" "sft-$V.json" teacher heldout *.log heldout-audit-*.json 2>/dev/null || zip -q -r "$ZIP" "$NAME" "sft-$V.jsonl" "sft-$V.json" teacher heldout *.log)
sha256sum "$ZIP" "$WORK/$NAME/adapter_model.safetensors"
ls -la "$ZIP"
echo "GENERAL NARRATOR DONE: save $ZIP before the runtime releases"
