# Round 4: prompt 4, a truth check that reads roles, and a fine-tune on it

Run on 2026-11-18 and 2026-11-19 on the same moments, splits and judge as
round 3 ([round3.md](round3.md)). The texts, the judges' answers and the
fine-tuning set stay under `private/`; only these aggregates are kept here.

## What changed

- **The truth check, v2** (`check.mjs`). Besides every move, square and number,
  a text's owners ("your knight on f3"), line starts ("starting with Qxf7+")
  and tactic words (pin, fork, skewer, trap, discovered) must be the facts'.
  Under v2, Gemma 4's prompt 3 held-out texts pass on 98.5%, against 99.5%
  under v1.
- **Prompt 4** (`lib.mjs`). The mistake gets a sheet of its own: the first
  piece the opponent takes and the net material the player loses, or the
  king's square when the move allows mate. The writer names a target only when
  the sheet names one, keeps each fact with its move, names owners and line
  starts as the facts give them, and gives a capture that only follows another
  move as conditional.
- **Prompt 5** (`lib.mjs`) asks for the habit as a closing sentence of its own,
  after prompt 4 lost it (below). It is written but not yet run.

## Gemma 4 26B-A4B on prompt 4

Truth check v2: 99.5% of 1,079 train game moments, 100% of 200 held-out game
moments, 99.0% of 732 train puzzle moments and 100% of 200 held-out puzzle
moments. Median length on held-out games: 59 words, against 66 on prompt 3.

The claim audit (coach-eval's `rubric.mjs`, Sonnet 5.5, ten moments a call,
800 of 800 texts answered) read both prompts' texts on the 200 held-out game
moments beside today's text and a decoy:

| | Today's text | Prompt 3 | Prompt 4 | Decoy |
|---|---|---|---|---|
| Stakes | 78% | 73% | 69% | 0% |
| Target | 79% | 84% | 80% | 0% |
| Their reply | 92% | 94% | 94% | 1% |
| The fix | 74% | 79% | 77% | 0% |
| The habit | 87% | 88% | 64% | 0% |
| The level | 19% | 100% | 99% | 0% |
| False claims per text | 0 | 0.040 | 0 | 0 |
| Unsupported claims per text | 0 | 0.140 | 0.015 | 0 |
| Claims over today's, paired | | +0.18 (0.13 to 0.25) | +0.015 (0 to 0.031) | 0 |

Paired on the same moments, prompt 4 has 0.165 fewer claims a text than prompt
3 (0.109 to 0.227 fewer). The cost was the habit: asked to keep every claim to
the facts, Gemma 4 often dropped the closing advice, which is not a claim about
the position. Prompt 5 asks for it in a sentence of its own.

## The fine-tune on prompt 4

- Set (`sft.mjs`): every train game and puzzle moment whose prompt 4 text
  passes check v2, 1,799 examples (1,074 game, 725 puzzle).
- Training (`finetune.py`): round 3's settings (Llama 3.2 3B Instruct, LoRA
  rank 16 on q, k, v and o, two epochs at 2e-4, batch 4 with 4 accumulation
  steps, 226 steps). It ran 44 minutes on a Colab L4; the loss fell from 0.95
  to 0.17 (0.24 over the run). The adapter is 35 MB.
- Truth check v2: 100% of the 200 held-out game moments and 100% of the 200
  held-out puzzle moments. Median length 59 words.

**Blind judge**, against today's text on the 200 held-out game moments, both
orders, now in ten calls of 50 items (the last of 10): preferred in 80.7% of
398 decided comparisons, 76.5 to 85.5% over games and 72.5 to 91.1% over calls
(per call 93, 60, 84, 72, 96, 86, 78, 65, 84 and 100%). Controls held: the same
text on both sides was called the same 20 of 20 times, and the decoy lost all
40 of its decided comparisons. One item the first call skipped was answered
in a call of its own.

**Claim audit**, beside its teacher's prompt 4 texts on the same 200 moments
(800 of 800 texts answered):

| | Today's text | Gemma 4, prompt 4 | Llama 3.2 3B fine-tuned | Decoy |
|---|---|---|---|---|
| Stakes | 78% | 72% | 69% | 1% |
| Target | 83% | 84% | 84% | 0% |
| Their reply | 91% | 93% | 93% | 0% |
| The fix | 71% | 69% | 69% | 0% |
| The habit | 88% | 67% | 70% | 0% |
| The level | 15% | 99% | 99% | 0% |
| False claims per text | 0 | 0.010 | 0.005 | 0 |
| Unsupported claims per text | 0 | 0.020 | 0.025 | 0 |
| Claims over today's, paired | | +0.030 (0.005 to 0.057) | +0.030 (0.010 to 0.057) | 0 |

The fine-tune matches its teacher: paired on the same moments, it has +0.000
claims a text more (-0.024 to +0.025). The audit's own count of rare claims
moves between runs: the same 200 prompt 4 texts of Gemma 4 drew 3 claims in
the first audit and 6 in this one.

## Where the claims come from

On 19 of the 200 held-out moments (10%), the fact sheet gives no reason why
the reply to the player's move hurts: it names the reply and its line, and the
board code finds nothing it attacks or wins. The fine-tune's flagged texts fall
on 5 of those 19 moments and on 1 of the other 181; Gemma 4's on 3 of the 19
and 3 of the 181. Most supply the missing reason: the reply "gives them time
to develop", "leads to a different plan", "stops your pressure". The rest put
a fact in the wrong role, such as the better move's mate threat credited to the
move played.

## Against the rule

| Condition | Gemma 4, prompt 4 | Llama 3.2 3B fine-tuned on it |
|---|---|---|
| 1. Truth check at least 99% on held-out | 100% | 100% |
| 1. Audited claims no more than today's | fails: +0.015 and +0.030 a text in two audits | fails: +0.030 a text |
| 2. Preferred to today's text, interval above one half | not judged this round | held-out, over games and over calls |
| 3. Judge controls | held | held |
| 4. Median length at most today's | 59 against 114 words | 59 against 114 words |

Neither is kept. Both are within about one claim in 33 texts of today's text,
and the rule asks for none: today's text restates the facts, so it carries no
claim of its own, and the audit's interval can lie at or below zero only for a
writer with no flagged text at all.

## What the round says

The claims that remain sit where Game Review's facts do not say why the
player's move was bad, and the writer fills the gap. A rewording of the same
facts cannot coach that moment, however clear it is. The next round gives the
writer more to coach from: coach-eval's coaching sheet (`coach-sheet.mjs`),
which holds the candidate moves a player at the level weighs, each failing
one with the reply that refutes it and the tactic that reply carries out, the
better move's forcing line move by move, and what on the board should have
prompted the search.

## Cost on Workers AI

A prompt 4 prompt is about 3,400 characters (about 1,000 tokens), against
2,900 for prompt 3. At round 3's prices an explanation costs about 7 neurons on
Llama 3.2 3B and about 11 on Gemma 4.
