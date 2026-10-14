# Chess Coach Models: guide for agents

This repository is the research lab for the chess coaching app
([Aneesh-Pothuru/chess](https://github.com/Aneesh-Pothuru/chess), private). The
app is the product; this is where models, heuristics and the coach's prompts
are measured and improved, and a change that wins here is ported to the app.

## What lives here

- Models trained on public data (the Lichess database, CC0): the
  graded-opponent scorer, the Maia2 benchmark, the blunder hazard model, the
  repertoire optimizer and the concept tagger (README sections 1 to 5).
- Research projects under `projects/<project>/` that measure the app's own
  code through the bridge: each folder holds one question's scripts, the
  aggregates they write (`results/`) and a paper (`paper/`).
  [`projects/README.md`](projects/README.md) lists them and the order that
  reproduces them all.

## The data rule

This repository is public. The player's own data (games, notes, calibration
answers, profile) stays in the app's repository, or under `private/` here,
which git ignores: a project reads it at run time, writes anything per game
under `private/<project>/`, and commits aggregates. A paper may show a few
positions from the player's games, as boards with their moves, FEN and UCI,
but never a link to a game, a game id or the account name.
`scripts/check_private.py` runs in CI and fails on the shapes that data takes;
it also reads extra patterns from the `PRIVATE_PATTERNS` secret, so a pattern
that is itself private never appears in the repository.

## The bridge to the app

- `bridge/chess.json` pins the app commit (a full sha) that every eval
  measures, and the commit of the research records the app's repository keeps
  (`records`).
- `bridge/checkout.sh` fetches the app commit once into `.cache/chess/<sha>`,
  runs `npm ci` there, and prints the directory; `bridge/checkout.sh records`
  does the same for the records, without `npm ci`. `CHESS_DIR` (or
  `CHESS_RECORDS_DIR`), when set, wins.
- `bridge/candidate.sh <name> <app path>=<file> ...` prints a candidate: a copy
  of the pinned app with those files replaced, which an eval measures by
  running with `CHESS_DIR` pointed at it.
- `bridge/run.sh projects/<project>/<script>.mjs` runs a script under the
  app's own tsx, with packages such as chess.js resolved from the app's
  `node_modules`; `chess(path)` from `bridge/lib/chess.mjs` imports an app
  module by its path in the app repo, such as `src/core/score/index.ts`, and
  `bridge/lib/lab.mjs` says where a project reads and writes (`records()`,
  `privateDir()`, `resultsDir()`).
- From Python, `chess_coach_models.bridge.run_eval(script, payload)` sends JSON
  on stdin and reads JSON from stdout.
- The app's repository is private, so the bridge needs read access to it. CI
  here has none, so bridge evals run locally or in a Claude session, and their
  reports are committed with the commit they measured.

Never re-implement an app instrument (win%, a phase, a metric) in an eval to
compare against it: import the app's. A lab instrument that should match the
app's gets a parity eval, like `projects/winprob-parity/parity.py`.

## Running an eval or a hill-climb

- A report is written by its script, never typed, and names the app commit it
  measured and the data it ran on.
- A paper prints no number by hand. Its `paper/generate.*` writes every number,
  table and position into `paper/generated.tex` (`projects/paper.mjs` has the
  helpers) and refuses to write when a claim the paper makes no longer holds.
- Before a run, write down the metric, the train and held-out split, and what
  counts as better. Change one thing per round, and keep it only when train
  and held-out both improve beyond the noise (a paired bootstrap).
- A model judge compares blind and in both orders. Before trusting a streak of
  wins, check it with controls: the same text on both sides, and a decoy of
  the same length that says nothing new.

## Porting a winner to the app

- A port is its own pull request on the app repository, made by its rules (its
  `CLAUDE.md`, its services and contracts, `npm run verify`). It carries the
  evidence: this repository's report and the commit of the eval that produced
  it.
- After the port merges, move `bridge/chess.json` to the merge commit and
  rerun the eval, so the lab's baseline is the app as it now runs.
- Merging to the app's `main` deploys to production, so it happens only on
  the owner's word.

## Commands

| Command | What it runs |
|---|---|
| `make setup` | The full environment (Torch, LightGBM, Maia2) in `.venv` |
| `make test` | Every test; CI runs only those that need no models or data |
| `make chess` | Fetches the pinned app and the research records (`bridge/checkout.sh`) |
| `make parity` | The win% parity eval against the app (`projects/winprob-parity/results/`) |
| `make papers` | Every project's `paper/generated.tex`, then its PDF (needs `latexmk`; see `projects/README.md`) |
| `python scripts/check_private.py` | The data rule's check |
