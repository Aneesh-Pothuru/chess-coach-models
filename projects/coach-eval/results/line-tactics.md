# Line tactics: naming what a whole line does

Run on 2026-11-19 at the app's `03eea91`. A coaching explanation of a tactic names
the idea of the winning line, and that idea often sits after the first move: the
check that drags the king onto a forking square, the capture that deflects the
last defender, the mate at the end. The app names a position's theme from the
first move only (`themeOfBest`, the misses deck's labeller). `line-tactics.mjs`
runs the app's own detectors at every one of the solver's moves in a line, reads
how the line ends, and is measured against the themes Lichess's tagger gives its
puzzles. Lichess's tagger is another heuristic, not the truth; agreement with it
is the measure, as in detector-themes.

## The sets

- **Development**: the 4,630 puzzles the app ships (`src/data/puzzles.json`).
  Every choice of source and tier was made here (`line-tactics-dev.mjs`).
- **Held-out**: 20,000 puzzles rated 400 to 1899, a seeded uniform sample of the
  Lichess database drawn the way detector-themes draws its held-out set, leaving
  out the app's puzzles and coach-eval's own sample (`line_sample.py`).
- **Coach**: coach-eval's 1,200 Lichess puzzles, 60 for each of 20 themes, rated
  1100 to 1700, a different mix from the other two.

## What is read

At each solver move the script records the app's fork detector, its per-move
themes (pins, skewers, discovered and double checks), the move describer's
findings with the rest of the line as the reply, its line readers (deflection,
attraction, the capture of a defender, the in-between move), its quiet-move and
first-move theme readers, and, read off the board, how many pieces give check and
whether a piece other than the one moved gives it. For the line it records the
mate, the app's name for the mate's shape, the material given and won back, and a
back-rank reading written here: a rook or queen mates along the king's back rank
and every square in front of the king holds one of its own pieces, none of which
the mating side attacks, so the king's own pieces box it in.

On the development set that back-rank reading agrees with every one of Lichess's
346 back-rank tags and adds none; the app's mate namer calls 815 mates back-rank
mates there, Lichess 346.

## Held-out results (20,000 puzzles)

Precision and recall against Lichess's tags, the app's first-move labeller beside
the whole-line reading. "Point" is the tier a coaching text may call the idea of
the line; "also" holds readings that are true of the board but that the tagger
often does not name as the puzzle's theme.

| Concept | Tagged | First move: P / R | Whole line: P / R | Tier |
|---|---|---|---|---|
| Checkmate | 8,060 | 0.99 / 0.48 | 0.99 / 1.00 | point |
| Fork | 2,767 | 0.89 / 0.58 | 0.83 / 0.79 | point |
| Back-rank mate | 891 | none right (10 said) | 1.00 / 1.00 | point |
| Attraction (of the king) | 641 | not said | 0.96 / 0.75 | point |
| Promotion | 477 | not said | 0.99 / 1.00 | point |
| Smothered mate | 110 | not said | 0.96 / 1.00 | point |
| Double check | 105 | not said | 1.00 / 1.00 | point |
| Hook, Anastasia, epaulette mate | 57, 36, 104 | not said | 0.85 / 1.00, 0.84 / 1.00, 0.85 / 0.34 | point |
| Discovered attack | 1,137 | 0.72 / 0.52 | 0.67 / 0.81 | also |
| Skewer | 496 | 0.70 / 0.57 | 0.61 / 0.89 | also |
| Trapped piece | 213 | 0.76 / 0.67 | 0.72 / 0.81 | also |
| Pin (absolute) | 1,087 | 0.64 / 0.22 | 0.50 / 0.44 | also |
| Deflection | 797 | 0.63 / 0.45 | 0.58 / 0.69 | also |
| Sacrifice | 1,267 | not said | 0.29 / 0.93 | also |
| Advanced pawn | 1,044 | not said | 0.61 / 0.98 | also |
| Hanging piece | 757 | 0.27 / 0.69 | 0.27 / 0.69 | also |
| Quiet move | 371 | not said | 0.38 / 0.44 | also |
| In-between move | 176 | not said | 0.38 / 0.57 | also |
| Removing the defender | 110 | not said | 0.21 / 0.84 | also |

The point tier's pooled precision is 0.957 over 13,016 labels on the held-out set,
0.966 over 819 on the coach set and 0.985 over 3,446 on the development set. On
the coach set every point concept is at 0.81 or above (fork 0.81, the rest 0.99
or 1.00).

## How the tiers were set

The first tiers were fixed on the development set, putting a reading in the point
tier when it agreed with the tagger about four times in five there. On the
held-out set six of them fell below that: the discovered attack (0.79 on
development, 0.67 held-out), the skewer (0.83, 0.61), the trapped piece (0.99,
0.72), and the opera, Arabian and blind swine mates (0.83, 1.00 and 1.00 on few
cases; 0.65, 0.74 and 0.21). They moved to "also", and the held-out table above is
the revised split. The coach set was scored at the same time as the held-out set,
so it does not test the revision independently. The scores of the first split are
kept as `line-tactics-<set>-v1.json`.

Readings the development set ruled out: the app's fork detector on a mating move
(a queen that mates while attacking a rook), relative pins (0.07), the attraction
of a queen or rook (0.03), and material-only definitions of a sacrifice (0.31 to
0.38).

## What it is for

coach-eval's coaching sheet is to read the line of the better move and of each
refuted candidate with `lineSignals` and `lineConcepts`, so a writer can say, for
example, that a check attracts the king to the square where the knight forks it,
and call only the point tier the idea. The whole-line reading is also a candidate
for the app's own labellers: it finds every back-rank mate Lichess tags where the
first-move labeller finds none, and twice as many mates overall.
