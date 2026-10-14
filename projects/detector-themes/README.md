# Do the app's motif labels name the tactic a position holds?

**The question.** Three of the app's board readers put a motif word on a
position, and the words travel far. `themeOfBest` names the best move the
player missed: the misses deck files each position under it, the puzzle
buckets and the rule ledger share it, and the learner credits a solve to the
skill it names. `blunderMotifs` tags what a bad move allowed: the weakness
profile, the metrics and the pattern census count it. `describeMove` says
what a move does, and the explanations are written from it. Judged on public
puzzles that an independent tagger has labelled, how often is each word right
when it is said, and how often is it said when it is right?

**The answer.** Fork is named well by all three. Beyond it, the misses deck's
labeller has no word for pins, skewers, discovered attacks, deflections or
trapped pieces, and files most of those puzzles as a defensive move, a word
the puzzles' tagger rarely agrees with. The review scan tags a hanging piece
on far more puzzles than have one. `describeMove` is the most precise of the
three and the one to build the others on. The paper,
[`paper/paper.pdf`](paper/paper.pdf), has the numbers.

## The data

The Lichess puzzle database (CC0). A puzzle is a mistake (its first move) and
the line that punishes it, tagged with themes by Lichess's own tagger. Two
sets:

- **the app's pool**: the puzzles the app ships (`src/data/puzzles.json` at
  the pinned commit), the training set for any change tuned here;
- **held out**: a seeded uniform sample of 20,000 other puzzles rated 400 to
  1899, the app pool's range (`sample.py`), the test set.

Lichess's tags are another heuristic tagger, not the truth. Agreement with it
is a measure, and the paper reads disagreements on the board before calling
either side wrong.

## The rules, fixed in score.mts before it first ran

Each labeller reads a puzzle the way the app reads a game:

- `best`: `themeOfBest(position, solution)`, on the position the solver faces
  and the first solution move;
- `blunder`: `blunderMotifs(before, mistake, after, score, refutation)`, on
  the puzzle's first move and the solution line, with the score the solution
  reaches (a mate when the puzzle is tagged mate in N, else five pawns for the
  solver);
- `move`: `describeMove(position, solution, { replyPv })`, the findings that
  are a gain for the solver.

Both sides' words map to the knowledge catalogue's concept ids through the
app's own `VOCABULARY`, so a Lichess word and an app word name one concept the
way the app resolves them. Per labeller and concept: true and false positives
and misses over puzzles, precision and recall with 95% Wilson intervals. A
concept only one side has a word for is reported, not scored. For `blunder`,
checkmate is given by the score passed in, so its row is not a test.

## Files

| File | What it does |
|---|---|
| `sample.py` | Draws the held-out set from the database (`zstdcat data/raw/lichess_db_puzzle.csv.zst \| python3 projects/detector-themes/sample.py`, with `CHESS_DIR` set). |
| `score.mts` | Scores the three labellers on a set; writes `results/score-<set>.json` (counts) and the per-puzzle labels to `data/processed/`. |
| `compare.mjs` | Compares a candidate's labels with the pinned app's by the rule under Candidates; writes `results/compare-<candidate>.json`. |
| `candidates/` | Each candidate's replacement files. |
| `paper/` | The paper. |

## Running it

```bash
make chess
export CHESS_DIR=$(bridge/checkout.sh)
curl -LO https://database.lichess.org/lichess_db_puzzle.csv.zst --output-dir data/raw
zstdcat data/raw/lichess_db_puzzle.csv.zst | python3 projects/detector-themes/sample.py
bridge/run.sh projects/detector-themes/score.mts app
bridge/run.sh projects/detector-themes/score.mts heldout
bridge/run.sh projects/detector-themes/paper/generate.mjs
```

## Candidates

A candidate changes one labeller and is scored by pointing `CHESS_DIR` at it
(`bridge/candidate.sh`) with `CANDIDATE=<name>` set, then compared with the
pinned app by `compare.mjs`. The rule, fixed before the first candidate ran:
per puzzle, a labeller *agrees* when one of its words names a concept the
puzzle is tagged with, and *disagrees* when one names a concept the puzzle is
not tagged with. A candidate is kept when, on the app's pool and on the
held-out set alike, its agreement rises with the 95% interval of the paired
difference (2,000 bootstrap draws of puzzles) above zero, and its
disagreement does not rise (the interval's upper end at or below one point).

| Candidate | Labeller | The change |
|---|---|---|
| `describe-first` | `best` | Before the defensive fallback, name a skewer, a discovered attack or a pin when the move describer finds one for the mover. |
