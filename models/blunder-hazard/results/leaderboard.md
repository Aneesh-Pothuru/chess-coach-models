# blunder-hazard: leaderboard

Written by `lab eval blunder-hazard` from the run records in this folder.

- **Predicts:** chance the mover loses more than 20 points of win probability.
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T01:42:50Z at lab commit `85d0c35+changes`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** PR-AUC (higher is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | PR-AUC | ROC-AUC | Brier | Log loss | Calibration error | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.2666 (0.2526 to 0.2822) | 0.8279 | 0.0565 | 0.2000 | 0.0032 | **+0.01331 (+0.007014 to +0.01978)** | 6,557,505 | NVIDIA A100-SXM4-80GB | 8 min |
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 0.2628 (0.2491 to 0.2780) | 0.8266 | 0.0565 | 0.2002 | 0.0023 | **+0.009522 (+0.002803 to +0.01715)** | 6,557,505 | NVIDIA A100-SXM4-80GB | 11 min |
| `gbm-hand` | LightGBM, context and hand features | 0.2533 (0.2396 to 0.2681) | 0.8232 | 0.0569 | 0.2013 | 0.0042 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 11 s |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.2370 (0.2244 to 0.2506) | 0.8177 | 0.0575 | 0.2037 | 0.0026 | **-0.01631 (-0.02519 to -0.007419)** | 6,554,177 | NVIDIA A100-SXM4-80GB | 8 min |
| `conv-small` | conv, 6 layers of width 96 | 0.2369 (0.2252 to 0.2504) | 0.8187 | 0.0574 | 0.2033 | 0.0021 | **-0.01642 (-0.02564 to -0.007133)** | 1,031,425 | NVIDIA A100-SXM4-80GB | 2 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.2364 (0.2244 to 0.2500) | 0.8190 | 0.0575 | 0.2033 | 0.0021 | **-0.01692 (-0.02552 to -0.00821)** | 861,985 | NVIDIA A100-SXM4-80GB | 3 min |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 0.2359 (0.2236 to 0.2488) | 0.8166 | 0.0575 | 0.2040 | 0.0026 | **-0.01736 (-0.02569 to -0.008905)** | 6,554,177 | NVIDIA A100-SXM4-80GB | 11 min |
| `gbm-context` | LightGBM, context numbers only | 0.1879 (0.1782 to 0.2001) | 0.7797 | 0.0595 | 0.2142 | 0.0027 | **-0.06535 (-0.07524 to -0.05528)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 4 s |
| `constant` | one number for every row | 0.0685 (0.0659 to 0.0712) | 0.5000 | 0.0639 | 0.2499 | 0.0061 | **-0.1847 (-0.1982 to -0.1722)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## PR-AUC by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `transformer-medium-hand` | 0.3666 | 0.2730 | 0.2218 | 0.1882 | 0.1375 |
| `transformer-medium-hand-long` | 0.3611 | 0.2730 | 0.2150 | 0.1868 | 0.1287 |
| `gbm-hand` | 0.3426 | 0.2593 | 0.2160 | 0.1794 | 0.1293 |
| `transformer-medium` | 0.3328 | 0.2294 | 0.1908 | 0.1781 | 0.1429 |
| `conv-small` | 0.3167 | 0.2468 | 0.1930 | 0.1683 | 0.1431 |
| `transformer-small` | 0.3325 | 0.2308 | 0.1933 | 0.1665 | 0.1309 |
| `transformer-medium-long` | 0.3264 | 0.2334 | 0.1924 | 0.1751 | 0.1430 |
| `gbm-context` | 0.2587 | 0.1866 | 0.1477 | 0.1327 | 0.1107 |
| `constant` | 0.1066 | 0.0782 | 0.0621 | 0.0530 | 0.0380 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |

## Calibration of `transformer-medium-hand`

Test rows in ten equal groups by predicted chance: what the model said against what happened.

| Predicted | Happened | Rows |
|---|---|---|
| 0.0% | 0.0% | 6,858 |
| 0.0% | 0.0% | 6,858 |
| 0.4% | 0.5% | 6,858 |
| 1.2% | 1.4% | 6,858 |
| 2.6% | 2.8% | 6,858 |
| 4.4% | 4.7% | 6,858 |
| 6.8% | 7.6% | 6,858 |
| 10.1% | 10.2% | 6,858 |
| 15.0% | 14.4% | 6,858 |
| 26.2% | 26.9% | 6,857 |
