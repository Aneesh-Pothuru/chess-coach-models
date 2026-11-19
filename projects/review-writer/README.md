# Rewording Game Review's explanations

**The question.** At each key moment of a game, Game Review explains what the
player's move allowed and what the better move does, in text the app's code
writes from facts it has checked on the board ([explain-top-move](../explain-top-move/)).
That text is true, but it is long, it names no lesson idea, and it reads the
same at every level. Can an open language model that Cloudflare's Workers AI
serves, so the app could call it from a Pages Function, rewrite the explanation
from the same checked facts so that a player at his level understands it
better, without saying anything the facts do not?

**The answer, so far (round 3, 2026-11-18).** Yes for the clarity and the
truth check; the claim audit is still to run. Given the checked facts, Gemma 4
26B-A4B passes the truth check on 99.5% of 200 held-out moments, and a blind
judge prefers its text to today's in 68% of decided comparisons (95% interval
62 to 73%; 58% on train). Llama 3.2 3B Instruct, the smallest base Workers AI
runs LoRA adapters on, is preferred 10% of the time as it ships; fine-tuned on
1,804 of Gemma 4's train texts that pass the check, it passes on 99.0% of the
held-out moments and is preferred in 69% (64 to 75%), at a median of 65.5
words against today's 114. The judge's controls held in every run. Numbers,
settings and costs are in [results/round3.md](results/round3.md).
The facts: 2,322 moments in 387 games, 1,079 train and 1,243 held-out, 2,085
of them with a lesson link; today's text passes the truth check at every one.

## What is measured

- **The moments.** Rated 10-minute Lichess games (600+0) from October 2026
  between two players rated 1200 to 1500 (the player's level is about 1350 on
  Lichess by the app's conversion): the first 400 that `stream.py` keeps. Each
  game is reviewed by the app's Game Review at the phone profile, with White as
  the player in even games and Black in odd ones (`facts.mjs`). A moment is one
  of the player's inaccuracies, mistakes, misses or blunders that the screen
  gives a lesson. No game of the player's own is read in this round.
- **The app.** Its `main` at `03eea91da93c8a9b3fe38646d2f1c6bc7968f21e`
  (2026-11-17), later than the lab's pin, because the lesson link the screen
  shows came with chess PR 240 and is not at the pin.
- **The split.** By game: the first byte of sha256("review-writer:" + the
  Lichess id) below 128 is train, the rest held-out. A writer's prompt is
  developed on train only, and the verdict reads held-out.
- **The fact sheet.** What `facts.mjs` records for a moment: the position, the
  move played and the better move with its line, the class and the win% the
  move gave away, the board code's reading of the mistake (its kind, piece,
  square, points and line), the purposes of the better move and of the reply,
  the lesson chapter the screen links and why, the odds that a player at the
  opponent's band finds the punishing reply, and today's text in its parts
  (headline, what the move allowed, what the better move does instead, the
  difference and the takeaway).
- **The baseline.** Today's text as the screen shows it: the headline, the two
  sections, the difference and the takeaway.
- **The candidates.** Open models in the Workers AI catalog as it stood on
  2026-11-18: Llama 3.1 8B Instruct, Qwen3 30B-A3B, gpt-oss-20b and Gemma 4
  26B-A4B. This round runs their open weights on Colab, since Cloudflare may
  serve them quantized: the writer that is kept is read again as Cloudflare
  serves it before anything is ported. Each writes from the fact sheet alone,
  with one prompt per candidate, fixed on train. From the third round,
  gpt-oss-120b writes too, as a ceiling and a teacher (Workers AI serves it at
  several times the others' cost), and Llama 3.2 3B Instruct, the smallest base
  Workers AI runs LoRA adapters on, is read as it ships and after fine-tuning on
  the teachers' train texts that pass the truth check (`sft.mjs`,
  `finetune.py`). A fine-tune is a candidate under the same rule, and
  coach-eval's puzzle moments add train examples and a second held-out set.

## The rule

Written before any candidate's text is read. A candidate is kept when, on the
held-out moments, all four hold:

1. **It says nothing the facts do not.** The truth check (`check.mjs`, code)
   finds every move, square and number a text names among the fact sheet's,
   and every piece it places on a square on that square in the position the
   sentence is about. A text that misses once fails its moment. The
   candidate's pass rate is at least 99%, and an audit by a judge model of
   false and unsupported claims finds no more per text than in today's text
   (the paired difference's 95% bootstrap interval over games lies at or below
   zero).
2. **It is clearer at his level.** A blind judge (Sonnet 5.5, both orders)
   reads the candidate's text and today's and picks the one a player rated
   about 1350 would understand and use better. The candidate is preferred in
   more than half of the decided comparisons, pooled over both orders, with
   the 95% bootstrap interval over games above one half, on train and on
   held-out.
3. **The judge is checked.** It calls the same text on both sides the same at
   least 90% of the time, and a decoy as long as the candidate, which restates
   the facts and explains nothing, loses to today's text at least as often as
   it wins.
4. **It is no longer.** The candidate's median length in words is at most
   today's.

If more than one candidate is kept, the one that costs least per moment on
Workers AI is taken. If none is, the round reports which condition failed,
and fine-tuning the best candidate on train is the next round's question.

## Files

| File | What it does |
|---|---|
| `stream.py` | Keeps the month's rated 600+0 Lichess games between players rated 1200 to 1500 that carry evals and clocks, the first `--games` in file order, under `private/review-writer/`. |
| `facts.mjs` | Reviews each kept game with the app's Game Review at the phone profile and writes one fact sheet a moment, with today's text, under `private/review-writer/`. Sharded and resumable. |
| `lib.mjs` | What the scripts share: the split, today's text as the screen shows it, the fact sheet a writer reads and the writer's prompt. |
| `prompts.mjs` | The writers' prompts for a split, from public games only, so the file can be read on Colab. `--limit N` takes the first N moments in a seeded order. |
| `write.py` | Writes each prompt's explanation with one candidate's open weights under vLLM on a GPU (Colab), greedy, loading the weights once for all the prompts files it is given. `--lora` applies a fine-tune's adapter. |
| `sft.mjs` | The fine-tuning set: each train moment's prompt with the first teacher text, in the order given, that passed the truth check. |
| `finetune.py` | LoRA-tunes a writer on that set on a GPU (TRL, loss on the answer only), keeping to Workers AI's LoRA limits so the app could serve the adapter. The default base is Llama 3.2 3B Instruct, which Workers AI runs LoRA adapters on. |
| `check.mjs` | The rule's truth check in code, on a writer's texts or, with `--today`, on today's text as the control. A lesson's own idea is not a fact about the position, so it does not count as one. `--facts` adds other moments in the same shape, such as coach-eval's puzzle moments. |
| `judge.mjs` | The blind judge's comparisons (`build`: a writer's text against today's in both orders, with a same-text control and a length-matched decoy) and their score (`score`: the preference over decided comparisons with a 95% bootstrap interval over games, and the controls). |

The writer's prompt is in `lib.mjs` (`PROMPT_VERSION`). Prompt 1 gave the
linked lesson's idea; writers then applied the lesson's own example to the
game's position. Prompt 2, developed on train, gives the player's side and
drops the idea.

## Running it

```bash
.venv/bin/python projects/review-writer/stream.py --month 2026-10 --games 400
export CHESS_DIR="$(bridge/checkout.sh at 03eea91da93c8a9b3fe38646d2f1c6bc7968f21e)"
for i in 0 1 2 3; do bridge/run.sh projects/review-writer/facts.mjs --month 2026-10 --shard $i/4 & done; wait
bridge/run.sh projects/review-writer/check.mjs --today --split train
node projects/review-writer/prompts.mjs --split train --limit 200

# On a GPU (Colab), one writer a process; writes texts-prompts-train-200-v3-qwen3-30b-a3b.jsonl:
python projects/review-writer/write.py --prompts prompts-train-200-v3.jsonl --writer qwen3-30b-a3b --out-dir .

bridge/run.sh projects/review-writer/check.mjs --texts private/review-writer/texts-prompts-train-200-v3-qwen3-30b-a3b.jsonl --name train-v3-qwen3-30b-a3b
```
