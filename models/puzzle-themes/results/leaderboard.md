# puzzle-themes: leaderboard

Written by `lab eval puzzle-themes` from the run records in this folder.

- **Predicts:** probability that the puzzle carries each theme.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-28T06:10:15Z at lab commit `a677087`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** Average precision (higher is better), with its 95% interval over resampled games.
- **A row's answer is a set:** which of 30 tags are right, and a run gives each a chance. Average precision is the mean, over a row's right tags, of the share of right ones among those ranked at least as high; first right is how often the one given the highest chance is right. Both are means over the rows that have a right tag. Log loss reads every chance as a yes or no of its own.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | Average precision | First right | Log loss | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-solution-quadruple` | transformer, 8 layers of width 256, attention told what each piece attacks, with post-move and final solution boards, per-tag Platt, with hand features; trained on 3,837,994 rows of the larger build `puzzles-all-v1` | 0.9970 (0.9967 to 0.9972) | 0.9964 | 0.0059 | **+0.1268 (+0.1251 to +0.1285)** | 6,578,270 | NVIDIA L4 | 109 min |
| `transformer-medium-hand-solution` | transformer, 8 layers of width 256, attention told what each piece attacks, with post-move and final solution boards, per-tag Platt, with hand features | 0.9932 (0.9928 to 0.9936) | 0.9916 | 0.0087 | **+0.123 (+0.1214 to +0.1248)** | 6,578,270 | NVIDIA L4 | 87 min |
| `transformer-medium-hand-attacks` | transformer, 8 layers of width 256, attention told what each piece attacks, per-tag Platt, with hand features | 0.9865 (0.9859 to 0.9871) | 0.9824 | 0.0123 | **+0.1163 (+0.1147 to +0.1181)** | 6,571,358 | NVIDIA L4 | 63 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.9814 (0.9807 to 0.9821) | 0.9749 | 0.0146 | **+0.1113 (+0.1096 to +0.113)** | 6,571,102 | NVIDIA L4 | 52 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.9809 (0.9802 to 0.9815) | 0.9745 | 0.0150 | **+0.1107 (+0.109 to +0.1125)** | 6,562,654 | NVIDIA L4 | 52 min |
| `conv-small` | conv, 6 layers of width 96 | 0.9592 (0.9581 to 0.9602) | 0.9464 | 0.0230 | **+0.08899 (+0.08729 to +0.09075)** | 1,043,070 | NVIDIA L4 | 3 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.9540 (0.9529 to 0.9551) | 0.9362 | 0.0242 | **+0.08385 (+0.08217 to +0.08562)** | 866,238 | NVIDIA L4 | 9 min |
| `gbm-hand` | a LightGBM booster a tag, context and hand features | 0.8702 (0.8684 to 0.8719) | 0.8199 | 0.0443 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 8 min |
| `gbm-context` | a LightGBM booster a tag, context numbers only | 0.4057 (0.4033 to 0.4080) | 0.2641 | 0.1180 | **-0.4644 (-0.4672 to -0.4617)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `constant` | each tag's share of the training rows, for every row | 0.3545 (0.3523 to 0.3567) | 0.2142 | 0.1268 | **-0.5157 (-0.5186 to -0.513)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 12 s |

## Average precision by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-solution-quadruple` | 0.9998 | 0.9990 | 0.9979 | 0.9940 | 0.9880 |
| `transformer-medium-hand-solution` | 0.9994 | 0.9973 | 0.9948 | 0.9870 | 0.9758 |
| `transformer-medium-hand-attacks` | 0.9988 | 0.9948 | 0.9886 | 0.9735 | 0.9550 |
| `transformer-medium-hand` | 0.9969 | 0.9920 | 0.9833 | 0.9653 | 0.9436 |
| `transformer-medium` | 0.9965 | 0.9921 | 0.9832 | 0.9649 | 0.9392 |
| `conv-small` | 0.9933 | 0.9797 | 0.9592 | 0.9243 | 0.8932 |
| `transformer-small` | 0.9899 | 0.9764 | 0.9519 | 0.9210 | 0.8818 |
| `gbm-hand` | 0.9455 | 0.9061 | 0.8584 | 0.8060 | 0.7609 |
| `gbm-context` | 0.5363 | 0.4306 | 0.3703 | 0.3268 | 0.3077 |
| `constant` | 0.4049 | 0.3862 | 0.3426 | 0.3078 | 0.2764 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |

## Calibration of `transformer-medium-hand-solution-quadruple`

Every tag of every test row, in ten equal groups by its predicted chance: what the model said against how often it was right.

| Predicted | Happened | Rows |
|---|---|---|
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 0.0% | 0.0% | 337,350 |
| 31.5% | 31.5% | 337,350 |

## Each tag by itself, for `transformer-medium-hand-solution-quadruple`

A tag as one yes or no over the test rows: how many rows carry it, and how well its chance tells those rows from the rest. The most common first.

Macro PR-AUC 0.9686, macro ROC-AUC 0.9994, rare-tag (<2%, 15 tags) PR-AUC 0.9483.

| Tag | Rows | Share | PR-AUC | ROC-AUC |
|---|---|---|---|---|
| `fork` | 15,186 | 13.5% | 0.9875 | 0.9986 |
| `kingsideAttack` | 9,742 | 8.7% | 0.9955 | 0.9997 |
| `sacrifice` | 8,857 | 7.9% | 0.9948 | 0.9997 |
| `advancedPawn` | 7,237 | 6.4% | 0.9916 | 0.9996 |
| `pin` | 7,235 | 6.4% | 0.9854 | 0.9991 |
| `discoveredAttack` | 6,150 | 5.5% | 0.9949 | 0.9997 |
| `defensiveMove` | 6,116 | 5.4% | 0.9749 | 0.9989 |
| `deflection` | 5,294 | 4.7% | 0.9906 | 0.9997 |
| `attraction` | 4,573 | 4.1% | 0.9896 | 0.9996 |
| `hangingPiece` | 4,040 | 3.6% | 0.9907 | 0.9996 |
| `quietMove` | 3,992 | 3.6% | 0.9755 | 0.9989 |
| `exposedKing` | 3,645 | 3.2% | 0.9881 | 0.9997 |
| `backRankMate` | 2,952 | 2.6% | 0.9970 | 0.9999 |
| `promotion` | 2,901 | 2.6% | 0.9910 | 0.9998 |
| `skewer` | 2,624 | 2.3% | 0.9876 | 0.9997 |
| `discoveredCheck` | 2,186 | 1.9% | 0.9190 | 0.9990 |
| `queensideAttack` | 1,776 | 1.6% | 0.9911 | 0.9999 |
| `intermezzo` | 1,457 | 1.3% | 0.9827 | 0.9996 |
| `clearance` | 1,428 | 1.3% | 0.9846 | 0.9998 |
| `trappedPiece` | 1,331 | 1.2% | 0.9063 | 0.9981 |
| `zugzwang` | 1,168 | 1.0% | 0.8649 | 0.9977 |
| `operaMate` | 1,112 | 1.0% | 0.8828 | 0.9993 |
| `pillsburysMate` | 1,075 | 1.0% | 0.8845 | 0.9994 |
| `attackingF2F7` | 857 | 0.8% | 0.9922 | 0.9991 |
| `capturingDefender` | 853 | 0.8% | 0.9826 | 0.9997 |
| `doubleCheck` | 647 | 0.6% | 0.9962 | 1.0000 |
| `xRayAttack` | 475 | 0.4% | 0.9893 | 0.9993 |
| `smotheredMate` | 456 | 0.4% | 1.000 | 1.000 |
| `interference` | 428 | 0.4% | 0.9381 | 0.9992 |
| `epauletteMate` | 423 | 0.4% | 0.9106 | 0.9998 |

## Studies

A run here changes one thing in a run above, to say what that thing is worth. It is no candidate, so it is not ranked with the runs above. Its paired difference from the run it changes, on the same resampled test games, is in the closer look (`analysis.json`, under `pairs`).

### `calibrate`

| Run | The run it changes | What it changes | Trained on | Average precision | That run's Average precision | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `gbm-hand-per-tag` | `gbm-hand` | `train.calibrate` per_candidate | 958,941 rows | 0.8702 (0.8684 to 0.8719) | 0.8702 | +6.174e-06 (-0.0002737 to +0.0003076) | 8 min |

### `loss`

| Run | The run it changes | What it changes | Trained on | Average precision | That run's Average precision | Gain over `gbm-hand` | Time |
|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-solution-asl` | `transformer-medium-hand-solution` | `train.asl_clip` 0.05; `train.asl_gamma_neg` 2.0; `train.asl_gamma_pos` 0.0; `train.loss` asl | 958,941 rows | 0.9934 (0.9930 to 0.9938) | 0.9932 | **+0.1232 (+0.1215 to +0.125)** | 86 min |
