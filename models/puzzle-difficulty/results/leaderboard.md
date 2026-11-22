# puzzle-difficulty: leaderboard

Written by `lab eval puzzle-difficulty` from the run records in this folder.

- **Predicts:** Lichess puzzle rating points.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T00:20:03Z at lab commit `5e4946a`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `gbm-hand` | LightGBM, context and hand features | 294.9 (293.5 to 296.2) | 229.0 | 0.6561 | 0.8133 | reference |  | AMD Ryzen 7 3700X 8-Core Processor | 80 s |
| `gbm-context` | LightGBM, context numbers only | 428.8 (427.2 to 430.5) | 348.4 | 0.2731 | 0.5022 | **-133.8 (-135.4 to -132.2)** |  | AMD Ryzen 7 3700X 8-Core Processor | 5 s |
| `constant` | one number for every row | 502.9 (501.1 to 504.7) | 415.7 | -0.0000 | n/a | **-208 (-210.1 to -206.1)** |  | AMD Ryzen 7 3700X 8-Core Processor | 0 s |

## RMSE by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `gbm-hand` | 245.3 | 270.2 | 250.6 | 311.4 | 494.4 |
| `gbm-context` | 515.7 | 321.9 | 243.7 | 450.5 | 759.1 |
| `constant` | 675.0 | 284.4 | 170.5 | 537.2 | 958.5 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |
