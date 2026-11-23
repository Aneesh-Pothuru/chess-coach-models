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
  size, as `transformer-medium` everywhere else. Each of the six models that
  had full runs before it has two runs that start from it,
  `transformer-medium-pretrained` and `transformer-medium-hand-pretrained`,
  with nothing else changed. A start
  from this body is kept on a model only where that run beats the same run
  started from nothing, on that model's own test games, beyond the noise.
- **Bands.** Results are also given by the number of men on the board.

## Runs

| Run | Learner |
|---|---|
| `constant` | The mean for every position |
| `gbm-hand` | LightGBM on the position's hand features (the reference) |
| `transformer-medium` | The square-token transformer the other models train, on the board alone |
| `conv-medium` | The convolutional tower the other models train as `conv-medium-hand`, on the board alone: a body for a tower to start from. Written, and waits for its GPU |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval position-evaluation`. What the first full runs say (commit
`3810bca`; the numbers are in the leaderboard):

- **The transformer reads far more of the engine's verdict than counting
  does.** It is ahead of the trees beyond the noise, and the trees are ahead
  of the floor by more than twice that. It also puts positions in order
  better than the trees do (the rank correlation).
- **Every run is closest while the board is full.** By the number of men
  left, each run's error is smallest with 25 men or more, and the two
  learners' is largest between nine and sixteen. The floor's error by band
  says why the ends differ: with few men left the engine's verdicts stand
  far from even, and one number for every position misses them most there.
- **It was still learning when it stopped.** Its best valid epoch was the
  last of its six, and each epoch gained less than the one before (`history`
  under `learner` in [its record](results/transformer-medium.json)). A
  reading: a longer run would gain a little, and a body trained on more of
  the file or at a larger size is the larger thing not tried.
- **Its body is what it is for, and the body pays.** Six models trained
  their two twelve-epoch transformers again from this body, with nothing else
  changed. In five of them (blunder hazard, puzzle difficulty, puzzle
  difficulty unsolved, tactic found and think time) both runs are kept by
  the rule above, and the one that also reads the hand features is the
  model's best run. In practical chances both are worse than the same runs
  started from nothing, beyond the noise: every learner there already reads
  the engine's chance of winning beside the board. Each model's card says
  what the start was worth to it, and
  [the lab's paper](../../papers/lab/paper.pdf) sets the six side by side
  ("What a start from an engine's evaluations is worth").
- **No closer look and no paper of its own.** `analysis.yaml` says how its
  results would be cut, and `lab analyse` has not been run on it. The lab's
  paper lists it apart from the models it sets side by side and counts it in
  none of their comparisons (`purpose: body` in its task).

**Weights.** Each run's weights and test predictions are on the owner's
machine, under `artifacts/runs/position-evaluation/<run>/`, as the GPU session
packed them; none is published. The transformer's `model.pt`, the body the
other models start from, is 26,235,679 bytes, sha256
`e74b67486516834822284bd0ff23bd93b12da4acc5a14d559c8f13436a4ee65e` (`weights`
in [its record](results/transformer-medium.json)).

## What it does not say yet

- The positions are the ones people asked an engine about, which is not the
  mix a game has: forced mates and bare endings are far more common here than
  in play.
- The evaluations come at many depths, from 20 up. A deeper one is not treated
  differently.
- A body trained for longer, on more of the file, or at a larger size is not
  tried.
- Its score here is not what a start from it is worth. That is measured on
  each model that starts from it, and one body is all that has been tried.
