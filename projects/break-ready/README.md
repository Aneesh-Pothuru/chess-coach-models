# Does the checklist before a break tell when the break is sound?

**The question.** [structure-breaks](../structure-breaks/) found that a break
the app teaches for his pawn structure, played merely because it can be, is
sound about one time in five, no more often than a random move, while his own
move is sound more than half the time; the breaks he chose were as sound as
his other moves. What the app can teach is the moment. The coaching method
the app follows names the moment with a checklist to run before playing a
break (the curriculum's section 3c):

> pieces developed and pointed at the lines that open? rooks ready for the new
> file? does it create a passed pawn or expose a king? equal or better force on
> that sector? 3–4 moves calculated? Rushing the break before the pieces are
> ready is the band's most common structural error.

Read as board code, does that checklist tell a sound break from an unsound
one? Among breaks that the app's own blunder check calls safe, and comparing
each break with the same break of the same structure at other moments, are the
breaks whose pieces are ready sound more often than the rushed ones?

**The answer.** No signal, by the rule below, which was committed before any
reading was joined to a score; every control passed. Among the breaks the
app's blunder check calls safe, those whose pieces are ready are sound about as
often as the rushed ones of the same break: the lift is a few points on each
half of his games, both intervals across 0, and a few points below 0 for strong
players. The blunder check is the question that tells the moment: a safe break
is sound about twice as often as one that is not, for him and for strong
players. All five questions almost never pass together, and even where a safe
break has its pieces ready it is sound about three times in ten, against his
own move's five and a half. The app can keep the checklist as a way of thinking
and put the blunder check first, but the verdict on a break stays the
engine's. The numbers are in [`results/break-ready.md`](results/break-ready.md),
written by `analyze.mjs`, and [`results/descriptions.md`](results/descriptions.md),
written by `describe.mjs`, which adds after the run a check of the intervals on
random readings and each piece question alone among the safe breaks; the paper
is [`paper/paper.pdf`](paper/paper.pdf).

If they are, the review and the drills can teach the moment in the
checklist's words: the pieces are not ready yet, so the break opens lines for
the other side. If they are not, the checklist read this way cannot stand in
for the engine's word on a position, and the app should not offer it as the
test of when to break.

## The breaks

Every break of every position structure-breaks scored: his quiet positions
with a break on (the earlier and the later half of his games, 491 and 418
positions; nothing is fitted, so the halves are two replications) and 1,200
strong players' positions (the Lichess September 2026 games between two players
rated 2200 or more), every one of whose moves had exact scores. A break is a legal move of the mover's that the app's
`playedLever` counts as a break of the structure `structureOf` names, for the
mover's side (`leversFor`), as structure-breaks read it. Each break is a unit:
his 716 and 553 breaks, the strong players' 1,416. Its soundness comes from
structure-breaks: the referee (Stockfish at the app's `grade` budget, the hash
cleared before each position) accepts it within 3 win% of its best
(`acceptsAlternative`). Its **group** is its structure and the break it plays
(the lever `playedLever` counts it as), such as the London pyramid's c3-c4.

## The questions, as board code

Each question reads the position before the break, through the app's
knowledge service (`boardOf`, `pieceSight`, `passedPawns`, `shelterOf`,
`safetyCheck`, `PIECE_VALUE`). The break moves a pawn from a square to the
**break square**; its **targets** are the other side's pawns the pawn attacks
from there; the **lines it opens** are the files of the pawn's square, the
break square and the targets; its **sector** is the break square's file and
the files on either side of it.

1. **Aimed**: no knight or bishop of the mover stands on its starting square,
   and at least two of the mover's knights, bishops, rooks and queens are
   aimed at the break: a rook or queen on one of the lines it opens, or a piece
   that sees the break square or a target (`pieceSight`'s `sees`: the squares
   it reaches up to and including the first piece on each line).
2. **Rooks**: a rook of the mover stands on one of the lines the break opens,
   or has a legal move to one. A mover with no rook passes.
3. **Purpose**: the break creates a passed pawn for the mover or thins the
   other king's shelter (`shelterOf`), read after the break and after the
   trade it offers (the break's pawn and a target taken off the board).
4. **Force**: the mover's knights, bishops, rooks and queens in the sector are
   worth at least the other side's (`PIECE_VALUE`).
5. **Safe**: the app's blunder check (`safetyCheck`) calls the break safe: it
   allows no mate in one, leaves nothing newly hanging and deserts no defence.
   This is as much of "3–4 moves calculated" as board code can read without an
   engine.

**Pieces ready**: questions 1, 2 and 4 all pass. A safe break whose pieces are
not ready is **rushed**.

## Counted before the rule

Before this rule was fixed, each question was read on every break and the
passes counted, with no score of any move read
([`results/coverage.md`](results/coverage.md), written by `coverage.mjs`). All
five questions pass for 8 of his 1,269 breaks and 11 of the strong players'
1,416, so the checklist taken whole cannot be tested: question 3 passes for
about one break in fourteen of his. The rule tests the piece questions, which
the checklist itself calls the band's most common error, among the breaks the
blunder check calls safe; there his breaks with the pieces ready are 157 of 446
and 136 of 344 on the two halves.

## The measure

**The lift** of a reading is the soundness of the breaks it passes minus that
of the breaks it fails, within each group, pooled over the groups with breaks
on both sides by the weight `n₁n₀/(n₁+n₀)` (`n₁` and `n₀` the group's breaks
on each side; a group with breaks on one side only adds nothing). It compares
each break with itself at other moments, so it measures the moment, not which
break is the sounder in general. Intervals come from 2,000 bootstrap draws
with a fixed seed (20261020), resampling his games within each half, or the
strong players' positions (one a game): the 95% percentile interval.

## The rule, fixed before any reading was joined to a score

**The controls come first.** If any fails, the study gives no verdict.

1. **The referee tells moves apart here.** His own move's soundness minus a
   random non-break move's must have its 95% interval above 0 on each half, and
   the strong player's move's minus the random move's above 0 (the random moves
   structure-breaks drew).
2. **A reading known to matter shows.** The blunder check's own lift (safe
   breaks against the others, over all breaks) must have its interval above 0
   on both halves. Without it, a lift the piece questions lack could be one
   this design cannot see.
3. **The null.** A reading drawn at random, passing as many safe breaks in each
   group as pieces ready does (seeded), in place of pieces ready, must not
   pass step 4 or step 5.

**Then, on his safe breaks:**

4. **The pieces tell the moment** when the lift of pieces ready has its 95%
   interval above 0 on both halves.
5. **The pieces mislead** when it lies below 0 on both halves.
6. **No signal** otherwise.
7. **Not enough data (n=…)** when a half has fewer than 60 safe breaks with the
   pieces ready or fewer than 60 rushed ones, whatever the numbers say.

## Also reported, without a rule

- The lift of each question alone, of the four questions other than purpose
  together, and the soundness by how many of the five pass, his halves pooled.
- The strong players: the lift of pieces ready among their safe breaks, and
  the blunder check's lift.
- By group: the lift of pieces ready for each group with at least 30 safe
  breaks on each side, his halves pooled.
- **His choice**: how often he played the break when it was safe with the
  pieces ready, and when it was rushed.
- **The ready break against his move**: in his positions with a safe break
  whose pieces are ready, those breaks' soundness minus his own move's, paired
  by position.

## Caveats

- **A reading of the words.** "Pointed at the lines that open", "ready" and
  "sector" are read here one way each, fixed before any score was joined; a
  coach might read them otherwise. Another reading is another study.
- **The breaks are the app's.** Only the breaks the structure catalogue names
  are tested, at the squares `playedLever` reads.
- **Sound is a window**, as in structure-breaks: several moves are often within
  3 win% of the best.
- **Many breaks a game for him.** A game where a break stays on counts many
  times; intervals resample whole games for that reason.
- **The same positions.** The positions, their scores and the referee are
  structure-breaks'; this study adds no engine search.

## Who runs it

A Claude session on this repository's bridge, on CPU. The readings of each
break go under `private/break-ready/`, which git ignores; only aggregates are
committed (`results/`), written by the scripts, then the paper. No language
model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants, the five questions (`checksOf`), each break's group (`leverOf`), the lift (`leverWeighted`) and its bootstrap (`bootStat`). |
| `coverage.mjs` | Reads the questions on every break structure-breaks scored and writes them (`private/break-ready/<who>-checks.jsonl`) and their counts (`results/coverage.json` and `.md`). No score is read. |
| `analyze.mjs` | Joins each break's readings to its score, applies the rule and the descriptions; writes `results/break-ready.json` and `.md`. |
| `describe.mjs` | The descriptions added after the run (the intervals checked on random readings, each piece question alone among the safe breaks, the safe breaks by piece questions passed); writes `results/descriptions.json` and `.md`. |
| `paper/generate.mjs` | Writes `paper/generated.tex`, every number, table and position the paper prints, from `results/` and the private rows (the two positions rescored), and refuses to write when a claim the paper makes no longer holds. |
| `paper/paper.tex` | The paper. |

## Running it

```bash
make chess
# structure-breaks first: its positions and scores
bridge/run.sh projects/break-ready/coverage.mjs
bridge/run.sh projects/break-ready/analyze.mjs
bridge/run.sh projects/break-ready/describe.mjs
bridge/run.sh projects/break-ready/paper/generate.mjs
(cd projects/break-ready/paper && latexmk -pdf paper.tex)
```
