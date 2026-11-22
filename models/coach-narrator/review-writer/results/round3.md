# Round 3: six writers on prompt 3, and a fine-tune

Run on 2026-11-18. The writers read prompt 3 (`lib.mjs`), which asks for
coach-eval's rubric in order: what the move allowed and what it costs, the
target, the better move and how it meets the reply, and one habit. Every writer
wrote every train game moment, 200 held-out game moments in the seeded sample
order, coach-eval's puzzle moments (732 train, 200 held-out) and coach-eval's
bare task (200 train and 200 held-out of each kind), greedy, under vLLM 0.34.0
on a Colab A100 80 GB. The texts, the judge's answers and the fine-tuning set
stay under `private/`; only these aggregates are kept here.

## Truth check (`check.mjs`)

Share of texts that pass. "Position only" is coach-eval's bare task, checked
against the same facts, so a sound move the engine did not list also fails.

| Writer | Games, train (1,079) | Games, held-out (200) | Puzzles, train (732) | Puzzles, held-out (200) | Position only, games (200) | Position only, puzzles (200) | Median words, games held-out |
|---|---|---|---|---|---|---|---|
| Gemma 4 26B-A4B | 99.6% | 99.5% | 99.6% | 99.0% | 15.0% | 11.5% | 66 |
| Qwen3 30B-A3B | 99.1% | 99.0% | 98.5% | 99.5% | 1.5% | 3.5% | 64 |
| gpt-oss-120b | 98.2% | 99.0% | 98.6% | 98.5% | 5.0% | 7.0% | 84 |
| gpt-oss-20b | 98.2% | 98.0% | 97.7% | 98.0% | 2.0% | 3.5% | 78 |
| Llama 3.1 8B | 97.9% | 99.5% | 96.5% | 99.5% | 3.5% | 3.0% | 94 |
| Llama 3.2 3B (as shipped) | 95.7% | 94.0% | 95.1% | 94.0% | 6.0% | 2.5% | 75 |
| Llama 3.2 3B fine-tuned | trained on | 99.0% | trained on | 99.5% | | | 65.5 |
| Today's text | 100% | 100% | 100% | 100% | | | 114 |

Most grounded failures place a piece on a square where it does not stand, or
add a number the facts do not hold. Most bare failures name a move the engine
does not give. The check cannot see vague advice: one bare text recommends
keeping the tension in a position with a forced mate in two, and passes.

## Blind judge (`judge.mjs`)

Sonnet 5.5, one batch of 100 items per call, reading only the two texts. Each
moment is judged in both orders. The share is over decided comparisons, with a
95% bootstrap interval over games.

| Writer | Moments | Preferred to today's text | 95% interval | Won |
|---|---|---|---|---|
| Gemma 4 26B-A4B | 200 train | 58.3% | 52.6 to 64.6% | 233 of 400 |
| gpt-oss-120b | 200 train | 52.4% | 47.0 to 58.0% | 208 of 397 |
| Qwen3 30B-A3B | 200 train | 40.4% | 35.4 to 47.1% | 161 of 399 |
| Llama 3.2 3B (as shipped) | 200 train | 9.6% | 6.3 to 13.3% | 38 of 396 |
| Gemma 4 26B-A4B | 200 held-out | 67.6% | 62.1 to 73.2% | 269 of 398 |
| Llama 3.2 3B fine-tuned | 200 held-out | 69.4% | 63.9 to 75.1% | 275 of 396 |

Controls, in every run: the same text on both sides was called the same 20 of
20 times, and the length-matched decoy lost all 40 of its decided comparisons
to today's text.

The judge calls lean differently. Each run has five batches, one call each, and
the writer's share moves between calls by more than chance allows (Gemma 4 on
train: 66, 80, 44, 51 and 46%). Taken over calls, with a t interval on four
degrees of freedom, the intervals widen:

| Writer | Moments | Rate per call | Interval over calls |
|---|---|---|---|
| Gemma 4 26B-A4B | train | 66, 80, 44, 51, 46% | 39 to 76% |
| gpt-oss-120b | train | 45, 48, 58, 61, 48% | 43 to 61% |
| Qwen3 30B-A3B | train | 59, 35, 29, 44, 31% | 24 to 55% |
| Llama 3.2 3B (as shipped) | train | 9, 4, 6, 7, 29% | below 23% |
| Gemma 4 26B-A4B | held-out | 78, 79, 63, 58, 57% | 54 to 80% |
| Llama 3.2 3B fine-tuned | held-out | 60, 73, 75, 73, 63% | 61 to 77% |

On held-out both stay above one half; on train no writer's preference is
settled. `judge.mjs score` now reports the interval over calls beside the one
over games, and later rounds should use more, smaller batches.

Gemma 4 was taken as the teacher because it was the only writer the judge
preferred to today's text on train with the interval over games above one
half; over calls its train interval includes one half.

One judge call (gpt-oss-120b, train, batch 2) typed its choices as a numbered
list and wrote them through a script, and says an off-by-one slip in that list
cannot be ruled out. Its 100 answers enter only gpt-oss-120b's train figure.
Later calls are told to use only the Read and Write tools.

## The fine-tune

- Set (`sft.mjs`): every train game moment and train puzzle moment whose Gemma
  4 text passed the truth check, 1,804 examples (1,075 game, 729 puzzle), with
  prompt 3's messages and Gemma 4's text as the answer.
- Training (`finetune.py`): `unsloth/Llama-3.2-3B-Instruct` (Meta's weights),
  LoRA rank 16, alpha 32, dropout 0.05, on q, k, v and o; two epochs, learning
  rate 2e-4 on a cosine schedule, batch 4 with 4 accumulation steps, 226 steps,
  loss on the answer only; TRL 1.18.1, PEFT 0.21.3, transformers 5.23.0. It ran
  38 minutes on a Colab L4; the loss fell from 1.00 to 0.24 (0.33 over the run).
  The adapter is 35 MB with `model_type` llama, inside Workers AI's limits.
- Held-out texts: `write.py --lora` under vLLM 0.34.0.

## Claim audit (coach-eval's `rubric.mjs`)

Sonnet 5.5, ten held-out moments a call, each with its fact sheet and four
texts under neutral labels: the fine-tune's, Gemma 4's, today's and a decoy.
199 of the 200 moments were answered in full. Shares of texts meeting each
criterion, claims per text, and the paired difference in false plus
unsupported claims against today's text on the same moment (95% bootstrap over
games):

| | Today's text | Gemma 4 26B-A4B | Llama 3.2 3B fine-tuned | Decoy |
|---|---|---|---|---|
| Stakes | 77% | 73% | 71% | 0% |
| Target | 84% | 90% | 89% | 0% |
| Their reply | 92% | 96% | 93% | 0% |
| The fix | 63% | 69% | 68% | 0% |
| The habit | 87% | 89% | 90% | 0% |
| The level | 19% | 100% | 100% | 0% |
| False claims per text | 0 | 0.040 | 0.060 | 0 |
| Unsupported claims per text | 0 | 0.156 | 0.136 | 0 |
| Texts with no false claim | 100% | 96.0% | 94.5% | 100% |
| Claims over today's, paired | | +0.20 (0.15 to 0.25) | +0.20 (0.14 to 0.26) | 0 |

The control held: the decoy met the fix and the habit criteria on none of the
moments, against 63% and 87% for today's text. Today's text restates the
facts, so it carries no claim of its own. The writers' false claims name real
moves and squares in the wrong role, which the code check cannot see: a mate
"starting with Rxf7" when the line starts with Qxf7+, a knight "won" in a line
that only follows a recapture, "the pawn on e1" read off a mistake's square and
material, or a trade "costing you a piece" that is a pawn trade.

## Against the rule

| Condition | Gemma 4 26B-A4B | Llama 3.2 3B fine-tuned |
|---|---|---|
| 1. Truth check at least 99% on held-out | 99.5% | 99.0% |
| 1. Audited false and unsupported claims no more than today's | fails: +0.20 a text | fails: +0.20 a text |
| 2. Preferred to today's text, interval above one half | held-out (over calls too); train only over games | held-out (over calls too) |
| 3. Judge controls | held | held |
| 4. Median length at most today's | 66 against 114 words | 65.5 against 114 words |

Neither is kept. Both are clearer than today's text and meet the rubric's
teaching points at least as often, but both add claims the facts do not
support, so neither replaces today's text in this round. The next round's
question is whether a clearer fact sheet (the mistake's piece named, lines that
only follow a recapture marked as such), a code check that reads a move's role
as well as its name, and a fine-tune on texts that pass it bring the audited
claims down to today's.

## Cost on Workers AI

A prompt is about 2,900 characters (about 850 tokens) and an answer about 85
to 100 tokens. At the prices of 2026-11-18, Gemma 4 26B-A4B costs about 10
neurons an explanation and Llama 3.2 3B about 7, so the free 10,000 neurons a
day cover about 1,000 or 1,400 explanations, and each one past that costs
about $0.0001. If both pass in a later round, the rule takes the cheaper: the
fine-tune.
