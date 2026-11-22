# Think time

**The question.** How long do players at a level think in this position, on
this clock? The app coaches thinking in rapid, and "you moved too fast here"
needs a yardstick: the two seconds the player spent mean one thing where his
peers also take two, and another where they take twenty. A model of the
typical think time is that yardstick.

| | |
|---|---|
| **Reads** | The position, the opponent's last move, both ratings, both clocks, the time control and the move number. It does not read an engine: the question is what the player can see. |
| **Predicts** | The seconds spent on the move, as log(1 + seconds). |
| **Data** | The same positions as [blunder-hazard](../blunder-hazard/): rated Lichess rapid games of October 2026 (CC0) with clocks, up to 24 positions a game from each side's sixth move on. The seconds spent are the mover's clock before the move, less the clock after it, plus the increment. Recipe: [`datasets/game-positions.yaml`](../../datasets/game-positions.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test. |

## The rule

Written before the first full run.

- **Metric.** Mean absolute error of log(1 + seconds) on the test positions:
  an error of 0.69 is a factor of two. RMSE, R² and Spearman's rank correlation
  are reported beside it.
- **Floor and baseline.** `constant` gives every position the training median.
  `gbm-context` reads the ratings and clocks with no view of the board, which
  says how much of think time is the clock alone. `gbm-hand`, the reference,
  also reads hand features of the position.
- **What counts as better.** A run beats the reference when its paired gain in
  MAE on the same resampled test games has a 95% interval above zero.
- **Bands.** Results are also given by the mover's rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | The training median for every position |
| `gbm-context` | LightGBM on ratings and clocks |
| `gbm-hand` | LightGBM with the hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the hand features beside the board |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval think-time`. What the first full runs say (commit `f9827db`; the
numbers are in the leaderboard):

- **Most of what can be predicted is the clock.** The largest step is from the
  floor to the trees that never see the board. The hand features add about
  half as much again, and the best network a small step more.
- **One network beats the trees beyond the noise: the medium transformer that
  also reads the hand features.** The small transformer and the convolutional
  tower are level with the trees (the intervals of their gains hold zero), and
  the medium transformer on the board alone is just behind them.
- **Most of a move's time stays unexplained.** The best run explains under a
  third of the variance in log seconds, and its typical miss is a little under
  a factor of two. As a yardstick for "you moved too fast here" it can say what
  is usual for a position and a clock; one move far from it is weak evidence
  on its own, and a pattern over many moves is what to read.
- **Stronger players are harder to predict.** The error grows with the mover's
  rating band in every run.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/think-time/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is 26,258,975
bytes, sha256 `4e82080046f9aea0c6ec20458cbccd6f072b6ce7c8f157f3fb1ae764e292e496`,
read off the file there: these records were written before a record named its
weights, which every later one does.

## What it does not say yet

- Much of a move's time is not on the board: a premove, a recapture, how long
  the opponent just thought, a plan made two moves ago. A model that reads the
  game as a sequence of moves and clocks can use that, as Allie does
  ([`docs/ideas.md`](../../docs/ideas.md)).
- The times are Lichess rapid players'. The player's own pace is a separate,
  private fit.
