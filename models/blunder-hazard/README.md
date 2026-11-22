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

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval blunder-hazard`.

## Version 0

The lab's first hazard model is a LightGBM over 16 board features, trained on
rated games of April 2019 with its own scripts
([report](../../reports/blunder_hazard.md)). It showed that the size of the
evaluation alone ranks blunders no better than chance and that a few board
features do. Its data, features and split differ from the harness's, so its
scores are not comparable with the leaderboard here. Its open questions carry
over: ratings are Lichess's, so the chance needs calibrating for another
site's ratings before the app can state it
([#2](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/2)), and the
hanging-piece feature is a proxy for a full exchange search
([#5](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/5)).

## What it does not say yet

- Only analysed games give a label, and players choose which games to analyse.
- The label is as deep as Lichess's server analysis.
- The model sees one position. The moves and clock use that led to it are a
  sequence model's input ([`docs/ideas.md`](../../docs/ideas.md)).
