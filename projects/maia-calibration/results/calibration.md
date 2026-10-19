# Maia-2 calibration by band: results

Written by fit.mjs. App commit 3a377486e8ae214f86f1e948f69231248f79f8a0. Lichess sample: 25000 moves in 13785 games (fitting half 12474 moves, held-out half 12526). The player's games: 34025 moves in 648 games, at offset 250. Punish events: 521 in the primary set, 684 in all, over 60 games. Bootstrap: 1000 draws over games, seed 7.

**Verdict.** Not adopted: Lichess held-out passes, the player's games fail, the punish events pass.

Beside it: the app's Maia-2 has the move played as its first choice for 12875 of the 25000 Lichess moves (51.5%).

| Test | Raw | Tempered | Difference (95% interval) |
|---|---:|---:|---:|
| Lichess held-out, mean log-likelihood per move | -1.4944 | -1.4915 | 0.0029 (0.0014 to 0.0044) |
| The player's games, mean log-likelihood per move | -1.3929 | -1.3998 | -0.0068 (-0.0078 to -0.0058) |
| Punish events (primary set), Brier score | 0.1527 | 0.1542 | 0.0015 (-0.0005 to 0.0037) |
| Punish events (all), Brier score | 0.1550 | 0.1563 | 0.0013 (-0.0005 to 0.0032) |

| Band | Fitting moves | Temperature | Lichess held-out: top choice played | mean top probability, raw | tempered | The player's games: moves | top choice played | raw | tempered |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 2537 | 1.082 | 46.2% | 49.8% | 47.0% | 6652 | 52.9% | 51.7% | 48.9% |
| 1100 | 729 | 1.064 | 49.2% | 54.2% | 52.0% | 5906 | 54.1% | 54.3% | 52.2% |
| 1200 | 833 | 1.085 | 51.3% | 54.2% | 51.5% | 6893 | 53.1% | 54.1% | 51.3% |
| 1300 | 946 | 1.088 | 52.2% | 54.9% | 52.0% | 13691 | 54.8% | 55.3% | 52.5% |
| 1400 | 814 | 1.125 | 53.1% | 56.0% | 52.0% | 883 | 56.5% | 55.9% | 51.9% |
| 1500 | 823 | 1.058 | 49.2% | 54.4% | 52.5% | 0 |  |  |  |
| 1600 | 841 | 1.068 | 52.8% | 54.7% | 52.5% | 0 |  |  |  |
| 1700 | 1001 | 1.018 | 55.2% | 57.6% | 57.0% | 0 |  |  |  |
| 1800 | 833 | 1.034 | 53.4% | 56.9% | 55.8% | 0 |  |  |  |
| 1900 | 620 | 1.071 | 53.3% | 57.4% | 55.1% | 0 |  |  |  |
| 2000 | 2497 | 1.079 | 54.2% | 57.7% | 55.2% | 0 |  |  |  |
