# position-evaluation: leaderboard

Written by `lab eval position-evaluation` from the run records in this folder.

- **Predicts:** the mover's chance of winning by the engine's evaluation (percent).
- **Data:** `evaluations-v1`, 6,000,000 rows (test 120,035, train 5,819,934, valid 60,031) from https://database.lichess.org/lichess_db_eval.jsonl.zst (CC0 1.0, database.lichess.org), built 2026-11-22T13:39:30Z at lab commit `36a0ad9`.
- **Test set:** 120,035 rows from 120,035 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium` | transformer, 8 layers of width 256 | 12.963 (12.859 to 13.070) | 7.972 | 0.7469 | 0.8175 | **+3.486 (+3.387 to +3.584)** | 6,551,617 | NVIDIA A100-SXM4-40GB | 42 min |
| `gbm-hand` | LightGBM, context and hand features | 16.449 (16.347 to 16.556) | 11.215 | 0.5924 | 0.6782 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `constant` | one number for every row | 25.765 (25.666 to 25.866) | 18.483 | -0.0000 | n/a | **-9.316 (-9.426 to -9.2)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 1 s |

## RMSE by band

| Run | <9 | 9-16 | 17-24 | 25-32 |
|---|---|---|---|---|
| `transformer-medium` | 14.224 | 15.654 | 14.632 | 9.151 |
| `gbm-hand` | 18.100 | 19.801 | 18.458 | 11.764 |
| `constant` | 38.374 | 31.946 | 25.791 | 14.333 |
| rows | 16,000 | 23,338 | 34,199 | 46,498 |
