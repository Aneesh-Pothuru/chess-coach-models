# Practical chances

**The question.** Between two people at these ratings, with these clocks, who
wins from here? An engine's evaluation says what a position is worth with best
play on both sides. A game between two club players is not best play: a
winning position still has to be won, and a lost one is often saved. A coach
who knows what the engine's verdict is worth at a level can say which "equal"
positions are hard to hold there, and which "lost" ones were still a game.

| | |
|---|---|
| **Reads** | The position, the opponent's last move, both ratings, both clocks, the time control, the move number, and the mover's win probability from the engine's evaluation before the move. |
| **Predicts** | The mover's expected score in the game: 1 for a win, 0.5 for a draw, 0 for a loss. |
| **Data** | The positions [blunder hazard](../blunder-hazard/) and [think time](../think-time/) read: rated Lichess rapid games of October 2026 (CC0) that carry Lichess's engine analysis and clocks, up to 24 positions a game from each side's sixth move on, each with its game's result. Recipe: [`datasets/game-positions.yaml`](../../datasets/game-positions.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test. |

## The rule

Written before the first full run.

- **Metric.** RMSE of the expected score against the game's result on the
  test positions: the square root of the mean squared error, which is lowest
  for the true expected score and for nothing else. MAE, R² and the rank
  correlation with the result are reported beside it.
- **Floor and baselines.** `constant` gives every position the mean result.
  `engine-curve` is the engine's evaluation passed through the win-probability
  curve, with nothing fitted: the number a review shows today, and the first
  thing a model here has to beat. `elo-gap` is the rating formula's expected
  score from the two ratings, with no view of the position. `gbm-context`
  reads the evaluation, the ratings, the clocks and the move number together,
  with no view of the board. `gbm-hand`, the reference, also reads hand
  features of the position.
- **What counts as better.** A run beats the reference when its paired gain in
  RMSE on the same resampled test games has a 95% interval above zero. The
  closer look also sets `gbm-context` and the best network against
  `engine-curve` the same way, since that comparison is the model's reason to
  exist.
- **Bands.** Results are also given by the mover's rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | The mean result for every position |
| `engine-curve` | The engine's win probability, read as the expected score |
| `elo-gap` | The rating formula on the two ratings |
| `gbm-context` | LightGBM on the evaluation, ratings, clocks and move number |
| `gbm-hand` | LightGBM with the hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the hand features beside the board |

## Results

No full run has been recorded yet. `results/leaderboard.md` is written by
`lab eval practical-chances` once the runs are in.

## What it does not say yet

- Every position of a game carries the same result, so one position's label
  says little, and the test set is as large as its games, not its rows. The
  intervals resample whole games for that reason, and more games is the first
  run to add.
- A game here ended normally or on time. A lost position that was won on the
  clock counts as a win, as it does for the player.
- Only analysed games give a row, and players choose which games to analyse.
- The evaluation is as deep as Lichess's server analysis.
- Ratings are Lichess's. Another site's ratings need mapping first
  ([`docs/ideas.md`](../../docs/ideas.md), "Checks on the player's own
  scale").
