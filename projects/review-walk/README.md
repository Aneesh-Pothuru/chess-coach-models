# How many of his marked moves should a Game Review walk through?

**The question.** The app's Game Review marks every move of his that it grades
an inaccuracy, a mistake, a miss or a blunder, every great or brilliant move,
and every mate he let slip, and its walk ("Next key moment") stopped at each
of them. It also opened on a move, his costliest error, so each game opened
on a different position. Does a walk of at most five stops, his four
costliest errors and one best move, opened from an overview of the whole
game, still hold most of what his errors cost him and stop where the game
turned?

**The answer.** Not run yet. The rule below is committed before the held-out
games are reviewed.

## What the app does (the change measured)

The change is the app's own code at the commit the report names, on the
branch of the chess pull request that ports it:

- `walkOf` (review, `src/services/review/walk.ts`) picks the walk's stops
  from a review's marked moves (`moments`): his costliest mistakes, misses
  and blunders by `lossPct`, the earlier on a tie, then the mates within
  three moves that he let slip, four in all; with no mistake, miss or
  blunder, his two costliest inaccuracies; and one best move, a brilliant
  one before a great one. An inaccuracy never takes a mistake's place,
  whatever it cost. The stops are walked in game order, and the other marked
  moves stay one fold away.
- `seenOf`, the error the overview names as what he should have seen, ranks
  the same way, so it is always the walk's costliest error.
- The screen opens on the overview of the game (where it turned, what he
  should have seen, the chances graph with the stops numbered, the stops as
  a list), and one button starts the walk. A stop says what he missed when
  its lesson card names a habit (`causeOf`: their reply, or his own chance),
  and the overview links up to two lesson chapters the stops point to
  (`gameLessons`).

## The games

- **The design set.** The app's archive of his games as the routine reviewed
  them, every game, read while the walk was designed (the first table of
  `results/review-walk.md`), and phone reviews of 37 games played from
  2026-09-23 on, read one by one.
- **Held out.** A seeded sample of 80 of the games played before 2026-09-23
  (`heldoutOf` in `lib.mjs`), each reviewed anew the way the phone's Game
  Review reviews it (the app's `coach review <game> --profile phone`, at the
  commit measured). No phone review of these games was made or read while the
  walk was designed. Their archive reviews are in the design set's
  aggregates: what is held out is the phone's review of them, a smaller
  analysis with its own grades, and it is the review the screen walks.

## The rule, fixed before the run

**Measures**, a game at a time, on the review's own records:

1. **Length.** Its marked moves (the old walk's stops) and the walk's stops.
2. **Coverage.** The `lossPct` of the errors the walk stops at, over the
   `lossPct` of all his errors, inaccuracies included. A game with no error
   of his has none.
3. **The turn.** Where the game turned on his own moves (`turnOf`), whether a
   stop lies inside the turn.
4. **The costliest error.** Whether the move `seenOf` names is a stop.

**What counts.** The walk is kept when, on the held-out games:

- the walk's errors hold more than 50% of what his errors cost in the median
  game, with the whole 95% interval of that median (10,000 bootstrap
  resamples of games) above 50%, and at least 40% in the lower-quartile game;
- a stop lies inside the turn in at least 90% of the games that turned on his
  own moves;
- and two guards hold, which the rule's caps and `seenOf` should make true of
  any game: no walk is longer than five stops, with a median of at most
  four, and the costliest error is a stop in every game that has an error.

When one of these fails, the report says which, and the walk is not ported
as it stands.

**Reported beside the rule, not part of it:** what a cap of one to six errors
would hold; what four stops ranked by cost alone, whatever the grade, would
hold, and how often that would put a softened error ahead of a mistake; what
the walk holds of his mistakes, misses and blunders alone; how far into the
game the costliest error falls (the move the old screen opened on); and, on
the held-out reviews, what the screen says at the walk's errors: how many
have a lesson card, how many of those say he missed their reply or his own
chance, and how many link a lesson chapter.

**On the design set**, the same measures are in the first table of
[`results/review-walk.md`](results/review-walk.md), written before any
held-out game was reviewed. The cap of four errors was a choice made in
design, for a walk short enough to finish on a phone, not a fitted value:
the table shows what each cap from one to six would hold.

## Running it

```bash
make chess
CHESS_DIR=<checkout of the change> bridge/run.sh projects/review-walk/games.mjs --concurrency 4
CHESS_DIR=<checkout of the change> bridge/run.sh projects/review-walk/measure.mjs
CHESS_DIR=<checkout of the change> bridge/run.sh projects/review-walk/paper/generate.mjs
```

`games.mjs` writes the held-out sample and its phone reviews to
`private/review-walk/`; `measure.mjs` writes the aggregates and the verdict
to `results/`, with the app commit it measured. No model judges anything
here: every number is read from the reviews.
