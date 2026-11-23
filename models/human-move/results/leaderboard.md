# human-move: leaderboard

Written by `lab eval human-move` from the run records in this folder.

- **Predicts:** the chance that each legal move is the one the player makes.
- **Data:** `game-positions-2026-10`, 698,013 rows (test 68,579, train 594,940, valid 34,494) from https://database.lichess.org/standard/lichess_db_standard_rated_2026-10.pgn.zst (CC0 1.0, database.lichess.org), built 2026-11-22T20:51:48Z at lab commit `8c77161`.
- **Test set:** 68,579 rows from 2,944 games, never seen in training or in choosing an epoch.
- **Ranked by:** First right (higher is better), with its 95% interval over resampled games.
- **A row's answer is a move:** which of the position's legal moves was played, and a run gives each a chance that add up to one. First right is how often the move given the highest chance is the one played, in the first three how often it is among the three highest, and log loss is the mean of minus the log of the chance given to the move played. A promotion to any piece is one move.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | First right | In the first three | Log loss | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|
| `maia2` | Maia-2 as published, its rapid model: nothing is fitted here | 0.5172 (0.5133 to 0.5212) | 0.7998 | 1.486 | **+0.1192 (+0.115 to +0.1231)** | 23,297,486 | NVIDIA A100-SXM4-80GB | 58 s |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.4712 (0.4670 to 0.4751) | 0.7521 | 1.676 | **+0.07313 (+0.06934 to +0.0767)** | 6,553,920 | NVIDIA A100-SXM4-80GB | 8 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.4704 (0.4663 to 0.4744) | 0.7503 | 1.682 | **+0.07233 (+0.06868 to +0.07578)** | 861,856 | NVIDIA A100-SXM4-80GB | 5 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.4694 (0.4653 to 0.4736) | 0.7471 | 1.690 | **+0.07136 (+0.06771 to +0.07477)** | 6,557,248 | NVIDIA A100-SXM4-80GB | 8 min |
| `conv-small` | conv, 6 layers of width 96 | 0.4405 (0.4365 to 0.4446) | 0.7205 | 1.810 | **+0.04243 (+0.03875 to +0.04583)** | 1,031,328 | NVIDIA A100-SXM4-80GB | 3 min |
| `gbm-hand` | LightGBM on a row a legal move: what moves and where, context and hand features and what a person would count of the move | 0.3980 (0.3941 to 0.4022) | 0.6540 | 2.038 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 5 min |
| `gbm-context` | LightGBM on a row a legal move: what moves and where, context numbers only | 0.2855 (0.2820 to 0.2892) | 0.4764 | 2.643 | **-0.1126 (-0.1162 to -0.109)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 54 s |
| `constant` | the same chance for every legal move | 0.0643 (0.0632 to 0.0656) | 0.1609 | 3.280 | **-0.3337 (-0.3377 to -0.3297)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 s |

## First right by band

| Run | <1100 | 1100-1400 | 1400-1700 | 1700-2000 | 2000+ |
|---|---|---|---|---|---|
| `maia2` | 0.4641 | 0.5094 | 0.5350 | 0.5323 | 0.5358 |
| `transformer-medium` | 0.4509 | 0.4790 | 0.4808 | 0.4723 | 0.4545 |
| `transformer-small` | 0.4482 | 0.4794 | 0.4818 | 0.4687 | 0.4545 |
| `transformer-medium-hand` | 0.4530 | 0.4783 | 0.4784 | 0.4677 | 0.4517 |
| `conv-small` | 0.4274 | 0.4487 | 0.4525 | 0.4317 | 0.4256 |
| `gbm-hand` | 0.3962 | 0.4136 | 0.4037 | 0.3873 | 0.3705 |
| `gbm-context` | 0.2869 | 0.3021 | 0.2826 | 0.2782 | 0.2669 |
| `constant` | 0.0735 | 0.0669 | 0.0638 | 0.0594 | 0.0561 |
| rows | 10,712 | 16,674 | 19,614 | 14,453 | 7,126 |

## Calibration of `maia2`

Every legal move of every test row, in ten equal groups by its predicted chance: what the model said against how often the move was the one played.

| Predicted | Happened | Rows |
|---|---|---|
| 0.0% | 0.0% | 215,883 |
| 0.0% | 0.0% | 215,882 |
| 0.0% | 0.0% | 215,882 |
| 0.0% | 0.0% | 215,882 |
| 0.1% | 0.1% | 215,882 |
| 0.2% | 0.1% | 215,882 |
| 0.4% | 0.4% | 215,882 |
| 1.0% | 1.0% | 215,882 |
| 3.4% | 3.5% | 215,882 |
| 26.7% | 26.7% | 215,882 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `games`

| Run | The run it changes | What it changes | Trained on | First right | That run's First right | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-half` | `transformer-medium` | `data.train_share` 0.5; `train.epochs` 24 (the base has 12); `train.patience` 6 (the base has 3) | 299,955 rows | 0.4532 (0.4493 to 0.4568) | 0.4712 | **+0.05513 (+0.05171 to +0.05861)** | 8 min |
| `transformer-medium-quarter` | `transformer-medium` | `data.train_share` 0.25; `train.epochs` 48 (the base has 12); `train.patience` 12 (the base has 3) | 151,209 rows | 0.4258 (0.4220 to 0.4295) | 0.4712 | **+0.02775 (+0.02403 to +0.03114)** | 7 min |

### `ratings`

| Run | The run it changes | What it changes | Trained on | First right | That run's First right | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `maia2-one-rating` | `maia2` | `learner.against` 1500 (the base has opponent_elo); `learner.player` 1500 (the base has mover_elo) | 594,940 rows | 0.5100 (0.5059 to 0.5139) | 0.5172 | **+0.112 (+0.1075 to +0.1159)** | 57 s |
