# Game rating

**The question.** What rating does a player's play in one game look like? A
rating is earned over many games, and one game is a single reading of it. If
a model can read a rating off the moves and the clock of one game, a review
can say what that game looked like beside the player's usual level, and the
runs here say first how far off one game's reading usually is, and what in a
game gives the rating away: how much the moves lost, how the clock was used,
or the positions themselves.

| | |
|---|---|
| **Reads** | Each of the player's moves from their sixth on, in order, up to 48 of them: the position before the move, the opponent's last move, the move played, both clocks, the seconds the move took, the player's winning chances before it and what it lost (from the engine evaluations Lichess attached), the number of legal moves, whether it took or gave check, and the castling rights. Beside the moves, the time control and the game's length. It reads neither player's rating and not the result. |
| **Predicts** | The player's Lichess rapid rating when the game was played. |
| **Data** | Rated Lichess rapid games of October 2026 (CC0) with engine evaluations and clocks. A row is one player in one game, and both players of a game are rows. A player gives a row with at least 10 moves that carry an evaluation and clocks. Recipe: [`datasets/games.yaml`](../../datasets/games.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test, so both players of a game are in the same part. A game falls in the same part here as in the positions of [blunder-hazard](../blunder-hazard/). |

This is the lab's first model whose row is a sequence. A network reads every
position of the row with the body the other models use, and a few more
transformer layers read the positions in order
([`docs/design.md`](../../docs/design.md), "A row that is a sequence").

## The rule

Written before the first full run.

- **Metric.** Mean absolute error in rating points on the test rows. RMSE, R²
  and Spearman's rank correlation are reported beside it.
- **Floor and baseline.** `constant` gives every player the training median.
  `gbm-context` reads the time control and the game's length with no view of a
  move, which says what is left before any play is read. `gbm-hand`, the
  reference, also reads counts over the player's moves: what they lost, how
  the clock was used, and what there was to choose from
  (`game_features` in [`encode/hand.py`](../../src/chess_coach_models/encode/hand.py)).
- **What counts as better.** A run beats the reference when its paired gain in
  MAE on the same resampled test games has a 95% interval above zero.
- **Bands.** Results are also given by the player's rating band. The bands
  are bands of the label itself, so they show who a run reads well: a run that
  pulls every reading toward the middle has an error that grows toward both
  ends.

## Runs

| Run | Learner |
|---|---|
| `constant` | The training median for every player |
| `gbm-context` | LightGBM on the time control and the game's length |
| `gbm-hand` | LightGBM with the counts over the player's moves (the reference) |
| `conv-small` | A convolutional tower reads each position, and two transformer layers read the moves in order |
| `transformer-small` | A small square-token transformer reads each position, under the same two layers; for a GPU |
| `transformer-medium` | A larger square-token transformer under two wider layers, for a GPU |
| `transformer-medium-hand` | The same, reading the counts over the player's moves beside the game |

### Studies

Runs that change one thing in a run above, to say what that thing is worth
([`docs/design.md`](../../docs/design.md), "A run that changes another"). They
are listed apart on the leaderboard, and each is read against the run it
changes.

| Study | Runs | What each changes |
|---|---|---|
| `features` | `gbm-hand-no-<group>` for each of accuracy, tempo, choices | One group of the counts left out: what the moves lost, how the clock was used, what there was to choose from |
| `games` | `gbm-hand-half`, `gbm-hand-quarter` | Half and a quarter of the training games, chosen by a hash of the game |

## Results

None yet. The model runs end to end on a small sample
(`lab all game-rating --smoke`, which is a check of the code and never a
result). Its first full pass is the plan `games` in
[`colab/plans/`](../../colab/plans/). The leaderboard will be
`results/leaderboard.md`, written by `lab eval game-rating`.

## What it does not say yet

- **One game is a noisy reading.** A player rated 1500 has games that look
  like 1300 and games that look like 1700. The error left after the best run
  is partly the model's and partly the game's, and nothing here separates the
  two yet. Several games of one player would.
- **The pairing shows through.** Lichess pairs players of like rating, and a
  position is made by both of them, so a network can read the level of the
  game as much as the player. The same model asked for the opponent's rating
  would say how much: it is not run yet.
- **By phase.** The idea is a rating for the opening, the middlegame and the
  ending of a game. This model gives one number for the game.
- **The engine is read.** What a move lost comes from the evaluations Lichess
  attached. A rating read from the moves and the clock alone is a different
  run.
- **Which games.** Only analysed games give a row, and players choose which
  games to analyse. The evaluation is as deep as Lichess's server analysis. A
  long game is cut at the player's 48th counted move.
- **Whose scale.** The ratings are Lichess rapid's, which is not the scale of
  the player's own site.
