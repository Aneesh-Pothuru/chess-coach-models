# Puzzle difficulty, unsolved

**The question.** How hard is this puzzle, judged from the position alone?
[Puzzle difficulty](../puzzle-difficulty/) reads a puzzle with its solution
marked on the board, as a coach who has the engine's line reads a tactic in a
game. This model is asked the same thing with the solution hidden: the same
puzzles, the same ratings, the same test puzzles. What it can still say is how
much of a tactic's difficulty shows in the position, before anyone knows the
line. The gap between the two is what knowing the line is worth.

| | |
|---|---|
| **Reads** | The position the solver sees, the opponent's move that led to it, and castling rights. Nothing of the solution: not its squares, not its length, not what its moves do. |
| **Predicts** | The puzzle's Lichess rating, in rating points. |
| **Data** | The rows [puzzle difficulty](../puzzle-difficulty/) reads: the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), puzzles whose rating has settled, a fixed quarter of them. Recipe: [`datasets/puzzles.yaml`](../../datasets/puzzles.yaml). |
| **Split** | By the game a puzzle was cut from: 85% train, 5% valid, 10% test, the same puzzles in each as for puzzle difficulty. |

## The rule

Written before the first full run.

- **Metric.** Root mean squared error on the test puzzles, in rating points.
  MAE, R² and Spearman's rank correlation are reported beside it.
- **What is hidden.** Its [task](task.yaml) names what a learner may read. Of
  the marks on squares, only the en passant square and the opponent's last
  move. Of the hand features, only the ones counted from the position
  (material, what the mover can do, pieces that can be taken, passed pawns,
  attackers near each king, whether the opponent's last move took something).
  The length of the solution is not among the numbers beside the board.
- **Floor and baseline.** `constant` gives every puzzle the training mean.
  `gbm-hand`, the reference, reads the position's hand features and the
  castling rights. There is no `gbm-context` here: the context is the castling
  rights alone.
- **What counts as better.** A run beats the reference when its paired gain in
  RMSE on the same resampled test games has a 95% interval above zero.
- **Read beside puzzle difficulty.** Both models are scored on the same test
  puzzles, so a run here and the run of the same name there differ in one
  thing: whether the solution is shown. The closer look sets each such pair
  on the same resampled test games (its [plan](analysis.yaml) names puzzle
  difficulty as `shown`), so what the solution is worth to a learner has an
  interval, overall and inside each slice.
- **Bands.** Results are also given by the puzzle's true rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | One number for every puzzle |
| `gbm-hand` | LightGBM on the position's hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the position's hand features beside the board |
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/) |
| `transformer-medium-hand-pretrained` | `transformer-medium-hand` started from the same body |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval puzzle-difficulty-unsolved`. What the first full runs say (commit
`ceae3ec`; the numbers are in the leaderboard, and the table that sets the
two models side by side is in [the paper](paper/paper.pdf)):

- **A position alone says some of a tactic's difficulty, and less than
  half.** Every network beats the trees beyond the noise, and the trees beat
  the floor. Measured from the floor, the best run here makes a bit over a
  third of the step that the best run of puzzle difficulty makes on the same
  test puzzles. No run keeps half of what the run of the same name makes
  when it is shown the solution, and the trees keep the least, about a fifth.
- **A network matters most here.** With the line's counts gone the trees have
  only the counts of the position, and each network leads them by more than
  the same network leads the trees of puzzle difficulty.
- **The convolutional tower is first.** In puzzle difficulty the medium
  transformers lead. Here the small tower is ahead of them. Each was trained
  once and the two have not been set against each other on resampled games,
  so the order of the first two is a reading and not yet a finding.
- **The position's counts still pay under a network.** The medium transformer
  that reads them is better than the same transformer on the board alone, on
  the valid rows and beyond the noise on the test rows (`pairs` in
  [`results/analysis.json`](results/analysis.json)).
- **A sorter, not a judge.** The best run puts puzzles in order (its rank
  correlation) and misses a single puzzle's rating by well over a rating
  class. What it says holds on average: the puzzles it rates lowest and
  highest are far apart in truth (the closer look's reliability groups).
- **The position gives the line away in part.** Cut by facts no learner here
  reads (the length of the line, a quiet move in it, a mate at its end, a
  check or a sacrifice on its first move), what the best run says moves the
  way the truth does, and by less.
- **For the app: rate a tactic after the line is known.** The app has the
  engine's line whenever it has a tactic, and the model that reads the line
  is far closer. Nothing here is a model to port. The finding is where the
  difficulty is.

Still to come: the two `-pretrained` runs, which are trained after position
evaluation, and the intervals of the comparison. The paper's table is drawn
from the two leaderboards. The paired gain of each shown run over its hidden
run, overall and by slice, is measured by the next closer look on the machine
that holds both models' predictions.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/puzzle-difficulty-unsolved/<run>/`, as the GPU
session packed them; none is published. The best run's `model.pt` is
4,153,095 bytes, sha256
`a96b36b33c6c727f5700371985965b91222a19e95645658eb099748829ea2497`
(`weights` in [its record](results/conv-small.json)).

## What it does not say yet

- A puzzle position is not any position: every one of them holds a tactic, and
  the opponent has just gone wrong. This model says nothing about a position
  where there may be nothing to find.
- The rating is on Lichess's puzzle scale, as for puzzle difficulty.
- A puzzle's rating also depends on who is served it, which this ignores.
