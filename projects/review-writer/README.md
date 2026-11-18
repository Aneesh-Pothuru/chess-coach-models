# Rewording Game Review's explanations

**The question.** At each key moment of a game, Game Review explains what the
player's move allowed and what the better move does, in text the app's code
writes from facts it has checked on the board ([explain-top-move](../explain-top-move/)).
That text is true, but it is long, it names no lesson idea, and it reads the
same at every level. Can an open language model that Cloudflare's Workers AI
serves, so the app could call it from a Pages Function, rewrite the explanation
from the same checked facts so that a player at his level understands it
better, without saying anything the facts do not?

**The answer.** Not yet run. The facts are being exported.

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
  with one prompt per candidate, fixed on train.

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

The writer, the truth check and the judge come with their own scripts.

## Running it

```bash
.venv/bin/python projects/review-writer/stream.py --month 2026-10 --games 400
export CHESS_DIR="$(bridge/checkout.sh at 03eea91da93c8a9b3fe38646d2f1c6bc7968f21e)"
for i in 0 1 2 3; do bridge/run.sh projects/review-writer/facts.mjs --month 2026-10 --shard $i/4 & done; wait
```
