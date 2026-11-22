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
  intervals of their gains do not touch), so eight layers did not learn from
  the board everything the features count. Which features carry that is a run
  to make: one group left out at a time.
- **Good at ranking, loose on the rating.** The best run orders puzzles well
  (its rank correlation) and its typical miss is still more than a rating
  class. It can sort the tactics of a game into easier and harder ones, and it
  cannot yet give one a rating worth stating.
- **A band rewards hedging.** Bands are cut by the true rating, so the floor,
  which says the average for every puzzle, has the smallest error of all in
  the middle band and the largest at both ends. Read a band's column from the
  top down, not across the bands. The best network's lead over the trees is at
  the two ends, the easiest and the hardest puzzles, and in the middle band
  the trees are level with it.
- **No network had finished learning.** Three of the four had their best valid
  epoch at the last one, so a longer schedule is the cheapest run to add.

**Weights.** Every run's weights and test predictions are on the owner's
machine, under `artifacts/runs/puzzle-difficulty/<run>/`, as the GPU session
packed them; none is published. The best run's `model.pt` is 26,285,279
bytes, sha256 `346b597547beb8884841dd188f8832a132a4d85a54fa7ea3234ac5b5e7e98eab`,
read off the file there: these records were written before a record named its
weights, which every later one does.

## What it does not say yet

- The rating is on Lichess's puzzle scale. Reading it on the player's own
  scale needs a mapping this model does not make.
- The model is shown the solution. How hard a tactic is to notice, with no
  line given, is a different question with the same data (a position-only run).
- A puzzle's rating also depends on who is served it, which this ignores.

Others have asked the same question: the FedCSIS 2025 data-mining challenge
"Predicting Chess Puzzle Difficulty" scored models on this label, and its
strongest entries started from a human-move model rather than from the raw
board. A Maia-2 body under this head is the next body to try.
