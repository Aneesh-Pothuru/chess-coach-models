# practical-chances: leaderboard

Written by `lab eval practical-chances` from the run records in this folder.

- **Predicts:** expected score of the mover in the game (a win 1, a draw 0.5, a loss 0).
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T05:45:24Z at lab commit `3a74aa4`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `conv-small` | conv, 6 layers of width 96 | 0.4235 (0.4183 to 0.4291) | 0.3639 | 0.2578 | 0.5025 | +0.0001616 (-0.001151 to +0.001411) | 1,031,425 | NVIDIA A100-SXM4-80GB | 2 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.4235 (0.4181 to 0.4294) | 0.3586 | 0.2578 | 0.5024 | +0.0001574 (-0.001199 to +0.001565) | 861,985 | NVIDIA A100-SXM4-80GB | 3 min |
| `gbm-hand` | LightGBM, context and hand features | 0.4237 (0.4184 to 0.4294) | 0.3618 | 0.2572 | 0.5016 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 10 s |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.4244 (0.4193 to 0.4300) | 0.3670 | 0.2546 | 0.4995 | -0.0007413 (-0.002056 to +0.0005804) | 6,554,177 | NVIDIA A100-SXM4-80GB | 5 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.4249 (0.4200 to 0.4303) | 0.3703 | 0.2529 | 0.4986 | -0.00122 (-0.002381 to +7.052e-06) | 6,557,505 | NVIDIA A100-SXM4-80GB | 5 min |
| `gbm-context` | LightGBM, context numbers only | 0.4260 (0.4206 to 0.4319) | 0.3650 | 0.2492 | 0.4936 | **-0.002288 (-0.003088 to -0.001502)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 4 s |
| `engine-curve` | the column `win_before`, times 0.01 | 0.4373 (0.4313 to 0.4439) | 0.3487 | 0.2086 | 0.4780 | **-0.01365 (-0.01612 to -0.01124)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |
| `constant` | one number for every row | 0.4916 (0.4899 to 0.4932) | 0.4834 | -0.0000 | n/a | **-0.06791 (-0.07324 to -0.06205)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |
| `elo-gap` | the rating formula on `mover_elo` against `opponent_elo` | 0.4967 (0.4918 to 0.5016) | 0.4749 | -0.0207 | 0.0974 | **-0.07298 (-0.07949 to -0.06664)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## RMSE by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `conv-small` | 0.4247 | 0.4268 | 0.4272 | 0.4308 | 0.3875 |
| `transformer-small` | 0.4241 | 0.4263 | 0.4279 | 0.4308 | 0.3877 |
| `gbm-hand` | 0.4269 | 0.4269 | 0.4260 | 0.4306 | 0.3895 |
| `transformer-medium` | 0.4254 | 0.4275 | 0.4281 | 0.4318 | 0.3893 |
| `transformer-medium-hand` | 0.4246 | 0.4289 | 0.4276 | 0.4315 | 0.3940 |
| `gbm-context` | 0.4303 | 0.4285 | 0.4282 | 0.4330 | 0.3918 |
| `engine-curve` | 0.4524 | 0.4401 | 0.4383 | 0.4370 | 0.4045 |
| `constant` | 0.4917 | 0.4949 | 0.4925 | 0.4917 | 0.4809 |
| `elo-gap` | 0.4965 | 0.5040 | 0.5002 | 0.4984 | 0.4655 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `features`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-no-kings` | `gbm-hand` | `learner.without` kings | 594,940 rows | 0.4238 (0.4185 to 0.4295) | 0.4237 | -0.0001212 (-0.0005159 to +0.0002695) | 6 s |
| `gbm-hand-no-pawns` | `gbm-hand` | `learner.without` pawns | 594,940 rows | 0.4238 (0.4184 to 0.4295) | 0.4237 | -0.0001402 (-0.0005229 to +0.0002233) | 7 s |
| `gbm-hand-no-hanging` | `gbm-hand` | `learner.without` hanging | 594,940 rows | 0.4239 (0.4186 to 0.4297) | 0.4237 | -0.0002129 (-0.0005567 to +0.0001509) | 7 s |
| `gbm-hand-no-mobility` | `gbm-hand` | `learner.without` mobility | 594,940 rows | 0.4242 (0.4188 to 0.4302) | 0.4237 | **-0.00055 (-0.001078 to -4.266e-05)** | 9 s |
| `gbm-hand-no-material` | `gbm-hand` | `learner.without` material | 594,940 rows | 0.4254 (0.4200 to 0.4313) | 0.4237 | **-0.001706 (-0.002365 to -0.001093)** | 6 s |

### `games`

| Run | The run it changes | What it changes | Trained on | RMSE | That run's RMSE | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-half` | `gbm-hand` | `data.train_share` 0.5 | 299,955 rows | 0.4242 (0.4189 to 0.4297) | 0.4237 | -0.0004752 (-0.00135 to +0.0003377) | 5 s |
| `gbm-hand-quarter` | `gbm-hand` | `data.train_share` 0.25 | 151,209 rows | 0.4244 (0.4191 to 0.4299) | 0.4237 | -0.0006815 (-0.001737 to +0.0004166) | 2 s |
| `transformer-medium-hand-half` | `transformer-medium-hand` | `data.train_share` 0.5; `train.epochs` 24 (the base has 12); `train.patience` 6 (the base has 3) | 299,955 rows | 0.4259 (0.4211 to 0.4310) | 0.4249 | **-0.002243 (-0.00356 to -0.0008078)** | 5 min |
| `transformer-medium-hand-quarter` | `transformer-medium-hand` | `data.train_share` 0.25; `train.epochs` 48 (the base has 12); `train.patience` 12 (the base has 3) | 151,209 rows | 0.4276 (0.4228 to 0.4327) | 0.4249 | **-0.003917 (-0.00525 to -0.002496)** | 3 min |
