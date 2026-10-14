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

| Project | The question | In the app |
|---|---|---|
| [accuracy-vs-chesscom](accuracy-vs-chesscom/) | How far is Game Review's accuracy from chess.com's for the same game, and what closes the gap? | Shipped: the review's accuracy instrument |
| [explain-top-move](explain-top-move/) | Does the review explain the engine's better move truthfully, and say why it is better? | Shipped: the kept rounds' explanation code |
| [maia-punish](maia-punish/) | Can Maia-2's odds of the reply that punishes an error be trusted on the player's games? | Shipped: every error is priced with these odds |
| [judge-in-context](judge-in-context/) | Should a move's verdict read win% on a curve fitted to the mover's rating? | Not adopted |
| [winprob-parity](winprob-parity/) | Does the lab compute the same win% as the app? | A check: nothing to port |
| [maia-rating-offset](maia-rating-offset/) | Which chess.com to Lichess offset makes Maia-2 most likely to play the moves in the player's games? | Confirmed: the app's 250 stays |
| [maia-calibration](maia-calibration/) | Does a temperature for each Maia band, fitted on Lichess, make its probabilities truer on the player's games? | Not adopted |
| [think-time-rapid](think-time-rapid/) | In 10-minute games at his level, where does a long think cut serious errors, and do the app's long-think triggers mark those moments? | Not yet ported: no trigger shows a long think pays, and as written they ask for most of the clock |
| [focus-backtest](focus-backtest/) | Does the weekly focus's grade tell a real improvement from none? | Port open: the candidate grade (a permutation test of points per move over 120 games), waiting on the owner's review |
| [detector-themes](detector-themes/) | Do the app's motif labels name the tactic a position holds, judged on public puzzles? | Not yet ported: the describe-first candidate gained on both pools and waits its turn |
| [drill-decks](drill-decks/) | Do the misses deck's theme words and the plan quiz ask what they say they ask? | Not yet ported: the threat search and the quiet positions' plan questions are the candidates |
| [praise-gate](praise-gate/) | Does the live coach, holding its instant praise for the engine's verdict, praise only the moves that earn it? | Measured on the change before it lands: narrowly short of its bar; the next round tests a stricter one |
| [band-above](band-above/) | Where do players 200 points above his level give away fewer points a game than players at his level, by the leak ledger's own causes, and how much of a point given away shows in the result? | Running: the rule is fixed, the results are to come |
| [phone-vs-routine](phone-vs-routine/) | Does Game Review on his phone name the same mistakes and blunders as the routine's review of the same game? | Running: the rule is fixed, the results are to come |
| [learner-solve-chance](learner-solve-chance/) | When the learner gives a solve chance for a puzzle, how often does he solve it, and should a set aim from the view of its own channel instead of the headline rating? | Running: the rule is fixed, the results are to come |

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
# game reviewed at two engine budgets. Both builds resume where they stopped.
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine

# Each project's numbers, recomputed from the records and rerun on that evidence.
bridge/run.sh projects/accuracy-vs-chesscom/reproduce.mjs
bridge/run.sh projects/explain-top-move/reproduce.mjs
bridge/run.sh projects/judge-in-context/reproduce.mjs
bridge/run.sh projects/maia-punish/reproduce.mjs
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

make papers   # each paper's generated.tex, then its PDF
```

The papers need a TeX Live with `latexmk` and the games, pictures and
plain-generic collections (the boards' `skak` needs `lambda.sty` from the
last; on Debian: `apt-get install latexmk texlive-latex-extra texlive-games
texlive-pictures texlive-plain-generic`; on macOS, MacTeX).

## Starting a project

A new project takes the same shape: a folder under `projects/`, scripts that
write per-game data only under `private/<project>/`, a `results/` that only
its scripts write, and a README with the question, the rule that decides it
(written before the first number), and how to run it. Once there is a result,
it gets a paper whose generator checks every claim the paper makes. A winner
is ported to the app as its own pull request (see [`CLAUDE.md`](../CLAUDE.md)).
