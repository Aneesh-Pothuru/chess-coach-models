# where-to-look: leaderboard

Written by `lab eval where-to-look` from the run records in this folder.

- **Predicts:** the chance that a square is one the tactic's line leaves or lands on.
- **A learner may read**, of what the dataset has: the marks on squares `en_passant`, `setup_from`, `setup_to`; the hand features `material_count`, `material_imbalance`, `phase_piece_count`, `in_check`, `legal_moves`, `legal_captures`, `legal_checks`, `hanging_own`, `hanging_opponent`, `passed_pawns_own`, `passed_pawns_opponent`, `attackers_near_own_king`, `attackers_near_opponent_king`, `setup_capture`. The task hides the rest.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T20:55:15Z at lab commit `8c77161`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** Average precision (higher is better), with its 95% interval over resampled games.
- **A row's answer is a set:** which of 64 squares are right, and a run gives each a chance. Average precision is the mean, over a row's right squares, of the share of right ones among those ranked at least as high; first right is how often the one given the highest chance is right. Both are means over the rows that have a right square. Log loss reads every chance as a yes or no of its own.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | Average precision | First right | Log loss | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|
| `transformer-medium` | transformer, 8 layers of width 256 | 0.9022 (0.9014 to 0.9031) | 0.9719 | 0.0884 | **+0.1548 (+0.1538 to +0.1558)** | 6,486,593 | NVIDIA A100-SXM4-80GB | 14 min |
| `transformer-small` | transformer, 4 layers of width 128 | 0.8702 (0.8692 to 0.8712) | 0.9535 | 0.1067 | **+0.1227 (+0.1219 to +0.1237)** | 844,577 | NVIDIA A100-SXM4-80GB | 5 min |
| `conv-small` | conv, 6 layers of width 96 | 0.8576 (0.8566 to 0.8585) | 0.9402 | 0.1119 | **+0.1101 (+0.1091 to +0.1111)** | 1,021,441 | NVIDIA A100-SXM4-80GB | 3 min |
| `gbm-hand` | LightGBM on a row a square: the piece on it, context and hand features and what a person would count on the square | 0.7475 (0.7464 to 0.7485) | 0.8827 | 0.1622 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 8 min |
| `gbm-context` | LightGBM on a row a square: the piece on it, context numbers only | 0.5547 (0.5536 to 0.5557) | 0.7575 | 0.2202 | **-0.1928 (-0.1938 to -0.1917)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 2 min |
| `constant` | each square's share of the training rows, for every row | 0.2282 (0.2273 to 0.2291) | 0.1857 | 0.2875 | **-0.5193 (-0.5205 to -0.518)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 16 s |

## Average precision by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium` | 0.9849 | 0.9566 | 0.9008 | 0.8075 | 0.7272 |
| `transformer-small` | 0.9771 | 0.9312 | 0.8535 | 0.7583 | 0.6958 |
| `conv-small` | 0.9731 | 0.9178 | 0.8358 | 0.7437 | 0.6844 |
| `gbm-hand` | 0.8731 | 0.7860 | 0.7109 | 0.6540 | 0.6233 |
| `gbm-context` | 0.5719 | 0.5679 | 0.5559 | 0.5310 | 0.5160 |
| `constant` | 0.2060 | 0.2361 | 0.2263 | 0.2340 | 0.2477 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |

## Calibration of `transformer-medium`

Every square of every test row, in ten equal groups by its predicted chance: what the model said against how often it was right.

| Predicted | Happened | Rows |
|---|---|---|
| 0.0% | 0.0% | 719,680 |
| 0.0% | 0.0% | 719,680 |
| 0.0% | 0.0% | 719,680 |
| 0.0% | 0.1% | 719,680 |
| 0.1% | 0.1% | 719,680 |
| 0.3% | 0.3% | 719,680 |
| 0.8% | 0.8% | 719,680 |
| 2.4% | 2.3% | 719,680 |
| 10.7% | 10.5% | 719,680 |
| 73.4% | 73.8% | 719,680 |
