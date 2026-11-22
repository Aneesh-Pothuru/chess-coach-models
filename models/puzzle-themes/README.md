# Puzzle themes

**The question.** Which themes does this tactic show? Lichess tags every
puzzle with themes, a fork, a pin, a deflection, a quiet move, by its own
tagging code and its users' votes. This model reads a puzzle and its solution
and gives each of 30 themes a chance. In the app it would name what a tactic
in the player's own games was, in the words a coach uses, for any line an
engine gives.

| | |
|---|---|
| **Reads** | The position the solver sees, the opponent's move that led to it, the solution line marked on the board, the length of the line and castling rights. |
| **Predicts** | For each of 30 themes, the chance that the puzzle carries it. |
| **Data** | The rows [puzzle difficulty](../puzzle-difficulty/) reads: the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), puzzles whose rating has settled, a fixed quarter of them. Recipe: [`datasets/puzzles.yaml`](../../datasets/puzzles.yaml). |
| **Split** | By the game a puzzle was cut from: 85% train, 5% valid, 10% test, the same puzzles in each as for puzzle difficulty. |

**The themes.** Its [task](task.yaml) lists them: every theme that names a
pattern on the board. Most name a motif (fork, pin, skewer, discovered attack,
deflection, attraction, clearance, interference, intermezzo, quiet move,
sacrifice, and so on), five name a mate (back-rank, smothered, opera,
Pillsbury's, epaulette), and one is a promotion. A theme that says how long
the line is, which phase the game is in, how much the line wins or whose game
it came from is left out: board code and the engine already say those. So is
a pattern too rare for a test set to score, a corner mate or a capture in
passing. Many puzzles carry none of the 30, a plain mate in one for instance.

The answer is a set and not one number: a puzzle carries any number of the
themes, and a run gives all 30 a chance
([`docs/design.md`](../../docs/design.md), "An answer that is a set").

## The rule

Written before the first full run.

- **Metric.** Average precision, a puzzle at a time: rank the 30 themes by
  their chance, and take the mean, over the themes the puzzle carries, of the
  share of right ones among the themes ranked at least as high. A model's
  score is its mean over the test puzzles that carry at least one of the
  themes. Two more are reported beside it: how often the theme given the
  highest chance is one the puzzle carries (first right), over the same
  puzzles, and the log loss of the 30 chances over every test puzzle, each
  read as a yes or no of its own, which is where a puzzle with none of the
  themes counts.
- **Each theme by itself.** A leaderboard also gives every theme as one yes
  or no over the test puzzles, for the best run: how many carry it, and how
  well its chance tells those from the rest (PR-AUC, ROC-AUC). A mean over
  puzzles is led by the common themes, and this table is where a rare one
  shows.
- **Floor and baselines.** `constant` gives every puzzle the same 30 chances:
  each theme's share of the training puzzles. `gbm-context` is a booster a
  theme on the length of the line and the castling rights. `gbm-hand`, the
  reference, is a booster a theme on the hand features of the position and
  the line.
- **What counts as better.** A run beats the reference when its paired gain in
  average precision on the same resampled test games has a 95% interval above
  zero.
- **Bands.** Results are also given by the puzzle's rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | Each theme's share of the training puzzles, for every puzzle |
| `gbm-context` | A LightGBM booster a theme on the solution's length |
| `gbm-hand` | A LightGBM booster a theme on the hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized, with a logit a theme |
| `transformer-small` | A square-token transformer, CPU-sized, with a logit a theme |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the hand features beside the board |

## Results

No full run has been recorded yet. `results/leaderboard.md` is written by
`lab eval puzzle-themes` once the runs are in.

## What it does not say yet

- The label is Lichess's tagging, which its own code and its users' votes
  made. A model that predicts it learns that code and those votes, their
  mistakes with them. It is a measure of how much of each theme shows on the
  board and in the line, not a judge of what a fork is.
- Some hand features are close to a theme's own definition (a line that
  promotes carries `promotion`), so the reference starts high on those
  themes. The table of each theme by itself says which.
- A puzzle position is not any position: every line here is a tactic that
  works. Nothing here says a line from a game is one.
- The closer look and the paper read one number a row
  ([`docs/design.md`](../../docs/design.md), "The closer look"), so this
  model has a leaderboard and no closer look yet.
