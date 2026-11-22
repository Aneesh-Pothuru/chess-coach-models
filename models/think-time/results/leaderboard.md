# think-time: leaderboard

Written by `lab eval think-time` from the run records in this folder.

- **Predicts:** log(1 + seconds spent on the move).
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T00:26:19Z at lab commit `5e4946a`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** MAE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | MAE | RMSE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `gbm-hand` | LightGBM, context and hand features | 0.6306 (0.6255 to 0.6352) | 0.7992 | 0.2939 | 0.5322 | reference |  | AMD Ryzen 7 3700X 8-Core Processor | 24 s |
| `gbm-context` | LightGBM, context numbers only | 0.6794 (0.6737 to 0.6846) | 0.8536 | 0.1945 | 0.4265 | **-0.04885 (-0.05155 to -0.04637)** |  | AMD Ryzen 7 3700X 8-Core Processor | 7 s |
| `constant` | one number for every row | 0.7724 (0.7661 to 0.7789) | 0.9511 | -0.0000 | n/a | **-0.1418 (-0.1474 to -0.1367)** |  | AMD Ryzen 7 3700X 8-Core Processor | 0 s |

## MAE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `gbm-hand` | 0.6028 | 0.6133 | 0.6262 | 0.6480 | 0.6896 |
| `gbm-context` | 0.6401 | 0.6599 | 0.6790 | 0.7036 | 0.7365 |
| `constant` | 0.7173 | 0.7424 | 0.7760 | 0.8058 | 0.8474 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |
