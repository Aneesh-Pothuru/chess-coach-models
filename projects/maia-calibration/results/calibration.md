# Maia-2 calibration by band: results

Written by fit.mjs. App commit 3eb8afd0c17fbd344a126af1f87eee873ce52793. Lichess sample: 25000 moves in 13785 games (fitting half 12474 moves, held-out half 12526). The player's games: 34025 moves in 648 games, at the app's offsets (the player 250, his opponents 400). Punish events: 579 in the primary set, 679 in all, over 60 games. Bootstrap: 1000 draws over games, seed 7.

**Verdict.** Not adopted: Lichess held-out passes, the player's games fail, the punish events fail.

Beside it: the app's Maia-2 has the move played as its first choice for 12875 of the 25000 Lichess moves (51.5%).

| Test | Raw | Tempered | Difference (95% interval) |
|---|---:|---:|---:|
| Lichess held-out, mean log-likelihood per move | -1.4944 | -1.4915 | 0.0029 (0.0014 to 0.0044) |
| The player's games, mean log-likelihood per move | -1.3910 | -1.3964 | -0.0054 (-0.0064 to -0.0043) |
| Punish events (primary set), Brier score | 0.1641 | 0.1665 | 0.0024 (0.0002 to 0.0048) |
| Punish events (all), Brier score | 0.1526 | 0.1536 | 0.0010 (-0.0010 to 0.0031) |

| Band | Fitting moves | Temperature | Lichess held-out: top choice played | mean top probability, raw | tempered | The player's games: moves | top choice played | raw | tempered |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 2537 | 1.082 | 46.2% | 49.8% | 47.0% | 4070 | 52.7% | 52.3% | 49.5% |
| 1100 | 729 | 1.064 | 49.2% | 54.2% | 52.0% | 4904 | 55.0% | 54.3% | 52.2% |
| 1200 | 833 | 1.085 | 51.3% | 54.2% | 51.5% | 5782 | 53.6% | 54.5% | 51.7% |
| 1300 | 946 | 1.088 | 52.2% | 54.9% | 52.0% | 9610 | 54.9% | 54.9% | 52.0% |
| 1400 | 814 | 1.125 | 53.1% | 56.0% | 52.0% | 5545 | 53.0% | 55.5% | 51.5% |
| 1500 | 823 | 1.058 | 49.2% | 54.4% | 52.5% | 4091 | 54.6% | 56.5% | 54.6% |
| 1600 | 841 | 1.068 | 52.8% | 54.7% | 52.5% | 23 | 47.8% | 49.9% | 47.6% |
| 1700 | 1001 | 1.018 | 55.2% | 57.6% | 57.0% | 0 |  |  |  |
| 1800 | 833 | 1.034 | 53.4% | 56.9% | 55.8% | 0 |  |  |  |
| 1900 | 620 | 1.071 | 53.3% | 57.4% | 55.1% | 0 |  |  |  |
| 2000 | 2497 | 1.079 | 54.2% | 57.7% | 55.2% | 0 |  |  |  |
