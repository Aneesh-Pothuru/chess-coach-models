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

**The paper.** [`paper/paper.pdf`](paper/paper.pdf) reads these results at
length: every run, the figures, the cuts of the closer look, and positions
as boards (ordinary ones, the ones the best run was surest of and the ones
it got most wrong). `lab paper think-time` builds it from the results
committed here ([`docs/design.md`](../../docs/design.md), "The paper").

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
| `transformer-medium-long` | `transformer-medium` with twice the epochs |
| `transformer-medium-hand-long` | `transformer-medium-hand` with twice the epochs |
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/) |
| `transformer-medium-hand-pretrained` | `transformer-medium-hand` started from the same body |
| `gbm-hand-double` | `gbm-hand` on twice the training games, from the larger build `game-positions-120k` of the dataset |
| `gbm-hand-quadruple` | `gbm-hand` on four times the training games, from the same build |
| `transformer-medium-hand-double` | `transformer-medium-hand` on twice the training games, with half the epochs so that it takes as many steps |
| `transformer-medium-hand-quadruple` | `transformer-medium-hand` on four times the training games, with a quarter of the epochs |
| `conv-medium-hand` | `transformer-medium-hand` with its body changed to a convolutional tower of about its size, each block weighing its channels by the whole board |
| `hybrid-medium-hand` | `transformer-medium-hand` with its body changed to two blocks of the tower under five transformer layers |
| `transformer-medium-attacks` | `transformer-medium` with its attention told what each piece attacks and what it stands behind |
| `transformer-medium-hand-attacks` | `transformer-medium-hand` told the same |

The last four change only the body of the run they name
([`docs/design.md`](../../docs/design.md), "Bodies and a head"), and
[`docs/ideas.md`](../../docs/ideas.md) says what was expected of them before
they ran. Each is kept only if it beats the run it changes on valid and on
test beyond the noise.

The four runs on more games (`-double`, `-quadruple`) take their training rows
from [`game-positions-120k`](../../datasets/game-positions-120k.yaml), a larger
build of the dataset, and are scored on the valid and test rows every run here
is scored on ([`docs/design.md`](../../docs/design.md), "A run on more games").
They are the `games` study below turned round, and
[`docs/ideas.md`](../../docs/ideas.md) says what was expected of them before
they ran. Each is kept only if it beats the run it changes on valid and on test
beyond the noise.

### Studies

Runs that change one thing in a run above, to say what that thing is worth
([`docs/design.md`](../../docs/design.md), "A run that changes another"). They
are listed apart on the leaderboard, and each is read against the run it
changes: the paired difference on the same resampled test games (the closer
look's `pairs`), which says something only when its interval leaves zero out.

| Study | Runs | What each changes |
|---|---|---|
| `games` | `gbm-hand-half`, `gbm-hand-quarter`, `transformer-medium-hand-half`, `transformer-medium-hand-quarter` | Half and a quarter of the training games, chosen by a hash of the game. The network goes through them often enough to take as many steps as the run it changes, so only the number of games differs. |
| `features` | `gbm-hand-no-<group>` for each of material, mobility, hanging, pawns, kings | One group of hand features left out |
| `geometry` | `transformer-medium-hand-no-geometry` | The learned bias for each offset between two squares left out of the transformer's attention: what telling it the board's geometry is worth |

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

What twice the epochs say (commit `0ba155a`: `transformer-medium-long` and
`transformer-medium-hand-long`, each set against the run it changed among the
`pairs` of [`results/analysis.json`](results/analysis.json)):

- **Both longer runs are kept, by a little.** Each is better than the run it
  changed on the valid rows, and on the test rows beyond the noise.
  `transformer-medium-hand-long` is now the model's best run. Both gains are
  small beside the step the hand features make, and the gain is smaller for
  the run that already reads them.
- **On the board alone, the epochs take the transformer past the trees.** At
  twelve epochs it was just behind the reference, and with twice as many it
  is just ahead, beyond the noise both times.
- **Twenty-four epochs were enough.** Both runs used the whole schedule, and
  their valid scores had flattened over its last few epochs. A still longer
  schedule is not the next run.

What the two studies say (commit `ceae3ec`; a study run is listed apart on
the leaderboard and set against the run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **More games would help, and the network most.** Trained on half and on a
  quarter of the training games, the trees and the best twelve-epoch network
  are both worse beyond the noise, and the network loses more. Its lead over
  the trees widens with every doubling, and the last doubling was worth more
  to it than twice the epochs were. Like blunder hazard, this model is short
  of games before it is short of steps.
- **Beside the clocks, the trees need material most.** With one group of
  hand features left out at a time, the material group costs the trees most,
  then loose pieces, the moves on offer and the attackers near the kings.
  Passed pawns cost nothing these test rows can show. A reading: what moves a
  player's time, beyond the clock, is how far the game has gone, whether
  something can be taken, and how much there is to choose from.

What a start from engine evaluations says (commit `3810bca`:
`transformer-medium-pretrained` and `transformer-medium-hand-pretrained`, the
twelve-epoch runs started from the body that
[position evaluation](../position-evaluation/) trained, each set against the
run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **Both are kept, and both are ahead of every run before them.** Each is
  better than the same run started from nothing on the valid rows and on the
  test rows beyond the noise, and both are ahead of
  `transformer-medium-hand-long`, the best run before (the intervals of their
  gains over the reference do not touch).
- **The start was worth more than the features, and more than the epochs.**
  The transformer on the board alone gained more from the start than the hand
  features had added to it, and several times what twice the epochs had (the
  intervals of the three paired gains do not touch).
- **Under the start the features add nothing that can be measured.** The run
  that reads them and the run that does not have gains over the reference
  that lie inside each other's intervals. From nothing, twelve epochs had
  left the transformer on the board alone behind the trees.

What the architecture test says (commit `414f6d3`: the four runs of another
shape and the `geometry` study, each trained once from nothing and set
against the run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **Told what each piece attacks, the transformer on the board alone is
  kept.** `transformer-medium-attacks` is better than `transformer-medium`
  on the valid rows, and on the test rows beyond the noise. It is the
  largest gain this model has had from one change made from nothing: more
  than the hand features gave the same transformer, and several times what
  twice the epochs did. Only the start from the body gave it more (the four
  intervals do not touch). On the ladder that transformer was just behind
  the trees. Told the attacks it is well ahead of them.
- **With the hand features the same change does next to nothing, and that
  run is not kept.** `transformer-medium-hand-attacks` is a hair worse than
  `transformer-medium-hand` on the valid rows, which fails the first half of
  the rule, and a hair better on the test rows, beyond the noise. From the
  second epoch on its valid score follows that of the run it changed
  (`learner.history` in the two records).
- **So the run on the board alone is ahead of the run that has both.** Told
  the attacks, the transformer that reads no hand feature is ahead of the
  one that reads them, where on the ladder the features were worth a clear
  step. The intervals of the two runs' gains over the reference do not
  touch. The two were not set against each other on resampled games, so this
  is a reading of the leaderboard. A reading of why: with the features at
  hand a network trained from nothing leans on them and learns little of
  what its attention is told, and without them it learns to read the attacks
  and ends ahead. Each run was trained once, and a second training is the
  first check of it.
- **The convolutional tower is kept, and is the best run that starts from
  nothing.** `conv-medium-hand` is better than `transformer-medium-hand` on
  the valid rows, and on the test rows beyond the noise: by more than twice
  the epochs gave that run and by less than the start from the body did (the
  three intervals do not touch). It is ahead of
  `transformer-medium-hand-long`, the best run from nothing before it (the
  intervals of their gains over the reference do not touch), in half the
  transformer's time on the GPU. It also changes its learning rate, so the
  gain is the tower's as trained and cannot be given to the convolutions
  alone. The tower and the board-alone run that is told the attacks cannot
  be told apart on the leaderboard.
- **The hybrid is not kept.** It is a hair better than
  `transformer-medium-hand` on the valid rows and inside its noise on the
  test rows.
- **The offsets between squares cannot be shown to matter here.** Without
  them (the `geometry` study) the transformer is inside the noise of the one
  that has them.
- **The best run still starts from the body.**
  `transformer-medium-hand-pretrained` is ahead of the tower, and
  `transformer-medium-pretrained` is ahead of the board-alone run that is
  told the attacks (the intervals of their gains over the reference do not
  touch). What was written before these ran, that no shape would do much for
  a model that leans on the clock, did not hold. A reading: beside the clock
  a move's time turns on what can be taken and on how much there is to
  choose from, as the `features` study said, and what each piece attacks is
  how a network sees both. Two runs follow, each one change in a kept run:
  the attention that is told the attacks started from the body, on the board
  alone and with the features, and a tower as the body that learns the
  engine's evaluations ([`docs/ideas.md`](../../docs/ideas.md)).

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/think-time/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is
26,259,039 bytes, sha256
`1e5e3d83056a91ed650168fb0d41586f5059e045fdf546497b0809eef498abe1`
(`weights` in [its record](results/transformer-medium-hand-pretrained.json)). The
records of the first full runs were written before a record named its
weights: `transformer-medium-hand`'s `model.pt` is 26,258,975 bytes, sha256
`4e82080046f9aea0c6ec20458cbccd6f072b6ce7c8f157f3fb1ae764e292e496`, read off
the file there.

## What it does not say yet

- Much of a move's time is not on the board: a premove, a recapture, how long
  the opponent just thought, a plan made two moves ago. A model that reads the
  game as a sequence of moves and clocks can use that, as Allie does
  ([`docs/ideas.md`](../../docs/ideas.md)).
- The times are Lichess rapid players'. The player's own pace is a separate,
  private fit.
