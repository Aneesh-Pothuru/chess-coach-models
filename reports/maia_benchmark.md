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
| <1100 | 5,000 | 2,631 | 46.7% (45.3%–48.1%) | 45.3%–48.1% | 0.505 |
| 1100-1400 | 5,000 | 3,221 | 53.0% (51.6%–54.4%) | 51.7%–54.4% | 0.549 |
| 1400-1700 | 5,000 | 3,574 | 53.0% (51.6%–54.3%) | 51.6%–54.3% | 0.558 |
| 1700-2000 | 5,000 | 3,322 | 55.0% (53.6%–56.4%) | 53.5%–56.4% | 0.570 |
| 2000+ | 5,000 | 1,783 | 54.4% (53.0%–55.8%) | 53.0%–55.8% | 0.575 |
| **Overall** | **25,000** | | **52.4% (51.8%–53.0%)** | | 0.551 |

The band trend is not monotonically increasing with rating. Adjacent bands whose Wilson intervals do not overlap: <1100 < 1100-1400. The smoke test's 2.4 pp local minimum at 1400-1700 shrinks to a statistically insignificant 0.1 pp. Maia2's mean top-1 confidence rises monotonically with band (0.505 → 0.575), so the flat stretch in measured accuracy between the middle bands is not a confidence artifact.

## Comparison with the published Maia2 figures

| Skill group | This benchmark | Maia2 paper (Dec 2023 Cross-skill) |
|---|---|---:|
| <1600 | 50.8% (49.9%–51.6%) (n=13,339) | 51.72% |
| 1600-2000 | 54.2% (53.0%–55.4%) (n=6,661) | 54.15% |
| >2000 | 54.4% (53.0%–55.8%) (n=5,000) | 53.87% |

The paper's Cross-skill Testset uses December 2023 games with its own sampling, and its natural rating mix differs from this band-balanced sample (each band contributes equally here, which overweights low ratings inside the <1600 group). The comparison is directional, not exact.

## Comparison with the 2019-04 smoke test

| Band | Independent benchmark | 2019-04 smoke | Difference |
|---|---:|---:|---:|
| <1100 | 46.7% | 47.0% | -0.3 pp |
| 1100-1400 | 53.0% | 47.0% | +6.0 pp |
| 1400-1700 | 53.0% | 44.6% | +8.4 pp |
| 1700-2000 | 55.0% | 49.6% | +5.4 pp |
| 2000+ | 54.4% | 51.4% | +3.0 pp |

The smoke test drew from eval-annotated games only (analysis-requested selection bias), included plies 2–10, applied no clock filter, and mixed all time controls. Differences between the columns therefore reflect protocol as well as data-overlap effects; the independent benchmark is the number to quote.

## Accuracy by game phase

| Band | Plies 11–20 | Plies 21–40 | Plies 41+ | ≤10 pieces | 11–20 pieces | 21–32 pieces |
|---|---:|---:|---:|---:|---:|---:|
| <1100 | 43.8% | 46.0% | 50.4% | 57.8% | 52.0% | 44.2% |
| 1100-1400 | 50.0% | 53.1% | 55.5% | 60.1% | 56.3% | 51.6% |
| 1400-1700 | 50.6% | 53.0% | 54.5% | 62.3% | 55.2% | 51.7% |
| 1700-2000 | 56.0% | 52.7% | 56.5% | 64.9% | 57.6% | 53.6% |
| 2000+ | 54.3% | 52.9% | 55.8% | 59.3% | 57.3% | 53.2% |

## Limitations

- Wilson intervals treat moves as independent; moves from one game are correlated, which is why the game-clustered bootstrap interval is also reported.
- The sample covers the leading portion of the month's chronological dump (the first hours after 00:00 UTC on the 1st), matching the main pipeline's streaming protocol; time zones active at that hour are over-represented.
- Games involving BOT-titled accounts are excluded.
- Lichess ratings are Glicko-2; no chess.com mapping is claimed (issue #2).
