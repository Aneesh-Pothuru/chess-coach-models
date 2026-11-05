# Which lesson chapter should a Game Review moment link to?

**The question.** The app's Game Review explains each key moment of a game
(what his move allowed, what the engine's move does instead), but it names no
lesson, although the app now has 74 study lessons. The daily review does name
one: it reads what the engine's move is for (`movePurposes`) and offers the
chapters whose recommended moves are read the same way (`lessonsFor`). That
matcher concentrates: on his older games one chapter of the defence lesson
is its pick at more than 40% of his mistakes, whatever the defence was (the
open item [lesson-moves](../lesson-moves/) left). The lessons also show
wrong moves on purpose, 115 of them, each in a chapter about that mistake: a
guard that walks away, a defended piece taken, a square that was not safe, a
line opened, a mate allowed. Can the app read his mistake the way those
chapters show it, on the board, and link the chapter that shows the same
mistake? And does such a link fit the moment better than the daily's?

## What the app does (the change measured)

The change is the app's own code at the commit the report names, on the
branch of the chess pull request that ports it:

- `mistakeOf` (knowledge, `src/services/knowledge/purpose/mistake.ts`) reads
  what a move got wrong from the move and the reply line: it allows a mate
  within three moves (with the mate's pattern when the board code names
  it), its piece leaves a guard (`deserted-guard`), it captures a defended
  piece at a loss (`bad-capture`), its piece lands where it is taken at a loss
  (`unsafe-square`), the reply takes a piece that was already loose
  (`ignored-threat`), the reply's capture runs through the square the piece
  left (`opens-line`, with `pin` when the piece was pinned), the reply line
  wins material with a tactic the board code names (`allows-tactic`), or
  loses two points or more within three plies (`loses-material`). Else
  nothing.
- The study service reads the lessons' wrong moves (`counterexample` in the
  scripts) with `mistakeOf` and the scene's next moves, and matches a moment's
  mistake to them (`lessonsForMistake`).

## The positions

His rapid games, reviewed the way the phone's Game Review reviews them (the
app's `coach review <game> --profile phone`, at the commit measured). A
**moment** is a key moment of the review (`moments`) where he moved, the move
is graded an inaccuracy, mistake, miss or blunder, and the review writes a
lesson card for it (`lessonFor`). His mistake is read with the reply line the
card itself uses.

- **B, the daily's matcher**: the first chapter `lessonsFor` offers for the
  engine move's purposes, read with its line; else the first it offers for the
  purposes of the reply (his line), with the reply-threat idea, as the daily's
  `teach` command offers them.
- **C, the candidate**: when his mistake is one of `allows-mate`,
  `deserted-guard`, `bad-capture`, `unsafe-square`, `opens-line` or
  `allows-tactic` (with a named tactic), the chapter the study service
  matches to it; else B. `ignored-threat` and `loses-material` fall back to B,
  because what they need is the defence or the better move, which B reads.

## The rule, fixed before the run

**Split.** His games in the app's archive. Train: every eighth game up to and
including 2026-09-16 (59 games), on which the change was designed. Held out:
every game from 2026-09-17 to 2026-11-04 except those of 2026-10-31,
2026-11-02 and 2026-11-03, which were read while it was designed (223 games).

**Measures**, on each split:

1. **Coverage**: the share of moments where B, and C, name a chapter.
2. **Spread**: how many distinct chapters each names, and the share of its
   named moments that its most named chapter takes.
3. **Fit**, judged on the moments where B and C name different chapters, at
   most 60 on train and 120 held out (a seeded sample when there are more).
   A model judge sees the moment as the review describes it (the position's
   FEN, his move, the engine's move, the reply line, the card's headline and
   its "difference" lines) and the two chapters, each as its lesson's title,
   its chapter title and its narration, labelled A and B, and answers which
   chapter teaches what this moment needed, or that they are the same. Each
   pair is judged in both orders. A moment is a win for C when C wins both
   orders or wins one and the other is the same, a loss when B does, else a
   tie.
4. **Controls**, held out: 20 moments with the same chapter on both sides
   (the judge should answer "same"), and 20 moments with C's chapter against
   a chapter drawn at random from the other lessons (C should win).

**What counts.** C is kept when the controls hold (at least 16 of 20 same, and
C winning at least 14 of 20 decoys, both orders), and on held out: C's wins
exceed its losses, with the 95% interval of (wins - losses) / moments, from
10,000 bootstrap resamples of games, above 0; its coverage is at least B's
minus two points; and its most named chapter's share is at most B's. On
train, C's wins must not be fewer than its losses. When one of these fails,
the report says which, and nothing is ported.

## Running it

```bash
make chess
CHESS_DIR=<checkout of the change> bridge/run.sh projects/review-lessons/measure.mjs
CHESS_DIR=<checkout of the change> bridge/run.sh projects/review-lessons/judge.mjs
```

`measure.mjs` writes one row per moment to `private/review-lessons/` and the
aggregates to `results/`, with the app commit it measured. `judge.mjs` runs
the judge through a headless Claude session in a clean environment
(`../lesson-videos/bin/claude-clean.sh`) and writes its verdicts beside the
rows; only their counts are committed.
