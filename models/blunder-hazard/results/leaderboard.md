# blunder-hazard: leaderboard

Written by `lab eval blunder-hazard` from the run records in this folder.

- **Predicts:** chance the mover loses more than 20 points of win probability.
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T00:26:19Z at lab commit `5e4946a`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** PR-AUC (higher is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | PR-AUC | ROC-AUC | Brier | Log loss | Calibration error | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| `gbm-hand` | LightGBM, context and hand features | 0.2533 (0.2396 to 0.2681) | 0.8232 | 0.0569 | 0.2013 | 0.0042 | reference |  | AMD Ryzen 7 3700X 8-Core Processor | 7 s |
| `gbm-context` | LightGBM, context numbers only | 0.1879 (0.1782 to 0.2001) | 0.7797 | 0.0595 | 0.2142 | 0.0027 | **-0.06535 (-0.07524 to -0.05528)** |  | AMD Ryzen 7 3700X 8-Core Processor | 5 s |
| `constant` | one number for every row | 0.0685 (0.0659 to 0.0712) | 0.5000 | 0.0639 | 0.2499 | 0.0061 | **-0.1847 (-0.1982 to -0.1722)** |  | AMD Ryzen 7 3700X 8-Core Processor | 0 s |

## PR-AUC by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `gbm-hand` | 0.3426 | 0.2593 | 0.2160 | 0.1794 | 0.1293 |
| `gbm-context` | 0.2587 | 0.1866 | 0.1477 | 0.1327 | 0.1107 |
| `constant` | 0.1066 | 0.0782 | 0.0621 | 0.0530 | 0.0380 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |

## Calibration of `gbm-hand`

Test rows in ten equal groups by predicted chance: what the model said against what happened.

| Predicted | Happened | Rows |
|---|---|---|
| 0.0% | 0.0% | 6,858 |
| 0.0% | 0.0% | 6,858 |
| 0.6% | 0.4% | 6,858 |
| 1.7% | 1.7% | 6,858 |
| 3.0% | 2.7% | 6,858 |
| 4.6% | 5.3% | 6,858 |
| 6.7% | 7.7% | 6,858 |
| 9.7% | 10.4% | 6,858 |
| 14.2% | 13.7% | 6,858 |
| 25.7% | 26.7% | 6,857 |
