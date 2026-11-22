# Where runs go

The lab has three places to run things. Which one a run goes to is decided by whose data it reads,
what it costs, and how long it takes.

| Place | What it is | What runs there |
|---|---|---|
| Any machine, or a cloud session | A few CPU cores | Writing code, the tests, `--smoke` runs, and bridge scripts where the app's repository can be read |
| The owner's desktop | A 16-thread CPU, no GPU worth using | Dataset builds, the constant and tree runs, CPU-sized networks, the closer look at a model's results, and a model's checks on the player's own games |
| Google Colab, opened from the desktop's browser | A rented GPU, paid in compute units | Transformer runs, runs marked `needs: cuda`, the coach narrator's teacher and fine-tune |

## The rules behind the table

- **The player's data never goes to Colab or to GitHub Actions**, and only aggregates of it are
  committed here ([`CLAUDE.md`](../CLAUDE.md), "The data rule"). A model's check on the player's
  own games runs on the desktop, with its files under `private/` there. Open data (the Lichess
  database) can go anywhere.
- **A bridge script runs where the app's repository can be read:** on the desktop, or in a Claude
  session that has access to it. The study still under [`projects/`](../projects/) runs in its
  own session, with its per-attempt rows under `private/` there, until it reports.
- **GitHub Actions runs the privacy check and the light tests, nothing more.** No training, no
  data, none of the player's games.
- **A budget is agreed before a run that spends much.** GPU time is paid in Colab units, and a
  judge or an audit model is paid in usage. The run's size and cost are said first.
- **A run record names the processor it ran on, never the machine.**

## What goes where, and why

A tree run takes minutes on a CPU, so it never needs a GPU. A convolutional tower trains on a CPU
at a useful speed. A transformer does not: on the same CPU it trains several times slower than the
tower, so its runs go to a GPU, where a run that would take a night takes minutes. Every run
record carries its own speed (`rows_a_second` in each epoch) and time, so the leaderboard shows
what each result cost.

A model's runs can be split between machines. A record carries the fingerprint of the data it read
and its own gain over the reference run, so the leaderboard is written from the records alone
([`design.md`](design.md)). The one condition is that a machine trains `gbm-hand` before any run
it should be compared with. `lab all` does that by itself.

## On the desktop

```bash
make setup                       # once
lab all puzzle-difficulty        # its data, then every run this machine can train
lab all blunder-hazard
lab all think-time
lab all tactic-found
lab report                       # the README's table
```

`lab all` skips the runs marked `needs: cuda`. `--runs constant,gbm-context,gbm-hand,conv-small`
keeps a first pass to the runs a CPU finishes quickly.

The closer look runs here too, once a model's GPU runs are unzipped (below), because it needs the
dataset and every run's test predictions on one machine:

```bash
lab analyse tactic-found         # writes models/tactic-found/results/analysis.json; commit it
```

It reads a run's predictions only when they are the ones its record scored on this machine's build
of the data, and names the runs it left out and why. A model whose answer is a set has no closer
look yet ([`design.md`](design.md), "An answer that is a set"): its records and its leaderboard
are all it commits.

## On Colab

[`colab/lab.ipynb`](../colab/lab.ipynb) clones this repository, installs it, and runs the same
commands on the notebook's GPU. Its first cell names the models and the runs, or a plan kept in
[`colab/plans/`](../colab/plans/): `all` is every model's own runs, `studies` the study runs of
the models that have results, `pretrain` the body trained on engine evaluations and the runs that
start from it, `sets` the two models whose answer is a set, `games` the first pass of game
rating. Its last cell packs two zips and prints their hashes: `lab-results.zip`, the run records
and leaderboards under `models/*/results/`, and `lab-runs.zip`, every run's trained weights and
test predictions.

1. Open the notebook in Colab and choose a GPU runtime.
2. Run every cell.
3. Save both zips from the Files panel, before the runtime is released.
4. Unzip both at the root of a clone: the records replace `models/*/results/`, and the weights
   land under `artifacts/runs/`, which git ignores. Then `lab eval <model>` for each model,
   `lab report`, commit and push.

Nothing is pushed from Colab, and the notebook holds no credentials.

**A runtime's disk goes with the runtime.** The coach narrator's first adapter was lost that way:
it was trained, scored, and never copied off before the runtime was deleted. So a notebook's last
cell always packs what the run made, weights included, and the zips are saved before anything else
is done.

The coach narrator has its own script for the same reason,
[`models/coach-narrator/colab/retrain.sh`](../models/coach-narrator/colab/retrain.sh): its teacher
needs a GPU with 40 GB of memory, and its prompts are built on the desktop first because they come
from the app's code.

## Long runs

Start a long run in the background with its output in a log, and read the log's last line and the
process list before believing it finished. Neither a run nor a dataset build resumes: one that was
stopped is started again.
