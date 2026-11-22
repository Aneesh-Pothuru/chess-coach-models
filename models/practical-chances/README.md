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

**The paper.** [`paper/paper.pdf`](paper/paper.pdf) reads these results at
length: every run, the figures, the cuts of the closer look, and positions
as boards (ordinary ones, the ones the best run was surest of and the ones
it got most wrong). `lab paper practical-chances` builds it from the results
committed here ([`docs/design.md`](../../docs/design.md), "The paper").

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
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/) |
| `transformer-medium-hand-pretrained` | `transformer-medium-hand` started from the same body |
| `gbm-hand-double` | `gbm-hand` on twice the training games, from the larger build `game-positions-120k` of the dataset |
| `gbm-hand-quadruple` | `gbm-hand` on four times the training games, from the same build |
| `transformer-medium-hand-double` | `transformer-medium-hand` on twice the training games, with half the epochs so that it takes as many steps |
| `transformer-medium-hand-quadruple` | `transformer-medium-hand` on four times the training games, with a quarter of the epochs |

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

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval practical-chances`, and the closer look,
[`results/analysis.json`](results/analysis.json), written by
`lab analyse practical-chances`. What the first full runs say (commit
`72d43ea`; the numbers are in those two files):

- **Every fitted run beats the engine's curve, beyond the noise.**
  `gbm-context` reads only the evaluation, the ratings, the clocks and the
  move number, and it is ahead of `engine-curve` on the same resampled test
  games; so is the largest network (`pairs` in the closer look). The number
  a review shows today is not the best guess of how a game between two people
  ends.
- **The curve is too sure at both ends, and most of all at low ratings.**
  Where the engine gives the mover four chances in five or more, movers under
  1100 score well short of what the curve says, and movers above 2000 nearly
  what it says. Where it gives one chance in five or less, movers under 1400
  score more than twice the curve's number (the grid `rating-win`: each cell
  has the mean result of its positions and each run's mean prediction there).
- **A clear edge is worth little at low ratings.** In positions the engine
  gives 60 to 80 percent, movers under 1100 score only a little over half.
  Movers above 2000 score what the curve says.
- **The clock is the largest thing the engine does not see.** With under a
  minute left, the mover scores well under half in positions the engine calls
  level, and less than half even in positions it gives 60 to 80 percent (the
  grid `clock-win`). The fitted runs' lead over the curve is widest there
  (the slice `clock`).
- **By band, the lead over the curve is largest for movers under 1100** and
  smallest between 1700 and 2000.
- **The rating formula alone says less than the mean result.** `elo-gap`
  lands below `constant`. Games are paired by rating, so the gap between the
  two players is usually small, and where it is large the formula is far too
  sure of it: where it gives the mover about one chance in five, movers score
  about two in five, and where it gives four in five, about three in five
  (`reliability` in the closer look). Why its line is that flat on these
  games is open. The paper names two readings, ratings that are not settled
  in unusual pairings and which games players choose to analyse, and the
  check that would tell them apart.
- **No network beats the trees.** All four land inside the noise of
  `gbm-hand`: the two CPU-sized ones level with it, the two GPU transformers
  a little below. The GPU transformers had their best epoch on valid before
  the half of their schedule and were stopped early, so more epochs is not
  the run to add. The hand features add a little to the context numbers,
  beyond the noise (`gbm-hand` over `gbm-context` in `pairs`), and the trees
  take most of their gain from the evaluation, then the two ratings, the
  material and the clocks (`leans_on` in
  [the reference's record](results/gbm-hand.json)).

What the paper's closer look adds, with every run set beside the reference in
each cut:

- **The curve flatters whoever is to move, by half a move.** Over all the
  test positions the curve gives the mover a little more than half, and
  movers score half. The engine's number before a move is the position's
  worth if the mover finds the best move, and a person's move gives
  something away on average: if a move costs so many points of winning
  chances, the number before it stands half of that above an even split.
  The trees have no such lean. One cut fits this reading: a mover in check
  has few moves to choose from and less to give away, and there the curve's
  mean is a little under the result, not over it (the slice `check`).
- **The curve was fitted to much stronger players, without the clock.**
  Lichess fitted its multiplier to rapid games between players rated 2300 and
  over, with games lost on time left out (the pull request the paper cites).
  That fits the cuts: nearly right above 2000, too sure below, and well off
  where a clock is short. With under half a minute left the mover scores
  well under what the curve says, and with the opponent that short, well
  over it (the slices `clock` and `opponent-clock`). A reading: no run here
  refits the curve by band or with a clock, which is the run that would
  measure it.
- **On most positions the curve is the closer of the two.** It has the lowest
  MAE on the leaderboard and is nearer the result than the reference on more
  than half the test positions (`against_reference`). On a result that is
  nearly always 1 or 0, the absolute error rewards a run for being sure,
  right or wrong, and the curve is the surer of the two and the less true:
  where it is wrong it is wrong by more, which RMSE counts and which only the
  true expected score makes lowest. The MAE column is not the one to rank
  these runs by.

So the model to carry to the app is the trees: seconds to train, no GPU, and
nothing a network adds here. What it changes in a review is the number beside
a position: the result two players at these ratings and clocks get from it,
not the result best play gets.

What the two studies say (commit `ceae3ec`; a study run is listed apart on
the leaderboard and set against the run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **The trees do not need more games.** Trained on half and on a quarter of
  the training games, the trees are inside the noise both times. The network
  loses a little both times and stays behind the trees on every share of the
  games, by less as the games are added. A reading: what this model can say
  is set by what it reads, the engine's evaluation and the two ratings, and
  not by how many games it has seen.
- **Little beyond material.** With one group of hand features left out at a
  time, the material group costs the trees most and the moves on offer a
  little. Loose pieces, the attackers near the kings and passed pawns cost
  nothing these test rows can show, and every one of these costs is small
  beside what the trees add to the engine's curve.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/practical-chances/<run>/`, as the GPU session
packed them; none is published. Each record names its run's files by size
and sha256. The reference's `model.txt` is 2,437,650 bytes, sha256
`5b3526084ab51c61a60ab182996e0cebe2b9a707e92e3771684121f93ba03969`.

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
