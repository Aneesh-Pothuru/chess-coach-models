# tactic-found: leaderboard

Written by `lab eval tactic-found` from the run records in this folder.

- **Predicts:** chance the move played is the first move of the tactic.
- **Data:** `tactics-v1`, 810,140 rows (test 81,135, train 688,480, valid 40,525) from https://huggingface.co/datasets/Lichess/chess-puzzles-with-games/tree/3510a01f320eaaab7b7775ebc73afcfe0b33b4c2 (CC0 1.0, huggingface.co/datasets/Lichess/chess-puzzles-with-games), built 2026-11-22T13:52:00Z at lab commit `36a0ad9`.
- **Test set:** 81,135 rows from 81,135 games, never seen in training or in choosing an epoch.
- **Ranked by:** Log loss (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | Log loss | PR-AUC | ROC-AUC | Brier | Calibration error | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | transformer, 8 layers of width 256, with hand features, started from `position-evaluation/transformer-medium` | 0.5287 (0.5254 to 0.5321) | 0.8667 | 0.7513 | 0.1778 | 0.0047 | **+0.01263 (+0.01105 to +0.01423)** | 6,565,953 | NVIDIA A100-SXM4-40GB | 9 min |
| `transformer-medium-pretrained` | transformer, 8 layers of width 256, started from `position-evaluation/transformer-medium` | 0.5329 (0.5295 to 0.5362) | 0.8628 | 0.7460 | 0.1793 | 0.0050 | **+0.008507 (+0.006708 to +0.01035)** | 6,557,505 | NVIDIA A100-SXM4-40GB | 9 min |
| `conv-medium-hand` | conv, 10 layers of width 192, each block weighing its channels by the whole board, with hand features | 0.5337 (0.5306 to 0.5370) | 0.8627 | 0.7450 | 0.1797 | 0.0036 | **+0.007625 (+0.006176 to +0.009063)** | 6,960,097 | NVIDIA A100-SXM4-40GB | 4 min |
| `transformer-medium-hand-double` | transformer, 8 layers of width 256, with hand features; trained on 1,377,614 rows of the larger build `tactics-all-v1` | 0.5348 (0.5316 to 0.5381) | 0.8616 | 0.7428 | 0.1802 | 0.0041 | **+0.006574 (+0.005468 to +0.007825)** | 6,565,953 | NVIDIA A100-SXM4-40GB | 11 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.5369 (0.5338 to 0.5402) | 0.8599 | 0.7399 | 0.1810 | 0.0050 | **+0.004443 (+0.003247 to +0.00573)** | 6,565,953 | NVIDIA A100-SXM4-40GB | 10 min |
| `transformer-medium-hand-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks, with hand features | 0.5370 (0.5338 to 0.5403) | 0.8599 | 0.7398 | 0.1811 | 0.0052 | **+0.004397 (+0.003211 to +0.005691)** | 6,566,209 | NVIDIA A100-SXM4-40GB | 13 min |
| `transformer-medium-hand-long` | transformer, 8 layers of width 256, with hand features | 0.5373 (0.5339 to 0.5407) | 0.8599 | 0.7401 | 0.1812 | 0.0053 | **+0.004086 (+0.002865 to +0.005432)** | 6,565,953 | NVIDIA A100-SXM4-80GB | 12 min |
| `gbm-hand-double` | LightGBM, context and hand features; trained on 1,377,614 rows of the larger build `tactics-all-v1` | 0.5381 (0.5349 to 0.5416) | 0.8590 | 0.7381 | 0.1816 | 0.0048 | **+0.003246 (+0.002618 to +0.003861)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `hybrid-medium-hand` | hybrid, 2 conv blocks then 5 transformer layers of width 256, with hand features | 0.5398 (0.5367 to 0.5431) | 0.8574 | 0.7357 | 0.1822 | 0.0018 | **+0.001587 (+0.0002998 to +0.002928)** | 6,620,457 | NVIDIA A100-SXM4-40GB | 8 min |
| `gbm-hand` | LightGBM, context and hand features | 0.5414 (0.5381 to 0.5447) | 0.8560 | 0.7337 | 0.1828 | 0.0043 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 65 s |
| `transformer-medium-long` | transformer, 8 layers of width 256 | 0.5502 (0.5472 to 0.5536) | 0.8456 | 0.7197 | 0.1861 | 0.0028 | **-0.008867 (-0.01048 to -0.007188)** | 6,557,505 | NVIDIA A100-SXM4-80GB | 14 min |
| `conv-small` | conv, 6 layers of width 96 | 0.5513 (0.5484 to 0.5546) | 0.8462 | 0.7198 | 0.1866 | 0.0078 | **-0.009968 (-0.01184 to -0.008098)** | 1,041,121 | NVIDIA A100-SXM4-40GB | 2 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.5517 (0.5486 to 0.5551) | 0.8447 | 0.7174 | 0.1867 | 0.0040 | **-0.01037 (-0.01199 to -0.008681)** | 6,557,505 | NVIDIA A100-SXM4-40GB | 10 min |
| `transformer-medium-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks | 0.5518 (0.5488 to 0.5552) | 0.8442 | 0.7171 | 0.1867 | 0.0029 | **-0.01048 (-0.01211 to -0.008814)** | 6,557,761 | NVIDIA A100-SXM4-40GB | 13 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.5531 (0.5500 to 0.5563) | 0.8442 | 0.7153 | 0.1874 | 0.0041 | **-0.01175 (-0.0134 to -0.01015)** | 863,649 | NVIDIA A100-SXM4-40GB | 3 min |
| `puzzle-rating` | the rating formula on `mover_elo` against `rating` | 0.5889 (0.5858 to 0.5920) | 0.7869 | 0.6570 | 0.2008 | 0.0171 | **-0.04753 (-0.04996 to -0.04484)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |
| `gbm-context` | LightGBM, context numbers only | 0.5923 (0.5894 to 0.5953) | 0.7961 | 0.6369 | 0.2035 | 0.0050 | **-0.05098 (-0.05289 to -0.04909)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 s |
| `constant` | one number for every row | 0.6203 (0.6177 to 0.6229) | 0.6884 | 0.5000 | 0.2145 | 0.0056 | **-0.07898 (-0.08142 to -0.07655)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 1 s |

## Log loss by band

| Run | <1700 | 1700-1899 | 1900-2099 | 2100-2299 | 2300+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | 0.5401 | 0.5360 | 0.5165 | 0.5121 | 0.5281 |
| `transformer-medium-pretrained` | 0.5446 | 0.5414 | 0.5190 | 0.5143 | 0.5326 |
| `conv-medium-hand` | 0.5456 | 0.5409 | 0.5223 | 0.5179 | 0.5306 |
| `transformer-medium-hand-double` | 0.5472 | 0.5432 | 0.5212 | 0.5185 | 0.5315 |
| `transformer-medium-hand` | 0.5484 | 0.5446 | 0.5239 | 0.5214 | 0.5355 |
| `transformer-medium-hand-attacks` | 0.5487 | 0.5446 | 0.5239 | 0.5214 | 0.5354 |
| `transformer-medium-hand-long` | 0.5501 | 0.5453 | 0.5243 | 0.5194 | 0.5350 |
| `gbm-hand-double` | 0.5515 | 0.5463 | 0.5258 | 0.5176 | 0.5353 |
| `hybrid-medium-hand` | 0.5536 | 0.5480 | 0.5258 | 0.5223 | 0.5367 |
| `gbm-hand` | 0.5563 | 0.5491 | 0.5291 | 0.5206 | 0.5377 |
| `transformer-medium-long` | 0.5654 | 0.5588 | 0.5362 | 0.5295 | 0.5469 |
| `conv-small` | 0.5676 | 0.5581 | 0.5389 | 0.5298 | 0.5492 |
| `transformer-medium` | 0.5658 | 0.5605 | 0.5384 | 0.5310 | 0.5483 |
| `transformer-medium-attacks` | 0.5663 | 0.5608 | 0.5387 | 0.5300 | 0.5482 |
| `transformer-small` | 0.5682 | 0.5619 | 0.5394 | 0.5312 | 0.5498 |
| `puzzle-rating` | 0.6049 | 0.5923 | 0.5722 | 0.5705 | 0.6021 |
| `gbm-context` | 0.6123 | 0.6033 | 0.5797 | 0.5620 | 0.5809 |
| `constant` | 0.6428 | 0.6266 | 0.6090 | 0.5989 | 0.6080 |
| rows | 15,408 | 28,346 | 18,674 | 8,845 | 9,862 |

## Calibration of `transformer-medium-hand-pretrained`

Test rows in ten equal groups by predicted chance: what the model said against what happened.

| Predicted | Happened | Rows |
|---|---|---|
| 30.2% | 30.8% | 8,114 |
| 48.3% | 47.7% | 8,114 |
| 57.2% | 57.0% | 8,114 |
| 63.8% | 63.7% | 8,114 |
| 69.2% | 67.9% | 8,114 |
| 74.0% | 74.1% | 8,113 |
| 78.6% | 78.3% | 8,113 |
| 83.3% | 83.4% | 8,113 |
| 88.7% | 89.7% | 8,113 |
| 96.1% | 95.9% | 8,113 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `features`

| Run | The run it changes | What it changes | Trained on | Log loss | That run's Log loss | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-no-pawns` | `gbm-hand` | `learner.without` pawns | 688,480 rows | 0.5415 (0.5383 to 0.5448) | 0.5414 | -0.0001288 (-0.0006863 to +0.0004111) | 25 s |
| `gbm-hand-no-kings` | `gbm-hand` | `learner.without` kings | 688,480 rows | 0.5416 (0.5385 to 0.5450) | 0.5414 | -0.0002682 (-0.0008292 to +0.0004065) | 25 s |
| `gbm-hand-no-material` | `gbm-hand` | `learner.without` material | 688,480 rows | 0.5437 (0.5405 to 0.5470) | 0.5414 | **-0.00231 (-0.003004 to -0.00162)** | 25 s |
| `gbm-hand-no-setup` | `gbm-hand` | `learner.without` setup | 688,480 rows | 0.5440 (0.5409 to 0.5473) | 0.5414 | **-0.002627 (-0.003304 to -0.001918)** | 25 s |
| `gbm-hand-no-hanging` | `gbm-hand` | `learner.without` hanging | 688,480 rows | 0.5443 (0.5410 to 0.5476) | 0.5414 | **-0.002901 (-0.003627 to -0.002214)** | 23 s |
| `gbm-hand-no-mobility` | `gbm-hand` | `learner.without` mobility | 688,480 rows | 0.5452 (0.5421 to 0.5486) | 0.5414 | **-0.003835 (-0.004692 to -0.003019)** | 24 s |
| `gbm-hand-no-line` | `gbm-hand` | `learner.without` line | 688,480 rows | 0.5465 (0.5435 to 0.5501) | 0.5414 | **-0.005165 (-0.005955 to -0.004403)** | 17 s |
| `gbm-hand-no-first-move` | `gbm-hand` | `learner.without` first-move | 688,480 rows | 0.5547 (0.5516 to 0.5578) | 0.5414 | **-0.0133 (-0.01438 to -0.01216)** | 20 s |

### `games`

| Run | The run it changes | What it changes | Trained on | Log loss | That run's Log loss | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-half` | `transformer-medium-hand` | `data.train_share` 0.5; `train.epochs` 24 (the base has 12); `train.patience` 6 (the base has 3) | 344,236 rows | 0.5440 (0.5409 to 0.5473) | 0.5369 | **-0.002645 (-0.00385 to -0.001324)** | 7 min |
| `gbm-hand-half` | `gbm-hand` | `data.train_share` 0.5 | 344,236 rows | 0.5444 (0.5412 to 0.5477) | 0.5414 | **-0.003016 (-0.003711 to -0.002343)** | 14 s |
| `gbm-hand-quarter` | `gbm-hand` | `data.train_share` 0.25 | 171,616 rows | 0.5485 (0.5451 to 0.5518) | 0.5414 | **-0.007085 (-0.007907 to -0.006232)** | 6 s |
| `transformer-medium-hand-quarter` | `transformer-medium-hand` | `data.train_share` 0.25; `train.epochs` 48 (the base has 12); `train.patience` 12 (the base has 3) | 171,616 rows | 0.5518 (0.5486 to 0.5552) | 0.5369 | **-0.01045 (-0.01159 to -0.009122)** | 4 min |

### `geometry`

| Run | The run it changes | What it changes | Trained on | Log loss | That run's Log loss | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-no-geometry` | `transformer-medium-hand` | `learner.geometry` False | 688,480 rows | 0.5371 (0.5339 to 0.5404) | 0.5369 | **+0.004314 (+0.003141 to +0.005614)** | 10 min |
