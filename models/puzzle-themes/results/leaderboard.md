# puzzle-themes: leaderboard

Written by `lab eval puzzle-themes` from the run records in this folder.

- **Predicts:** the chance that a puzzle carries a theme.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T20:55:15Z at lab commit `8c77161`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** Average precision (higher is better), with its 95% interval over resampled games.
- **A row's answer is a set:** which of 30 tags are right, and a run gives each a chance. Average precision is the mean, over a row's right tags, of the share of right ones among those ranked at least as high; first right is how often the one given the highest chance is right. Both are means over the rows that have a right tag. Log loss reads every chance as a yes or no of its own.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | Average precision | First right | Log loss | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 0.9828 (0.9821 to 0.9834) | 0.9768 | 0.0142 | **+0.1126 (+0.1109 to +0.1143)** | 6,571,102 | NVIDIA A100-SXM4-80GB | 13 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 0.9796 (0.9789 to 0.9803) | 0.9729 | 0.0155 | **+0.1094 (+0.1078 to +0.1112)** | 6,562,654 | NVIDIA A100-SXM4-80GB | 13 min |
| `conv-small` | conv, 6 layers of width 96 | 0.9601 (0.9590 to 0.9610) | 0.9474 | 0.0227 | **+0.08988 (+0.08818 to +0.09162)** | 1,043,070 | NVIDIA A100-SXM4-80GB | 3 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.9573 (0.9563 to 0.9583) | 0.9412 | 0.0232 | **+0.08715 (+0.08547 to +0.08889)** | 866,238 | NVIDIA A100-SXM4-80GB | 5 min |
| `gbm-hand` | a LightGBM booster a tag, context and hand features | 0.8702 (0.8684 to 0.8719) | 0.8199 | 0.0443 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 8 min |
| `gbm-context` | a LightGBM booster a tag, context numbers only | 0.4057 (0.4033 to 0.4080) | 0.2641 | 0.1180 | **-0.4644 (-0.4672 to -0.4617)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `constant` | each tag's share of the training rows, for every row | 0.3545 (0.3523 to 0.3567) | 0.2142 | 0.1268 | **-0.5157 (-0.5186 to -0.513)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 15 s |

## Average precision by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium-hand` | 0.9974 | 0.9928 | 0.9839 | 0.9676 | 0.9486 |
| `transformer-medium` | 0.9961 | 0.9914 | 0.9817 | 0.9635 | 0.9353 |
| `conv-small` | 0.9931 | 0.9808 | 0.9591 | 0.9268 | 0.8954 |
| `transformer-small` | 0.9903 | 0.9780 | 0.9580 | 0.9248 | 0.8870 |
| `gbm-hand` | 0.9455 | 0.9061 | 0.8584 | 0.8060 | 0.7609 |
| `gbm-context` | 0.5363 | 0.4306 | 0.3703 | 0.3268 | 0.3077 |
| `constant` | 0.4049 | 0.3862 | 0.3426 | 0.3078 | 0.2764 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |

## Calibration of `transformer-medium-hand`

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
| 31.4% | 31.4% | 337,350 |

## Each tag by itself, for `transformer-medium-hand`

A tag as one yes or no over the test rows: how many rows carry it, and how well its chance tells those rows from the rest. The most common first.

| Tag | Rows | Share | PR-AUC | ROC-AUC |
|---|---|---|---|---|
| `fork` | 15,186 | 13.5% | 0.9587 | 0.9919 |
| `kingsideAttack` | 9,742 | 8.7% | 0.9912 | 0.9993 |
| `sacrifice` | 8,857 | 7.9% | 0.9920 | 0.9996 |
| `advancedPawn` | 7,237 | 6.4% | 0.9892 | 0.9996 |
| `pin` | 7,235 | 6.4% | 0.8726 | 0.9820 |
| `discoveredAttack` | 6,150 | 5.5% | 0.9850 | 0.9989 |
| `defensiveMove` | 6,116 | 5.4% | 0.9100 | 0.9942 |
| `deflection` | 5,294 | 4.7% | 0.9755 | 0.9987 |
| `attraction` | 4,573 | 4.1% | 0.9856 | 0.9995 |
| `hangingPiece` | 4,040 | 3.6% | 0.9863 | 0.9994 |
| `quietMove` | 3,992 | 3.6% | 0.9141 | 0.9957 |
| `exposedKing` | 3,645 | 3.2% | 0.9804 | 0.9995 |
| `backRankMate` | 2,952 | 2.6% | 0.9969 | 0.9998 |
| `promotion` | 2,901 | 2.6% | 0.9913 | 0.9997 |
| `skewer` | 2,624 | 2.3% | 0.9753 | 0.9991 |
| `discoveredCheck` | 2,186 | 1.9% | 0.8773 | 0.9975 |
| `queensideAttack` | 1,776 | 1.6% | 0.9815 | 0.9997 |
| `intermezzo` | 1,457 | 1.3% | 0.9696 | 0.9992 |
| `clearance` | 1,428 | 1.3% | 0.9445 | 0.9988 |
| `trappedPiece` | 1,331 | 1.2% | 0.7619 | 0.9923 |
| `zugzwang` | 1,168 | 1.0% | 0.8056 | 0.9957 |
| `operaMate` | 1,112 | 1.0% | 0.8677 | 0.9991 |
| `pillsburysMate` | 1,075 | 1.0% | 0.8497 | 0.9987 |
| `attackingF2F7` | 857 | 0.8% | 0.9937 | 0.9984 |
| `capturingDefender` | 853 | 0.8% | 0.8590 | 0.9972 |
| `doubleCheck` | 647 | 0.6% | 0.9047 | 0.9985 |
| `xRayAttack` | 475 | 0.4% | 0.9518 | 0.9981 |
| `smotheredMate` | 456 | 0.4% | 1.0000 | 1.0000 |
| `interference` | 428 | 0.4% | 0.6646 | 0.9914 |
| `epauletteMate` | 423 | 0.4% | 0.8242 | 0.9992 |
