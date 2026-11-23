# puzzle-difficulty: leaderboard

Written by `lab eval puzzle-difficulty` from the run records in this folder.

- **Predicts:** Lichess puzzle rating points.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T13:46:53Z at lab commit `36a0ad9`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | transformer, 8 layers of width 256, with hand features, started from `position-evaluation/transformer-medium` | 251.7 (250.3 to 253.1) | 187.3 | 0.7495 | 0.8733 | **+43.22 (+41.99 to +44.44)** | 6,563,649 | NVIDIA A100-SXM4-40GB | 14 min |
| `transformer-medium-hand-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks, with hand features | 258.1 (256.7 to 259.5) | 193.7 | 0.7365 | 0.8647 | **+36.79 (+35.83 to +37.8)** | 6,563,905 | NVIDIA A100-SXM4-80GB | 17 min |
| `transformer-medium-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks | 258.5 (257.0 to 259.9) | 191.8 | 0.7357 | 0.8666 | **+36.4 (+35.15 to +37.76)** | 6,555,457 | NVIDIA A100-SXM4-80GB | 17 min |
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 261.9 (260.6 to 263.2) | 196.8 | 0.7287 | 0.8601 | **+32.98 (+31.92 to +34.03)** | 6,563,649 | NVIDIA A100-SXM4-80GB | 22 min |
| `transformer-medium-pretrained` | transformer, 8 layers of width 256, started from `position-evaluation/transformer-medium` | 262.0 (260.5 to 263.5) | 194.8 | 0.7285 | 0.8627 | **+32.91 (+31.67 to +34.17)** | 6,555,201 | NVIDIA A100-SXM4-40GB | 14 min |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 264.4 (262.9 to 265.9) | 195.9 | 0.7235 | 0.8599 | **+30.48 (+29.11 to +31.85)** | 6,555,201 | NVIDIA A100-SXM4-80GB | 23 min |
| `conv-medium-hand` | conv, 10 layers of width 192, each block weighing its channels by the whole board, with hand features | 265.7 (264.2 to 267.0) | 200.3 | 0.7208 | 0.8560 | **+29.23 (+28.14 to +30.4)** | 6,958,369 | NVIDIA A100-SXM4-80GB | 7 min |
| `transformer-medium-hand-double` | transformer, 8 layers of width 256, with hand features; trained on 1,918,903 rows of the larger build `puzzles-all-v1` | 267.5 (266.0 to 268.8) | 203.2 | 0.7170 | 0.8512 | **+27.4 (+26.47 to +28.34)** | 6,563,649 | NVIDIA A100-SXM4-40GB | 14 min |
| `transformer-medium-hand-quadruple` | transformer, 8 layers of width 256, with hand features; trained on 3,837,994 rows of the larger build `puzzles-all-v1` | 269.0 (267.5 to 270.2) | 204.6 | 0.7139 | 0.8493 | **+25.96 (+25.18 to +26.81)** | 6,563,649 | NVIDIA A100-SXM4-40GB | 14 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 270.2 (268.8 to 271.6) | 204.8 | 0.7112 | 0.8484 | **+24.68 (+23.79 to +25.62)** | 6,563,649 | NVIDIA A100-SXM4-80GB | 13 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 284.0 (282.4 to 285.4) | 214.5 | 0.6810 | 0.8320 | **+10.91 (+9.73 to +12.14)** | 6,555,201 | NVIDIA A100-SXM4-80GB | 13 min |
| `gbm-hand-quadruple` | LightGBM, context and hand features; trained on 3,837,994 rows of the larger build `puzzles-all-v1` | 289.8 (288.4 to 291.1) | 224.6 | 0.6678 | 0.8207 | **+5.099 (+4.795 to +5.388)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 min |
| `conv-small` | conv, 6 layers of width 96 | 290.8 (289.3 to 292.3) | 221.8 | 0.6656 | 0.8213 | **+4.105 (+2.851 to +5.371)** | 1,040,257 | NVIDIA A100-SXM4-80GB | 3 min |
| `gbm-hand-double` | LightGBM, context and hand features; trained on 1,918,903 rows of the larger build `puzzles-all-v1` | 291.7 (290.3 to 293.0) | 226.2 | 0.6634 | 0.8180 | **+3.173 (+2.832 to +3.488)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 4 min |
| `transformer-small` | transformer, 4 layers of width 128 | 293.1 (291.5 to 294.4) | 224.2 | 0.6603 | 0.8178 | **+1.847 (+0.7441 to +3.053)** | 862,497 | NVIDIA A100-SXM4-80GB | 5 min |
| `gbm-hand` | LightGBM, context and hand features | 294.9 (293.5 to 296.2) | 229.0 | 0.6561 | 0.8133 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `gbm-context` | LightGBM, context numbers only | 428.8 (427.2 to 430.5) | 348.4 | 0.2731 | 0.5022 | **-133.8 (-135.4 to -132.2)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 4 s |
| `constant` | one number for every row | 502.9 (501.1 to 504.7) | 415.7 | -0.0000 | n/a | **-208 (-210.1 to -206.1)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## RMSE by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | 170.8 | 221.5 | 243.4 | 287.8 | 402.4 |
| `transformer-medium-hand-attacks` | 181.2 | 231.6 | 246.8 | 288.2 | 413.4 |
| `transformer-medium-attacks` | 178.4 | 224.9 | 243.6 | 292.4 | 430.3 |
| `transformer-medium-hand-long` | 184.8 | 239.0 | 251.1 | 291.8 | 410.8 |
| `transformer-medium-pretrained` | 179.0 | 226.5 | 247.6 | 301.2 | 432.3 |
| `transformer-medium-long` | 181.1 | 225.0 | 251.3 | 307.4 | 435.1 |
| `conv-medium-hand` | 191.6 | 244.9 | 255.8 | 289.9 | 414.3 |
| `transformer-medium-hand-double` | 198.0 | 244.4 | 250.5 | 292.7 | 427.2 |
| `transformer-medium-hand-quadruple` | 198.2 | 244.4 | 248.6 | 294.8 | 437.2 |
| `transformer-medium-hand` | 196.5 | 247.3 | 254.8 | 297.6 | 428.9 |
| `transformer-medium` | 209.8 | 250.6 | 263.6 | 317.4 | 464.6 |
| `gbm-hand-quadruple` | 239.5 | 266.0 | 247.4 | 305.6 | 485.7 |
| `conv-small` | 227.1 | 264.5 | 262.6 | 312.6 | 477.0 |
| `gbm-hand-double` | 241.6 | 267.8 | 249.3 | 307.5 | 487.9 |
| `transformer-small` | 228.2 | 268.7 | 271.0 | 315.4 | 466.4 |
| `gbm-hand` | 245.3 | 270.2 | 250.6 | 311.4 | 494.4 |
| `gbm-context` | 515.7 | 321.9 | 243.7 | 450.5 | 759.1 |
| `constant` | 675.0 | 284.4 | 170.5 | 537.2 | 958.5 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `body`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `hybrid-medium-hand` | `transformer-medium-hand` | `learner.body` hybrid (the base has transformer); `learner.convs` 2; `learner.depth` 5 (the base has 8) | 958,941 rows | 274.8 (273.3 to 276.3) | 270.2 | **+20.11 (+19.02 to +21.17)** | 11 min |
| `transformer-large-hand` | `transformer-medium-hand` | `learner.depth` 12 (the base has 8); `learner.dim` 384 (the base has 256) | 958,941 rows | 278.1 (276.5 to 279.4) | 270.2 | **+16.87 (+16.09 to +17.61)** | 27 min |

### `features`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-no-setup` | `gbm-hand` | `learner.without` setup | 958,941 rows | 294.5 (293.2 to 295.8) | 294.9 | **+0.3899 (+0.1321 to +0.6536)** | 2 min |
| `gbm-hand-no-pawns` | `gbm-hand` | `learner.without` pawns | 958,941 rows | 295.3 (293.9 to 296.6) | 294.9 | **-0.3739 (-0.6781 to -0.05792)** | 2 min |
| `gbm-hand-no-hanging` | `gbm-hand` | `learner.without` hanging | 958,941 rows | 296.1 (294.8 to 297.4) | 294.9 | **-1.188 (-1.498 to -0.8885)** | 2 min |
| `gbm-hand-no-kings` | `gbm-hand` | `learner.without` kings | 958,941 rows | 297.2 (295.7 to 298.5) | 294.9 | **-2.236 (-2.615 to -1.898)** | 2 min |
| `gbm-hand-no-material` | `gbm-hand` | `learner.without` material | 958,941 rows | 297.9 (296.4 to 299.2) | 294.9 | **-2.932 (-3.343 to -2.488)** | 2 min |
| `gbm-hand-no-first-move` | `gbm-hand` | `learner.without` first-move | 958,941 rows | 307.0 (305.6 to 308.3) | 294.9 | **-12.08 (-12.62 to -11.57)** | 76 s |
| `gbm-hand-no-mobility` | `gbm-hand` | `learner.without` mobility | 958,941 rows | 310.3 (308.8 to 311.6) | 294.9 | **-15.33 (-15.93 to -14.63)** | 2 min |
| `gbm-hand-no-line` | `gbm-hand` | `learner.without` line | 958,941 rows | 338.5 (337.0 to 340.1) | 294.9 | **-43.58 (-44.61 to -42.57)** | 76 s |

### `games`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-half` | `transformer-medium-hand` | `data.train_share` 0.5; `train.epochs` 24 (the base has 12); `train.patience` 6 (the base has 3) | 479,337 rows | 279.4 (277.9 to 280.8) | 270.2 | **+15.57 (+14.58 to +16.57)** | 13 min |
| `transformer-medium-hand-quarter` | `transformer-medium-hand` | `data.train_share` 0.25; `train.epochs` 48 (the base has 12); `train.patience` 12 (the base has 3) | 239,621 rows | 291.5 (290.0 to 292.9) | 270.2 | **+3.393 (+2.517 to +4.234)** | 9 min |
| `gbm-hand-half` | `gbm-hand` | `data.train_share` 0.5 | 479,337 rows | 298.6 (297.1 to 299.8) | 294.9 | **-3.629 (-3.963 to -3.324)** | 40 s |
| `gbm-hand-quarter` | `gbm-hand` | `data.train_share` 0.25 | 239,621 rows | 302.2 (300.7 to 303.4) | 294.9 | **-7.228 (-7.651 to -6.849)** | 22 s |

### `geometry`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-no-geometry` | `transformer-medium-hand` | `learner.geometry` False | 958,941 rows | 274.0 (272.5 to 275.3) | 270.2 | **+20.96 (+20.07 to +21.89)** | 13 min |
