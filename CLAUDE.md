# Chess Coach Models: guide for agents

This repository is the model lab for the chess coaching app
([Aneesh-Pothuru/chess](https://github.com/Aneesh-Pothuru/chess), private). The
app is the product; this is where its models are trained and measured, and a
model that wins here is ported to the app.

A model belongs here when it predicts something about people that an engine and
board code cannot compute (what a player at a level plays, where they go wrong,
how hard a tactic is, how long they think), or says checked facts in plain
words. A language model never judges chess on its own: its facts come from an
engine, a human-move model, board code or data.

## What lives here

- `models/<model>/`: one model each. `README.md` is its card (the question, the
  data, the rule, what the results say), `configs/<run>.yaml` its runs, and
  `results/` what the runs wrote. [`README.md`](README.md) lists the models.
- `src/chess_coach_models/`: the shared harness (`data/`, `encode/`, `nets/`,
  `train/`, `evals/`, `tasks/`, the `lab` command in `cli.py`), beside the first
  pipeline's modules. [`docs/design.md`](docs/design.md) explains it.
- `datasets/<name>.yaml`: recipes for datasets built from open sources.
- `docs/`: the design, the idea list ([`docs/ideas.md`](docs/ideas.md)) and
  where runs go ([`docs/compute.md`](docs/compute.md)).
- `bridge/`: the way to the app's own code, for scripts that need it.
- `scripts/`, `configs/config.yaml`, `reports/`: the first pipeline (the 2019
  models), kept as it ran.
- `projects/learner-solve-chance/`: the one study of the app's code still
  waiting on data. It leaves when it reports; start no new study there.

## Adding a model

1. Write its card first: the question, what it reads, what it predicts, the
   open data, the metric, the split, and what counts as better. Take the idea
   from `docs/ideas.md`, or add it there.
2. Add a `Task` in `src/chess_coach_models/tasks/__init__.py`: its dataset, its
   label, the context numbers a learner may read, its primary metric, its
   reference run.
3. If no dataset has its rows, add a builder under `data/` and a recipe under
   `datasets/`. A dataset splits by game and writes a manifest.
4. Copy the run configs from another model: the floor (`constant`), the tree
   baselines (`gbm-context`, `gbm-hand`) and the networks.
5. `lab all <model> --smoke` until it runs, then the full run where
   `docs/compute.md` says, then commit the results the run wrote.

A new kind of input or output (a whole game as a sequence, a label per square,
a move) is a new body or head in `nets/`, with a test, and a line in
`docs/design.md`.

## Running a model

- A report is written by its script, never typed. A run writes
  `results/<run>.json`; `lab eval <model>` writes the leaderboard from the
  records; `lab report` writes the README's table from the leaderboards. A
  card's prose may say what the numbers mean, with the numbers left in the
  generated files it links.
- Before a run, the card names the metric, the split and what counts as
  better. Change one thing a run, and keep it only when it beats the run it
  changed on valid and on test beyond the noise (the paired gain's interval
  leaves zero out).
- Every model keeps its `constant` and `gbm-hand` runs, and every other run is
  compared with `gbm-hand` on the same test rows. The comparison is made when
  a run is trained and written into its record, so `gbm-hand` is trained
  first on any machine that trains a run (`lab all` does this), and a
  leaderboard is written from the records alone.
- Test rows are for the final score. Choosing an epoch, a size or a learning
  rate reads valid.
- `--smoke` runs are checks that the code works. They write under
  `artifacts/smoke/` and are never reported.
- A model judge compares blind and in both orders. Before trusting a streak of
  wins, check it with controls: the same text on both sides, and a decoy of the
  same length that says nothing new.
- Agree a budget with the owner before a run that spends much (paid GPU time,
  a judge model over many texts).

## The data rule

This repository is public. Models are trained and tested on open data (the
Lichess database, CC0). The player's own data (games, notes, calibration
answers, a profile, puzzles from a paid course) stays in the app's repository,
or under `private/` here, which git ignores: a script reads it at run time,
writes anything per game under `private/<name>/`, and commits aggregates. A
card or a paper may show a few positions from the player's games, as boards
with their moves, FEN and UCI, but never a link to a game, a game id or the
account name. A run record names the processor it ran on, never the machine.
`scripts/check_private.py` runs in CI and fails on the shapes that data takes;
it also reads extra patterns from the `PRIVATE_PATTERNS` secret, so a pattern
that is itself private never appears in the repository.

Weights and datasets are not committed (`artifacts/` and `data/` are ignored).
A model's card says where its weights are and gives their hash.

## The bridge to the app

- `bridge/chess.json` pins the app commit (a full sha) that a bridge script
  measures, and the commit of the research records the app's repository keeps
  (`records`).
- `bridge/checkout.sh` fetches the app commit once into `.cache/chess/<sha>`,
  runs `npm ci` there, and prints the directory; `bridge/checkout.sh records`
  does the same for the records, without `npm ci`. `CHESS_DIR` (or
  `CHESS_RECORDS_DIR`), when set, wins. `bridge/checkout.sh at <full sha>`
  prints a checkout of the app at another commit.
- `bridge/candidate.sh <name> <app path>=<file> ...` prints a candidate: a copy
  of the pinned app with those files replaced.
- `bridge/run.sh <script>.mjs` runs a script under the app's own tsx, with
  packages such as chess.js resolved from the app's `node_modules`;
  `chess(path)` from `bridge/lib/chess.mjs` imports an app module by its path
  in the app repo, and `bridge/lib/lab.mjs` says where a folder of scripts
  reads and writes (`records()`, `privateDir()`, `resultsDir()`), finding the
  folder by its name under `models/` or `projects/`.
- From Python, `chess_coach_models.bridge.run_eval(script, payload)` sends JSON
  on stdin and reads JSON from stdout.
- The app's repository is private, so the bridge needs read access to it. CI
  here has none, so bridge scripts run locally or in a Claude session.

Never re-implement an app instrument (win%, a phase, a metric) to compare
against it: import the app's. A lab instrument that should match the app's
gets a parity check, like `bridge/winprob-parity/parity.py`, which holds the
win probability behind the blunder label to the app's.

## Landing a change here

- Commit and push straight to `main`; this repository takes no pull requests.
  Fetch and rebase on the latest `main` before each push, since other sessions
  push here too. CI runs the privacy check and the light tests on every push.

## Porting a winner to the app

- A port is its own pull request on the app repository, made by its rules (its
  `CLAUDE.md`, its services and contracts, `npm run verify`). Its description
  carries the evidence: this repository's leaderboard and the commit of the run
  that produced it. The app's code, docs and routines never cite this
  repository: the research shapes the app without being referenced there.
- Merging to the app's `main` deploys to production, so it happens only on
  the owner's word.

## Commands

| Command | What it runs |
|---|---|
| `make setup` | The environment in `.venv` (Torch, LightGBM, the `lab` command) |
| `make test` | Every test; CI runs only those that need no Torch or data |
| `make smoke` | Every starter model end to end on a small sample |
| `make starters` | The full datasets, every run this machine can train, the leaderboards, the README table |
| `lab data|train|eval|all|report` | One step of the harness (`lab --help`) |
| `make chess` | Fetches the pinned app and the research records (`bridge/checkout.sh`) |
| `make parity` | The win% parity check against the app (`bridge/winprob-parity/results/`) |
| `make reports` | The first pipeline's reports, from its committed metrics |
| `python scripts/check_private.py` | The data rule's check |
