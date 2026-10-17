# Research projects

Each folder here is one question the lab has put to the coaching app, with
everything that answers it:

- the scripts, which run against the app's own code through the bridge
  (`bridge/run.sh`, see [`CLAUDE.md`](../CLAUDE.md));
- `results/`, the aggregates those scripts wrote;
- `paper/`, a short paper. `paper/generate.*` writes every number, table and
  position the paper prints into `paper/generated.tex`, and refuses to write
  when a claim the paper makes no longer holds; `paper/paper.tex` says what
  they mean; `paper/paper.pdf` is the compiled paper.

The [lab's README](../README.md#research-projects) lists every project with
its question and what the app took from it.

`paper.mjs` holds the helpers the generators share (boards, moves in SAN, UCI
and FEN, number formats), and `preamble.tex` the LaTeX every paper loads.

## Where the data lives

The games these projects study are the player's own, so no per-game file is
committed here. The projects read three sources at run time:

- the research records: the cases, per-game rows and judge rounds the app's
  repository keeps at the commit `bridge/chess.json` pins as `records`
  (`bridge/checkout.sh records`, or `records()` in `bridge/lib/lab.mjs`);
- the engine evidence the lab rebuilds on the pinned app
  (`accuracy-vs-chesscom/build-evidence.mjs`), kept under `private/`;
- the app's game archive at the pinned commit, read through its archive
  service (`maia-rating-offset/positions.mts`), or at a change's own commit
  when a study measures a change before it lands (`praise-gate`).

Public games and puzzles come from the Lichess database, such as the Maia-2
benchmark's sample (`scripts/stream_benchmark.sh`, which `maia-calibration`
scores again).

Everything a project writes per game goes under `private/<project>/`, which
git ignores. What is committed is code, aggregates and papers. A paper may
show a few positions from the player's games, as boards with their moves,
FEN and UCI, but never a link to a game, a game id or the account name.

## Reproducing everything

From the lab's root, in order; each step reads what the steps above it wrote.

```bash
make chess    # the pinned app with its npm dependencies, and the records

# The games and their engine evidence. The evidence is the slow step: every
# game reviewed at the phone's and the routine's budgets, and the desktop's for
# phone-vs-routine. The builds resume where they stopped.
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile desktop
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine

# Each project's numbers, recomputed from the records and rerun on that evidence.
bridge/run.sh projects/accuracy-vs-chesscom/reproduce.mjs
bridge/run.sh projects/explain-top-move/reproduce.mjs
bridge/run.sh projects/judge-in-context/reproduce.mjs
bridge/run.sh projects/maia-punish/reproduce.mjs
bridge/run.sh projects/phone-vs-routine/compare.mjs
make parity

# The routines' studies: the weekly focus, the motif labels, the decks.
bridge/run.sh projects/focus-backtest/replay.mts
bridge/run.sh projects/focus-backtest/simulate.mts --runs 4000 --seed 1
zstdcat data/raw/lichess_db_puzzle.csv.zst | CHESS_DIR=$(bridge/checkout.sh) python3 projects/detector-themes/sample.py
bridge/run.sh projects/detector-themes/score.mts app
bridge/run.sh projects/detector-themes/score.mts heldout
bridge/run.sh projects/drill-decks/census.mts
RETHEME=1 CANDIDATE=retheme-base bridge/run.sh projects/drill-decks/census.mts
bridge/run.sh projects/drill-decks/threats.mts --pool 4

# Their candidates, each a copy of the pinned app with its files replaced.
export CHESS_DIR=$(bridge/candidate.sh permove src/services/method/focus.ts=projects/focus-backtest/candidates/permove/focus.ts)
CANDIDATE=permove bridge/run.sh projects/focus-backtest/replay.mts
CANDIDATE=permove bridge/run.sh projects/focus-backtest/simulate.mts --runs 4000 --seed 1
CANDIDATE=permove bridge/run.sh projects/focus-backtest/simulate.mts --runs 4000 --seed 2
export CHESS_DIR=$(bridge/candidate.sh describe-first src/services/knowledge/detectors/theme.ts=projects/detector-themes/candidates/describe-first/theme.ts)
CANDIDATE=describe-first bridge/run.sh projects/detector-themes/score.mts app
CANDIDATE=describe-first bridge/run.sh projects/detector-themes/score.mts heldout
RETHEME=1 CANDIDATE=describe-first bridge/run.sh projects/drill-decks/census.mts
unset CHESS_DIR
bridge/run.sh projects/detector-themes/compare.mjs describe-first

# A change measured before it lands: the live coach's held praise, read on a
# checkout of the change's commit (results/praise.json names it as app).
CHESS_DIR=<checkout of the change> bridge/run.sh projects/praise-gate/praise.mts --pool 4

# Maia-2's rating scale for the player, then its calibration by band. Maia runs
# on every counted move at every offset, so the policies step is the slow one;
# both policies steps resume where they stopped.
bridge/run.sh projects/maia-rating-offset/positions.mts
for k in 0 1 2 3; do bridge/run.sh projects/maia-rating-offset/policies.mts --shard $k/4 & done; wait
bridge/run.sh projects/maia-rating-offset/fit.mjs
PYTHON=.venv/bin/python scripts/stream_benchmark.sh
.venv/bin/python projects/maia-calibration/sample.py
for k in 0 1 2 3; do bridge/run.sh projects/maia-calibration/lichess-policies.mts --shard $k/4 & done; wait
bridge/run.sh projects/maia-calibration/punish-policies.mts
bridge/run.sh projects/maia-calibration/fit.mjs

# Lichess 10-minute games: think time, then the band above (which reads the same games).
python3 projects/think-time-rapid/stream.py --month 2026-09
for i in 0 1 2 3; do
  bridge/run.sh projects/think-time-rapid/facts.mjs --month 2026-09 --shard $i/4 --check 200 &
done; wait
bridge/run.sh projects/think-time-rapid/archive.mjs
python3 projects/think-time-rapid/analyze.py --month 2026-09
for i in 0 1 2 3; do
  bridge/run.sh projects/band-above/primary.mjs --month 2026-09 --shard $i/4 --check 200 &
done; wait
bridge/run.sh projects/band-above/ledger.mjs --month 2026-09
bridge/run.sh projects/band-above/ledger.mjs --month 2026-09 --archive
python3 projects/band-above/analyze.py --month 2026-09

# The books' advice at the player's level: nine tests on the same games. The
# engine passes resume where they stopped; 1g reads the books' positions from
# private/book-advice/, copied there at run time. 6a and 6b need no engine.
bridge/run.sh projects/book-advice/budgets.mjs
bridge/run.sh projects/book-advice/conversion.mjs
bridge/run.sh projects/book-advice/after-error.mjs facts
bridge/run.sh projects/book-advice/scan.mjs
for t in king trades practical retreats; do bridge/run.sh projects/book-advice/$t.mjs --pool 4; done
bridge/run.sh projects/book-advice/after-error.mjs engine --pool 4
bridge/run.sh projects/book-advice/king-notes.mjs
bridge/run.sh projects/book-advice/capstones.mjs
bridge/run.sh projects/book-advice/after-gain.mjs
bridge/run.sh projects/book-advice/lost-trades.mjs
# 6b's recheck, on August's games streamed and built the same way.
python3 projects/think-time-rapid/stream.py --month 2026-08
for i in 0 1 2 3; do
  bridge/run.sh projects/band-above/primary.mjs --month 2026-08 --shard $i/4 --check 200 &
done; wait
BOOK_ADVICE_MONTH=2026-08 bridge/run.sh projects/book-advice/lost-trades.mjs --no-archive

# The learner's solve chances: his puzzle attempts replayed through the app's
# learner, on a record rebuilt from the memory cards and on the profile as the
# app holds it.
bridge/run.sh projects/learner-solve-chance/replay.mjs
bridge/run.sh projects/learner-solve-chance/fit.mjs

# The weekly and monthly writer: past periods rewritten by two prompts on the
# owner's subscription, under the eval's cap and outside the routines' hours,
# then graded and exported. The cases, reviews and audits stay in EVAL_ROOT.
export EVAL_ROOT=/tmp/period-writer
for id in 2026-W35 2026-W36 2026-W37 2026-W38 2026-W39 2026-W40 2026-W41 2026-08 2026-09; do
  projects/period-writer/bin/make-case.sh $id $EVAL_ROOT/cases/$id <app commit>
done
projects/period-writer/bin/batch.py runs --configs baseline,threat-order --variant threat-order=projects/period-writer/variants/threat-order.json --reps 2
projects/period-writer/bin/batch.py audit --configs baseline,threat-order
projects/period-writer/bin/batch.py judge --config threat-order --vs baseline
projects/period-writer/bin/batch.py judge --config baseline --vs baseline
projects/period-writer/bin/batch.py controls --config threat-order --vs baseline
projects/period-writer/bin/batch.py report --config threat-order --vs baseline
projects/period-writer/bin/kinds.py --configs baseline,threat-order
projects/period-writer/bin/export.py --config threat-order --vs baseline

make papers   # each paper's generated.tex, then its PDF
```

The papers need a TeX Live with `latexmk` and the games, pictures and
plain-generic collections (the boards' `skak` needs `lambda.sty` from the
last; on Debian: `apt-get install latexmk texlive-latex-extra texlive-games
texlive-pictures texlive-plain-generic`; on macOS, MacTeX).

## Starting a project

A new project takes the same shape: a folder under `projects/`, scripts that
write per-game data only under `private/<project>/`, a `results/` that only
its scripts write, a README with the question, the rule that decides it
(written before the first number), and how to run it, and a row in the
[lab's README](../README.md#research-projects). Once there is a result,
it gets a paper whose generator checks every claim the paper makes. A winner
is ported to the app as its own pull request (see [`CLAUDE.md`](../CLAUDE.md)).
