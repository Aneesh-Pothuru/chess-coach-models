# Puzzle difficulty, unsolved

**The question.** How hard is this puzzle, judged from the position alone?
[Puzzle difficulty](../puzzle-difficulty/) reads a puzzle with its solution
marked on the board, as a coach who has the engine's line reads a tactic in a
game. This model is asked the same thing with the solution hidden: the same
puzzles, the same ratings, the same test puzzles. What it can still say is how
much of a tactic's difficulty shows in the position, before anyone knows the
line. The gap between the two is what knowing the line is worth.

| | |
|---|---|
| **Reads** | The position the solver sees, the opponent's move that led to it, and castling rights. Nothing of the solution: not its squares, not its length, not what its moves do. |
| **Predicts** | The puzzle's Lichess rating, in rating points. |
| **Data** | The rows [puzzle difficulty](../puzzle-difficulty/) reads: the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0), puzzles whose rating has settled, a fixed quarter of them. Recipe: [`datasets/puzzles.yaml`](../../datasets/puzzles.yaml). |
| **Split** | By the game a puzzle was cut from: 85% train, 5% valid, 10% test, the same puzzles in each as for puzzle difficulty. |

## The rule

Written before the first full run.

- **Metric.** Root mean squared error on the test puzzles, in rating points.
  MAE, R² and Spearman's rank correlation are reported beside it.
- **What is hidden.** Its [task](task.yaml) names what a learner may read. Of
  the marks on squares, only the en passant square and the opponent's last
  move. Of the hand features, only the ones counted from the position
  (material, what the mover can do, pieces that can be taken, passed pawns,
  attackers near each king, whether the opponent's last move took something).
  The length of the solution is not among the numbers beside the board.
- **Floor and baseline.** `constant` gives every puzzle the training mean.
  `gbm-hand`, the reference, reads the position's hand features and the
  castling rights. There is no `gbm-context` here: the context is the castling
  rights alone.
- **What counts as better.** A run beats the reference when its paired gain in
  RMSE on the same resampled test games has a 95% interval above zero.
- **Read beside puzzle difficulty.** Both models are scored on the same test
  puzzles, so a run here and the run of the same name there differ in one
  thing: whether the solution is shown.
- **Bands.** Results are also given by the puzzle's true rating band.

## Runs

| Run | Learner |
|---|---|
| `constant` | One number for every puzzle |
| `gbm-hand` | LightGBM on the position's hand features (the reference) |
| `conv-small` | A convolutional tower over the board, CPU-sized |
| `transformer-small` | A square-token transformer, CPU-sized |
| `transformer-medium` | A larger square-token transformer, for a GPU |
| `transformer-medium-hand` | The same, reading the position's hand features beside the board |
| `transformer-medium-pretrained` | `transformer-medium` started from the body of [position evaluation](../position-evaluation/) |
| `transformer-medium-hand-pretrained` | `transformer-medium-hand` started from the same body |

## Results

No full run has been recorded yet. `results/leaderboard.md` is written by
`lab eval puzzle-difficulty-unsolved` once the runs are in.

## What it does not say yet

- A puzzle position is not any position: every one of them holds a tactic, and
  the opponent has just gone wrong. This model says nothing about a position
  where there may be nothing to find.
- The rating is on Lichess's puzzle scale, as for puzzle difficulty.
- A puzzle's rating also depends on who is served it, which this ignores.
