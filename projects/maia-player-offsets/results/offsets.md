# Maia-2 player offsets: results

Written by fit.mjs. App commit f4bd63f19b343f686fb97ea4cf70b211c0bddc0a; records commit aed714ada579782ce73630596e59c8b65e74cb30. The archive contributes 648 games and 33522 moves: 324 fitting games (17055 moves), 324 held-out games (16467 moves). Punish reviews cover all 324 held-out games and contribute 3818 events (3295 verified) in 322 games. All 324 held-out games enter each of 1000 shared bootstrap draws, seed 7.

**Verdict.** Candidate A is adopted (player 250, opponents 400).

The likelihood tests use doubled lower-tail bootstrap p-values for positive gain, Holm over two candidates, positive fitting gains, and positive stage interval lower bounds. The punish guard requires each of four Brier-difference upper bounds from the 97.5% intervals to be at most 0.005. A missing cell or empty bootstrap denominator cannot pass.

| Candidate | Fitted values | Fitting gain | Held gain (95% interval) | Holm adjusted p | Likelihood wins | Punish guard |
|---|---|---:|---|---:|---|---|
| A | player 250, opponents 400 | 0.001790 | 0.002216 (0.000682 to 0.003754) | 0.007992 | true | true |
| B | a = 275, b = -0.5 | 0.002094 | 0.001940 (0.000332 to 0.003479) | 0.027972 | true | true |

| Candidate | Guard cell | Events | Baseline Brier | Candidate Brier | Difference (95% interval) | 97.5% interval | Status |
|---|---|---:|---:|---:|---|---|---|
| A | verified, player-err | 1610 | 0.170486 | 0.167373 | -0.003113 (-0.004807 to -0.001545) | -0.005020 to -0.001306 | pass |
| A | verified, opp-err | 1685 | 0.165851 | 0.165851 | 0.000000 (0.000000 to 0.000000) | 0.000000 to 0.000000 | pass |
| A | all, player-err | 1883 | 0.158393 | 0.156692 | -0.001701 (-0.003186 to -0.000218) | -0.003457 to 0.000083 | pass |
| A | all, opp-err | 1935 | 0.155725 | 0.155725 | 0.000000 (0.000000 to 0.000000) | 0.000000 to 0.000000 | pass |
| B | verified, player-err | 1610 | 0.170486 | 0.168980 | -0.001506 (-0.002741 to -0.000324) | -0.002970 to -0.000199 | pass |
| B | verified, opp-err | 1685 | 0.165851 | 0.164313 | -0.001538 (-0.003047 to -0.000242) | -0.003279 to -0.000025 | pass |
| B | all, player-err | 1883 | 0.158393 | 0.157441 | -0.000952 (-0.002017 to 0.000055) | -0.002213 to 0.000206 | pass |
| B | all, opp-err | 1935 | 0.155725 | 0.154911 | -0.000815 (-0.002206 to 0.000383) | -0.002361 to 0.000494 | pass |

The following descriptive comparisons do not decide the result.

| Candidate | Held moves | Count | Gain (95% interval) |
|---|---|---:|---|
| A | him | 8241 | -0.000942 (-0.001948 to 0.000111) |
| A | opponents | 8226 | 0.005381 (0.002531 to 0.008095) |
| A | rating 513 to 934 | 5113 | 0.006630 (0.003707 to 0.009682) |
| A | rating 935 to 1075 | 5690 | -0.000807 (-0.002920 to 0.001387) |
| A | rating 1076 to 1228 | 5664 | 0.001269 (-0.001462 to 0.003956) |
| B | him | 8241 | 0.000025 (-0.002136 to 0.002257) |
| B | opponents | 8226 | 0.003859 (0.001591 to 0.006170) |
| B | rating 513 to 934 | 5113 | 0.006454 (0.001523 to 0.011461) |
| B | rating 935 to 1075 | 5690 | -0.000046 (-0.000804 to 0.000738) |
| B | rating 1076 to 1228 | 5664 | -0.000140 (-0.000877 to 0.000652) |

| Conversion | First-choice share, fitting moves | Held-out moves | All moves |
|---|---:|---:|---:|
| 250 | 0.536793 | 0.542054 | 0.539377 |
| A | 0.537731 | 0.542297 | 0.539974 |
| B | 0.536500 | 0.542904 | 0.539646 |

The JSON report includes fixed-bin calibration descriptives, the exact numerical rule, all intervals, and input and design hashes.
