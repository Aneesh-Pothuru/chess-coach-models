# Rules after the check: results

Written by `analyze.py`. The board check is app `3437a711843006926c0804394b9087c5a55d4bcf`; Maia-2 and the referee are app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`, with records `aed714ada579782ce73630596e59c8b65e74cb30`. The positions are inherited from rules-of-thumb's Lichess rated standard 600+0 run (CC0): July and August 2026 pooled for train, September 2026 held out.

Intervals are 95% percentile intervals from 2,000 game resamples, seed 20261018. Shares are percentages and soundness differences are percentage points. Every measure of a rule and period uses the same game multiplicities. Undefined subgroup draws are counted in `rules.json`.

## The control

The pooled control includes quiet positions where the original R fails the check and the safe rule set is nonempty. It compares soundness of Rs with R. The bootstrap keeps all rows of a game together across rules.

| Period | Control positions | Games | Rs minus R |
|---|---:|---:|---|
| train | 292 | 288 | -1.03 (-6.49 to 4.47) |
| heldout | 175 | 173 | 2.29 (-5.98 to 10.13) |

The control does not pass on both periods. No rule receives a verdict; the measures below describe only.

## Quiet positions with a safe rule move

| Rule | Train positions | Held-out positions | Train lift Rs minus Ns | Held-out lift Rs minus Ns | Verdict |
|---|---:|---:|---|---|---|
| active-king | 4412 | 2245 | -10.74 (-11.98 to -9.52) | -9.84 (-11.50 to -8.21) | no verdict (control failed) |
| opposition | 1961 | 1015 | -5.97 (-7.37 to -4.53) | -8.47 (-10.56 to -6.38) | no verdict (control failed) |
| square-rule | 3178 | 1552 | -1.16 (-1.64 to -0.70) | -1.29 (-2.01 to -0.58) | no verdict (control failed) |
| rook-behind-passer | 2523 | 1307 | -25.29 (-27.41 to -23.26) | -24.64 (-27.51 to -21.65) | no verdict (control failed) |
| cut-off-king | 1098 | 552 | -28.60 (-31.74 to -25.66) | -28.99 (-33.10 to -25.00) | no verdict (control failed) |
| outside-passer | 17 | 12 | 0.00 (-16.67 to 16.67) | -16.67 (-42.86 to 0.00) | no verdict (control failed) |
| trade-when-ahead | 2085 | 1033 | -6.86 (-8.25 to -5.44) | -6.78 (-8.81 to -4.81) | no verdict (control failed) |
| open-file | 2815 | 1454 | -18.05 (-19.98 to -16.05) | -16.99 (-19.99 to -14.03) | no verdict (control failed) |
| rook-on-the-seventh | 2278 | 1176 | -16.15 (-18.15 to -14.01) | -17.18 (-20.08 to -14.18) | no verdict (control failed) |
| outpost | 2572 | 1259 | -20.68 (-22.59 to -18.76) | -20.17 (-22.95 to -17.28) | no verdict (control failed) |
| pawn-break | 3215 | 1620 | -30.51 (-32.41 to -28.39) | -31.98 (-34.81 to -29.09) | no verdict (control failed) |
| passed-pawn | 2080 | 1031 | -14.37 (-16.30 to -12.38) | -14.84 (-17.52 to -12.18) | no verdict (control failed) |
| worst-piece | 2524 | 1233 | -20.13 (-22.13 to -17.94) | -22.47 (-25.55 to -19.43) | no verdict (control failed) |

## Coverage

Quiet share uses all inherited rows. Safe-rule coverage among quiet uses all quiet rows, including those with no safe rule move. Move identity shares below use quiet positions with a nonempty safe rule set.

| Rule | Period | Inherited rows | Quiet | Quiet without a safe rule move | Quiet share | Safe rule among quiet | Rs = R | Ns = N |
|---|---|---:|---:|---:|---|---|---|---|
| active-king | train | 8000 | 4659 | 247 | 58.24 (57.19 to 59.30) | 94.70 (94.06 to 95.31) | 99.77 (99.62 to 99.91) | 98.37 (98.00 to 98.73) |
| active-king | heldout | 4000 | 2354 | 109 | 58.85 (57.32 to 60.35) | 95.37 (94.52 to 96.21) | 99.78 (99.56 to 99.96) | 98.31 (97.76 to 98.83) |
| opposition | train | 2775 | 1991 | 30 | 71.75 (70.05 to 73.33) | 98.49 (97.93 to 99.04) | 99.75 (99.50 to 99.95) | 99.64 (99.34 to 99.90) |
| opposition | heldout | 1435 | 1029 | 14 | 71.71 (69.48 to 74.01) | 98.64 (97.88 to 99.31) | 99.31 (98.71 to 99.80) | 99.21 (98.62 to 99.71) |
| square-rule | train | 5073 | 3180 | 2 | 62.68 (61.34 to 64.03) | 99.94 (99.84 to 100.00) | 100.00 (100.00 to 100.00) | 99.09 (98.74 to 99.41) |
| square-rule | heldout | 2582 | 1553 | 1 | 60.15 (58.29 to 62.04) | 99.94 (99.80 to 100.00) | 100.00 (100.00 to 100.00) | 99.10 (98.61 to 99.55) |
| rook-behind-passer | train | 8000 | 2707 | 184 | 33.84 (32.82 to 34.81) | 93.20 (92.21 to 94.14) | 99.52 (99.23 to 99.77) | 96.12 (95.36 to 96.86) |
| rook-behind-passer | heldout | 4000 | 1395 | 88 | 34.88 (33.37 to 36.38) | 93.69 (92.30 to 94.93) | 99.23 (98.72 to 99.69) | 95.49 (94.36 to 96.56) |
| cut-off-king | train | 2772 | 1489 | 391 | 53.72 (52.02 to 55.56) | 73.74 (71.44 to 76.02) | 100.00 (100.00 to 100.00) | 96.72 (95.65 to 97.77) |
| cut-off-king | heldout | 1398 | 729 | 177 | 52.15 (49.50 to 54.72) | 75.72 (72.42 to 78.95) | 100.00 (100.00 to 100.00) | 97.46 (96.09 to 98.70) |
| outside-passer | train | 2576 | 264 | 247 | 10.25 (9.08 to 11.37) | 6.44 (3.73 to 9.68) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) |
| outside-passer | heldout | 1303 | 150 | 138 | 11.51 (9.75 to 13.28) | 8.00 (3.90 to 12.57) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) |
| trade-when-ahead | train | 8000 | 2179 | 94 | 27.24 (26.26 to 28.20) | 95.69 (94.80 to 96.54) | 99.95 (99.85 to 100.00) | 98.90 (98.41 to 99.32) |
| trade-when-ahead | heldout | 4000 | 1071 | 38 | 26.77 (25.42 to 28.10) | 96.45 (95.35 to 97.52) | 99.81 (99.51 to 100.00) | 98.94 (98.30 to 99.52) |
| open-file | train | 8000 | 2956 | 141 | 36.95 (35.89 to 37.94) | 95.23 (94.43 to 95.97) | 96.38 (95.65 to 97.05) | 95.56 (94.79 to 96.29) |
| open-file | heldout | 4000 | 1526 | 72 | 38.15 (36.72 to 39.63) | 95.28 (94.15 to 96.32) | 95.53 (94.42 to 96.57) | 93.95 (92.71 to 95.14) |
| rook-on-the-seventh | train | 8000 | 2412 | 134 | 30.15 (29.16 to 31.11) | 94.44 (93.54 to 95.39) | 100.00 (100.00 to 100.00) | 97.85 (97.25 to 98.43) |
| rook-on-the-seventh | heldout | 4000 | 1243 | 67 | 31.08 (29.73 to 32.55) | 94.61 (93.37 to 95.83) | 100.00 (100.00 to 100.00) | 98.04 (97.20 to 98.82) |
| outpost | train | 8000 | 2848 | 276 | 35.60 (34.56 to 36.71) | 90.31 (89.24 to 91.39) | 99.46 (99.16 to 99.73) | 97.59 (97.00 to 98.18) |
| outpost | heldout | 4000 | 1373 | 114 | 34.33 (32.90 to 35.83) | 91.70 (90.14 to 93.11) | 99.21 (98.67 to 99.66) | 96.74 (95.69 to 97.67) |
| pawn-break | train | 8000 | 3474 | 259 | 43.43 (42.34 to 44.49) | 92.54 (91.63 to 93.40) | 99.04 (98.69 to 99.37) | 96.17 (95.51 to 96.81) |
| pawn-break | heldout | 4000 | 1770 | 150 | 44.25 (42.73 to 45.80) | 91.53 (90.27 to 92.83) | 99.20 (98.74 to 99.62) | 95.93 (94.92 to 96.86) |
| passed-pawn | train | 8000 | 2577 | 497 | 32.21 (31.19 to 33.25) | 80.71 (79.17 to 82.23) | 98.27 (97.69 to 98.81) | 97.55 (96.91 to 98.19) |
| passed-pawn | heldout | 4000 | 1284 | 253 | 32.10 (30.63 to 33.62) | 80.30 (78.11 to 82.43) | 98.55 (97.77 to 99.24) | 97.87 (96.92 to 98.68) |
| worst-piece | train | 8000 | 3038 | 514 | 37.97 (36.95 to 39.01) | 83.08 (81.81 to 84.42) | 96.79 (96.06 to 97.44) | 95.88 (95.11 to 96.65) |
| worst-piece | heldout | 4000 | 1496 | 263 | 37.40 (35.90 to 38.85) | 82.42 (80.38 to 84.36) | 96.11 (95.01 to 97.15) | 96.03 (94.94 to 97.05) |

## Quiet comparisons

These comparisons describe. Only the primary Rs minus Ns lift can decide a verdict after the control passes.

| Rule | Period | Positions | Rs minus Ns | Rs minus N | Rs minus R0s | Positions Rs ≠ Ns | Lift where Rs ≠ Ns | Ns minus N |
|---|---|---:|---|---|---|---:|---|---|
| active-king | train | 4412 | -10.74 (-11.98 to -9.52) | -10.63 (-11.86 to -9.37) | 6.23 (4.94 to 7.52) | 2934 | -16.16 (-17.97 to -14.31) | 0.11 (-0.09 to 0.34) |
| active-king | heldout | 2245 | -9.84 (-11.50 to -8.21) | -10.20 (-11.88 to -8.52) | 7.48 (5.70 to 9.39) | 1505 | -14.68 (-17.10 to -12.28) | -0.36 (-0.71 to -0.04) |
| opposition | train | 1961 | -5.97 (-7.37 to -4.53) | -6.02 (-7.42 to -4.60) | 4.39 (2.91 to 5.84) | 1326 | -8.82 (-10.86 to -6.68) | -0.05 (-0.15 to 0.00) |
| opposition | heldout | 1015 | -8.47 (-10.56 to -6.38) | -8.57 (-10.71 to -6.49) | 3.45 (1.29 to 5.75) | 698 | -12.32 (-15.37 to -9.31) | -0.10 (-0.31 to 0.00) |
| square-rule | train | 3178 | -1.16 (-1.64 to -0.70) | -1.23 (-1.71 to -0.76) | 10.01 (8.92 to 11.10) | 608 | -6.09 (-8.52 to -3.75) | -0.06 (-0.16 to 0.00) |
| square-rule | heldout | 1552 | -1.29 (-2.01 to -0.58) | -1.22 (-1.95 to -0.57) | 9.99 (8.35 to 11.59) | 297 | -6.73 (-10.48 to -3.08) | 0.06 (0.00 to 0.20) |
| rook-behind-passer | train | 2523 | -25.29 (-27.41 to -23.26) | -25.41 (-27.49 to -23.40) | 2.06 (0.16 to 3.84) | 2253 | -28.32 (-30.69 to -26.09) | -0.12 (-0.57 to 0.36) |
| rook-behind-passer | heldout | 1307 | -24.64 (-27.51 to -21.65) | -24.33 (-27.15 to -21.36) | 2.07 (-0.46 to 4.59) | 1172 | -27.47 (-30.65 to -24.19) | 0.31 (-0.46 to 1.07) |
| cut-off-king | train | 1098 | -28.60 (-31.74 to -25.66) | -28.87 (-31.94 to -25.81) | -1.82 (-4.43 to 0.82) | 1059 | -29.65 (-32.91 to -26.65) | -0.27 (-0.82 to 0.26) |
| cut-off-king | heldout | 552 | -28.99 (-33.10 to -25.00) | -29.71 (-33.82 to -25.64) | -1.09 (-4.94 to 2.77) | 533 | -30.02 (-34.21 to -25.90) | -0.72 (-1.68 to 0.00) |
| outside-passer | train | 17 | 0.00 (-16.67 to 16.67) | 0.00 (-16.67 to 16.67) | 58.82 (34.99 to 81.26) | 2 | 0.00 (-100.00 to 100.00) | 0.00 (0.00 to 0.00) |
| outside-passer | heldout | 12 | -16.67 (-42.86 to 0.00) | -16.67 (-42.86 to 0.00) | 8.33 (-36.36 to 50.00) | 2 | -100.00 (-100.00 to -100.00) | 0.00 (0.00 to 0.00) |
| trade-when-ahead | train | 2085 | -6.86 (-8.25 to -5.44) | -6.91 (-8.33 to -5.51) | 34.00 (31.63 to 36.44) | 532 | -26.88 (-32.05 to -21.69) | -0.05 (-0.25 to 0.15) |
| trade-when-ahead | heldout | 1033 | -6.78 (-8.81 to -4.81) | -6.97 (-9.05 to -5.03) | 36.79 (33.30 to 40.22) | 293 | -23.89 (-30.34 to -17.17) | -0.19 (-0.59 to 0.19) |
| open-file | train | 2815 | -18.05 (-19.98 to -16.05) | -17.16 (-19.14 to -15.12) | 8.88 (6.99 to 10.90) | 2314 | -21.95 (-24.27 to -19.51) | 0.89 (0.28 to 1.44) |
| open-file | heldout | 1454 | -16.99 (-19.99 to -14.03) | -16.71 (-19.73 to -13.74) | 7.02 (4.34 to 9.64) | 1190 | -20.76 (-24.33 to -17.13) | 0.28 (-0.53 to 1.09) |
| rook-on-the-seventh | train | 2278 | -16.15 (-18.15 to -14.01) | -16.20 (-18.21 to -14.08) | 15.10 (12.95 to 17.27) | 1637 | -22.48 (-25.17 to -19.55) | -0.04 (-0.49 to 0.39) |
| rook-on-the-seventh | heldout | 1176 | -17.18 (-20.08 to -14.18) | -17.01 (-20.02 to -13.93) | 14.88 (11.98 to 18.03) | 906 | -22.30 (-26.15 to -18.53) | 0.17 (-0.36 to 0.76) |
| outpost | train | 2572 | -20.68 (-22.59 to -18.76) | -20.80 (-22.75 to -18.85) | 10.96 (8.76 to 13.13) | 1749 | -30.42 (-33.14 to -27.60) | -0.12 (-0.54 to 0.31) |
| outpost | heldout | 1259 | -20.17 (-22.95 to -17.28) | -19.70 (-22.39 to -16.79) | 13.03 (10.02 to 15.97) | 835 | -30.42 (-34.12 to -26.27) | 0.48 (-0.16 to 1.17) |
| pawn-break | train | 3215 | -30.51 (-32.41 to -28.39) | -30.64 (-32.49 to -28.51) | 3.67 (1.85 to 5.54) | 2842 | -34.52 (-36.64 to -32.17) | -0.12 (-0.59 to 0.37) |
| pawn-break | heldout | 1620 | -31.98 (-34.81 to -29.09) | -31.79 (-34.63 to -28.93) | 3.64 (0.85 to 6.39) | 1425 | -36.35 (-39.54 to -33.15) | 0.19 (-0.52 to 0.93) |
| passed-pawn | train | 2080 | -14.37 (-16.30 to -12.38) | -14.13 (-16.16 to -12.11) | 11.39 (9.22 to 13.56) | 1215 | -24.61 (-27.71 to -21.37) | 0.24 (-0.20 to 0.68) |
| passed-pawn | heldout | 1031 | -14.84 (-17.52 to -12.18) | -15.23 (-18.03 to -12.56) | 12.61 (9.59 to 15.61) | 612 | -25.00 (-29.40 to -20.52) | -0.39 (-0.96 to 0.10) |
| worst-piece | train | 2524 | -20.13 (-22.13 to -17.94) | -19.45 (-21.49 to -17.25) | 7.29 (5.21 to 9.30) | 2154 | -23.58 (-25.84 to -21.07) | 0.67 (0.12 to 1.24) |
| worst-piece | heldout | 1233 | -22.47 (-25.55 to -19.43) | -21.82 (-25.04 to -18.70) | 4.70 (2.02 to 7.42) | 1041 | -26.61 (-30.31 to -23.10) | 0.65 (-0.16 to 1.44) |

## All positions with a safe rule move

These comparisons describe. Only the primary Rs minus Ns lift can decide a verdict after the control passes.

| Rule | Period | Positions | Rs minus Ns | Rs minus N | Rs minus R0s | Positions Rs ≠ Ns | Lift where Rs ≠ Ns | Ns minus N |
|---|---|---:|---|---|---|---:|---|---|
| active-king | train | 7608 | -23.62 (-24.74 to -22.45) | -23.88 (-24.98 to -22.73) | 2.62 (1.59 to 3.59) | 5820 | -30.88 (-32.28 to -29.43) | -0.26 (-0.51 to -0.01) |
| active-king | heldout | 3822 | -23.29 (-24.84 to -21.67) | -23.84 (-25.40 to -22.20) | 2.59 (1.18 to 4.08) | 2902 | -30.67 (-32.60 to -28.62) | -0.55 (-0.91 to -0.18) |
| opposition | train | 2735 | -8.96 (-10.30 to -7.66) | -8.92 (-10.28 to -7.62) | 4.46 (3.13 to 5.79) | 1822 | -13.45 (-15.41 to -11.55) | 0.04 (-0.07 to 0.18) |
| opposition | heldout | 1418 | -10.65 (-12.49 to -8.80) | -10.79 (-12.64 to -8.95) | 3.74 (1.76 to 5.86) | 946 | -15.96 (-18.62 to -13.35) | -0.14 (-0.35 to 0.00) |
| square-rule | train | 5058 | -1.94 (-2.44 to -1.44) | -1.98 (-2.49 to -1.46) | 11.86 (10.92 to 12.86) | 1612 | -6.08 (-7.65 to -4.53) | -0.04 (-0.16 to 0.06) |
| square-rule | heldout | 2576 | -2.14 (-2.83 to -1.44) | -2.14 (-2.84 to -1.44) | 11.96 (10.57 to 13.41) | 825 | -6.67 (-8.87 to -4.51) | 0.00 (-0.19 to 0.19) |
| rook-behind-passer | train | 7215 | -40.18 (-41.48 to -38.92) | -41.09 (-42.41 to -39.84) | 0.51 (-0.62 to 1.62) | 6625 | -43.76 (-45.12 to -42.41) | -0.91 (-1.27 to -0.57) |
| rook-behind-passer | heldout | 3638 | -41.26 (-43.06 to -39.61) | -41.45 (-43.24 to -39.78) | -0.82 (-2.31 to 0.63) | 3352 | -44.78 (-46.67 to -43.01) | -0.19 (-0.72 to 0.36) |
| cut-off-king | train | 2207 | -37.97 (-40.24 to -35.82) | -38.51 (-40.78 to -36.37) | -2.95 (-4.95 to -0.96) | 2083 | -40.23 (-42.55 to -38.01) | -0.54 (-1.04 to -0.09) |
| cut-off-king | heldout | 1135 | -37.62 (-40.55 to -34.67) | -38.68 (-41.66 to -35.62) | -1.23 (-4.01 to 1.67) | 1054 | -40.51 (-43.55 to -37.35) | -1.06 (-1.79 to -0.44) |
| outside-passer | train | 2052 | -5.12 (-6.27 to -4.01) | -5.36 (-6.53 to -4.21) | 33.82 (31.63 to 36.12) | 311 | -33.76 (-40.40 to -27.04) | -0.24 (-0.53 to 0.00) |
| outside-passer | heldout | 1028 | -4.57 (-6.04 to -3.17) | -4.77 (-6.30 to -3.33) | 35.12 (31.91 to 38.42) | 143 | -32.87 (-41.48 to -23.74) | -0.19 (-0.49 to 0.00) |
| trade-when-ahead | train | 7554 | -11.03 (-11.96 to -10.15) | -11.09 (-12.03 to -10.21) | 45.22 (43.98 to 46.52) | 2639 | -31.56 (-34.05 to -29.29) | -0.07 (-0.31 to 0.19) |
| trade-when-ahead | heldout | 3816 | -11.82 (-13.14 to -10.50) | -11.79 (-13.14 to -10.47) | 45.94 (44.20 to 47.81) | 1373 | -32.85 (-36.17 to -29.45) | 0.03 (-0.29 to 0.31) |
| open-file | train | 7500 | -30.89 (-32.16 to -29.64) | -31.00 (-32.26 to -29.73) | 7.00 (5.80 to 8.15) | 6244 | -37.11 (-38.59 to -35.60) | -0.11 (-0.48 to 0.28) |
| open-file | heldout | 3750 | -30.45 (-32.18 to -28.55) | -30.91 (-32.71 to -29.05) | 5.23 (3.69 to 6.97) | 3107 | -36.76 (-38.75 to -34.48) | -0.45 (-1.04 to 0.13) |
| rook-on-the-seventh | train | 7364 | -27.25 (-28.46 to -26.06) | -27.32 (-28.56 to -26.10) | 19.01 (17.81 to 20.27) | 5560 | -36.10 (-37.65 to -34.54) | -0.07 (-0.38 to 0.23) |
| rook-on-the-seventh | heldout | 3717 | -28.14 (-29.92 to -26.35) | -28.46 (-30.24 to -26.70) | 17.27 (15.55 to 18.93) | 2895 | -36.13 (-38.29 to -33.96) | -0.32 (-0.73 to 0.11) |
| outpost | train | 7090 | -30.08 (-31.32 to -28.84) | -30.39 (-31.67 to -29.13) | 16.16 (14.92 to 17.50) | 5189 | -41.11 (-42.72 to -39.52) | -0.31 (-0.63 to -0.01) |
| outpost | heldout | 3599 | -30.26 (-32.04 to -28.45) | -30.15 (-31.90 to -28.32) | 17.03 (15.25 to 18.87) | 2641 | -41.23 (-43.47 to -38.88) | 0.11 (-0.34 to 0.56) |
| pawn-break | train | 7239 | -46.71 (-48.00 to -45.34) | -47.22 (-48.51 to -45.86) | -0.70 (-1.79 to 0.35) | 6767 | -49.96 (-51.35 to -48.57) | -0.51 (-0.91 to -0.11) |
| pawn-break | heldout | 3627 | -47.64 (-49.49 to -45.75) | -47.97 (-49.86 to -46.04) | 0.19 (-1.40 to 1.66) | 3388 | -51.00 (-52.97 to -49.01) | -0.33 (-0.83 to 0.22) |
| passed-pawn | train | 6364 | -29.20 (-30.51 to -27.90) | -29.78 (-31.09 to -28.46) | 11.42 (10.08 to 12.69) | 4460 | -41.66 (-43.46 to -39.89) | -0.58 (-0.96 to -0.23) |
| passed-pawn | heldout | 3169 | -29.19 (-31.05 to -27.35) | -29.76 (-31.66 to -27.88) | 12.40 (10.47 to 14.26) | 2230 | -41.48 (-43.85 to -39.01) | -0.57 (-1.05 to -0.13) |
| worst-piece | train | 6344 | -36.11 (-37.51 to -34.74) | -36.57 (-38.01 to -35.17) | 4.51 (3.27 to 5.69) | 5531 | -41.42 (-43.01 to -39.93) | -0.46 (-0.87 to -0.06) |
| worst-piece | heldout | 3158 | -36.45 (-38.51 to -34.50) | -36.61 (-38.68 to -34.65) | 3.48 (1.75 to 5.21) | 2734 | -42.10 (-44.45 to -39.92) | -0.16 (-0.76 to 0.45) |

## Quiet splits

The split is read by the check app. Forcing means Rs is a capture or gives check. These lifts describe and create no additional decision rule.

| Rule | Split | Cell | Train positions | Train lift | Held-out positions | Held-out lift |
|---|---|---|---:|---|---:|---|
| active-king | material | ahead | 1613 | -9.24 (-10.93 to -7.54) | 778 | -8.87 (-11.29 to -6.36) |
| active-king | material | level | 1673 | -14.58 (-16.97 to -12.24) | 875 | -14.40 (-17.55 to -11.28) |
| active-king | material | behind | 1126 | -7.19 (-9.31 to -5.07) | 592 | -4.39 (-7.45 to -1.55) |
| active-king | phase | middlegame | 0 | undefined | 0 | undefined |
| active-king | phase | endgame | 4412 | -10.74 (-11.98 to -9.52) | 2245 | -9.84 (-11.50 to -8.21) |
| active-king | forcing | false | 4412 | -10.74 (-11.98 to -9.52) | 2244 | -9.85 (-11.51 to -8.21) |
| active-king | forcing | true | 0 | undefined | 1 | 0.00 (0.00 to 0.00) |
| active-king | kingDanger | false | 4412 | -10.74 (-11.98 to -9.52) | 2245 | -9.84 (-11.50 to -8.21) |
| active-king | kingDanger | true | 0 | undefined | 0 | undefined |
| opposition | material | ahead | 385 | -2.08 (-3.84 to -0.53) | 230 | -3.91 (-7.14 to -0.91) |
| opposition | material | level | 1297 | -7.94 (-9.88 to -5.99) | 642 | -10.59 (-13.49 to -7.82) |
| opposition | material | behind | 279 | -2.15 (-5.45 to 0.99) | 143 | -6.29 (-11.35 to -1.60) |
| opposition | phase | middlegame | 0 | undefined | 0 | undefined |
| opposition | phase | endgame | 1961 | -5.97 (-7.37 to -4.53) | 1015 | -8.47 (-10.56 to -6.38) |
| opposition | forcing | false | 1961 | -5.97 (-7.37 to -4.53) | 1015 | -8.47 (-10.56 to -6.38) |
| opposition | forcing | true | 0 | undefined | 0 | undefined |
| opposition | kingDanger | false | 1961 | -5.97 (-7.37 to -4.53) | 1015 | -8.47 (-10.56 to -6.38) |
| opposition | kingDanger | true | 0 | undefined | 0 | undefined |
| square-rule | material | ahead | 2513 | -1.19 (-1.73 to -0.68) | 1205 | -1.24 (-2.07 to -0.50) |
| square-rule | material | level | 640 | -0.94 (-1.94 to 0.00) | 329 | -1.22 (-3.04 to 0.35) |
| square-rule | material | behind | 25 | -4.00 (-13.04 to 0.00) | 18 | -5.56 (-19.07 to 0.00) |
| square-rule | phase | middlegame | 1 | 0.00 (0.00 to 0.00) | 0 | undefined |
| square-rule | phase | endgame | 3177 | -1.16 (-1.64 to -0.70) | 1552 | -1.29 (-2.01 to -0.58) |
| square-rule | forcing | false | 3166 | -1.17 (-1.64 to -0.70) | 1549 | -1.29 (-2.02 to -0.58) |
| square-rule | forcing | true | 12 | 0.00 (0.00 to 0.00) | 3 | 0.00 (0.00 to 0.00) |
| square-rule | kingDanger | false | 3172 | -1.17 (-1.64 to -0.70) | 1550 | -1.29 (-2.01 to -0.58) |
| square-rule | kingDanger | true | 6 | 0.00 (0.00 to 0.00) | 2 | 0.00 (0.00 to 0.00) |
| rook-behind-passer | material | ahead | 1188 | -26.35 (-29.08 to -23.51) | 587 | -22.66 (-26.61 to -18.80) |
| rook-behind-passer | material | level | 786 | -30.79 (-35.01 to -26.65) | 454 | -30.84 (-36.21 to -25.43) |
| rook-behind-passer | material | behind | 549 | -15.12 (-19.51 to -10.94) | 266 | -18.42 (-25.00 to -12.09) |
| rook-behind-passer | phase | middlegame | 783 | -34.74 (-38.71 to -30.95) | 397 | -32.75 (-38.36 to -27.27) |
| rook-behind-passer | phase | endgame | 1740 | -21.03 (-23.50 to -18.72) | 910 | -21.10 (-24.46 to -17.76) |
| rook-behind-passer | forcing | false | 2515 | -25.33 (-27.47 to -23.30) | 1298 | -24.88 (-27.75 to -21.92) |
| rook-behind-passer | forcing | true | 8 | -12.50 (-40.14 to 0.00) | 9 | 11.11 (0.00 to 37.50) |
| rook-behind-passer | kingDanger | false | 2316 | -24.74 (-26.96 to -22.68) | 1210 | -23.80 (-26.81 to -20.76) |
| rook-behind-passer | kingDanger | true | 207 | -31.40 (-38.74 to -24.23) | 97 | -35.05 (-46.07 to -24.71) |
| cut-off-king | material | ahead | 375 | -21.07 (-25.79 to -16.67) | 176 | -16.48 (-23.27 to -9.88) |
| cut-off-king | material | level | 677 | -31.61 (-35.65 to -27.75) | 341 | -33.72 (-39.45 to -28.17) |
| cut-off-king | material | behind | 46 | -45.65 (-61.55 to -30.00) | 35 | -45.71 (-62.97 to -29.41) |
| cut-off-king | phase | middlegame | 0 | undefined | 0 | undefined |
| cut-off-king | phase | endgame | 1098 | -28.60 (-31.74 to -25.66) | 552 | -28.99 (-33.10 to -25.00) |
| cut-off-king | forcing | false | 1098 | -28.60 (-31.74 to -25.66) | 552 | -28.99 (-33.10 to -25.00) |
| cut-off-king | forcing | true | 0 | undefined | 0 | undefined |
| cut-off-king | kingDanger | false | 1086 | -28.55 (-31.68 to -25.52) | 547 | -28.70 (-32.90 to -24.66) |
| cut-off-king | kingDanger | true | 12 | -33.33 (-63.17 to -8.33) | 5 | -60.00 (-100.00 to 0.00) |
| outside-passer | material | ahead | 6 | -16.67 (-50.00 to 0.00) | 4 | 0.00 (0.00 to 0.00) |
| outside-passer | material | level | 8 | 0.00 (0.00 to 0.00) | 5 | -40.00 (-100.00 to 0.00) |
| outside-passer | material | behind | 3 | 33.33 (0.00 to 100.00) | 3 | 0.00 (0.00 to 0.00) |
| outside-passer | phase | middlegame | 0 | undefined | 0 | undefined |
| outside-passer | phase | endgame | 17 | 0.00 (-16.67 to 16.67) | 12 | -16.67 (-42.86 to 0.00) |
| outside-passer | forcing | false | 0 | undefined | 0 | undefined |
| outside-passer | forcing | true | 17 | 0.00 (-16.67 to 16.67) | 12 | -16.67 (-42.86 to 0.00) |
| outside-passer | kingDanger | false | 17 | 0.00 (-16.67 to 16.67) | 12 | -16.67 (-42.86 to 0.00) |
| outside-passer | kingDanger | true | 0 | undefined | 0 | undefined |
| trade-when-ahead | material | ahead | 2085 | -6.86 (-8.25 to -5.44) | 1033 | -6.78 (-8.81 to -4.81) |
| trade-when-ahead | material | level | 0 | undefined | 0 | undefined |
| trade-when-ahead | material | behind | 0 | undefined | 0 | undefined |
| trade-when-ahead | phase | middlegame | 1597 | -7.70 (-9.47 to -6.02) | 806 | -7.57 (-10.01 to -5.26) |
| trade-when-ahead | phase | endgame | 488 | -4.10 (-6.69 to -1.59) | 227 | -3.96 (-7.76 to -0.47) |
| trade-when-ahead | forcing | false | 0 | undefined | 0 | undefined |
| trade-when-ahead | forcing | true | 2085 | -6.86 (-8.25 to -5.44) | 1033 | -6.78 (-8.81 to -4.81) |
| trade-when-ahead | kingDanger | false | 1939 | -6.55 (-8.04 to -5.08) | 961 | -7.39 (-9.50 to -5.33) |
| trade-when-ahead | kingDanger | true | 146 | -10.96 (-16.91 to -5.23) | 72 | 1.39 (-2.99 to 6.15) |
| open-file | material | ahead | 680 | -11.32 (-14.77 to -7.74) | 351 | -15.38 (-20.18 to -10.59) |
| open-file | material | level | 1518 | -22.79 (-25.68 to -19.78) | 794 | -19.02 (-23.23 to -14.63) |
| open-file | material | behind | 617 | -13.78 (-17.83 to -9.71) | 309 | -13.59 (-19.28 to -8.06) |
| open-file | phase | middlegame | 1859 | -21.52 (-24.10 to -18.97) | 976 | -19.26 (-23.10 to -15.50) |
| open-file | phase | endgame | 956 | -11.30 (-14.24 to -8.19) | 478 | -12.34 (-16.70 to -7.91) |
| open-file | forcing | false | 2638 | -18.95 (-21.05 to -16.81) | 1356 | -17.92 (-20.97 to -14.77) |
| open-file | forcing | true | 177 | -4.52 (-10.06 to 1.05) | 98 | -4.08 (-11.43 to 3.16) |
| open-file | kingDanger | false | 2606 | -18.15 (-20.21 to -16.08) | 1311 | -16.02 (-19.18 to -12.87) |
| open-file | kingDanger | true | 209 | -16.75 (-24.62 to -8.86) | 143 | -25.87 (-34.03 to -17.91) |
| rook-on-the-seventh | material | ahead | 907 | -15.33 (-18.16 to -12.51) | 420 | -12.38 (-16.36 to -8.33) |
| rook-on-the-seventh | material | level | 837 | -17.68 (-21.46 to -13.62) | 476 | -22.48 (-27.88 to -17.23) |
| rook-on-the-seventh | material | behind | 534 | -15.17 (-19.50 to -10.95) | 280 | -15.36 (-21.38 to -9.18) |
| rook-on-the-seventh | phase | middlegame | 682 | -20.53 (-24.54 to -16.28) | 347 | -19.31 (-25.47 to -13.35) |
| rook-on-the-seventh | phase | endgame | 1596 | -14.29 (-16.69 to -11.98) | 829 | -16.28 (-19.50 to -12.77) |
| rook-on-the-seventh | forcing | false | 2107 | -17.13 (-19.23 to -14.93) | 1113 | -18.24 (-21.33 to -15.07) |
| rook-on-the-seventh | forcing | true | 171 | -4.09 (-9.47 to 1.19) | 63 | 1.59 (-3.85 to 7.35) |
| rook-on-the-seventh | kingDanger | false | 2052 | -15.59 (-17.71 to -13.35) | 1064 | -16.26 (-19.40 to -13.29) |
| rook-on-the-seventh | kingDanger | true | 226 | -21.24 (-28.95 to -14.47) | 112 | -25.89 (-36.75 to -15.09) |
| outpost | material | ahead | 860 | -16.40 (-19.25 to -13.38) | 413 | -18.89 (-23.14 to -14.79) |
| outpost | material | level | 1314 | -23.67 (-26.65 to -20.68) | 662 | -22.05 (-26.24 to -17.89) |
| outpost | material | behind | 398 | -20.10 (-25.06 to -15.20) | 184 | -16.30 (-23.24 to -9.36) |
| outpost | phase | middlegame | 1512 | -23.15 (-25.78 to -20.45) | 720 | -22.92 (-26.61 to -18.98) |
| outpost | phase | endgame | 1060 | -17.17 (-19.94 to -14.33) | 539 | -16.51 (-20.24 to -12.57) |
| outpost | forcing | false | 2346 | -21.95 (-24.00 to -19.81) | 1142 | -21.19 (-24.10 to -18.17) |
| outpost | forcing | true | 226 | -7.52 (-12.34 to -2.34) | 117 | -10.26 (-17.00 to -4.00) |
| outpost | kingDanger | false | 2435 | -20.82 (-22.82 to -18.79) | 1197 | -20.13 (-22.95 to -17.27) |
| outpost | kingDanger | true | 137 | -18.25 (-26.47 to -9.91) | 62 | -20.97 (-35.00 to -8.00) |
| pawn-break | material | ahead | 604 | -29.30 (-33.39 to -25.12) | 280 | -29.29 (-35.53 to -23.18) |
| pawn-break | material | level | 2077 | -32.93 (-35.51 to -30.36) | 1086 | -34.44 (-38.02 to -30.78) |
| pawn-break | material | behind | 534 | -22.47 (-26.98 to -17.64) | 254 | -24.41 (-31.37 to -17.53) |
| pawn-break | phase | middlegame | 2520 | -31.63 (-33.88 to -29.25) | 1239 | -34.22 (-37.54 to -30.79) |
| pawn-break | phase | endgame | 695 | -26.47 (-30.28 to -22.46) | 381 | -24.67 (-30.41 to -19.05) |
| pawn-break | forcing | false | 3210 | -30.56 (-32.47 to -28.43) | 1619 | -32.00 (-34.85 to -29.11) |
| pawn-break | forcing | true | 5 | 0.00 (0.00 to 0.00) | 1 | 0.00 (0.00 to 0.00) |
| pawn-break | kingDanger | false | 3020 | -30.17 (-32.17 to -27.98) | 1536 | -31.84 (-34.74 to -28.89) |
| pawn-break | kingDanger | true | 195 | -35.90 (-43.54 to -28.06) | 84 | -34.52 (-46.38 to -22.73) |
| passed-pawn | material | ahead | 1012 | -13.04 (-15.49 to -10.69) | 476 | -13.45 (-16.84 to -10.22) |
| passed-pawn | material | level | 731 | -16.69 (-20.35 to -12.81) | 402 | -16.67 (-21.76 to -11.40) |
| passed-pawn | material | behind | 337 | -13.35 (-17.97 to -8.36) | 153 | -14.38 (-21.13 to -7.84) |
| passed-pawn | phase | middlegame | 728 | -21.70 (-25.61 to -17.68) | 342 | -25.15 (-30.84 to -19.31) |
| passed-pawn | phase | endgame | 1352 | -10.43 (-12.44 to -8.43) | 689 | -9.72 (-12.59 to -6.75) |
| passed-pawn | forcing | false | 1769 | -15.21 (-17.25 to -13.11) | 870 | -15.86 (-18.83 to -12.84) |
| passed-pawn | forcing | true | 311 | -9.65 (-14.33 to -4.95) | 161 | -9.32 (-15.57 to -3.27) |
| passed-pawn | kingDanger | false | 1923 | -13.78 (-15.75 to -11.74) | 957 | -14.21 (-17.10 to -11.43) |
| passed-pawn | kingDanger | true | 157 | -21.66 (-29.25 to -14.48) | 74 | -22.97 (-32.89 to -13.43) |
| worst-piece | material | ahead | 641 | -13.10 (-16.40 to -9.60) | 312 | -18.27 (-23.31 to -13.24) |
| worst-piece | material | level | 1317 | -26.20 (-29.27 to -22.96) | 662 | -27.34 (-32.03 to -22.53) |
| worst-piece | material | behind | 566 | -13.96 (-18.30 to -9.87) | 259 | -15.06 (-21.43 to -8.91) |
| worst-piece | phase | middlegame | 1526 | -24.12 (-26.99 to -21.31) | 714 | -25.49 (-30.10 to -21.13) |
| worst-piece | phase | endgame | 998 | -14.03 (-17.05 to -10.98) | 519 | -18.30 (-22.70 to -14.15) |
| worst-piece | forcing | false | 2491 | -20.27 (-22.29 to -18.08) | 1210 | -22.73 (-25.87 to -19.67) |
| worst-piece | forcing | true | 33 | -9.09 (-25.00 to 7.69) | 23 | -8.70 (-30.43 to 11.54) |
| worst-piece | kingDanger | false | 2333 | -20.62 (-22.71 to -18.38) | 1135 | -22.82 (-26.00 to -19.62) |
| worst-piece | kingDanger | true | 191 | -14.14 (-21.69 to -6.28) | 98 | -18.37 (-29.47 to -7.78) |

## Fresh referee searches

The denominator is all eligible positions needing a fresh search, quiet or not. The first exact line's move is compared with the original referee's first exact line. Stored moves and saved tablebase probes do not enter this denominator.

| Rule | Period | Fresh positions | Best changed | Share changed |
|---|---|---:|---:|---|
| active-king | train | 4441 | 0 | 0.00% |
| active-king | heldout | 2229 | 0 | 0.00% |
| opposition | train | 553 | 0 | 0.00% |
| opposition | heldout | 280 | 0 | 0.00% |
| square-rule | train | 2009 | 0 | 0.00% |
| square-rule | heldout | 995 | 0 | 0.00% |
| rook-behind-passer | train | 5838 | 0 | 0.00% |
| rook-behind-passer | heldout | 2921 | 0 | 0.00% |
| cut-off-king | train | 1272 | 0 | 0.00% |
| cut-off-king | heldout | 666 | 0 | 0.00% |
| outside-passer | train | 1438 | 0 | 0.00% |
| outside-passer | heldout | 690 | 0 | 0.00% |
| trade-when-ahead | train | 6636 | 0 | 0.00% |
| trade-when-ahead | heldout | 3362 | 0 | 0.00% |
| open-file | train | 5470 | 0 | 0.00% |
| open-file | heldout | 2716 | 0 | 0.00% |
| rook-on-the-seventh | train | 6388 | 0 | 0.00% |
| rook-on-the-seventh | heldout | 3193 | 0 | 0.00% |
| outpost | train | 5992 | 0 | 0.00% |
| outpost | heldout | 3054 | 0 | 0.00% |
| pawn-break | train | 6142 | 0 | 0.00% |
| pawn-break | heldout | 3090 | 0 | 0.00% |
| passed-pawn | train | 4917 | 0 | 0.00% |
| passed-pawn | heldout | 2430 | 0 | 0.00% |
| worst-piece | train | 5000 | 0 | 0.00% |
| worst-piece | heldout | 2476 | 0 | 0.00% |

Soundness shares, all-position identity shares and coverage, and the numeric operational counters are in `rules.json`.
