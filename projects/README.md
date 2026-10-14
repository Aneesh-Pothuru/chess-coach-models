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
| [think-time-rapid](think-time-rapid/) | In 10-minute games at his level, where does a long think cut serious errors, and do the app's long-think triggers mark those moments? | Running: the rule is fixed, the results are to come |

`paper.mjs` holds the helpers the generators share (boards, moves in SAN, UCI
and FEN, number formats), and `preamble.tex` the LaTeX every paper loads.

## Where the data lives

The games these projects study are the player's own, so no per-game file is
committed here. The projects read two sources at run time:

- the research records: the cases, per-game rows and judge rounds the app's
  repository keeps at the commit `bridge/chess.json` pins as `records`
  (`bridge/checkout.sh records`, or `records()` in `bridge/lib/lab.mjs`);
- the engine evidence the lab rebuilds on the pinned app
  (`accuracy-vs-chesscom/build-evidence.mjs`), kept under `private/`.

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

make papers   # each paper's generated.tex, then its PDF
```

The papers need a TeX Live with `latexmk` and the games and pictures
collections (on Debian: `apt-get install latexmk texlive-latex-extra
texlive-games texlive-pictures`; on macOS, MacTeX).

## Starting a project

A new project takes the same shape: a folder under `projects/`, scripts that
write per-game data only under `private/<project>/`, a `results/` that only
its scripts write, and a README with the question, the rule that decides it
(written before the first number), and how to run it. Once there is a result,
it gets a paper whose generator checks every claim the paper makes. A winner
is ported to the app as its own pull request (see [`CLAUDE.md`](../CLAUDE.md)).
