# Can the review teach a move from his lessons instead of the engine's top line?

**The question.** The daily review teaches, at each of his turning points, a
better move and the line from it. Since the app has study lessons (74 of them,
each a video and a written lesson whose recommended moves were checked with
Stockfish), the player asked for that move to come from what the lessons
teach whenever the engine says it holds: a queen trade, a rook to the seventh
rank, a pawn break, a defence that meets the threat, named with the lesson's
rule, rather than the engine's first line and its moves. Two earlier studies
bound what such a pick may claim: a rule of thumb explains a move but should
not choose it ([rules-of-thumb](../rules-of-thumb/)), and a sound move he
would find costs about what the engine says it gives up
([findable-move](../findable-move/)). So the lessons only choose among moves
the engine already says hold. At his turning points, how often does such a
move exist, what does it cost against the engine's first line, and is it a
move his band plays more often than that first line?

**The answer.** Kept, by the rule below, which was committed before the run.
On both splits a lesson teaches the pick at most turning points, and at most
of them for a purpose his own move lacked; the pick gives up a fraction of a
win% against the engine's first line on average and never leaves the holding
verdicts (its few large losses keep a won game won); and players at his band
choose it more often than the engine's first line. The pick is mostly the
engine's first line; where it is not, his band chooses it far more often than
the engine's move, though a little less often than the move it likes best.
Described, not tested: the lessons it names are few, and one chapter of the
defence lesson stands for most defences, often without fitting the move, so
the next round is a check that the chapter a pick names fits the position.
The numbers are in [`results/lesson-moves.md`](results/lesson-moves.md),
written by `measure.mjs`, and the paper, [`paper/paper.pdf`](paper/paper.pdf).

## What the app does (the change measured)

The change is the app's own code at the commit the report names. It shipped
in chess PR 230 (merge commit 4ba253b), and the lab's pin is that commit, so
both scripts run at the pin:

- `movePurposes` (`src/services/knowledge/purpose/purposes.ts`) reads what a
  move is for on the board, from the move and its engine line: it meets a
  threat, wins material, trades queens, offers a queen trade, trades into a
  pawn ending, trades while ahead, pushes a passed pawn, uses an ending
  technique, puts a rook on the seventh rank or an open file, breaks with a
  pawn, takes an outpost, improves the worst piece, castles, develops, takes
  the centre, or mates.
- `lessonChapters` and `lessonsFor` (`src/services/study/lessonIdeas.ts`) read
  the same purposes from every move the lessons recommend, and offer, for a
  purpose, the chapters whose lesson is tagged with one of its ideas, ranked
  by how well the chapter's own recommended moves match it.
- `pickLessonMove` (`src/services/review/lessonMove.ts`) picks, among the
  candidates that hold for him, the one his band plays most often among those
  a lesson teaches for a purpose his move lacked; else that a lesson teaches;
  else the likeliest that holds; else the engine's first line.

## The positions

His games in the app's archive (`coach-log/review-analysis/`), every turning
point (`deep`) with him to move and at least one stored engine line. In each:

- **The candidates** are the first moves of the stored lines (the routine's
  `deep` budget, up to five), with their stored evals in his view
  (`fromArchiveCp`). No new engine search is run: the app's `teach` command
  also adds his band's likeliest moves, which this study leaves out.
- **E, the engine's first line**: the first stored line.
- **Holding** candidates are graded against E by the app's `gradeEvals` and
  hold for him by `TEACHING_HOLDS.player` (`best` or `keeps`).
- **His band** is `defaultMaiaElo` of his rating at the game with the app's
  offset, and each candidate's **share** is Maia-2's probability for it at
  that band (the app's `humanPolicy`).
- **N, the natural move**: the holding candidate with the largest share.
- **L, the lesson pick**: `pickLessonMove` over the holding candidates, each
  with its purposes (read with its stored line) and the chapters
  `lessonsFor` offers for each; his move's purposes are read with the
  routine's punishment line.

## The rule, fixed before the run

**Split.** Train: the archive's days up to and including 2026-09-16, the
first two thirds of the turning points. Held out: 2026-09-17 to 2026-11-02,
without 2026-10-31 and 2026-11-02, whose turning points were read while the
change was designed.

**Measures**, on each split:

1. **Coverage**: the share of turning points where L is taught by a lesson
   (`lesson` or `lesson-shared`), and where it is taught for a purpose his move
   lacked (`lesson`).
2. **Cost**: L's win% loss against E, in his view (the app's `winPercentFor`,
   as `gradeEvals` reads it).
3. **Findability**: L's share minus E's share, paired by turning point, with a
   95% interval from 10,000 bootstrap resamples of games (a game's turning
   points move together).
4. Described, not tested: how often L is E, how often L is N, L's share minus
   N's, the purposes L is picked for, and how many lessons are named.

**What counts.** The pick is kept in the app's `teach` when, on both splits:
coverage under `lesson` or `lesson-shared` is at least 50%; L's mean loss
against E is at most 1.5 win% and no L falls outside the holding verdicts;
and L's share minus E's has its interval above 0. When one of these fails,
the report says which, and the port waits.

## Running it

```bash
make chess
bridge/run.sh projects/lesson-moves/measure.mjs
bridge/run.sh projects/lesson-moves/paper/generate.mjs
```

`measure.mjs` writes one row per turning point to `private/lesson-moves/`
and the aggregates to [`results/lesson-moves.json`](results/lesson-moves.json)
and [`results/lesson-moves.md`](results/lesson-moves.md), with the app commit
it measured. It uses Maia-2 and the board code only: no engine search and no
language model.
