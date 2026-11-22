# puzzle-difficulty: leaderboard

Written by `lab eval puzzle-difficulty` from the run records in this folder.

- **Predicts:** Lichess puzzle rating points.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T06:09:46Z at lab commit `3a74aa4`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 261.9 (260.6 to 263.2) | 196.8 | 0.7287 | 0.8601 | **+32.98 (+31.92 to +34.03)** | 6,563,649 | NVIDIA A100-SXM4-80GB | 22 min |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 264.4 (262.9 to 265.9) | 195.9 | 0.7235 | 0.8599 | **+30.48 (+29.11 to +31.85)** | 6,555,201 | NVIDIA A100-SXM4-80GB | 23 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 270.2 (268.8 to 271.6) | 204.8 | 0.7112 | 0.8484 | **+24.68 (+23.79 to +25.62)** | 6,563,649 | NVIDIA A100-SXM4-80GB | 13 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 284.0 (282.4 to 285.4) | 214.5 | 0.6810 | 0.8320 | **+10.91 (+9.73 to +12.14)** | 6,555,201 | NVIDIA A100-SXM4-80GB | 13 min |
| `conv-small` | conv, 6 layers of width 96 | 290.8 (289.3 to 292.3) | 221.8 | 0.6656 | 0.8213 | **+4.105 (+2.851 to +5.371)** | 1,040,257 | NVIDIA A100-SXM4-80GB | 3 min |
| `transformer-small` | transformer, 4 layers of width 128 | 293.1 (291.5 to 294.4) | 224.2 | 0.6603 | 0.8178 | **+1.847 (+0.7441 to +3.053)** | 862,497 | NVIDIA A100-SXM4-80GB | 5 min |
| `gbm-hand` | LightGBM, context and hand features | 294.9 (293.5 to 296.2) | 229.0 | 0.6561 | 0.8133 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 89 s |
| `gbm-context` | LightGBM, context numbers only | 428.8 (427.2 to 430.5) | 348.4 | 0.2731 | 0.5022 | **-133.8 (-135.4 to -132.2)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 4 s |
| `constant` | one number for every row | 502.9 (501.1 to 504.7) | 415.7 | -0.0000 | n/a | **-208 (-210.1 to -206.1)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## RMSE by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-long` | 184.8 | 239.0 | 251.1 | 291.8 | 410.8 |
| `transformer-medium-long` | 181.1 | 225.0 | 251.3 | 307.4 | 435.1 |
| `transformer-medium-hand` | 196.5 | 247.3 | 254.8 | 297.6 | 428.9 |
| `transformer-medium` | 209.8 | 250.6 | 263.6 | 317.4 | 464.6 |
| `conv-small` | 227.1 | 264.5 | 262.6 | 312.6 | 477.0 |
| `transformer-small` | 228.2 | 268.7 | 271.0 | 315.4 | 466.4 |
| `gbm-hand` | 245.3 | 270.2 | 250.6 | 311.4 | 494.4 |
| `gbm-context` | 515.7 | 321.9 | 243.7 | 450.5 | 759.1 |
| `constant` | 675.0 | 284.4 | 170.5 | 537.2 | 958.5 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |
