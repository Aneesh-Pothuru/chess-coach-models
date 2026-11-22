# think-time: leaderboard

Written by `lab eval think-time` from the run records in this folder.

- **Predicts:** log(1 + seconds spent on the move).
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T05:45:24Z at lab commit `3a74aa4`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** MAE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | MAE | RMSE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 0.6185 (0.6134 to 0.6231) | 0.7875 | 0.3144 | 0.5569 | **+0.01205 (+0.01018 to +0.01388)** | 6,557,249 | NVIDIA A100-SXM4-80GB | 16 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.6200 (0.6148 to 0.6246) | 0.7884 | 0.3129 | 0.5530 | **+0.01063 (+0.009066 to +0.01214)** | 6,557,249 | NVIDIA A100-SXM4-80GB | 8 min |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 0.6280 (0.6228 to 0.6328) | 0.7979 | 0.2963 | 0.5372 | **+0.002601 (+0.0002087 to +0.004526)** | 6,553,921 | NVIDIA A100-SXM4-80GB | 16 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.6287 (0.6233 to 0.6334) | 0.7975 | 0.2969 | 0.5372 | +0.001931 (-0.0002074 to +0.003677) | 861,857 | NVIDIA A100-SXM4-80GB | 3 min |
| `conv-small` | conv, 6 layers of width 96 | 0.6292 (0.6236 to 0.6344) | 0.7994 | 0.2935 | 0.5384 | +0.001397 (-0.001706 to +0.003967) | 1,031,329 | NVIDIA A100-SXM4-80GB | 2 min |
| `gbm-hand` | LightGBM, context and hand features | 0.6306 (0.6255 to 0.6352) | 0.7992 | 0.2939 | 0.5322 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 25 s |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.6327 (0.6277 to 0.6374) | 0.8020 | 0.2889 | 0.5286 | **-0.002127 (-0.004274 to -0.0003426)** | 6,553,921 | NVIDIA A100-SXM4-80GB | 8 min |
| `gbm-context` | LightGBM, context numbers only | 0.6794 (0.6737 to 0.6846) | 0.8536 | 0.1945 | 0.4265 | **-0.04885 (-0.05155 to -0.04637)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 s |
| `constant` | one number for every row | 0.7724 (0.7661 to 0.7789) | 0.9511 | -0.0000 | n/a | **-0.1418 (-0.1474 to -0.1367)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## MAE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-long` | 0.5927 | 0.6017 | 0.6138 | 0.6367 | 0.6730 |
| `transformer-medium-hand` | 0.5920 | 0.6031 | 0.6152 | 0.6373 | 0.6793 |
| `transformer-medium-long` | 0.6051 | 0.6107 | 0.6249 | 0.6440 | 0.6788 |
| `transformer-small` | 0.6052 | 0.6105 | 0.6250 | 0.6451 | 0.6830 |
| `conv-small` | 0.5981 | 0.6093 | 0.6250 | 0.6514 | 0.6889 |
| `gbm-hand` | 0.6028 | 0.6133 | 0.6262 | 0.6480 | 0.6896 |
| `transformer-medium` | 0.6092 | 0.6160 | 0.6296 | 0.6483 | 0.6840 |
| `gbm-context` | 0.6401 | 0.6599 | 0.6790 | 0.7036 | 0.7365 |
| `constant` | 0.7173 | 0.7424 | 0.7760 | 0.8058 | 0.8474 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |
