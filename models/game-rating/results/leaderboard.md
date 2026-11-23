# game-rating: leaderboard

Written by `lab eval game-rating` from the run records in this folder.

- **Predicts:** Lichess rapid rating points.
- **Data:** `games-2026-10`, 99,699 rows (test 9,974, train 84,672, valid 5,053) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T23:18:23Z at lab commit `8c77161`.
- **Test set:** 9,974 rows from 4,999 games, never seen in training or in choosing an epoch.
- **Ranked by:** MAE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | MAE | RMSE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `conv-small` | conv, 6 layers of width 96 for each position, then 2 transformer layers over the positions in order | 204.1 (200.2 to 208.2) | 259.2 | 0.5392 | 0.7324 | **+38.56 (+35.06 to +42.32)** | 1,730,209 | NVIDIA A100-SXM4-80GB | 5 min |
| `transformer-small` | transformer, 4 layers of width 128 for each position, then 2 transformer layers over the positions in order | 204.9 (200.9 to 208.8) | 259.0 | 0.5397 | 0.7298 | **+37.8 (+34.08 to +41.24)** | 2,094,753 | NVIDIA A100-SXM4-80GB | 10 min |
| `transformer-medium` | transformer, 8 layers of width 256 for each position, then 2 transformer layers over the positions in order | 211.1 (206.9 to 215.0) | 265.8 | 0.5152 | 0.7134 | **+31.65 (+28.19 to +35.05)** | 11,444,545 | NVIDIA A100-SXM4-80GB | 28 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256 for each position, then 2 transformer layers over the positions in order, with hand features | 225.4 (221.3 to 229.9) | 283.2 | 0.4499 | 0.6635 | **+17.3 (+14.9 to +19.68)** | 11,453,249 | NVIDIA A100-SXM4-80GB | 28 min |
| `gbm-hand` | LightGBM, context and hand features | 242.7 (238.3 to 247.2) | 302.0 | 0.3741 | 0.5964 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 8 s |
| `gbm-context` | LightGBM, context numbers only | 306.9 (300.9 to 312.8) | 376.1 | 0.0294 | 0.1607 | **-64.2 (-69.1 to -59.24)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 3 s |
| `constant` | one number for every row | 312.3 (305.9 to 318.1) | 382.0 | -0.0012 | n/a | **-69.58 (-74.52 to -64.29)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 s |

## MAE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `conv-small` | 241.0 | 189.7 | 181.1 | 188.9 | 277.1 |
| `transformer-small` | 252.7 | 198.8 | 175.7 | 179.8 | 279.0 |
| `transformer-medium` | 259.8 | 195.3 | 183.5 | 190.2 | 292.9 |
| `transformer-medium-hand` | 291.8 | 210.9 | 177.9 | 206.9 | 327.4 |
| `gbm-hand` | 352.6 | 216.1 | 160.1 | 229.7 | 391.8 |
| `gbm-context` | 576.4 | 256.7 | 89.689 | 306.7 | 611.7 |
| `constant` | 592.6 | 261.7 | 74.698 | 322.1 | 636.2 |
| rows | 1,569 | 2,411 | 2,827 | 2,140 | 1,027 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `features`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-no-tempo` | `gbm-hand` | `learner.without` tempo | 84,672 rows | 249.3 (244.7 to 253.9) | 242.7 | **-6.583 (-8.421 to -4.791)** | 4 s |
| `gbm-hand-no-choices` | `gbm-hand` | `learner.without` choices | 84,672 rows | 253.5 (249.0 to 258.1) | 242.7 | **-10.82 (-12.66 to -8.756)** | 4 s |
| `gbm-hand-no-accuracy` | `gbm-hand` | `learner.without` accuracy | 84,672 rows | 273.4 (268.4 to 278.1) | 242.7 | **-30.68 (-34.16 to -27.15)** | 4 s |

### `games`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-half` | `gbm-hand` | `data.train_share` 0.5 | 42,481 rows | 244.6 (240.1 to 249.0) | 242.7 | **-1.905 (-2.913 to -0.8047)** | 4 s |
| `gbm-hand-quarter` | `gbm-hand` | `data.train_share` 0.25 | 21,480 rows | 247.0 (242.6 to 251.5) | 242.7 | **-4.285 (-5.506 to -2.883)** | 4 s |
