# Model 2: Blunder-hazard classifier

The v0 LightGBM was trained on 50,000 positions from 17,264 games. Splits are deterministic by game, so no position from a game appears in more than one split.

## v0 held-out metrics

| Band | Model | N | Base rate | ROC-AUC | PR-AUC | Brier |
|---|---|---:|---:|---:|---:|---:|
| overall | LightGBM | 7,649 | 5.7% | 0.817 | 0.197 | 0.049 |
| overall | Absolute-eval baseline | 7,649 | 5.7% | 0.502 | 0.055 | 0.054 |
| overall | Constant | 7,649 | 5.7% | 0.500 | 0.057 | 0.054 |
| <1100 | LightGBM | 842 | 9.1% | 0.839 | 0.303 | 0.073 |
| <1100 | Absolute-eval baseline | 842 | 9.1% | 0.567 | 0.106 | 0.084 |
| <1100 | Constant | 842 | 9.1% | 0.500 | 0.091 | 0.084 |
| 1100-1400 | LightGBM | 2,089 | 6.7% | 0.787 | 0.177 | 0.059 |
| 1100-1400 | Absolute-eval baseline | 2,089 | 6.7% | 0.554 | 0.074 | 0.063 |
| 1100-1400 | Constant | 2,089 | 6.7% | 0.500 | 0.067 | 0.063 |
| 1400-1700 | LightGBM | 2,448 | 5.4% | 0.805 | 0.199 | 0.048 |
| 1400-1700 | Absolute-eval baseline | 2,448 | 5.4% | 0.474 | 0.050 | 0.051 |
| 1400-1700 | Constant | 2,448 | 5.4% | 0.500 | 0.054 | 0.051 |
| 1700-2000 | LightGBM | 1,557 | 4.1% | 0.834 | 0.160 | 0.037 |
| 1700-2000 | Absolute-eval baseline | 1,557 | 4.1% | 0.462 | 0.038 | 0.040 |
| 1700-2000 | Constant | 1,557 | 4.1% | 0.500 | 0.041 | 0.040 |
| 2000+ | LightGBM | 713 | 2.8% | 0.774 | 0.091 | 0.027 |
| 2000+ | Absolute-eval baseline | 713 | 2.8% | 0.529 | 0.035 | 0.028 |
| 2000+ | Constant | 713 | 2.8% | 0.500 | 0.028 | 0.028 |

Success bar (LightGBM PR-AUC > |eval| PR-AUC): **PASS** (0.197 vs 0.055).

![Calibration](hazard_calibration.png)

![Feature importance](hazard_feature_importance.png)

## Maia2-feature v1

| Band | Model | N | Base rate | ROC-AUC | PR-AUC | Brier |
|---|---|---:|---:|---:|---:|---:|
| overall | LightGBM | 2,364 | 6.0% | 0.809 | 0.224 | 0.052 |
| overall | Absolute-eval baseline | 2,364 | 6.0% | 0.484 | 0.056 | 0.057 |
| overall | Constant | 2,364 | 6.0% | 0.500 | 0.060 | 0.057 |
| <1100 | LightGBM | 475 | 10.7% | 0.806 | 0.341 | 0.084 |
| <1100 | Absolute-eval baseline | 475 | 10.7% | 0.531 | 0.114 | 0.099 |
| <1100 | Constant | 475 | 10.7% | 0.500 | 0.107 | 0.099 |
| 1100-1400 | LightGBM | 489 | 6.3% | 0.756 | 0.211 | 0.057 |
| 1100-1400 | Absolute-eval baseline | 489 | 6.3% | 0.566 | 0.070 | 0.059 |
| 1100-1400 | Constant | 489 | 6.3% | 0.500 | 0.063 | 0.060 |
| 1400-1700 | LightGBM | 468 | 5.8% | 0.822 | 0.185 | 0.051 |
| 1400-1700 | Absolute-eval baseline | 468 | 5.8% | 0.415 | 0.047 | 0.054 |
| 1400-1700 | Constant | 468 | 5.8% | 0.500 | 0.058 | 0.054 |
| 1700-2000 | LightGBM | 478 | 4.0% | 0.779 | 0.141 | 0.037 |
| 1700-2000 | Absolute-eval baseline | 478 | 4.0% | 0.422 | 0.035 | 0.038 |
| 1700-2000 | Constant | 478 | 4.0% | 0.500 | 0.040 | 0.038 |
| 2000+ | LightGBM | 454 | 3.3% | 0.826 | 0.097 | 0.031 |
| 2000+ | Absolute-eval baseline | 454 | 3.3% | 0.603 | 0.056 | 0.032 |
| 2000+ | Constant | 454 | 3.3% | 0.500 | 0.033 | 0.032 |

On the capped Maia2 subset, v1 PR-AUC is 0.224. The matched hand-feature model scores 0.213, for a Maia-feature delta of +0.011. The deployed product hook remains v0 because it is trained on much more data and avoids runtime Maia inference.

## Feature definition and limitations

- The hanging-piece count is a fast static-exchange proxy: attacked pieces whose cheapest attacker costs less, or which are undefended.
- The local run caps labels at 50,000 and Maia2 features at 5,000 positions.
- Lichess analysis availability is not random; results characterize the sampled annotated games.
- The absolute-eval baseline is calibrated on training games, while its ranking signal remains |eval| alone.
