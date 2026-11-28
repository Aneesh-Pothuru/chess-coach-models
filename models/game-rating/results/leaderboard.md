# game-rating: leaderboard

Written by `lab eval game-rating` from the run records in this folder.

- **Predicts:** Lichess rapid rating points.
- **Data:** `games-2026-10`, 99,699 rows (test 9,974, train 84,672, valid 5,053) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-28T00:35:21Z at lab commit `a677087`.
- **Test set:** 9,974 rows from 4,999 games, never seen in training or in choosing an epoch.
- **Ranked by:** MAE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | MAE | RMSE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `conv-medium-skip-quadruple` | conv, 8 layers of width 128 for each position, then 3 transformer layers over the positions in order with BiGRU and step-feature skip and attention pooling; trained on 338,809 rows of the larger build `games-200k-2026-10` | 180.8 (177.3 to 184.8) | 231.7 | 0.6318 | 0.7908 | **+61.92 (+57.81 to +65.84)** | 5,399,045 | NVIDIA A100-SXM4-40GB | 41 min |
| `steps-board-quadruple` | per-move sequence, 1 transformer layer of width 128, BiGRU, attention pooling, with temporal features and board-geometry features; trained on 338,809 rows of the larger build `games-200k-2026-10` | 185.7 (181.9 to 189.8) | 237.0 | 0.6146 | 0.7794 | **+56.99 (+52.9 to +60.82)** | 524,421 | NVIDIA A100-SXM4-40GB | 13 min |
| `conv-medium-skip` | conv, 8 layers of width 128 for each position, then 3 transformer layers over the positions in order with BiGRU and step-feature skip and attention pooling | 192.3 (188.6 to 196.4) | 245.1 | 0.5880 | 0.7630 | **+50.37 (+46.59 to +54.21)** | 5,399,045 | NVIDIA A100-SXM4-40GB | 17 min |
| `steps-board` | per-move sequence, 1 transformer layer of width 128, BiGRU, attention pooling, with temporal features and board-geometry features | 194.1 (190.4 to 198.1) | 247.1 | 0.5809 | 0.7585 | **+48.56 (+44.82 to +52.33)** | 524,421 | Intel(R) Xeon(R) CPU @ 2.30GHz | 34 min |
| `conv-small-long` | conv, 6 layers of width 96 for each position, then 2 transformer layers over the positions in order | 199.2 (195.7 to 203.3) | 253.8 | 0.5580 | 0.7485 | **+43.52 (+39.64 to +47.53)** | 1,730,209 | NVIDIA A100-SXM4-40GB | 11 min |
| `conv-small` | conv, 6 layers of width 96 for each position, then 2 transformer layers over the positions in order | 204.1 (200.2 to 208.2) | 259.2 | 0.5392 | 0.7324 | **+38.56 (+35.06 to +42.32)** | 1,730,209 | NVIDIA A100-SXM4-80GB | 5 min |
| `transformer-small` | transformer, 4 layers of width 128 for each position, then 2 transformer layers over the positions in order | 204.9 (200.9 to 208.8) | 259.0 | 0.5397 | 0.7298 | **+37.8 (+34.08 to +41.24)** | 2,094,753 | NVIDIA A100-SXM4-80GB | 10 min |
| `transformer-medium-skip` | transformer, 8 layers of width 256 for each position, then 3 transformer layers over the positions in order with BiGRU and step-feature skip and attention pooling | 205.4 (201.5 to 209.3) | 258.7 | 0.5408 | 0.7315 | **+37.34 (+33.65 to +40.8)** | 18,413,125 | NVIDIA A100-SXM4-40GB | 69 min |
| `transformer-medium` | transformer, 8 layers of width 256 for each position, then 2 transformer layers over the positions in order | 211.1 (206.9 to 215.0) | 265.8 | 0.5152 | 0.7134 | **+31.65 (+28.19 to +35.05)** | 11,444,545 | NVIDIA A100-SXM4-80GB | 28 min |
| `steps-temporal` | per-move sequence, 1 transformer layer of width 96, BiGRU, attention pooling, with temporal features | 216.1 (212.4 to 220.2) | 273.5 | 0.4867 | 0.6951 | **+26.65 (+23.29 to +29.76)** | 293,573 | Intel(R) Xeon(R) CPU @ 2.30GHz | 20 min |
| `steps-raw` | per-move sequence, 1 transformer layer of width 96, BiGRU, attention pooling | 221.4 (217.2 to 225.6) | 278.7 | 0.4671 | 0.6759 | **+21.28 (+18.11 to +24.25)** | 290,981 | Intel(R) Xeon(R) CPU @ 2.30GHz | 20 min |
| `gbm-hand` | LightGBM, context and hand features | 242.7 (238.3 to 247.2) | 302.0 | 0.3741 | 0.5964 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 7 s |
| `gbm-context` | LightGBM, context numbers only | 306.9 (300.9 to 312.8) | 376.1 | 0.0294 | 0.1607 | **-64.2 (-69.1 to -59.24)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 3 s |
| `constant` | one number for every row | 312.3 (305.9 to 318.1) | 382.0 | -0.0012 | n/a | **-69.58 (-74.52 to -64.29)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 s |

## MAE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `conv-medium-skip-quadruple` | 215.7 | 178.7 | 163.1 | 158.8 | 226.9 |
| `steps-board-quadruple` | 205.8 | 177.4 | 170.9 | 168.8 | 250.6 |
| `conv-medium-skip` | 236.2 | 188.1 | 169.0 | 167.1 | 251.8 |
| `steps-board` | 234.1 | 183.0 | 174.2 | 176.2 | 251.5 |
| `conv-small-long` | 238.1 | 195.3 | 179.0 | 177.2 | 250.2 |
| `conv-small` | 241.0 | 189.7 | 181.1 | 188.9 | 277.1 |
| `transformer-small` | 252.7 | 198.8 | 175.7 | 179.8 | 279.0 |
| `transformer-medium-skip` | 244.6 | 190.2 | 181.8 | 188.7 | 280.8 |
| `transformer-medium` | 259.8 | 195.3 | 183.5 | 190.2 | 292.9 |
| `steps-temporal` | 259.5 | 207.8 | 180.7 | 198.3 | 303.2 |
| `steps-raw` | 272.0 | 209.9 | 176.4 | 204.6 | 330.2 |
| `gbm-hand` | 352.6 | 216.1 | 160.1 | 229.7 | 391.8 |
| `gbm-context` | 576.4 | 256.7 | 89.689 | 306.7 | 611.7 |
| `constant` | 592.6 | 261.7 | 74.698 | 322.1 | 636.2 |
| rows | 1,569 | 2,411 | 2,827 | 2,140 | 1,027 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `aux`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `steps-board-aux` | `steps-board` | `train.aux_target` opponent_elo; `train.aux_weight` 0.3; `train.epochs` 8 (the base has 10) | 84,672 rows | 194.0 (190.3 to 197.9) | 194.1 | **+48.76 (+44.39 to +52.94)** | 27 min |

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

### `hand`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand` | `transformer-medium` | `learner.features` hand | 84,672 rows | 225.4 (221.3 to 229.9) | 211.1 | **+17.3 (+14.9 to +19.68)** | 28 min |

### `opponent`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `steps-own-only` | `steps-board` | `learner.without_opponent` True; `train.epochs` 8 (the base has 10) | 84,672 rows | 201.6 (198.1 to 205.6) | 194.1 | **+41.07 (+37.1 to +44.74)** | 27 min |
