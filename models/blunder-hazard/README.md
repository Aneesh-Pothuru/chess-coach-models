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

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/blunder-hazard/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is 26,259,999
bytes, sha256 `ed6d08bfee84b60de82fff5a7bb3527f0748fe4735d26f5aad53d11d289f48f2`,
read off the file there: these records were written before a record named its
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
