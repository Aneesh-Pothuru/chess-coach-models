# The study still waiting on data

This repository is a model lab ([`README.md`](../README.md)). Before it was, it also held studies
of the coaching app's own code and of the player's games. Those have left; the repository's history
keeps them, and what the app took from each is in the app.

One study is still here because its answer needs data that does not exist yet:

| Study | Its question | Waiting on |
|---|---|---|
| [`learner-solve-chance`](learner-solve-chance/) | When the app's learner gives a chance that he solves a puzzle, how often does he solve it? | Round 3, which needs more days of his puzzle sets than exist yet |

It leaves when it reports. No new study starts here: a question about what people do on the board
is a model under [`models/`](../models/), and a question about the app's own code belongs in the
app's repository.

## What the folder holds

- `learner-solve-chance/`: the scripts, which run against the app's own code through the bridge
  (`bridge/run.sh`, see [`CLAUDE.md`](../CLAUDE.md)); `results/`, the aggregates they wrote; and
  `paper/`, a short paper whose every number is written by `paper/generate.mjs`.
- `paper.mjs`: the helpers its paper's generator uses (boards, moves, number formats).
- `preamble.tex`: the LaTeX its paper loads.

## Where its data lives

The puzzle answers it studies are the player's own, so no per-attempt file is committed. Its
scripts read the research records the app's repository keeps, at the commit `bridge/chess.json`
pins as `records` (`bridge/checkout.sh records`), and the app's learner at a commit named on the
command line. Anything written per attempt goes under `private/learner-solve-chance/`, which git
ignores. Its own [`README.md`](learner-solve-chance/README.md) gives the commands.

`make study-paper` writes its paper's numbers and compiles the PDF.
