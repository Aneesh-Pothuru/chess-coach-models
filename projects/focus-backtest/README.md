# Does the weekly focus's grade tell a real improvement from none?

**The question.** Every Sunday the weekly review picks the ONE focus: the leak
cause where the player gives away the most against his opponents
(`rankFocus` in the app's method service), freezes a baseline and a target
(`preregister`), and grades it over the next 40 games (`gradeFocus`): *met*
when a CUSUM alarm fires downward or the posterior probability that his loss
fell is at least 0.9, else *not met*. A met focus is the evidence the plan
worked. When nothing about his play changes, how often does the grade say
met, and when it does change, how big a change can it see?

**The answer.** No. With nothing changed, the grade says met on several
times as many focuses as its own level allows, more as the window grows, and
nearly as often on a cause drawn at random, so most of it is the test itself
(a CUSUM on skewed per-game losses), not the choice. A permutation test of
the window against older games, which played no part in choosing the cause,
holds its level, and points per move of the cause sees a real cut sooner
than points per game. The paper, [`paper/paper.pdf`](paper/paper.pdf), has
the numbers.

## The two studies

- **Replay** (`replay.mts`): every Sunday of the archive with at least 100
  games, the weekly's own choice and commit (`method.focus.choose`, then
  `commit`) on a metrics instance that holds only the games played by then.
  Each candidate is also pre-registered as if chosen and read against the
  40 games that followed. This shows what the app did with his games.
- **Simulation** (`simulate.mts`): each run draws, with replacement from his
  archived games, an older 100-game history, the 100 games the picker reads,
  and a window of up to 120 games after it. The truth is known: nothing
  changes between them. The app's own `rankFocus`, `preregister` and
  `gradeFocus` run on the draws exactly as the weekly would. The same draws
  are then graded with a known share `r` of his loss on the chosen cause
  removed (each of his moves on the cause loses nothing with probability `r`,
  from a fixed uniform per move, so the cuts are compared on the same draws).

## The rules

The null and the measure were set before the first run: the share of
simulated focuses graded met when nothing changed, at the app's 40 games and
at 80 and 120, and the share met at cuts of 10%, 25% and 50%. A first run of
4,000 draws measured the app's grade alone. The candidate grades below were
added after reading it and fixed before the second run, whose numbers the
paper reports:

- **control**: the app's grade on a cause drawn at random from the ranked
  causes instead of the top one (no selection);
- **posterior**: the app's grade without its CUSUM early pass;
- **fresh**: a one-sided permutation test (400 permutations, level 0.1, the
  app's own 0.9) of the window's per-game loss on the cause against the
  older 100 games, which played no part in choosing it;
- **per move**: the same test on points per move of the cause (the ratio of
  sums) instead of points per game.

How to read them (written with the results, not before): a grade earns its
word when its met rate with nothing changed is at or under its level; between
two such grades, the one that says met more often at the same cut is the
stronger.

## Files

| File | What it does |
|---|---|
| `lib.mts` | The archive's facts through the app's own loader, the app's metrics and method services, and a seeded generator. |
| `replay.mts` | The weekly replay. Writes `results/replay.json` (weekly aggregates). |
| `simulate.mts` | The simulation. Writes `results/simulate.json` (rates and quantiles); per-run rows go to `private/focus-backtest/`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/focus-backtest/replay.mts
bridge/run.sh projects/focus-backtest/simulate.mts --runs 4000 --seed 1
bridge/run.sh projects/focus-backtest/paper/generate.mjs
```

The simulation takes about five minutes on four cores. Both scripts read the
player's archive from the pinned app checkout and never run in CI.
