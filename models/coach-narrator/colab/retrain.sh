#!/usr/bin/env bash
# Retrains the narrator on a Colab A100 from open data only, and packs what
# must leave the machine before it is deleted.
#
# Before running, in /content: this repository cloned, vllm, trl, peft and
# datasets installed, and the narration prompts of one version uploaded. The
# prompts are built on the owner's machine (coach-eval/coach-rewrite.mjs), and
# open_prompts.py, beside this script, copies them for the upload with every
# set-up from a course puzzle left out, so only open data leaves that machine:
# the three training files and the two held-out files named below.
#
#   bash chess-coach-models/models/coach-narrator/colab/retrain.sh n6
#
# Writes /content/Llama-3.2-3B-coach-narrator-<version>.zip: the adapter, the
# training set it was fitted on, the teacher's and the student's narrations and
# the logs. Save that zip before the runtime is deleted: nothing else keeps the
# weights.
set -uo pipefail
V="${1:?usage: retrain.sh <prompt version, such as n6>}"
cd /content
L=chess-coach-models/models/coach-narrator
NAME="Llama-3.2-3B-coach-narrator-$V"
TRAIN="narrate-prompts-games-train-$V.jsonl narrate-prompts-puzzles-train-$V.jsonl narrate-prompts-themed-train-$V.jsonl"
DEV="narrate-prompts-games-heldout-$V.jsonl narrate-prompts-puzzles-heldout-$V.jsonl"
mkdir -p open teacher heldout

# Only open data trains a published model. open_prompts.py already left the
# course puzzles out; this drops any that an upload made another way let in.
for f in $TRAIN; do grep -v '"id": *"course:' "$f" > "open/$f"; done
wc -l $TRAIN open/*.jsonl

# The teacher narrates the training set-ups, in 8-bit when the GPU cannot hold
# it in full precision.
MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n 1)
QUANT=""
[ "$MEM" -lt 79000 ] && QUANT="--quantization fp8"
python $L/review-writer/write.py --prompts $(printf 'open/%s ' $TRAIN) --writer gemma-4-26b-a4b $QUANT --out-dir teacher > teacher.log 2>&1 || echo TEACHER FAILED
tail -n 2 teacher.log

# The student learns only from narrations that pass the filter.
python $L/coach-eval/narrate_sft.py --open-only \
  --prompts $(printf 'open/%s ' $TRAIN) \
  --texts $(for f in $TRAIN; do printf 'teacher/texts-%s-gemma-4-26b-a4b.jsonl ' "${f%.jsonl}"; done) \
  --out "sft-$V.jsonl" | tee "sft-$V.json"

python $L/review-writer/finetune.py --data "sft-$V.jsonl" --out "$NAME" > train.log 2>&1 || echo TRAIN FAILED
tail -n 3 train.log
python $L/review-writer/write.py --prompts $DEV --writer llama-3.2-3b --lora "/content/$NAME" --out-dir heldout > eval.log 2>&1 || echo EVAL FAILED
tail -n 2 eval.log
wc -l "sft-$V.jsonl" heldout/*.jsonl

rm -f "$NAME.zip"
zip -q -r "$NAME.zip" "$NAME" "sft-$V.jsonl" "sft-$V.json" teacher heldout teacher.log train.log eval.log
sha256sum "$NAME.zip" "$NAME/adapter_model.safetensors"
ls -la "$NAME.zip"
echo RETRAIN DONE
