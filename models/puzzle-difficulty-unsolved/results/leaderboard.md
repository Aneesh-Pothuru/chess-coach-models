# puzzle-difficulty-unsolved: leaderboard

Written by `lab eval puzzle-difficulty-unsolved` from the run records in this folder.

- **Predicts:** Lichess puzzle rating points.
- **A learner may read**, of what the dataset has: the marks on squares `en_passant`, `setup_from`, `setup_to`; the hand features `material_count`, `material_imbalance`, `phase_piece_count`, `in_check`, `legal_moves`, `legal_captures`, `legal_checks`, `hanging_own`, `hanging_opponent`, `passed_pawns_own`, `passed_pawns_opponent`, `attackers_near_own_king`, `attackers_near_opponent_king`, `setup_capture`. The task hides the rest.
- **Data:** `puzzles-v1`, 1,127,915 rows (test 112,450, train 958,941, valid 56,524) from https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0 1.0, database.lichess.org), built 2026-11-22T13:46:53Z at lab commit `36a0ad9`.
- **Test set:** 112,450 rows from 112,450 games, never seen in training or in choosing an epoch.
- **Ranked by:** RMSE (lower is better), with its 95% interval over resampled games.
- **Gain:** how much better than `gbm-hand` on the same resampled test games, measured when the run was trained; **bold** when the interval leaves zero out.

| Run | Learner | RMSE | MAE | R² | Spearman | Gain over `gbm-hand` | Parameters | Trained on | Time |
|---|---|---|---|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | transformer, 8 layers of width 256, with hand features, started from `position-evaluation/transformer-medium` | 373.8 (371.9 to 375.5) | 285.6 | 0.4475 | 0.6684 | **+83.03 (+81.36 to +84.63)** | 6,555,713 | NVIDIA A100-SXM4-40GB | 14 min |
| `transformer-medium-pretrained` | transformer, 8 layers of width 256, started from `position-evaluation/transformer-medium` | 378.2 (376.4 to 379.9) | 290.7 | 0.4345 | 0.6579 | **+78.65 (+77 to +80.38)** | 6,552,129 | NVIDIA A100-SXM4-40GB | 14 min |
| `conv-small` | conv, 6 layers of width 96 | 411.8 (409.9 to 413.6) | 324.3 | 0.3294 | 0.5605 | **+45.01 (+43.49 to +46.46)** | 1,030,657 | NVIDIA A100-SXM4-80GB | 3 min |
| `transformer-medium-hand` | transformer, 8 layers of width 256, with hand features | 416.1 (414.3 to 417.8) | 328.3 | 0.3153 | 0.5480 | **+40.71 (+39.51 to +41.9)** | 6,555,713 | NVIDIA A100-SXM4-80GB | 13 min |
| `transformer-medium` | transformer, 8 layers of width 256 | 425.7 (424.0 to 427.4) | 338.9 | 0.2833 | 0.5166 | **+31.1 (+29.8 to +32.24)** | 6,552,129 | NVIDIA A100-SXM4-80GB | 13 min |
| `transformer-small` | transformer, 4 layers of width 128 | 429.7 (427.9 to 431.5) | 343.2 | 0.2698 | 0.5036 | **+27.11 (+25.83 to +28.3)** | 860,961 | NVIDIA A100-SXM4-80GB | 5 min |
| `gbm-hand` | LightGBM, context and hand features | 456.8 (455.2 to 458.5) | 370.9 | 0.1748 | 0.4039 | reference |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 34 s |
| `constant` | one number for every row | 502.9 (501.1 to 504.7) | 415.7 | -0.0000 | n/a | **-46.06 (-47.29 to -44.91)** |  | Intel(R) Xeon(R) CPU @ 2.20GHz | 0 s |

## RMSE by band

| Run | <1000 | 1000-1399 | 1400-1799 | 1800-2199 | 2200+ |
|---|---|---|---|---|---|
| `transformer-medium-hand-pretrained` | 335.5 | 338.8 | 255.8 | 382.9 | 696.5 |
| `transformer-medium-pretrained` | 353.3 | 344.7 | 254.9 | 381.7 | 696.0 |
| `conv-small` | 434.8 | 343.4 | 242.0 | 425.1 | 769.2 |
| `transformer-medium-hand` | 445.4 | 333.1 | 238.4 | 439.8 | 783.0 |
| `transformer-medium` | 475.3 | 335.0 | 235.4 | 446.3 | 794.1 |
| `transformer-small` | 486.6 | 337.2 | 237.3 | 448.4 | 795.7 |
| `gbm-hand` | 556.9 | 313.9 | 217.2 | 487.1 | 861.4 |
| `constant` | 675.0 | 284.4 | 170.5 | 537.2 | 958.5 |
| rows | 22,751 | 31,846 | 28,501 | 19,518 | 9,834 |
