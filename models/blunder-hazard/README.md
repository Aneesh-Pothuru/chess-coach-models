# Blunder hazard

**The question.** Before a move is played, how likely is the player to blunder
here? Some positions are quiet and some are cliffs, and which is which depends
on the player's level and clock as much as on the board. Positions where
players at the player's level go wrong are the ones worth slowing down in: the
app could flag them in a review and aim drills at them.

| | |
|---|---|
| **Reads** | The position, the opponent's last move, both ratings, both clocks, the time control, the move number, and the mover's win probability from the engine's evaluation before the move. |
| **Predicts** | The chance the move played loses more than 20 points of win probability: the blunder bar the app and Lichess share ([`bridge/winprob-parity`](../../bridge/winprob-parity/) holds the lab's curve to the app's). |
| **Data** | Rated Lichess rapid games of October 2026 (CC0) that carry Lichess's engine analysis and clocks, read from the start of the month; up to 24 positions a game from each side's sixth move on. Recipe: [`datasets/game-positions.yaml`](../../datasets/game-positions.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test. |

**The paper.** [`paper/paper.pdf`](paper/paper.pdf) reads these results at
length: every run, the figures, the cuts of the closer look, and positions
as boards (ordinary ones, the ones the best run was surest of and the ones
it got most wrong). `lab paper blunder-hazard` builds it from the results
committed here ([`docs/design.md`](../../docs/design.md), "The paper").

## The rule

Written before the first full run.

- **Metric.** PR-AUC (average precision) on the test positions: a blunder is
  rare, so ranking is what matters. ROC-AUC is reported beside it, and Brier
  score, log loss and calibration error after the chance is rescaled on valid
  (Platt scaling), so a stated 20% can be read as one in five.
- **Floor and baseline.** `constant` gives every position the base rate.
  `gbm-context` reads the ratings, clocks and evaluation with no view of the
  board. `gbm-hand`, the reference, also reads hand features of the position:
  material, mobility, hanging pieces, checks and captures available, passed
  pawns, pressure on each king.
- **What counts as better.** A run beats the reference when its paired gain in
  PR-AUC on the same resampled test games has a 95% interval above zero.
- **Bands.** Results are also given by the mover's rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | The base rate for every position |
| `gbm-context` | LightGBM on ratings, clocks and the evaluation |
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
| `features` | `gbm-hand-no-<group>` for each of material, mobility, hanging, pawns, kings, and `transformer-medium-hand-no-<group>` for the same groups | One group of hand features left out |
| `geometry` | `transformer-medium-hand-no-geometry` | The learned bias for each offset between two squares left out of the transformer's attention: what telling it the board's geometry is worth |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval blunder-hazard`. What the first full runs say (commit `f9827db`; the
numbers are in the leaderboard):

- **One network beats the trees: the medium transformer that also reads the
  hand features.** Its paired gain is beyond the noise, while its own interval
  and the trees' overlap: with a test set of about three thousand games, only
  the paired comparison separates them.
- **From the board alone, no network matches the trees.** The convolutional
  tower and both transformers land together, below the reference beyond the
  noise, whatever their size. From this many games a network does not learn
  off the squares what the hand features count: a hanging piece, the checks
  and captures on offer. More games is the run to add, since the recipe keeps
  30,000 of a month's.
- **The stated chance can be read as a frequency.** After the rescaling on
  valid, the calibration table stays near the diagonal up to its top group.
- **Ranking is harder the stronger the mover.** Every run's PR-AUC falls as
  the rating band rises, and so does the base rate (the floor's row), so
  compare runs within a band, not one band with another.

What twice the epochs say (commit `0ba155a`: `transformer-medium-long` and
`transformer-medium-hand-long`, each set against the run it changed among the
`pairs` of [`results/analysis.json`](results/analysis.json)):

- **Neither longer run is kept.** `transformer-medium-long` is a hair better
  than the run it changed on the valid rows and level with it on the test
  rows. `transformer-medium-hand-long` is no better on either. The intervals
  of both paired gains hold zero, so `transformer-medium-hand` stays the
  model's best run.
- **Both stopped early.** Each had its best valid epoch at the fourteenth of
  its twenty-four and was stopped three epochs later, while the training
  loss went on falling. The valid rows are few here, and their score moves
  from one epoch to the next by more than the two schedules differ, so where
  a run stopped is partly chance; either way the runs as trained are no
  better.
- **A reading: this model is short of games, not of steps.** That fits what
  the first runs said, that more games is the run to add. The `games` study
  below measured it.

A run that is not kept stays in the results as a measurement of what its
change is worth. The two long runs are filed under a study of their own
(`lab file`) once the runs now training are in; until then the leaderboard
still ranks them.

What the two studies say (commit `ceae3ec`; a study run is listed apart on
the leaderboard and set against the run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **The model is short of games.** Trained on half and on a quarter of the
  training games, the best network is worse beyond the noise both times. On a
  quarter of the games the network and the trees are level, and the network's
  lead opens as the games are added. The trees lose less: on half the games
  they are inside the noise. This is what the longer schedule suggested, now
  measured, and the dataset's games are a small part of one month of the
  Lichess database. A larger dataset is the next thing to try.
- **Material is what the hand features carry.** With one group left out at a
  time, the trees and the network both lose most without the material group,
  and for the network that loss is most of what the hand features gave it.
  Loose pieces and the moves on offer cost both learners something. The
  attackers near the kings cost the trees and not the network, and passed
  pawns cost neither anything these test rows can show. A reading: the
  network reads off the squares what stands near a king, and does not learn
  from these games the sums over the whole board: how much is left, who is
  ahead, how far the game has gone.

What a start from engine evaluations says (commit `3810bca`:
`transformer-medium-pretrained` and `transformer-medium-hand-pretrained`, the
twelve-epoch runs started from the body that
[position evaluation](../position-evaluation/) trained, each set against the
run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **Both are kept, and the one with the features is the model's best run.**
  Each is better than the same run started from nothing on the valid rows, and
  on the test rows beyond the noise.
- **A network on the board alone is ahead of the trees for the first time.**
  Every network that read only the board was below `gbm-hand` here, in twelve
  epochs and in twenty-four. Started from the body, the same transformer is
  ahead of it beyond the noise.
- **Under the start the features add little.** The run that reads them and
  the run that does not have gains over the reference that lie inside each
  other's intervals. A reading: the features count what hangs and who is
  ahead, and a body trained to say who is winning has learned to see most of
  that.
- **The gain with the features is the less sure of the two.** Its interval
  leaves zero out by little, and each run was trained once. A second seed is
  the cheap run to add before this one is leaned on.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/blunder-hazard/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is 26,260,127
bytes, sha256 `aa6347c502fe165b9dfd3ba3ba200b16a696928227e1fa2b030263a4f1f47854`
(`weights` in [its record](results/transformer-medium-hand-pretrained.json)).
The records of the first full runs were written before a record named its
weights, which every later one does.

## Version 0

The lab's first hazard model was a LightGBM over sixteen board features,
trained on rated games of April 2019 with its own scripts. It showed that the
size of the evaluation alone ranks blunders no better than chance and that a
few board features do. Its data, features and split differ from the harness's,
so its scores are not comparable with the leaderboard here
([`docs/history.md`](../../docs/history.md) has its report). Its open
questions carry over: ratings are Lichess's, so the chance needs calibrating
for another site's ratings before the app can state it
([#2](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/2)), and the
hanging-piece feature is a proxy for a full exchange search
([#5](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/5)).

## What it does not say yet

- A position that is already lost cannot be blundered: with a win probability
  of 20 or less, no move loses 20 more points. Every learner that reads the
  evaluation gets those rows right for free, and the calibration table shows
  them as its lowest groups. That lifts ROC-AUC for every run alike, so PR-AUC
  and the paired gains are what to read. The fairer picture of each learner
  is its score on the positions that can still be blundered: the closer look
  gives it, as the group `20+` of its `open` slice.
- Only analysed games give a label, and players choose which games to analyse.
- The label is as deep as Lichess's server analysis.
- The model sees one position. The moves and clock use that led to it are a
  sequence model's input ([`docs/ideas.md`](../../docs/ideas.md)).
