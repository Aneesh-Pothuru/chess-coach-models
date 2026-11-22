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

Each model is a folder under [`models/`](models/) with a card (`README.md`), its run configs, and
the results its runs wrote.

| Model | Reads | Predicts | State |
|---|---|---|---|
| [coach-narrator](models/coach-narrator/) | Checked facts about a line of play | Two plain sentences that tell the line | A fine-tuned Llama 3.2 3B. Code, recipe and development results are here; its weights were not kept (see its card) |
| [puzzle-difficulty](models/puzzle-difficulty/) | A position and its solution line | The puzzle's Lichess rating | On the shared harness |
| [blunder-hazard](models/blunder-hazard/) | A position, both ratings, both clocks, the evaluation | The chance the mover blunders | On the shared harness; a first version from 2019 data is in [`reports/`](reports/) |
| [think-time](models/think-time/) | A position, both ratings, both clocks | The seconds a player spends on the move | On the shared harness |
| [human-moves](models/human-moves/) | A position and a rating | The move a player at that rating plays | Maia-2 as published, benchmarked here |
| [concept-tagger](models/concept-tagger/) | A position | Its tactical themes | First pipeline |
| [graded-opponent](models/graded-opponent/) | A game | Each mistake, and the chance its punishment is found at a rating | First pipeline |
| [opening-repertoire](models/opening-repertoire/) | Opening lines at a rating band | How each line scores for humans | First pipeline |

Ideas that have no model yet, with what each would read, predict and be scored by, are in
[`docs/ideas.md`](docs/ideas.md).

### Leaderboards

The best run of each model on the shared harness, beside the tree baseline it is compared with.
`lab report` writes this table from the leaderboards; each model's own
`results/leaderboard.md` has every run.

<!-- LEADERBOARDS_START -->
| Model | Predicts | Best run | Score | Reference | Its score | Gain | Test rows |
|---|---|---|---|---|---|---|---|
| [`blunder-hazard`](models/blunder-hazard/) | chance the mover loses more than 20 points of win probability | `gbm-hand` | PR-AUC 0.2533 (0.2396 to 0.2681) | `gbm-hand` | 0.2533 | the reference is the best run | 68,579 |
| [`puzzle-difficulty`](models/puzzle-difficulty/) | Lichess puzzle rating points | `gbm-hand` | RMSE 294.9 (293.5 to 296.2) | `gbm-hand` | 294.9 | the reference is the best run | 112,450 |
| [`think-time`](models/think-time/) | log(1 + seconds spent on the move) | `gbm-hand` | MAE 0.6306 (0.6255 to 0.6352) | `gbm-hand` | 0.6306 | the reference is the best run | 68,579 |
<!-- LEADERBOARDS_END -->

## One harness for every model

A model that reads a position does the same five things, so they are written once
([`docs/design.md`](docs/design.md) has the reasons):

```
datasets/<name>.yaml            a recipe: an open source, filters, a fixed sample, a split by game
src/chess_coach_models/
  data/                         Lichess streams (puzzles, a month of games), splits, the dataset format
  encode/                       a board as 64 tokens from the mover's side, marks, hand features
  nets/                         bodies (a square-token transformer, a convolutional tower) and the head
  train/                        the tree baseline, the network loop, the run record
  evals/                        metrics, intervals over resampled games, paired gains, leaderboards
  tasks/                        one small definition a model: its label, what it may read, its metric
models/<model>/
  README.md                     the card: the question, the data, the rule, what the results say
  configs/<run>.yaml            one learner each
  results/<run>.json            written by the run; results/leaderboard.md written by `lab eval`
```

A new idea is a task definition, a card and a few configs. Everything else is shared.

```bash
lab data puzzles                          # build a dataset from its recipe
lab train puzzle-difficulty gbm-hand      # one run: train, score, write its record
lab eval puzzle-difficulty                # the model's leaderboard, with paired gains over the baseline
lab all think-time                        # its data, every run this machine can train, its leaderboard
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
make smoke        # all three starter models end to end on a small sample
make starters     # the full datasets, every run this machine can train, the leaderboards
```

Runs marked `needs: cuda` wait for a GPU: [`colab/lab.ipynb`](colab/lab.ipynb) runs the same
commands on Google Colab. [`docs/compute.md`](docs/compute.md) says what runs where.

## The first pipeline

The lab's first models were built before the harness, on rated Lichess games of April 2019 (the
Maia-2 benchmark on June 2025, the concept tagger on the puzzle database), with their own scripts
([`scripts/`](scripts/), [`configs/config.yaml`](configs/config.yaml)) and reports
([`reports/`](reports/)). Their cards under `models/` say what each found.

<!-- RESULTS_START -->
| Model | Result |
|---|---|
| Graded-opponent scorer | Maia2 smoke on 2,500 held-out positions; sample PGN annotation complete |
| Maia2 independent benchmark | Top-1 51.5% (95% CI 50.9–52.1%) on 25,000 2025-06 rated rapid moves |
| Blunder hazard v0 | PR-AUC 0.197 vs absolute-eval baseline 0.055; Brier 0.049 |
| Repertoire optimizer | 7 strict-N rows below 1100; 12 at 1100–1400 |
| Concept tagger | Macro-AP 0.469 vs prevalence baseline 0.047 across 35 puzzle themes |
<!-- RESULTS_END -->

`make reports` writes that table and every page under `reports/` from the committed metrics
(`make data`, `make eval`, `make benchmark` and `make concepts` rebuild them; they need `zstd` and
Stockfish).

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

## Licences

- The [Lichess Open Database](https://database.lichess.org/) exports are CC0.
- [`maia2`](https://pypi.org/project/maia2/) is MIT-licensed; its weights download on first use.
- The coach narrator is built with Llama: its base model, Llama 3.2 3B, is under the
  [Llama 3.2 Community License](https://www.llama.com/llama3_2/license/).
- This repository's code is MIT-licensed ([`LICENSE`](LICENSE)).
