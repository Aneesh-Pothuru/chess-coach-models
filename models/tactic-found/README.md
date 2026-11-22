# Tactic found

**The question.** The opponent has just made a mistake, and there is a tactic
on the board. Does the player to move find it? A puzzle tells its solver that
something is there. A game does not: the clock is running and the player has
plans of his own. The app meets this in every review. A missed tactic that
players at his level usually find is a lapse worth a drill, and one they
usually miss is not, and today it cannot tell the two apart.

| | |
|---|---|
| **Reads** | The position after the opponent's mistake, the mistake, and the tactic's line, with the squares each of its moves starts and ends on marked on the board; both ratings, both clocks, the time control, the move number, and the mover's win probability from the engine's evaluation before and after the mistake. |
| **Predicts** | The chance that the move the player makes is the first move of the tactic. |
| **Data** | [`Lichess/chess-puzzles-with-games`](https://huggingface.co/datasets/Lichess/chess-puzzles-with-games) (CC0): the Lichess puzzles of September 2022, each joined to the rated game it was cut from. A puzzle begins with the opponent's mistake, so the game's next move says whether the player at the board found the answer. Blitz, rapid and classical games, puzzles whose own rating has settled, a random half of the source. Recipe: [`datasets/tactics.yaml`](../../datasets/tactics.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test. |

## The rule

Written before the first full run.

- **The label.** Found means the move played is the first move of the puzzle's
  solution. Lichess keeps a puzzle only when that move is clearly the best
  one, so any other move lets the tactic go. One exception is Lichess's own:
  when the solution mates at once, any move that mates counts. Rows where the
  game ended with the mistake, or where the clocks were not kept, give no
  label; the dataset's manifest counts them.
- **Metric.** Log loss on the test rows, after the chance is rescaled on valid
  (Platt scaling). The app would show the number as a chance, so it is scored
  as one. Brier score, calibration error, PR-AUC and ROC-AUC are reported
  beside it.
- **Floor and baseline.** `constant` gives every row the base rate.
  `gbm-context` reads the ratings, the clocks, the two evaluations and the
  length of the line, with no view of the board. `gbm-hand`, the reference,
  also reads hand features of the position and of the line: material,
  mobility, checks and captures available, and what the line does (checks,
  captures, quiet moves, sacrifices, whether it ends in mate).
- **The crowd's rating.** `puzzle-rating` is not a model. It puts the mover's
  rating and the puzzle's own rating through the rating formula, with one
  slope and one intercept fitted on valid as for every run. The puzzle's
  rating is what thousands of attempts made it, the best summary there is of
  how hard the tactic is as a puzzle. No other run may read it, because a
  tactic in a player's own game has no crowd rating. Where it lands says how
  much of finding a tactic in a game the crowd's rating already explains, and
  its fitted slope says how much of the formula's steepness is left in a game
  (a slope of 1 would mean a game is a puzzle).
- **What counts as better.** A run beats the reference when its paired gain in
  log loss on the same resampled test games has a 95% interval above zero.
  `puzzle-rating` is compared with the reference the same way.
- **Bands.** Results are also given by the mover's rating band. The bands
  start at 1700 because Lichess cuts its puzzles from games between players
  rated about 1500 and up.

## Runs

| Run | Learner |
|---|---|
| `constant` | The base rate for every row |
| `puzzle-rating` | The rating formula on the mover's rating and the puzzle's |
| `gbm-context` | LightGBM on ratings, clocks, evaluations and the line's length |
| `gbm-hand` | LightGBM with the hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the hand features beside the board |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval tactic-found`.

## What it does not say yet

- **Players under 1500.** Almost every game a puzzle was cut from is between
  players rated 1500 or more on Lichess. The model has seen nobody below
  that, so its chance for a lower-rated player is a guess past the edge of
  its data, and it needs the check on the player's own games before the app
  states it ([`docs/ideas.md`](../../docs/ideas.md), "Checks on the player's
  own scale").
- **Only the first move.** A player who plays the first move for another
  reason counts as having found the tactic. Finding the whole line is a
  stricter label, which a game answers only while the opponent follows the
  puzzle's replies.
- **Tactics that work.** Every row is a tactic that was there. Positions where
  a tempting sacrifice fails are not in this data, so the model says nothing
  about false alarms.
- **Analysed games.** Lichess makes puzzles from games that were analysed, and
  players choose which games to analyse.
- **The model is shown the line.** In the app the line comes from the engine.
  Lichess's puzzle lines follow the best defence, which the engine's line
  also does.
