# Chess Coach Models

The model lab for a personal chess coaching app. The app, in a private repository
([Aneesh-Pothuru/chess](https://github.com/Aneesh-Pothuru/chess)), reviews one player's rapid
games and coaches at that player's level. This repository trains and measures the models behind
that coaching: models that read a position (a FEN) or a game (a PGN) and predict what an engine
cannot compute, which is what people do there.

An engine says which move is best. A coach also has to know how hard that move is to find, where
players at a level go wrong, how long they think, and how to say a line in plain words. Each model
here answers one such question, is trained on open data, and is scored on games it never saw,
beside a plain baseline, so a network has to earn its place.

## The models

Each model is one folder under [`models/`](models/): its card, what it is asked, its runs, and the
results its runs wrote.

| Model | Reads | Predicts |
|---|---|---|
| [puzzle-difficulty](models/puzzle-difficulty/) | A position and its solution line | The puzzle's Lichess rating |
| [puzzle-difficulty-unsolved](models/puzzle-difficulty-unsolved/) | The same position with the solution hidden | The puzzle's Lichess rating |
| [blunder-hazard](models/blunder-hazard/) | A position, both ratings, both clocks, the evaluation | The chance the mover blunders |
| [think-time](models/think-time/) | A position, both ratings, both clocks | The seconds a player spends on the move |
| [tactic-found](models/tactic-found/) | A position after the opponent's mistake, the tactic's line, both ratings, both clocks | The chance the player finds the tactic in the game |
| [practical-chances](models/practical-chances/) | A position, both ratings, both clocks, the evaluation | The mover's expected score in the game |
| [position-evaluation](models/position-evaluation/) | A position | An engine's evaluation of it: the body the others can start from |
| [coach-narrator](models/coach-narrator/) | Checked facts about a line of play | Two plain sentences that tell the line |

The first seven share one harness. The coach narrator is a fine-tuned language model (Llama 3.2
3B) with its own scripts; a retrain on open data is published as
[a release](https://github.com/Aneesh-Pothuru/chess-coach-models/releases/tag/Llama-3.2-3B-coach-narrator-n6)
(see its card).

Ideas that have no model yet, with what each would read, predict and be scored by, are in
[`docs/ideas.md`](docs/ideas.md).

### Leaderboards

The best run of each model on the harness, beside the tree baseline it is compared with.
`lab report` writes this table from the leaderboards; each model's own
`results/leaderboard.md` has every run.

<!-- LEADERBOARDS_START -->
| Model | Predicts | Best run | Score | Reference | Its score | Gain | Test rows |
|---|---|---|---|---|---|---|---|
| [`blunder-hazard`](models/blunder-hazard/) | chance the mover loses more than 20 points of win probability | `transformer-medium-hand` | PR-AUC 0.2666 (0.2526 to 0.2822) | `gbm-hand` | 0.2533 | +0.01331 | 68,579 |
| [`practical-chances`](models/practical-chances/) | expected score of the mover in the game (a win 1, a draw 0.5, a loss 0) | `conv-small` | RMSE 0.4235 (0.4183 to 0.4291) | `gbm-hand` | 0.4237 | +0.0001616 (within noise) | 68,579 |
| [`puzzle-difficulty`](models/puzzle-difficulty/) | Lichess puzzle rating points | `transformer-medium-hand` | RMSE 270.2 (268.8 to 271.6) | `gbm-hand` | 294.9 | +24.68 | 112,450 |
| [`tactic-found`](models/tactic-found/) | chance the move played is the first move of the tactic | `transformer-medium-hand` | Log loss 0.5369 (0.5338 to 0.5402) | `gbm-hand` | 0.5414 | +0.004443 | 81,135 |
| [`think-time`](models/think-time/) | log(1 + seconds spent on the move) | `transformer-medium-hand` | MAE 0.6200 (0.6148 to 0.6246) | `gbm-hand` | 0.6306 | +0.01063 | 68,579 |
<!-- LEADERBOARDS_END -->

### Papers

Each model with full results has a paper: its data, what it reads, every run, a closer look at
where it is right and where it is wrong, example positions, and what the app can use today.
`lab paper <model>` draws a paper from the model's committed results, so no number in it is typed.

| Paper | Its question |
|---|---|
| [Puzzle difficulty](models/puzzle-difficulty/paper/paper.pdf) | How hard is this tactic for people? |
| [Blunder hazard](models/blunder-hazard/paper/paper.pdf) | Before a move is played, how likely is the player to blunder here? |
| [Think time](models/think-time/paper/paper.pdf) | How long do players at a level think in this position, on this clock? |
| [Tactic found](models/tactic-found/paper/paper.pdf) | The opponent has just gone wrong. Does the player to move find the tactic? |
| [Practical chances](models/practical-chances/paper/paper.pdf) | Between two people at these ratings, with these clocks, who wins from here? |

## One folder a model, one harness for all

A model that reads a position does the same five things: get labelled positions from open data,
turn a board into numbers, fit a learner, score it on games it never saw, and compare it with a
baseline. Those are written once ([`docs/design.md`](docs/design.md) has the reasons), and a model
is what is left: a folder of small files, with no code of its own.

```
models/<model>/
  README.md              the card: the question, the data, the rule, what the results say
  task.yaml              what is asked: the dataset, the label, what a learner may read, the metric
  configs/<run>.yaml     one learner each: the floor, the tree baselines, the networks, and the
                         study runs that change one thing in one of them
  results/               written by the runs: <run>.json, the leaderboard, the closer look
  analysis.yaml          how the closer look cuts the results: by rating, clock, theme
datasets/<name>.yaml     a recipe: an open source, filters, a fixed sample, a split by game
src/chess_coach_models/  the harness
  paths.py               where everything above is kept
  tasks.py               a model's task, read from its folder
  data/                  Lichess sources (puzzles, a month of games, puzzles joined to their games,
                         engine evaluations), samples and splits by hash, the dataset format
  encode/                a board as 64 tokens from the mover's side, marks, hand features
  nets/                  bodies (a square-token transformer, a convolutional tower) and the head
  train/                 the learners, one file each, and the run that writes a record
  evals/                 metrics, intervals over resampled games, paired gains, leaderboards,
                         and the closer look
  cli.py                 the `lab` command
```

A new idea is a card, a task file and a few configs.

```bash
lab data puzzles                          # build a dataset from its recipe
lab train puzzle-difficulty gbm-hand      # one run: train, score, write its record
lab eval puzzle-difficulty                # the model's leaderboard, with paired gains over the baseline
lab all think-time                        # its data, every run this machine can train, its leaderboard
lab analyse tactic-found                  # the closer look, where the data and the predictions are
lab report                                # the table above
```

`--smoke` on any of them uses a small sample and writes under `artifacts/smoke/`: a check that the
code runs, never a result.

## What a result has to say

- **A report is written by its script.** No number here is typed. A run writes its record, the
  leaderboard is written from the records, and this README's table from the leaderboards.
- **The rule comes first.** A model's card names its metric, its split and what counts as better
  before the first run.
- **Whole games move together.** A split is a hash of the game, so no test game is seen in
  training, and every interval resamples whole games.
- **A gain is paired.** Two runs are compared on the same resampled test games, and a gain counts
  only when its 95% interval leaves zero out.
- **A baseline stands beside every network.** Gradient-boosted trees on a few dozen hand features
  are trained for every model, and so is the floor: one number for every row.

## Running it

Python 3.11 to 3.13.

```bash
make setup        # .venv with Torch, LightGBM and the rest
make test         # every test; CI runs the ones that need no Torch or data
make smoke        # every model on the harness end to end on a small sample
make models       # the full datasets, every run this machine can train, the leaderboards
make papers       # every model's paper, drawn from its committed results (needs LaTeX)
```

Runs marked `needs: cuda` wait for a GPU: [`colab/lab.ipynb`](colab/lab.ipynb) runs the same
commands on Google Colab. [`docs/compute.md`](docs/compute.md) says what runs where.

## The app, and the player's data

The app is the product and this is where its models are made. A model that wins here is ported to
the app as its own pull request there. Some scripts measure the app's own code through the bridge
([`bridge/`](bridge/)): the coach narrator's facts and checks run on it, and
[`bridge/winprob-parity`](bridge/winprob-parity/) holds the lab's win probability, which labels a
blunder, to the app's.

This repository is public and the app is one player's. Models are trained and tested on open data.
Anything of the player's (games, notes, a profile, puzzles from a paid course) stays in the app's
repository or under `private/`, which git ignores, and `scripts/check_private.py` fails CI on the
shapes that data takes.

One study of the app's own code is still here, [`projects/learner-solve-chance`](projects/),
because it is waiting on data. It leaves when it reports.

## Where the lab came from

The lab began as five experiments with their own scripts, most on Lichess games of April 2019: a
blunder model on sixteen board features, a benchmark of Maia-2, a tagger of tactical themes, a
mistake grader and an opening tree. Their code is no longer in the tree.
[`docs/history.md`](docs/history.md) says what each found and where to read it.

## Licences

- The [Lichess Open Database](https://database.lichess.org/) exports are CC0, and so is
  [`Lichess/chess-puzzles-with-games`](https://huggingface.co/datasets/Lichess/chess-puzzles-with-games).
- The coach narrator is built with Llama: its base model, Llama 3.2 3B, is under the
  [Llama 3.2 Community License](https://www.llama.com/llama3_2/license/), and so is the adapter
  this repository releases, which carries the licence's text and notice.
- This repository's code is MIT-licensed ([`LICENSE`](LICENSE)).
