# Do the decks built from his games ask what they say they ask?

**The question.** Two practice decks are built from the player's own games.
The misses deck serves the positions where he went wrong and files each one
under a theme word (`themeOfBest` in the knowledge service). That word orders
a session and, for the words the learner knows, is the skill a solve or a miss
counts toward. The guess-the-plan quiz shows a quiet position from his games
with three engine moves and asks which is the plan. Does the theme word say
what the missed move did, and does the quiz ask a plan question with one right
answer?

The detector-themes project scores the same theme labeller on Lichess puzzles.
Puzzles are tactics by construction; the misses deck is not, so this project
reads the labeller on the deck's own positions, against what the deck's own
engine lines show.

## The data

The decks the routine published at the pinned app commit,
`public/coach/mistake-deck.json` and `public/coach/plan-quizzes.json`. Both
name his opponents and link his games, so the script reads them at run time,
writes its per-item rows only to `private/drill-decks/`, and commits counts.

## The rules, fixed before any number was computed

What the best move did, read from the deck's stored engine line for it (the
routine's deep pass: 4M nodes, five lines), with the board code alone:

- *mates*: the best line ends in mate, or its evaluation is a mate score
  (9,000 or more from his side);
- *wins material*: his material balance (1, 3, 3, 5, 9) at the end of the best
  line is at least 2 points above the start; when the line ends on a capture,
  the lower of the last two balances counts, so a capture whose recapture the
  line cut off never counts as a gain;
- otherwise *holds*.

What his move cost, read from the played move's stored line when the deck has
one, else from the move followed by the deck's punishing line:

- *allowed mate*: that line ends in mate or its evaluation is a mate score
  against him;
- *lost material*: his balance at its end (counted the same way) is at least 2
  points below the start;
- otherwise *other* (a slower loss).

A miss is *attacking* when the best move mates or wins material and his move
neither allowed mate nor lost material: he missed a win. It is *defensive*
when the best move holds and his move allowed mate or lost material: he had
to stop something. Everything else is *mixed*.

The theme word fits when:

- `defensiveMove`: the miss is defensive;
- `hangingPiece`, `fork`: the best move wins material or mates;
- `mateIn1`, `backRankMate`: the best move mates;
- a phase word (`opening`, `middlegame`, `endgame`) names no motif, so it is
  not scored; the census counts how many phase-word misses were attacking (a
  win he missed, filed under a phase) and how many defensive.

Opening deviations (`repertoire`, no engine lines) are left out.

For the quiz, the app's own rule (`quizCorrect`: an option within 45
centipawns of the best counts as right) decides how many of the three options
are right. A quiz's best option is *forcing* when its first move is a capture
or a check, and *material* when it leads the next option by 200 centipawns or
more. A quiz asks a plan question with one right answer when exactly one
option is right and the best option is neither forcing nor material.

## Files

| File | What it does |
|---|---|
| `census.mts` | Classifies every item of both decks by the rules above and writes `results/census.json` (counts only). |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/drill-decks/census.mts
```
