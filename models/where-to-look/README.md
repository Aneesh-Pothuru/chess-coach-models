# Where to look

**The question.** Which squares does the tactic in this position run through?
A puzzle's solution is a line of moves, and the squares those moves leave and
land on are where a player has to look to find it. This model reads the
position the solver sees, with nothing of the solution, and gives every square
a chance of being one of them. In the app it would answer "where should I have
looked?" for a tactic the player missed: a hint that is a place on the board
and not yet a move.

| | |
|---|---|
| **Reads** | The position the solver sees, the opponent's move that led to it, and castling rights. Nothing of the solution: not its squares, not its length, not what its moves do. |
| **Predicts** | For each of the 64 squares, the chance that a move of the solution leaves it or lands on it. The solver's moves and the forced replies count alike. |
| **Data** | The rows [puzzle difficulty](../puzzle-difficulty/) reads: the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), puzzles whose rating has settled, a fixed quarter of them. Recipe: [`datasets/puzzles.yaml`](../../datasets/puzzles.yaml). |
| **Split** | By the game a puzzle was cut from: 85% train, 5% valid, 10% test, the same puzzles in each as for puzzle difficulty. |

This is the lab's first model whose answer is a set and not one number: a
position has several right squares, and a run gives all 64 a chance
([`docs/design.md`](../../docs/design.md), "An answer that is a set").

## The rule

Written before the first full run.

- **Metric.** Average precision, a position at a time: rank the 64 squares by
  their chance, and take the mean, over the right squares, of the share of
  right ones among the squares ranked at least as high. It is 1 when every
  right square comes before every other, and a model's score is its mean over
  the test positions. Two more are reported beside it: how often the square
  given the highest chance is a right one (first right), and the log loss of
  the 64 chances, each read as a yes or no of its own.
- **What is hidden.** Its [task](task.yaml) names what a learner may read. Of
  the marks on squares, only the en passant square and the opponent's last
  move: the marks of the solution are the answer. Of the hand features, only
  the ones counted from the position.
- **Floor and baselines.** `constant` gives every position the same 64
  chances: each square's share of the training positions. The trees read one
  row a square. `gbm-context` reads what needs no chess: where the square is,
  the piece on it, whether the opponent's last move left or reached it,
  whether a pawn may be taken in passing there, and the castling rights.
  `gbm-hand`, the reference, also reads the position's hand features and what
  a person would count on the square: who attacks it and with what, whether
  the piece on it can be taken or is pinned, how many of the mover's moves
  start and end there, how many of those take or give check, and how far each
  king is. A position is 64 rows to the trees, so they train on a tenth of
  the training games.
- **What counts as better.** A run beats the reference when its paired gain in
  average precision on the same resampled test games has a 95% interval above
  zero.
- **Bands.** Results are also given by the puzzle's rating band: a harder
  puzzle's squares should be harder to point at.

## Runs

| Run | Learner |
|---|---|
| `constant` | Each square's share of the training positions, for every position |
| `gbm-context` | LightGBM on a row a square, with no chess in it |
| `gbm-hand` | LightGBM on a row a square, with what a person would count there (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized, with a logit a square |
| `transformer-small` | A square-token transformer, CPU-sized, with a logit a square |
| `transformer-medium` | A larger square-token transformer, for a GPU |

A network here reads the board alone. Its head gives each square's own vector
a logit, where the other models' heads read one vector for the whole board.

## Results

No full run has been recorded yet. `results/leaderboard.md` is written by
`lab eval where-to-look` once the runs are in.

## What it does not say yet

- A puzzle position is not any position: every one of them holds a tactic, and
  the opponent has just gone wrong. This model says where a tactic that is
  there runs. It says nothing about whether there is one.
- Every square of the line counts alike, the first move's and a late reply's.
  The first move's two squares alone are the same task with a shorter label.
- A square says where to look, not what to see there. The line itself is
  [puzzle difficulty](../puzzle-difficulty/)'s input and an engine's output.
- The closer look and the paper read one number a row
  ([`docs/design.md`](../../docs/design.md), "The closer look"), so this
  model has a leaderboard and no closer look yet.
