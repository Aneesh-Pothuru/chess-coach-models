# How well does a language model coach chess?

**The question.** When a club player makes an error, how well does a language
model coach it? Is what it says true, does it teach the way a good coach
teaches calculation and attack, and would the player rather read it than the
app's own text? Each model is measured twice: given the facts the app's code
has already checked, and given only the position.

**The answer, so far (2026-11-18).** Truth first. Given the facts the app's
code has checked, six open models pass the code truth check on 94 to 99.5% of
200 held-out game moments and 94 to 99.5% of 200 held-out puzzle moments.
Given only the position, the same models pass on 1.5 to 15% and 2.5 to 11.5%:
most of their texts name a move the engine does not give. On 199 held-out game
moments, the rubric judge finds Gemma 4 and a Llama 3.2 3B fine-tuned on its
texts meeting the teaching points (target, reply, fix, habit) at least as often
as today's text and the level far more often (100% against 19%), but adding
about 0.2 false or unsupported claims a text, where today's text adds none.
The rubric for the other models and for the bare task is still to run. The
numbers are in review-writer's
[results/round3.md](../review-writer/results/round3.md). In round 4 a stricter
prompt cut those claims to about 0.03 a text, for Gemma 4 and for the Llama
3.2 3B fine-tuned on it alike ([round4.md](../review-writer/results/round4.md));
most of what remains falls where the facts give no reason why the reply hurts.
This file fixed the tasks, the rubric and the measures before any model's text
was read.

**Naming the tactic of a line (2026-11-19).** A coaching text needs the idea of
the winning line, not only of its first move. Read with the app's own detectors
at every solver move, a line's mate, back-rank mate, fork, sacrifice,
attraction of the king, promotion, double check and four mate shapes agree with
Lichess's tags 96% of the time on 20,000 held-out puzzles, and the line finds
every back-rank mate the tagger names, where the app's first-move labeller finds
none
([results/line-tactics.md](results/line-tactics.md)).

## The tasks

Both tasks run on two kinds of moment, with review-writer's train and held-out
split (by game, or by puzzle). No game of the player's own is read.

- **Game moments.** [review-writer](../review-writer/)'s moments: the player's
  inaccuracies, mistakes, misses and blunders that Game Review gives a lesson,
  in rated 10-minute Lichess games from October 2026 between players rated
  1200 to 1500.
- **Puzzle moments.** Puzzles on the themes the courses teach: 1,200 from the
  Lichess puzzle database (CC0; 60 on each of 20 themes of calculation and
  attack, rated 1100 to 1700, with at least 1,000 plays and a popularity of 80
  or more), and the courses' own puzzles. In each puzzle's position, Maia-2 at
  the player's band (chess.com 1100, Lichess 1350) names the four moves such a
  player most likely plays; the first that the engine grades an inaccuracy or
  worse becomes the move played, and the solution's first move, with the
  engine's line after it, the better move. A puzzle whose first move the
  engine does not hold, or where no likely move is an error, is dropped. Game
  Review's own code then writes the moment's facts (the lesson, the mistake's
  reading, the moves' purposes, the linked lesson chapter), as for a game.

**What the puzzles gave (2026-11-18).** All 1,200 Lichess puzzles became
moments (599 train, 601 held-out). Of the 317 course puzzles read, 272 did (133
train, 139 held-out): in 38 none of the four likeliest moves at his band is an
error, in 6 the engine does not hold the solution's first move, and 1 opens
with a null move. Today's text passes the truth check on all 1,472. One thing
the moments show about the app itself: the lesson Game Review links is a
defense lesson ("Choose a defense that changes the threat" or "Choose the right
kind of defense") in 435 of the 1,200 Lichess moments, including 46 of the 60
hanging-piece puzzles, because the better move's purposes match those chapters
first. The writers name the lesson the sheet gives, so the link's misses carry
into their texts.

- **Grounded.** The model gets the moment's fact sheet (review-writer's
  `sheetOf`): the move played, the better move and their lines, what each does
  by the board code, the mistake's reading, the linked lesson and the player's
  side and rating. It writes the explanation the player reads.
- **Bare.** The model gets only the position before the move (FEN), the move
  played, the player's side and rating, and the instruction to coach the
  moment. It has to find the better move and the reason itself.

## The rubric

What a coaching explanation of an error should do, in this lab's words. It
draws on two courses on calculation and attack (listed under Sources) and on
the app's own lessons on checks, captures and threats, defensive duties, the
opponent's best reply and judging an attack.

1. **The stakes.** It says what the error costs, in material or in what it
   allows, such as a mate or a lost piece.
2. **The target.** It names the concrete thing the play turns on: a piece
   with no more defenders than attackers, a piece that can be forked, pinned,
   skewered or trapped, a defender with two jobs, or a weak square or line
   near a king.
3. **Their reply.** It names the opponent's strongest answer to the move
   played and what that answer does.
4. **The fix.** It says how the better move deals with that answer, or what it
   does first that the move played did not. A good coach does not just swap in
   another move; they say what problem the new move solves.
5. **The habit.** It ends with one thing to do at the board next time, tied to
   the moment: count the material, look for loose pieces and for checks,
   captures and threats before quiet moves, ask what the opponent's best reply
   is, or, before an attack, count the attackers against the defenders.
6. **The level.** Plain words a player rated about 1350 follows, with no engine
   numbers unless they help, in about 90 words or fewer.

## The measures

Each on the held-out moments, with a 95% bootstrap interval over games (or
puzzles), for every model run:

- **Truth.** The share of texts that pass the code check (review-writer's
  `check.mjs`). It finds every move, square and number a text names among the
  moment's facts, and every piece it places on a square on that square in a
  position the facts are about. Bare texts are checked against the same facts,
  so a move the facts do not record counts as unsupported even when it is
  sound: the bare task is read for truth, not for agreement with the engine.
  Beside the code check, a judge model counts each text's false claims and
  unsupported claims, with the fact sheet as its reference.
- **Rubric coverage.** For each of the six criteria, the share of texts that
  meet it, read by a judge model blind to the writer.
- **Preference.** The share of decided blind comparisons, in both orders, in
  which the judge prefers the model's text to today's (review-writer's
  `judge.mjs`).
- **Controls.** Today's text is read by the same rubric judge. A decoy as long
  as the model's text, which restates the facts and explains nothing, must
  score lower than today's text on criteria 4 and 5, and lose to today's text
  in the preference at least as often as it wins. The same text on both sides
  must be called the same at least 90% of the time. A run whose controls fail
  reports no scores.

The judges are Sonnet 5.5, given the texts and the criteria only, never the
writer's name. Their answers stay under `private/coach-eval/`, and only the
aggregates are committed.

## The coaching task (from 2026-11-19)

Rewording Game Review's findings cannot coach a moment its facts do not explain
(review-writer's round 4). The coaching task gives the writer more to coach from
and asks for a puzzle book's explanation: what in the position should catch the
player's eye, why the natural move fails, the better move's idea and its key
moves, and a habit.

- **The coaching sheet** (`coach-sheet.mjs`). For a moment: what to notice (the
  opponent's loose pieces, a king boxed in on its back rank or with no safe
  square, the player's checks and loose pieces, and the opponent's threat, the
  line they would play if it were their move when it mates or wins two points);
  the candidates (Maia-2's four likeliest moves at the band, the engine's best
  three and the move played), each with the engine's verdict and, for a failing
  move, the refuting line, what it changes hands and its tactics; and the better
  move's line with its idea. The tactics are `line-tactics.mjs`'s readings: the
  point tier may be called the idea, the also tier only what a move does.
- **The prompt** (`coach-prompts.mjs`). The writer reads a trimmed sheet with
  no evaluations or percentages: the move played and one more candidate most
  players at the level choose, when it fails too. Version 2 marks how forced
  each reply in a line is by the rules alone (the only legal move, or a check
  the king has two or three squares out of) and asks the writer to tell a line
  as cause and effect: which move forces which reply, and what that reply sets
  up. A puzzle's better line is its answer key, carried on by the engine's line
  from the key's end to what it wins.
- **Training puzzles** (`train_puzzles.py`). 3,200 Lichess puzzles, 100 on
  each of 32 themes, rated 900 to 1900, none in the held-out sets; their sheets
  are made straight from the puzzles (`coach-sheet.mjs --puzzles`, with Maia-2's
  likeliest error at the band as the move played), for a teacher's coaching
  texts and a fine-tune.
- **The measures.** The truth check (`coach-check.mjs`, review-writer's reading
  of a text against the trimmed sheet, with sacrifices, deflections, decoys,
  double checks, smothered and back-rank mates and promotions added to the
  tactics a text may name only when the sheet does); the coaching rubric and
  claim audit (`coach-rubric.mjs`, Sonnet 5.5, ten moments a call: notice,
  refutation, idea, line, habit and level, with false and unsupported claims
  against the sheet, and a decoy that restates the sheet's lines); and the blind
  judge asking which text better teaches the player to find such moves
  (review-writer's `judge.mjs --question teach`), against today's text and
  against round 4's fine-tuned rewording.

**The coaching rule, written before any candidate's coaching text is read.** A
coaching writer is kept when, on 200 held-out game moments and 200 held-out
puzzle moments:

1. at least 97% of its texts pass the truth check (the app would show a text
   that fails the check only after a rewrite, or fall back to today's text, so
   the rate sets how often that happens);
2. the claim audit finds at most 0.02 false claims a text, the 95% interval's
   upper end at most 0.04, and at most 0.05 unsupported claims a text, with the
   decoy control holding;
3. the teaching judge prefers it to today's text in more than half of the
   decided comparisons, with the interval over games and over calls above one
   half, on game moments and on puzzle moments; and
4. its median length is at most 150 words.

If more than one writer is kept, the one that costs least per moment on
Workers AI is taken. The bars of 2 are provisional, for the project's owner to
set. Six
coaching texts from Sonnet 5.5, not a candidate, were read to check the prompt
before this rule was written.

## The models

The open models that Cloudflare's Workers AI serves and review-writer
measures (Llama 3.1 8B, Qwen3 30B-A3B, gpt-oss-20b and Gemma 4 26B-A4B, run
from their open weights on Colab), gpt-oss-120b as a ceiling, each
review-writer prompt's writer, any model fine-tuned on the train moments, and
Claude models where they can be run for both tasks.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The bare task's prompt. |
| `prompts.mjs` | The bare task's prompts for review-writer's game moments of a split, in review-writer's sample order. |
| `lichess_puzzles.py` | Samples the Lichess puzzle database into `private/coach-eval/lichess-puzzles/`, in the shape the course puzzles take. |
| `puzzle-facts.mjs` | Turns a puzzle set (`--set lichess` or `--set course`) into review moments with the app's code. Sharded and resumable. |
| `puzzle-prompts.mjs` | Merges the puzzle moments and writes their grounded and bare prompts for a split. |
| `rubric.mjs` | The rubric judge and claim audit: builds blind batches of a moment's texts beside today's text and a decoy, and scores the judge's answers with the paired difference in claims against today's text. |
| `line-tactics.mjs` | The tactic a whole line carries out: the app's detectors at every solver move and how the line ends (`signals`), and their words scored against Lichess's puzzle themes (`score`). Exports `lineSignals`, `lineConcepts` and `RULES` for the coaching sheet. |
| `line-tactics-dev.mjs` | The development set's comparison of readings that set `line-tactics.mjs`'s tiers. |
| `line-tactics-peek.mjs` | Prints development-set mates that the back-rank reading and Lichess's tags disagree on. |
| `line_sample.py` | Draws `line-tactics.mjs`'s held-out set by streaming the Lichess puzzle database. |
| `coach-sheet.mjs` | The coaching sheet of a moment, with the app's engine, Maia-2 and board code. Sharded and resumable. |
| `coach-prompts.mjs` | The coaching task's prompt and the trimmed sheet a writer reads. |
| `train_puzzles.py` | Samples the coaching task's training puzzles from the Lichess database, by theme. |
| `engine-lines-check.mjs` | Compares the app engine's multi-line and single-line searches on moments. |
| `coach-check.mjs` | The coaching task's truth check, against the trimmed sheet. |
| `coach-rubric.mjs` | The coaching rubric judge and claim audit, with a decoy control and paired differences between writers. |
| `engine-peek.mjs`, `threat-peek.mjs`, `coach-vocab-peek.mjs` | Print the app engine's lines, the threat reading and a sheet's truth-check vocabulary for one position. |

## Running it

```bash
.venv/bin/python projects/coach-eval/lichess_puzzles.py --per 60
export CHESS_DIR="$(bridge/checkout.sh at 03eea91da93c8a9b3fe38646d2f1c6bc7968f21e)"
for i in 0 1 2 3 4 5; do bridge/run.sh projects/coach-eval/puzzle-facts.mjs --set lichess --shard $i/6 & done; wait
node projects/coach-eval/prompts.mjs --split train --limit 200
node projects/coach-eval/puzzle-prompts.mjs --split train --limit 200
bridge/run.sh projects/review-writer/check.mjs --today --split train --facts private/coach-eval/puzzle-moments.jsonl --name today-puzzles-train
.venv/bin/python projects/coach-eval/line_sample.py
for s in app heldout; do for i in 0 1 2 3 4 5; do bridge/run.sh projects/coach-eval/line-tactics.mjs signals --set $s --shard $i/6 & done; wait; done
bridge/run.sh projects/coach-eval/line-tactics.mjs score --set heldout --shards 6
```

The writers run on Colab with review-writer's `write.py`, and their texts are
checked with review-writer's `check.mjs` (`--facts` for the puzzle moments).

## Sources

- Azel Chua, *Calculation: A Complete Guide for Tournament Players*,
  Chessable, 2021: the order of looking (material, then targets, then
  candidate moves) and fixing a failed candidate by what refuted it.
- Azel Chua, *How to Create Attacks*, Chessable, 2023: adding attackers,
  weighing the defenders and valuing pieces by what they do.
- S. A. Hebbar, P. Sheng, S. Oh and P. Viswanath, *Hallucinations on the
  Board: Tool-Augmented Evaluation of LLM Chess Commentary*, arXiv 2608.04240,
  2026: claim-level checking of chess commentary against engine tools.

No text from the courses is used or kept here: the rubric puts their methods in
this lab's own words. Their puzzles' positions and solutions are read from the
owner's account into `private/coach-eval/course-puzzles/` on the owner's
machine, for the puzzle task and for fine-tuning, and are never committed;
only aggregates over them are.
