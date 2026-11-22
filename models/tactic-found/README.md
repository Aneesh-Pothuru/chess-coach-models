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

**The paper.** [`paper/paper.pdf`](paper/paper.pdf) reads these results at
length: every run, the figures, the cuts of the closer look, and positions
as boards (ordinary ones, the ones the best run was surest of and the ones
it got most wrong). `lab paper tactic-found` builds it from the results
committed here ([`docs/design.md`](../../docs/design.md), "The paper").

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
| `features` | `gbm-hand-no-<group>` for each of material, mobility, hanging, pawns, kings, setup, first-move, line | One group of hand features left out |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval tactic-found`. What the first full runs say (commit `7cd074c`; the
numbers are in the leaderboard):

- **One network beats the trees: the medium transformer that also reads the
  hand features.** Its paired gain is beyond the noise, and small beside what
  the trees already take off the floor. By band it is ahead of the reference
  in every band but one, where the two are level.
- **Without the hand features, no network matches the trees.** The
  convolutional tower and both transformers land together, below the
  reference beyond the noise, whatever their size. They are shown the line as
  marked squares and have to work out for themselves what the hand features
  count: what the first move gives up, what the line wins, how long it is.
  Both of those transformers were still improving on valid at their last
  epoch, so more epochs is the run to add before saying the squares are not
  enough.
- **The crowd's rating says less than a look at the board.** `puzzle-rating`
  lands beside the trees that see no board, and far below the reference,
  which never reads a puzzle's rating. The reference leans most on the two
  evaluations and on whether the tactic's first move gives up material
  (`leans_on` in [its record](results/gbm-hand.json)). So what the line does
  on the board says more about finding a tactic in a game than thousands of
  puzzle attempts summed into one number.
- **A game is far from a puzzle.** The slope fitted for `puzzle-rating` is
  about a fifth of the rating formula's
  (`calibration` in [its record](results/puzzle-rating.json)): a gap between
  the player's rating and the puzzle's that would decide a puzzle moves the
  chance in a game much less.
- **The stated chance can be read as a frequency.** After the rescaling on
  valid, each of the best run's ten groups is within about a point of what
  happened, from a chance near a third to one above nine in ten.
- **Every run does best in the same band.** Log loss is lowest for movers
  rated 2100 to 2299 and higher on both sides, for the floor as well, so
  compare runs within a band, not one band with another.

What twice the epochs say (commit `0ba155a`: `transformer-medium-long` and
`transformer-medium-hand-long`, each set against the run it changed among the
`pairs` of [`results/analysis.json`](results/analysis.json)):

- **One of the two longer runs is kept: the transformer on the board alone.**
  `transformer-medium-long` is better than `transformer-medium` on the valid
  rows, and on the test rows beyond the noise. The gain is small, and the run
  is still behind the trees beyond the noise. So the epochs were not what
  the squares lacked: at this many games a network does not work out from
  the marked squares what the hand features count about the line.
- **With the hand features, twice the epochs change nothing.**
  `transformer-medium-hand-long` is a little better than the run it changed
  on the valid rows and level with it on the test rows (the interval of its
  paired gain holds zero). It is not kept, and `transformer-medium-hand`
  stays the model's best run.
- **Both stopped early.** Each had its best valid epoch a little past halfway
  and was stopped three epochs later: the training loss went on falling and
  the valid score did not.

A run that is not kept stays in the results as a measurement of what its
change is worth. `transformer-medium-hand-long` is filed under a study of its
own (`lab file`) once the runs now training are in; until then the
leaderboard still ranks it.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/tactic-found/<run>/`, as the GPU session
packed them; none is published. Each record names its run's files by size
and sha256. The best run's `model.pt` is 26,294,815 bytes, sha256
`37235b297e5fe07e4a7b1221e7a370c8fc52f3004b2023f17893fe4937c440f6`.

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
