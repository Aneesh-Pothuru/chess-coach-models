# Puzzle difficulty

**The question.** How hard is this tactic for people? A Lichess puzzle's rating
is where the crowd's attempts settled: a player rated the same solves it about
half the time. A model that can read that rating off a position and its
solution can rate any tactic, including the ones in the player's own games, on
the scale his puzzle rating lives on. The app could then tell a missed tactic
that was within reach from one far above his level, and pick drills at the
right height.

| | |
|---|---|
| **Reads** | The position the solver sees, the opponent's move that led to it, and the solution line: the squares each move of the line starts and ends on are marked on the board. |
| **Predicts** | The puzzle's Lichess rating, in rating points. |
| **Data** | The [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0): puzzles whose rating has settled (Glicko deviation at most 100 after at least 100 attempts), a fixed quarter of them chosen by a hash of the puzzle id. Recipe: [`datasets/puzzles.yaml`](../../datasets/puzzles.yaml). |
| **Split** | By the game a puzzle was cut from: 85% train, 5% valid, 10% test. |

**The paper.** [`paper/paper.pdf`](paper/paper.pdf) reads these results at
length: every run, the figures, the cuts of the closer look, and positions
as boards (ordinary ones, the ones the best run was surest of and the ones
it got most wrong). `lab paper puzzle-difficulty` builds it from the results
committed here ([`docs/design.md`](../../docs/design.md), "The paper").

## The rule

Written before the first full run.

- **Metric.** Root mean squared error on the test puzzles, in rating points.
  MAE, R² and Spearman's rank correlation are reported beside it.
- **Floor and baseline.** `constant` gives every puzzle the training mean.
  `gbm-context` reads only the length of the solution. `gbm-hand`, the
  reference, reads hand features of the position and the line: material,
  mobility, checks and captures available, and what the line does (checks,
  captures, quiet moves, sacrifices, how many pieces move, whether it ends in
  mate).
- **What counts as better.** A run beats the reference when its paired gain in
  RMSE on the same resampled test games has a 95% interval above zero.
- **Bands.** Results are also given by the puzzle's true rating band, since an
  error of 200 points matters most near the player's own level.

## Runs

| Run | Learner |
|---|---|
| `constant` | One number for every puzzle |
| `gbm-context` | LightGBM on the solution's length |
| `gbm-hand` | LightGBM on the hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the hand features beside the board |
| `transformer-medium-long` | `transformer-medium` with twice the epochs |
| `transformer-medium-hand-long` | `transformer-medium-hand` with twice the epochs |
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/) |
| `transformer-medium-hand-pretrained` | `transformer-medium-hand` started from the same body |
| `gbm-hand-double` | `gbm-hand` on twice the training games, from the larger build `puzzles-all` of the dataset |
| `gbm-hand-quadruple` | `gbm-hand` on four times the training games, from the same build |
| `transformer-medium-hand-double` | `transformer-medium-hand` on twice the training games, with half the epochs so that it takes as many steps |
| `transformer-medium-hand-quadruple` | `transformer-medium-hand` on four times the training games, with a quarter of the epochs |
| `conv-medium-hand` | `transformer-medium-hand` with its body changed to a convolutional tower of about its size, each block weighing its channels by the whole board |
| `hybrid-medium-hand` | `transformer-medium-hand` with its body changed to two blocks of the tower under five transformer layers |
| `transformer-medium-attacks` | `transformer-medium` with its attention told what each piece attacks and what it stands behind |
| `transformer-medium-hand-attacks` | `transformer-medium-hand` told the same |
| `transformer-large-hand` | `transformer-medium-hand` three times larger: twelve layers of width 384 |

The last five change only the body of the run they name
([`docs/design.md`](../../docs/design.md), "Bodies and a head"), and
[`docs/ideas.md`](../../docs/ideas.md) says what was expected of them before
they ran. Each is kept only if it beats the run it changes on valid and on
test beyond the noise.

The four runs on more games (`-double`, `-quadruple`) take their training rows
from [`puzzles-all`](../../datasets/puzzles-all.yaml), a larger build of the
dataset, and are scored on the valid and test rows every run here is scored on
([`docs/design.md`](../../docs/design.md), "A run on more games"). They are the
`games` study below turned round, and [`docs/ideas.md`](../../docs/ideas.md)
says what was expected of them before they ran. Each is kept only if it beats
the run it changes on valid and on test beyond the noise.

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
| `geometry` | `transformer-medium-hand-no-geometry` | The learned bias for each offset between two squares left out of the transformer's attention: what telling it the board's geometry is worth |

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval puzzle-difficulty`. What the first full runs say (commit `f9827db`;
the numbers are in the leaderboard):

- **Every network beats the trees, beyond the noise.** The order follows what
  a network reads and how large it is: the medium transformer that also reads
  the hand features, the same transformer on the board alone, the
  convolutional tower, the small transformer.
- **The hand features still pay under a network.** The medium transformer with
  the features is well ahead of the same transformer without them (the
  intervals of their gains do not touch), so in twelve epochs eight layers did
  not learn from the board everything the features count. Which features
  carry that under a network is still a run to make here: the features
  study below left a group out of the trees only.
- **Good at ranking, loose on the rating.** The best run orders puzzles well
  (its rank correlation) and still misses a puzzle's rating by about a rating
  class on average. It can sort the tactics of a game into easier and harder
  ones, and it cannot yet give one a rating worth stating.
- **A band rewards hedging.** Bands are cut by the true rating, so the floor,
  which says the average for every puzzle, has the smallest error of all in
  the middle band and the largest at both ends. Read a band's column from the
  top down, not across the bands. The best network leads the trees by most at
  the two ends, the easiest and the hardest puzzles, and in the middle band
  the trees are level with it.
- **No network had finished learning.** Three of the four had their best valid
  epoch at the last one, so a longer schedule was the cheapest run to add.

What twice the epochs say (commit `0ba155a`: `transformer-medium-long` and
`transformer-medium-hand-long`, each set against the run it changed among the
`pairs` of [`results/analysis.json`](results/analysis.json)):

- **Both longer runs are kept.** Each is better than the run it changed on
  the valid rows, and on the test rows beyond the noise.
  `transformer-medium-hand-long` is now the model's best run.
- **The epochs were worth more than the hand features.** The transformer on
  the board alone gained more from twice the epochs than it had from the
  features, and with the epochs it is ahead of the twelve-epoch transformer
  that reads the features (the intervals of their gains over the reference do
  not touch).
- **Under the longer schedule the features add little.** The two long runs
  order puzzles equally well and miss by as much on average: their rank
  correlations and their mean absolute errors lie inside each other's
  intervals (`test` in the two records). The one with the features is ahead
  on RMSE, and by band only on the puzzles rated 1800 and up; under 1400 the
  board alone does better (the leaderboard's table by band, which draws no
  interval). A reading: given the steps, eight layers learn from the board
  most of what the features count, and the features still help where a
  puzzle is hard. Set against each other on the same resampled games
  (`pairs`), the run with the features is better on the valid rows and, by a
  small margin, beyond the noise on the test rows: a fraction of what the
  features were worth at twelve epochs.
- **Twenty-four epochs were enough.** Both runs had their best valid epoch
  about three quarters of the way through, and the trainer stopped them three
  epochs later: the training loss went on falling and the valid score did
  not. So a still longer schedule is not the next run. More puzzles or a
  better start may be: the `games` study below says puzzles are, and the
  `-pretrained` runs.

What the two studies say (commit `ceae3ec`; a study run is listed apart on
the leaderboard and set against the run it changed among the `pairs` of
[`results/analysis.json`](results/analysis.json)):

- **More puzzles would help, and the network most.** Trained on half and on
  a quarter of the training puzzles, the trees and the best twelve-epoch
  network are both worse beyond the noise, and the network loses more than
  twice what the trees lose. Its lead over the trees widens with every
  doubling, and the last doubling was worth about as much to it as twice the
  epochs were. The dataset is a fixed quarter of the puzzles whose rating has
  settled, so the next thing to try is the rest of them.
- **The trees know a puzzle mostly by its solution.** With one group of hand
  features left out at a time, the counts of what the line's moves do cost
  the trees by far the most, though they are still told the line's length.
  Then come the moves on offer in the position and the first move of the
  solution. Material, the attackers near the kings, loose pieces and passed
  pawns cost little, and without the one count of the opponent's last move
  the trees are a hair better.
  [Puzzle difficulty, unsolved](../puzzle-difficulty-unsolved/) measures the
  same from the other side: what is left when the whole solution is hidden.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/puzzle-difficulty/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is
26,285,279 bytes, sha256
`5b3d0e624fd6658d58881700839970866a8114559dea7e67414d8132c96c097d`
(`weights` in [its record](results/transformer-medium-hand-long.json)). The
records of the first full runs were written before a record named its
weights: `transformer-medium-hand`'s `model.pt` is 26,285,279 bytes, sha256
`346b597547beb8884841dd188f8832a132a4d85a54fa7ea3234ac5b5e7e98eab`, read off
the file there.

## What it does not say yet

- The rating is on Lichess's puzzle scale. Reading it on the player's own
  scale needs a mapping this model does not make.
- The model is shown the solution. How hard a tactic is to notice, with no
  line given, is a different question with the same data:
  [puzzle difficulty, unsolved](../puzzle-difficulty-unsolved/) asks it.
- A puzzle's rating also depends on who is served it, which this ignores.

Others have asked the same question: the FedCSIS 2025 data-mining challenge
"Predicting Chess Puzzle Difficulty" scored models on this label, and its
strongest entries started from a human-move model rather than from the raw
board. A Maia-2 body under this head is the next body to try.
