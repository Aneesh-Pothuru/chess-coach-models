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

## The threat search: rules fixed before it ran

The stored lines cannot tell a miss where he had to answer a threat from one
where nothing was threatened, and about a third of the positions show no
material change either way. So every scored position of the misses deck is searched twice by the
app's engine at its `best` budget (the routine's punish search): as he faced
it, and with the move passed to his opponent (the knowledge service's
`flipTurn`; a position where he is in check cannot be passed and is counted
apart).

- *threatened*: the opponent's line after the pass ends in mate, or its
  evaluation is a mate score against him, or it wins the opponent at least 2
  points of material, counted the way the census counts a gain (the lower of
  the last two balances when the line ends on a capture);
- *the pass's cost*: his win% (the app's curve) in the passed position against
  the position as he faced it, from the two searches. Reported, not a rule;
- *the gate fires*: the live coach's instant threat reader (`readThreatGate`)
  fires for him in the position as he faced it: something of his can be taken,
  the f7/f2 strike is loaded, or the opponent has a mate in one.

Reported for each census cell (best by played) and each theme word: the share
threatened, the share the gate fires on, and the gate's precision and recall
against the search. A miss that was threatened is a defensive miss whatever
its stored lines show; a clear defensive miss (the best move holds, his move
lost material or allowed mate) that was not threatened is self-inflicted: his
move made the loss, and no threat was on the board to answer.

A quiet miss is one in the no-change cell that was not threatened. It would
make a plan question by the census's quiz rule when, of the deck's top three
options for it (by its stored evaluations), exactly one is within the quiz's
margin of the best, and the best is neither a capture nor a check nor 200
centipawns ahead of the second.

## Files

| File | What it does |
|---|---|
| `lib.mts` | The board code both scripts share: walking a stored line and a deck item's cell. |
| `census.mts` | Classifies every item of both decks by the rules above and writes `results/census.json` (counts only). With `RETHEME=1` it files each position again with the checkout's own labeller (a candidate's, under `CHESS_DIR`) and writes `results/census-<CANDIDATE>.json`. |
| `threats.mts` | The threat search. Writes `results/threats.json` (counts only). |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/drill-decks/census.mts
bridge/run.sh projects/drill-decks/threats.mts --pool 4
```

The threat search runs two searches of 600,000 nodes for each of about 1,300
positions; with four engine processes it takes a few minutes.
