# think-time: leaderboard

Written by `lab eval think-time` from the run records in this folder.

- **Predicts:** log(1 + seconds spent on the move).
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T13:43:02Z at lab commit `36a0ad9`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** MAE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | MAE | RMSE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | transformer, 8 layers of width 256, with hand features, started from `position-evaluation/transformer-medium` | 0.6089 (0.6042 to 0.6138) | 0.7772 | 0.3323 | 0.5758 | **+0.02164 (+0.01944 to +0.0239)** | 6,557,249 | NVIDIA A100-SXM4-40GB | 9 min |
| `transformer-medium-pretrained` | transformer, 8 layers of width 256, started from `position-evaluation/transformer-medium` | 0.6098 (0.6051 to 0.6145) | 0.7777 | 0.3314 | 0.5739 | **+0.02074 (+0.01859 to +0.02273)** | 6,553,921 | NVIDIA A100-SXM4-40GB | 9 min |
| `conv-medium-hand` | conv, 10 layers of width 192, each block weighing its channels by the whole board, with hand features | 0.6137 (0.6087 to 0.6183) | 0.7817 | 0.3246 | 0.5657 | **+0.01688 (+0.01496 to +0.01881)** | 6,936,673 | NVIDIA A100-SXM4-40GB | 4 min |
| `transformer-medium-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks | 0.6148 (0.6098 to 0.6195) | 0.7820 | 0.3240 | 0.5623 | **+0.01574 (+0.01364 to +0.01746)** | 6,554,177 | NVIDIA A100-SXM4-40GB | 11 min |
| `transformer-medium-hand-quadruple` | transformer, 8 layers of width 256, with hand features; trained on 2,371,230 rows of the larger build `game-positions-2026-10-120k` | 0.6179 (0.6128 to 0.6225) | 0.7855 | 0.3179 | 0.5561 | **+0.01268 (+0.01115 to +0.01407)** | 6,557,249 | NVIDIA A100-SXM4-40GB | 9 min |
| `transformer-medium-hand-double` | transformer, 8 layers of width 256, with hand features; trained on 1,189,017 rows of the larger build `game-positions-2026-10-120k` | 0.6184 (0.6133 to 0.6230) | 0.7863 | 0.3166 | 0.5551 | **+0.01218 (+0.01059 to +0.01358)** | 6,557,249 | NVIDIA A100-SXM4-40GB | 9 min |
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 0.6185 (0.6134 to 0.6231) | 0.7875 | 0.3144 | 0.5569 | **+0.01205 (+0.01018 to +0.01388)** | 6,557,249 | NVIDIA A100-SXM4-80GB | 16 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.6200 (0.6148 to 0.6246) | 0.7884 | 0.3129 | 0.5530 | **+0.01063 (+0.009066 to +0.01214)** | 6,557,249 | NVIDIA A100-SXM4-80GB | 8 min |
| `gbm-hand-quadruple` | LightGBM, context and hand features; trained on 2,371,230 rows of the larger build `game-positions-2026-10-120k` | 0.6270 (0.6219 to 0.6315) | 0.7954 | 0.3007 | 0.5378 | **+0.00363 (+0.002971 to +0.004316)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 0.6280 (0.6228 to 0.6328) | 0.7979 | 0.2963 | 0.5372 | **+0.002601 (+0.0002087 to +0.004526)** | 6,553,921 | NVIDIA A100-SXM4-80GB | 16 min |
| `gbm-hand-double` | LightGBM, context and hand features; trained on 1,189,017 rows of the larger build `game-positions-2026-10-120k` | 0.6283 (0.6232 to 0.6328) | 0.7967 | 0.2983 | 0.5357 | **+0.002297 (+0.001541 to +0.003013)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 54 s |
| `transformer-small` | transformer, 4 layers of width 128 | 0.6287 (0.6233 to 0.6334) | 0.7975 | 0.2969 | 0.5372 | +0.001931 (-0.0002074 to +0.003677) | 861,857 | NVIDIA A100-SXM4-80GB | 3 min |
| `conv-small` | conv, 6 layers of width 96 | 0.6292 (0.6236 to 0.6344) | 0.7994 | 0.2935 | 0.5384 | +0.001397 (-0.001706 to +0.003967) | 1,031,329 | NVIDIA A100-SXM4-80GB | 2 min |
| `gbm-hand` | LightGBM, context and hand features | 0.6306 (0.6255 to 0.6352) | 0.7992 | 0.2939 | 0.5322 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 39 s |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.6327 (0.6277 to 0.6374) | 0.8020 | 0.2889 | 0.5286 | **-0.002127 (-0.004274 to -0.0003426)** | 6,553,921 | NVIDIA A100-SXM4-80GB | 8 min |
| `gbm-context` | LightGBM, context numbers only | 0.6794 (0.6737 to 0.6846) | 0.8536 | 0.1945 | 0.4265 | **-0.04885 (-0.05155 to -0.04637)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 s |
| `constant` | one number for every row | 0.7724 (0.7661 to 0.7789) | 0.9511 | -0.0000 | n/a | **-0.1418 (-0.1474 to -0.1367)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## MAE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | 0.5814 | 0.5883 | 0.6061 | 0.6283 | 0.6669 |
| `transformer-medium-pretrained` | 0.5840 | 0.5892 | 0.6095 | 0.6252 | 0.6668 |
| `conv-medium-hand` | 0.5875 | 0.5961 | 0.6086 | 0.6325 | 0.6702 |
| `transformer-medium-attacks` | 0.5864 | 0.5955 | 0.6119 | 0.6339 | 0.6724 |
| `transformer-medium-hand-quadruple` | 0.5905 | 0.6018 | 0.6127 | 0.6346 | 0.6773 |
| `transformer-medium-hand-double` | 0.5916 | 0.6020 | 0.6130 | 0.6357 | 0.6767 |
| `transformer-medium-hand-long` | 0.5927 | 0.6017 | 0.6138 | 0.6367 | 0.6730 |
| `transformer-medium-hand` | 0.5920 | 0.6031 | 0.6152 | 0.6373 | 0.6793 |
| `gbm-hand-quadruple` | 0.5979 | 0.6101 | 0.6231 | 0.6455 | 0.6831 |
| `transformer-medium-long` | 0.6051 | 0.6107 | 0.6249 | 0.6440 | 0.6788 |
| `gbm-hand-double` | 0.6000 | 0.6110 | 0.6241 | 0.6464 | 0.6860 |
| `transformer-small` | 0.6052 | 0.6105 | 0.6250 | 0.6451 | 0.6830 |
| `conv-small` | 0.5981 | 0.6093 | 0.6250 | 0.6514 | 0.6889 |
| `gbm-hand` | 0.6028 | 0.6133 | 0.6262 | 0.6480 | 0.6896 |
| `transformer-medium` | 0.6092 | 0.6160 | 0.6296 | 0.6483 | 0.6840 |
| `gbm-context` | 0.6401 | 0.6599 | 0.6790 | 0.7036 | 0.7365 |
| `constant` | 0.7173 | 0.7424 | 0.7760 | 0.8058 | 0.8474 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `attacks`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-attacks` | `transformer-medium-hand` | `learner.attacks` True | 594,940 rows | 0.6194 (0.6142 to 0.6240) | 0.6200 | **+0.01121 (+0.009634 to +0.0127)** | 11 min |

### `body`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `hybrid-medium-hand` | `transformer-medium-hand` | `learner.body` hybrid (the base has transformer); `learner.convs` 2; `learner.depth` 5 (the base has 8) | 594,940 rows | 0.6207 (0.6155 to 0.6253) | 0.6200 | **+0.009835 (+0.00808 to +0.01155)** | 7 min |

### `features`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-no-pawns` | `gbm-hand` | `learner.without` pawns | 594,940 rows | 0.6305 (0.6253 to 0.6352) | 0.6306 | +0.0001036 (-0.000392 to +0.0006039) | 14 s |
| `gbm-hand-no-kings` | `gbm-hand` | `learner.without` kings | 594,940 rows | 0.6327 (0.6276 to 0.6373) | 0.6306 | **-0.002082 (-0.002836 to -0.001288)** | 13 s |
| `gbm-hand-no-mobility` | `gbm-hand` | `learner.without` mobility | 594,940 rows | 0.6387 (0.6336 to 0.6435) | 0.6306 | **-0.008161 (-0.009225 to -0.007152)** | 10 s |
| `gbm-hand-no-hanging` | `gbm-hand` | `learner.without` hanging | 594,940 rows | 0.6402 (0.6350 to 0.6449) | 0.6306 | **-0.009655 (-0.01084 to -0.008394)** | 16 s |
| `gbm-hand-no-material` | `gbm-hand` | `learner.without` material | 594,940 rows | 0.6447 (0.6394 to 0.6496) | 0.6306 | **-0.0141 (-0.01551 to -0.01277)** | 10 s |

### `games`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-half` | `transformer-medium-hand` | `data.train_share` 0.5; `train.epochs` 24 (the base has 12); `train.patience` 6 (the base has 3) | 299,955 rows | 0.6257 (0.6205 to 0.6305) | 0.6200 | **+0.004893 (+0.003193 to +0.006495)** | 7 min |
| `gbm-hand-half` | `gbm-hand` | `data.train_share` 0.5 | 299,955 rows | 0.6321 (0.6270 to 0.6368) | 0.6306 | **-0.001566 (-0.002294 to -0.0009242)** | 9 s |
| `transformer-medium-hand-quarter` | `transformer-medium-hand` | `data.train_share` 0.25; `train.epochs` 48 (the base has 12); `train.patience` 12 (the base has 3) | 151,209 rows | 0.6325 (0.6275 to 0.6372) | 0.6200 | **-0.001933 (-0.00388 to -0.0001612)** | 6 min |
| `gbm-hand-quarter` | `gbm-hand` | `data.train_share` 0.25 | 151,209 rows | 0.6352 (0.6299 to 0.6400) | 0.6306 | **-0.004568 (-0.005568 to -0.003614)** | 4 s |

### `geometry`

| Run | The run it changes | What it changes | Trained on | MAE | That run's MAE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-no-geometry` | `transformer-medium-hand` | `learner.geometry` False | 594,940 rows | 0.6202 (0.6149 to 0.6249) | 0.6200 | **+0.01041 (+0.008929 to +0.01194)** | 9 min |
