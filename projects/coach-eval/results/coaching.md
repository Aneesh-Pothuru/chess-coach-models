# Coaching a line out loud: what a writer adds to Game Review

Run on 2026-11-19 at the app's `03eea91`, on the development set: 200 held-out game
moments (review-writer's facts, public Lichess games of October 2026) and 200 held-out
puzzle moments (course and Lichess puzzles read as review moments, `puzzle-facts.mjs`).
These moments were read while the sheets, prompts and checks below were built, so every
number here is a development number; the coaching rule's verdict needs a fresh sample.

The question is the one a coach answers at the board: when the winning move does not
win at once but forces a reply that sets up the tactic ("this check drags the king to
g2, and then the knight forks king and queen"), can a language model say that line out
loud, truthfully, in a way that teaches better than today's Game Review text?

Writers ran from their open weights on a Colab A100 (vLLM 0.34, greedy decoding):
Gemma 4 26B-A4B, gpt-oss-120b, gpt-oss-20b, Qwen3 30B-A3B and Llama 3.2 3B. The
measures are the coaching task's (README): the truth check (`coach-check.mjs`), the
claim audit (`coach-rubric.mjs`, Sonnet 5.5, false and unsupported claims against the
facts the writer was given), and the blind teaching judge against today's text
(review-writer's `judge.mjs --question teach`, both orders, with the same-text and
decoy controls, which held in every run below). A preference rate is the writer's
share of decided comparisons, with 95% intervals over moments and over judge calls.

## 1. Coaching from the coaching sheet

The writer gets the moment's coaching sheet (`coach-sheet.mjs`: what to notice, the
failing candidates with their refutations, the better line with its point) and writes
the explanation itself (`coach-prompts.mjs`).

| Writer (prompt) | Truth, games / puzzles | Median words | Judge vs today, games / puzzles | Audit: false / unsupported a text |
|---|---|---|---|---|
| gpt-oss-20b (2) | 95.0% / 91.5% | 130 | 11.0% [6.6, 16.5] / 7.6% [3.1, 12.2] | 0.55 / 0.62 |
| Gemma 4 (3) | 100.0% / 96.0% | 122 / 141 | 1.5% [0, 4.6] / 16.5% [9.5, 23.5] | 0.09 / 0.23 |
| gpt-oss-120b (3) | 89.5% / 82.0% | 142 / 154 | | |
| Qwen3 30B (3) | 93.5% / 94.5% | 110 / 120 | | |
| gpt-oss-20b (3) | 94.5% / 92.5% | 130 / 132 | | |
| Llama 3.2 3B (3) | 52.5% / 75.0% | 181 / 183 | | |

A bigger writer is far more truthful, but the judge still prefers today's text almost
every time: given a sheet, writers walk through every candidate and long engine lines
move by move, and what the player should take away gets lost.

A narrator in code (`coach-text.mjs`), telling the sheet's chain in fixed sentences, is
true by construction and loses too: 39.5% [30.6, 48.0] of game moments, 27.6% [19.5,
34.8] of puzzle moments.

## 2. Rewriting today's text with the story of its lines

The writer gets today's explanation in its parts and, for each of its lines, the story
the board code reads (`coach-rewrite.mjs`): how forced each reply is by the rules, the
tactic each move carries out, the point, and how the line ends.

| Writer (version) | Truth, games / puzzles | Median words | Tells the set-up chain, puzzles / games | Judge vs today, games / puzzles |
|---|---|---|---|---|
| today's text | 100% / 100% | 114 / 119 | 22% / 0% | |
| Gemma 4 (1) | 99.0% / 99.5% | 85 / 87 | 91% / 83% | 26.6% [19.5, 33.8] / 21.5% [13.5, 29.0] |
| gpt-oss-120b (1) | 96.5% / 96.5% | 108 / 103 | 89% / 67% | |
| gpt-oss-20b (1) | 94.5% / 93.5% | 110 / 106 | 83% / 83% | |
| Qwen3 30B (1) | 95.5% / 95.5% | 73 / 73 | 54% / 28% | |
| Llama 3.2 3B (1) | 91.5% / 92.0% | 83 / 86 | 11% / 0% | |
| Gemma 4 (3) | 99.0% / 98.5% | 61 / 60 | 77% / 40% | 29.6% [23.5, 36.9] / 18.2% [12.1, 23.9] |

"Tells the set-up chain" counts the moments whose better line makes its point after
its first move (46 puzzles, 18 games under version 1's lines) where the text names the
first move, the move that makes the point with its tactic's word, and calls a reply
forced when the rules force it. Today's text names the move that makes the point in
22% of those puzzles and none of those games. Gemma tells the chain in most of them,
but as a replacement for today's text the rewrite still loses about three times in
four: today's text leads with its point, and the rewrite spends its words on the line.
The claim audit of version 3 finds 0.03 false and 0.40 unsupported claims a text,
most of them a reply called forced that the rules do not force.

## 3. Adding the set-up line to today's text

The narration task asks for one or two sentences that tell only the set-up line,
shown after today's headline; today's text stays as it is. A moment is narrated when
its better line (or the line its move allowed) makes its point, a point-tier tactic
or mate, with a later move by the same side within six plies; the story runs to that
point (version 3, the first point; version 4, the last within reach) and keeps how the
line ends. On the development set that is 79 puzzle moments and 17 game moments.

| Narration added after the headline | Truth | Judge vs today, games / puzzles | Audit: false / unsupported |
|---|---|---|---|
| Gemma 4, any line with a later tactic (version 2; 75 games, 150 puzzles) | 98.7% | 6.8% [2.6, 12.0] / 45.5% [37.5, 54.5] | 0.20 / 0.51 |
| Gemma 4, set-ups only (version 3) | 100% | 23.5% [5.6, 44.4] / 62.7% [52.5, 71.5] | 0.13 / 0.09 |
| Code template, set-ups only (version 3) | 100% | 35.3% [12.5, 58.8] / 86.7% [79.7, 92.4] | not audited: it states the facts |

Head to head, both added to today's text, the judge prefers Gemma's narration to the
code template's in 91.1% [84.8, 96.2] of puzzle comparisons and 94.1% [81.2, 100] of
game comparisons. Against today's text alone the template does better, so the judge
is not ranking these on one scale: it reads a mechanical sentence as concrete extra
information, and Gemma's fluent one as better writing of it. Either way, on puzzle
set-ups, the line told out loud teaches more than today's text alone; on game moments
it does not yet (17 moments), and in version 2, which also narrated lines whose
later tactics were side events of a long engine line, it made today's text worse.

Two narrations of the same puzzle (version 3):

- Gemma: "Instead of Rg8, you can play Qg1+ to sacrifice your queen. After they are
  forced to play Rxg1, you follow up with Nf2# for a smothered mate."
- Code: "Qg1+ gives up the queen: it is taken where it lands, after Rxg1 (forced: the
  only legal answer to the check), then Nf2#, and you mate, and before that you lose
  the queen."

## What the texts exposed in the facts

- The opponent's threat was read in the position before the move played, and version 1
  told the writer to say first that the move had not met it. The writer cannot tell,
  and often the move had met it; version 2 gives the threat only when the opponent's
  reply carries it out (19 of the 67 game moments that had one, 14 of 89 puzzles).
- The app cuts its lines, and a cut inside a trade made the line reader see a
  sacrifice in the first half of an exchange and a lost piece in its result. A
  sacrifice now needs the line to go on past the capture (`line-tactics.mjs`), and the
  rewrite carries an app line on through recaptures with the stored engine line that
  starts with it (version 3); lines with a sacrifice tag fell from 23 to 8 in games.
- Tactics were matched to moves by SAN, so a recapture with the same SAN inherited the
  capture's tactic (7 game and 8 puzzle prompts of version 1); they are now tied to plies.
- The truth check walked the app's lines from a doubled first move; it now walks them
  from the moment's position, and it flags a tactic named for a move that does not
  carry it (five of five flags on Llama's texts were real errors once sentences that
  open on "This move" are read with the sentence before).

## Training data

`train-lessons.mjs` gives each themed training puzzle (`train_puzzles.py`) Game
Review's lesson from its sheet's stored search, with no engine. On the development
puzzles its lessons agree with fresh ones on the better move 198 times in 198, the
reply 184 times and the grade 196 times. Of the first 1,879 themed puzzles, 678 hold a
set-up to narrate; the train-split game and puzzle moments add 65 and 252.
