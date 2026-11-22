# Position evaluation

**The question.** What does an engine make of this position? This is the one
model in the lab whose label is not about people, and the app has no use for
its answer: it runs an engine. It is here for its body. A network that has
learned to evaluate a few million positions knows what the pieces do before it
is asked anything about players, and the other models can start from it
instead of from nothing ([`docs/design.md`](../../docs/design.md), "Starting
from another run").

| | |
|---|---|
| **Reads** | The position and castling rights. |
| **Predicts** | The mover's chance of winning by the engine's evaluation, in percent: the evaluation passed through the curve the app and Lichess use, a forced mate as 100 or 0. |
| **Data** | The open [Lichess evaluations](https://database.lichess.org/#evals) (CC0): every position Lichess has an engine evaluation for. A row is one position with its deepest evaluation, depth 20 at least; one position in eight is taken by a hash of the position, until six million. Recipe: [`datasets/evaluations.yaml`](../../datasets/evaluations.yaml). |
| **Split** | By position: 97% train, 1% valid, 2% test. |

## The rule

Written before the first full run.

- **Metric.** RMSE of the predicted chance of winning against the engine's, in
  points of percent, on the test positions. MAE, R² and the rank correlation
  are reported beside it.
- **Floor and baseline.** `constant` gives every position the mean. `gbm-hand`,
  the reference, reads the hand features of the position: what counting
  material, moves and attackers says of who is winning.
- **What counts as better here** is the usual paired gain over the reference.
  It is not what this model is for.
- **What it is for.** `transformer-medium` here is the same body, at the same
  size, as `transformer-medium` everywhere else. Each other model has two runs
  that start from it, `transformer-medium-pretrained` and
  `transformer-medium-hand-pretrained`, with nothing else changed. A start
  from this body is kept on a model only where that run beats the same run
  started from nothing, on that model's own test games, beyond the noise.
- **Bands.** Results are also given by the number of men on the board.

## Runs

| Run | Learner |
|---|---|
| `constant` | The mean for every position |
| `gbm-hand` | LightGBM on the position's hand features (the reference) |
| `transformer-medium` | The square-token transformer the other models train, on the board alone |

## Results

No full run has been recorded yet. `results/leaderboard.md` is written by
`lab eval position-evaluation` once the runs are in.

## What it does not say yet

- The positions are the ones people asked an engine about, which is not the
  mix a game has: forced mates and bare endings are far more common here than
  in play.
- The evaluations come at many depths, from 20 up. A deeper one is not treated
  differently.
- A body trained for longer, on more of the file, or at a larger size is not
  tried.
