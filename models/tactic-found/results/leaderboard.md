# tactic-found: leaderboard

Written by `lab eval tactic-found` from the run records in this folder.

- **Predicts:** chance the move played is the first move of the tactic.
- **Data:** `tactics-v1`, 810,140 rows (test 81,135, train 688,480, valid 40,525) from https://huggingface.co/datasets/Lichess/chess-puzzles-with-games/tree/3510a01f320eaaab7b7775ebc73afcfe0b33b4c2 (CC0 1.0, huggingface.co/datasets/Lichess/chess-puzzles-with-games), built 2026-11-22T03:16:08Z at lab commit `b91c606`.
- **Test set:** 81,135 rows from 81,135 games, never seen in training or in choosing an epoch.
- **Ranked by:** Log loss (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | Log loss | PR-AUC | ROC-AUC | Brier | Calibration error | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.5369 (0.5338 to 0.5402) | 0.8599 | 0.7399 | 0.1810 | 0.0050 | **+0.004443 (+0.003247 to +0.00573)** | 6,565,953 | NVIDIA A100-SXM4-40GB | 10 min |
| `gbm-hand` | LightGBM, context and hand features | 0.5414 (0.5381 to 0.5447) | 0.8560 | 0.7337 | 0.1828 | 0.0043 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 31 s |
| `conv-small` | conv, 6 layers of width 96 | 0.5513 (0.5484 to 0.5546) | 0.8462 | 0.7198 | 0.1866 | 0.0078 | **-0.009968 (-0.01184 to -0.008098)** | 1,041,121 | NVIDIA A100-SXM4-40GB | 2 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.5517 (0.5486 to 0.5551) | 0.8447 | 0.7174 | 0.1867 | 0.0040 | **-0.01037 (-0.01199 to -0.008681)** | 6,557,505 | NVIDIA A100-SXM4-40GB | 10 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.5531 (0.5500 to 0.5563) | 0.8442 | 0.7153 | 0.1874 | 0.0041 | **-0.01175 (-0.0134 to -0.01015)** | 863,649 | NVIDIA A100-SXM4-40GB | 3 min |
| `puzzle-rating` | the rating formula on `mover_elo` against `rating` | 0.5889 (0.5858 to 0.5920) | 0.7869 | 0.6570 | 0.2008 | 0.0171 | **-0.04753 (-0.04996 to -0.04484)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |
| `gbm-context` | LightGBM, context numbers only | 0.5923 (0.5894 to 0.5953) | 0.7961 | 0.6369 | 0.2035 | 0.0050 | **-0.05098 (-0.05289 to -0.04909)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 6 s |
| `constant` | one number for every row | 0.6203 (0.6177 to 0.6229) | 0.6884 | 0.5000 | 0.2145 | 0.0056 | **-0.07898 (-0.08142 to -0.07655)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 1 s |

## Log loss by band

| Run | <1700 | 1700-1899 | 1900-2099 | 2100-2299 | 2300+ |
|---|---|---|---|---|---|
| `transformer-medium-hand` | 0.5484 | 0.5446 | 0.5239 | 0.5214 | 0.5355 |
| `gbm-hand` | 0.5563 | 0.5491 | 0.5291 | 0.5206 | 0.5377 |
| `conv-small` | 0.5676 | 0.5581 | 0.5389 | 0.5298 | 0.5492 |
| `transformer-medium` | 0.5658 | 0.5605 | 0.5384 | 0.5310 | 0.5483 |
| `transformer-small` | 0.5682 | 0.5619 | 0.5394 | 0.5312 | 0.5498 |
| `puzzle-rating` | 0.6049 | 0.5923 | 0.5722 | 0.5705 | 0.6021 |
| `gbm-context` | 0.6123 | 0.6033 | 0.5797 | 0.5620 | 0.5809 |
| `constant` | 0.6428 | 0.6266 | 0.6090 | 0.5989 | 0.6080 |
| rows | 15,408 | 28,346 | 18,674 | 8,845 | 9,862 |

## Calibration of `transformer-medium-hand`

Test rows in ten equal groups by predicted chance: what the model said against what happened.

| Predicted | Happened | Rows |
|---|---|---|
| 32.8% | 32.8% | 8,114 |
| 49.4% | 49.0% | 8,114 |
| 57.9% | 57.6% | 8,114 |
| 63.9% | 62.9% | 8,114 |
| 69.0% | 68.7% | 8,114 |
| 73.5% | 72.5% | 8,113 |
| 77.9% | 78.8% | 8,113 |
| 82.4% | 82.5% | 8,113 |
| 87.7% | 88.0% | 8,113 |
| 95.2% | 95.7% | 8,113 |
