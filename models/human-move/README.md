# Human move

**The question.** Which move does a player of this rating make here? An engine
says which move is best, and a human-move model says which one people play.
The app already asks one: it runs [Maia-2](https://github.com/CSSLab/maia2)
to say how often players in the player's band find a move, and what they play
instead. This model asks the same question on the lab's harness, for two
reasons. The first is a check on what the app relies on: Maia-2 as its authors
published it is a run of this leaderboard, scored on rapid games played
almost three years after the last of the games it learned from, by rating
band, with how well its chances hold. The second is a start. The runs trained here read what Maia-2
does not (both clocks and the time control), and they can be changed, so they
say how far a small body gets on a few hundred thousand positions and what
more games would be worth to it.

| | |
|---|---|
| **Reads** | The position before the move, the opponent's last move, both players' ratings, both clocks, the time control, the ply and the castling rights. Nothing an engine says of the position, and nothing about the move that was made. |
| **Predicts** | For each move the position allows, the chance that it is the one the player makes. A position's chances add up to one. |
| **Data** | The rows [blunder hazard](../blunder-hazard/) and [think time](../think-time/) read: positions from rated Lichess rapid games of October 2026 (CC0), nothing before each side's sixth move, up to 24 positions a game. Recipe: [`datasets/game-positions.yaml`](../../datasets/game-positions.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test, the same games in each part as for those two models. |

This is the lab's first model whose answer is one choice among a row's own
candidates. A row has as many candidates as its position has legal moves, a
network gives each a logit through a head of its own, and the trees read one
row a legal move ([`docs/design.md`](../../docs/design.md), "An answer that is
a move").

## The rule

Written before the first full run.

- **Metric.** First right: how often the move given the highest chance is the
  move played, the move-matching accuracy the human-move papers report. Two
  more are reported beside it: how often the move played is among the three
  given the highest chances, and the log loss, the mean of minus the log of
  the chance given to the move played. A pawn that promotes is one move
  whatever piece it becomes. A position with one legal move is a row like any
  other.
- **One temperature.** Every run's chances are sharpened or flattened by one
  number fitted on the valid rows. It moves no move past another, so it
  changes the log loss and the calibration and neither of the other two
  scores. A record keeps the log loss from before it, which for `maia2` is the
  published model's own.
- **Floor and baselines.** `constant` gives every legal move the same chance.
  The trees read one row a legal move and say the chance that it is the one
  played, and a position's chances are scaled to add up to one. `gbm-context`
  reads what needs no chess: who is playing, the clocks, where the move leaves
  and lands, the piece that moves, what stands where it lands, and whether
  either square is one the opponent's last move touched. `gbm-hand`, the
  reference, also reads the position's hand features and what a person would
  count of the move: who attacks the square it leaves and the square it
  reaches and with what, whether the piece there can be taken or is pinned,
  and whether the move gives check, castles, promotes or takes in passing
  ([`encode/moves.py`](../../src/chess_coach_models/encode/moves.py)). A
  position is about thirty rows to the trees, so they train on a quarter of
  the training games.
- **Maia-2.** `maia2` is the published rapid model, run by its own package on
  each row's position and the two ratings, which it reads in bands: below
  1100, each hundred from 1100 to 1999, and 2000 or above. Its published
  config names Lichess games from May 2018 to November 2023, and its code
  keeps a position from the eleventh ply on with more than 30 seconds on the
  clock. It does not read the clock. Its chances are taken over the moves the
  position allows, and it tells a promotion's four choices apart where a row
  here has one candidate, so those four are added. Nothing is fitted but the
  temperature.
- **What counts as better.** A run beats the reference when its paired gain in
  first right on the same resampled test games has a 95% interval above zero.
  A run trained here and `maia2` are set side by side by their own intervals
  for now: the paired difference of two named runs is the closer look's, and
  the closer look does not read this kind of model yet.
- **Bands.** Results are also given by the mover's rating band, which is the
  question the app puts to a human-move model.
- **What is expected.** Maia-2 learned from five and a half years of games and
  the runs here from 30,000 games of one month, so `maia2` should lead on
  first right, and that alone would not be a finding. The findings are its
  score on these rows band by band, how well its chances hold almost three
  years on, what its reading of the two ratings is worth, and how much of the
  distance to it the runs here cover with what they have.

## Runs

| Run | Learner |
|---|---|
| `constant` | The same chance for every legal move |
| `gbm-context` | LightGBM on a row a legal move, with no chess in it |
| `gbm-hand` | LightGBM on a row a legal move, with what a person would count of the move (the reference) |
| `maia2` | Maia-2's published rapid model, with nothing fitted here |
| `conv-small` | A convolutional tower under the move head |
| `transformer-small` | A small square-token transformer under the move head, for a GPU |
| `transformer-medium` | A larger one, for a GPU |
| `transformer-medium-hand` | The same, reading the position's hand features beside the board |
| `conv-medium` | `transformer-medium` with its body changed to a convolutional tower of about its size, each block weighing its channels by the whole board |
| `hybrid-medium` | `transformer-medium` with its body changed to two blocks of the tower under five transformer layers |
| `transformer-medium-attacks` | `transformer-medium` with its attention told what each piece attacks and what it stands behind |
| `transformer-large` | `transformer-medium` three times larger: twelve layers of width 384 |

The last four change only the body of the run they name
([`docs/design.md`](../../docs/design.md), "Bodies and a head"), and
[`docs/ideas.md`](../../docs/ideas.md) says what was expected of them before
they ran. Each is kept only if it beats the run it changes on valid and on
test beyond the noise.

Runs that are written and wait for their GPU
([`docs/ideas.md`](../../docs/ideas.md) says what is expected of them, written
before they run). Each changes one thing in a run above, and is kept only if it
beats that run on valid and on test beyond the noise:

| Run | Learner |
|---|---|
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/), under the move head |
| `transformer-medium-attacks-pretrained` | `transformer-medium-pretrained` with its attention told what each piece attacks and what it stands behind |

### Studies

Runs that change one thing in a run above, to say what that thing is worth
([`docs/design.md`](../../docs/design.md), "A run that changes another"). They
are listed apart on the leaderboard, and each is read against the run it
changes.

| Study | Runs | What each changes |
|---|---|---|
| `games` | `transformer-medium-half`, `transformer-medium-quarter` | Half and a quarter of the training games, chosen by a hash of the game, gone through as many times more so the steps are the same |
| `ratings` | `maia2-one-rating` | Maia-2 told that both players of every row are rated 1500: what its reading of the two ratings is worth |
| `geometry` | `transformer-medium-no-geometry` | The learned bias for each offset between two squares left out of the transformer's attention: what telling it the board's geometry is worth |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval human-move`. Where the package and its weights are, a test holds
the `maia2` run to the package's own reading of one position at a time: the
same first move, and the same chances to the four places the package prints
(`tests/test_maia.py`). What the first full runs say (commit `269bfb6`; the
numbers are in the leaderboard and in the runs' records beside it):

- **Maia-2 leads, as expected.** It names the move played in about one
  position in two, and the move is among its first three in four positions
  in five. That alone is not a finding: it learned from five and a half
  years of games and the runs here from thirty thousand games of one month.
- **Band by band, Maia-2 is weakest under 1100.** From 1400 up its first
  right is level across the bands. Under 1100 it is several points in a
  hundred lower.
- **Its chances hold almost three years on.** The one temperature fitted on
  the valid rows is close to one (the record's `calibration`), so its
  chances were nearly right as published. In ten equal groups of its
  chances, what it said and how often the move was played are within a
  tenth of a point of each other in every group.
- **Its reading of the ratings is worth most at the ends.** Told that both
  players of every row are rated 1500, it loses under one point of first
  right in a hundred over all the rows. By band (the record of
  `maia2-one-rating`), it loses nothing in the band that holds 1500 and
  nearly two points in a hundred under 1100 and at 2000 and above. The
  paired difference of the two runs is not made yet.
- **The runs trained here cover about three fifths of the step from the
  trees to Maia-2.** They are close to it under 1100 and far behind at 2000
  and above: Maia-2 holds its level as the players get stronger, and the
  runs trained here fall back.
- **Size did not matter here, and games do.** The small and the medium
  transformer lie inside each other's intervals, the hand features add
  nothing to the medium one, and the convolutional tower is behind both. On
  half of the training games the medium transformer loses nearly two points
  of first right in a hundred, and on a quarter more than four. On that
  quarter, which is what the trees were trained on, it is still ahead of
  the trees beyond the noise. So this model is short of games before it is
  short of size, and the larger build of this dataset is the run to make
  before any larger network.

What the architecture test says (commit `414f6d3`: the four runs of another
shape and the `geometry` study, each trained once from nothing). Their pairs
are not made yet. So each is read here off its own interval and the interval
of its gain over the trees, and none is kept or filed until
`lab analyse human-move` has set it against the run it changed:

- **Told what each piece attacks, the transformer is the best network
  trained here.** `transformer-medium-attacks` is better than
  `transformer-medium` on the valid rows, and on the test rows it stands
  clear of every other network trained here, the one three times its size
  among them (the intervals of their gains over the trees do not touch). It
  covers about seven tenths of the step from the trees to Maia-2, where the
  ladder's transformers covered about three fifths. It is ahead of
  `transformer-medium` in every band, by least under 1100 and by most at
  2000 and above, where the ladder's runs fell furthest behind. Maia-2 is
  still ahead of it in every band. Its best valid epoch was its last, so it
  had not finished learning.
- **Three times the parameters cannot be told from the medium
  transformer.** `transformer-large` is a little better than
  `transformer-medium` on the valid rows, and on the test rows the two lie
  inside each other's intervals. From under one million parameters to over
  twenty million, the three transformers of the ladder's shape lie inside
  each other's intervals. Size is still not what this model is short of.
- **The tower and the hybrid are far behind.** Each is behind every
  transformer that has its offsets, the small one too (the intervals do not
  touch), and level with the small tower of the ladder. Both fitted their
  training rows fast:
  the tower's best valid epoch was its fifth and the hybrid's its seventh,
  the trainer stopped both early, and by then their loss on their own
  training rows was far below any transformer's. In the models that answer
  with one number the tower is kept in three of four. Here it is well
  behind.
- **Without the offsets between squares the transformer falls to the
  trees.** `transformer-medium-no-geometry` is level with `gbm-hand` (the
  interval of its gain over them holds zero), where with the offsets the
  same network is far ahead. It was still improving at its last epoch, and
  its loss on its own training rows was far above the other's: it learns
  slowly what the offsets hand the other. In the models that answer with one
  number the same study found little or nothing.
- **A reading of the three.** A move joins two squares anywhere on the
  board. Attention joins any two squares in one layer and a convolution only
  neighbours, and what attention has to know to do it is how the two squares
  lie to each other and whether the piece on one reaches the other.

What the app can take from this today: Maia-2, which it already runs, is the
right model to ask, and its chances can be shown as they are. The rating it
is told matters most for the weakest and the strongest players, and for a
player in the middle bands the band asked matters little to the first move
it names.

A model whose answer is a move has no paper of its own yet, and its closer
look holds only its pairs: each run set against the run it changed on the
same test games. The pairs of these runs are not made yet. `lab analyse
human-move` makes them where the test predictions are.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/human-move/<run>/`, as the GPU session packed
them; none is published. `maia2` has no weights of the lab's: its package
fetches the published ones, whose hash is in the run's record. The best run
trained here, `transformer-medium-attacks`, has a `model.pt` of 26,247,999
bytes, sha256
`3c690d6eb229260ec507cca01a2c48b2f3ca27e845aaa5e7ee218358f0b48a4b`.

## What it does not say yet

- **Which model the app should run.** Maia-2's authors have since published
  [Maia-3](https://github.com/CSSLab/maia3) and recommend it for new work. It
  is not a run here yet. On the same rows it would say whether the app should
  move to it.
- **Two runs against each other.** The gain on the leaderboard is over the
  trees. Whether a network trained here and Maia-2 differ beyond the noise is
  read from their two intervals until the closer look reads this kind of
  model.
- **By the clock.** Maia-2 learned from no position with 30 seconds or less
  left and does not read the clock, and the networks here read both clocks.
  Where that matters is a cut of the test rows by the time left, which the
  closer look would make.
- **Few games.** The runs trained here read 30,000 games. The `games` study
  says what half and a quarter of them are worth, which is the case for or
  against a larger build of the dataset. A body that already reads a board
  (the one [position-evaluation](../position-evaluation/) trains) under the
  move head is not run yet. The attention that is told the attacks can start
  from that body as it is, and it had not finished learning on the games it
  had, so the larger build and that start are the two runs for it.
- **A promotion is one move.** A model here does not say which piece a pawn
  becomes.
- **What people play, not what is good.** Nothing here reads an engine. The
  likeliest move at a level can be a mistake, and saying so is the engine's
  part.
- **Whose scale.** The ratings are Lichess rapid's, which is not the scale of
  the player's own site.
