# Independent Maia2 move-match benchmark

Maia2 (`rapid` weights, cpu) was evaluated on 25,000 moves sampled from Lichess 2025-06 rated rapid games. The released Maia2 weights were trained on Lichess rapid games from May 2018 through November 2023, excluding December 2019 (Tang et al., NeurIPS 2024; CSSLab/maia2 training configs), and were published in October 2024 without subsequent retraining. Lichess 2025-06 therefore cannot overlap the training data — unlike the committed 2019-04 smoke test, whose month sits inside the training window.

## Protocol

- Only rated standard rapid games with two banded ratings qualify.
- The first 10 plies of each game are excluded, and so is any position where either player has under 30 seconds on the clock, following the published Maia2 evaluation filters.
- Each player contributes at most 8 moves per game; a seeded per-band reservoir (seed 42) samples 5,000 moves per band from 150,181 streamed games.
- Maia2 is conditioned on the actual ratings of both players, not band midpoints.
- The evaluated checkpoint is the October 2024 `rapid_model.pt` release (SHA-256 `65aae8465eed…e267e997`, matching the CSSLab/maia2 integrity pin), which has never been retrained.

## Results

| Band | Moves | Games | Top-1 accuracy (Wilson 95% CI) | Cluster-bootstrap 95% CI | Mean top-1 prob |
|---|---:|---:|---|---|---:|
| <1100 | 5,000 | 2,574 | 46.6% (45.3%–48.0%) | 45.1%–48.0% | 0.499 |
| 1100-1400 | 5,000 | 3,251 | 51.1% (49.7%–52.4%) | 49.5%–52.5% | 0.544 |
| 1400-1700 | 5,000 | 3,575 | 52.4% (51.0%–53.7%) | 51.0%–53.8% | 0.556 |
| 1700-2000 | 5,000 | 3,356 | 53.7% (52.4%–55.1%) | 52.4%–55.1% | 0.568 |
| 2000+ | 5,000 | 1,762 | 53.7% (52.3%–55.1%) | 52.3%–55.1% | 0.576 |
| **Overall** | **25,000** | | **51.5% (50.9%–52.1%)** | | 0.549 |

The band trend is not monotonically increasing with rating. Adjacent bands whose Wilson intervals do not overlap: <1100 < 1100-1400. The smoke test's 2.4 pp local minimum at 1400-1700 does not reproduce here. Maia2's mean top-1 confidence rises monotonically with band (0.499 → 0.576).

![Benchmark accuracy by band](maia_benchmark_accuracy.png)

## Comparison with the published Maia2 figures

| Skill group | This benchmark | Maia2 paper (Dec 2023 Cross-skill) |
|---|---|---:|
| <1600 | 49.6% (48.8%–50.5%) (n=13,323) | 51.72% |
| 1600-2000 | 53.6% (52.4%–54.8%) (n=6,677) | 54.15% |
| >2000 | 53.7% (52.3%–55.1%) (n=5,000) | 53.87% |

The paper's Cross-skill Testset uses December 2023 games with its own sampling, and its natural rating mix differs from this band-balanced sample (each band contributes equally here, which overweights low ratings inside the <1600 group). The comparison is directional, not exact.

## Comparison with the 2019-04 smoke test

| Band | Independent benchmark | 2019-04 smoke | Difference |
|---|---:|---:|---:|
| <1100 | 46.6% | 47.0% | -0.4 pp |
| 1100-1400 | 51.1% | 47.0% | +4.1 pp |
| 1400-1700 | 52.4% | 44.6% | +7.8 pp |
| 1700-2000 | 53.7% | 49.6% | +4.1 pp |
| 2000+ | 53.7% | 51.4% | +2.3 pp |

The smoke test drew from eval-annotated games only (analysis-requested selection bias), included plies 2–10, applied no clock filter, and mixed all time controls. Differences between the columns therefore reflect protocol as well as data-overlap effects; the independent benchmark is the number to quote.

## Accuracy by game phase

| Band | Plies 11–20 | Plies 21–40 | Plies 41+ | ≤10 pieces | 11–20 pieces | 21–32 pieces |
|---|---:|---:|---:|---:|---:|---:|
| <1100 | 44.4% | 45.4% | 50.6% | 54.6% | 50.2% | 45.0% |
| 1100-1400 | 46.7% | 51.1% | 54.7% | 59.3% | 54.4% | 49.5% |
| 1400-1700 | 52.0% | 51.6% | 53.3% | 62.3% | 54.2% | 51.1% |
| 1700-2000 | 53.0% | 53.7% | 54.2% | 64.7% | 54.3% | 52.8% |
| 2000+ | 53.7% | 52.6% | 54.7% | 59.2% | 56.8% | 52.3% |

## Limitations

- Wilson intervals treat moves as independent; moves from one game are correlated, which is why the game-clustered bootstrap interval is also reported.
- The sample covers the leading portion of the month's chronological dump (the first hours after 00:00 UTC on the 1st), matching the main pipeline's streaming protocol; time zones active at that hour are over-represented.
- Games involving BOT-titled accounts are excluded.
- Lichess ratings are Glicko-2; no chess.com mapping is claimed (issue #2).
