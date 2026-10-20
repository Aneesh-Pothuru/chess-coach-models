# Rules of thumb: the random-rule comparison

Written by `analyze_null.py` on app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The data are the completed run's rated standard Lichess 600+0 games (CC0): July and August 2026 pooled for train, and September 2026 held out.

The addition uses 2,000 game-bootstrap resamples with seed 20261018. Intervals are 95% percentile intervals. Soundness differences below are percentage points; identity and soundness shares are percentages. Undefined subgroup draws are counted in `null.json`.

R0 is Maia-2's most likely move in a random legal subset the same size as the rule's subset. Null lift is S(R0) − S(N). Content is S(R) − S(R0). These readings change no preregistered verdict.

| Rule | Train positions | Held-out positions | Train null lift | Held-out null lift | Train content | Held-out content | Content reading |
|---|---:|---:|---|---|---|---|---|
| active-king | 8000 | 4000 | -32.77 (-33.91 to -31.61) | -32.15 (-33.88 to -30.55) | 7.56 (6.51 to 8.60) | 7.03 (5.47 to 8.48) | points to better moves than chance |
| opposition | 2775 | 1435 | -18.20 (-19.86 to -16.54) | -17.98 (-20.21 to -15.75) | 8.86 (7.39 to 10.41) | 6.97 (4.95 to 8.99) | points to better moves than chance |
| square-rule | 5073 | 2582 | -16.81 (-17.90 to -15.79) | -16.77 (-18.40 to -15.26) | 14.78 (13.82 to 15.85) | 14.64 (13.13 to 16.19) | points to better moves than chance |
| rook-behind-passer | 8000 | 4000 | -47.99 (-49.20 to -46.79) | -47.98 (-49.75 to -46.32) | 5.69 (4.70 to 6.74) | 5.78 (4.30 to 7.22) | points to better moves than chance |
| cut-off-king | 2772 | 1398 | -41.92 (-43.87 to -40.08) | -41.70 (-44.49 to -38.84) | 0.25 (-1.73 to 2.13) | 0.36 (-2.50 to 3.15) | no differently from chance |
| outside-passer | 2576 | 1303 | -43.63 (-45.85 to -41.61) | -45.51 (-48.35 to -42.75) | 27.06 (24.88 to 29.54) | 28.47 (25.40 to 31.70) | points to better moves than chance |
| trade-when-ahead | 8000 | 4000 | -63.45 (-64.54 to -62.34) | -65.00 (-66.62 to -63.42) | 51.59 (50.34 to 52.74) | 52.23 (50.50 to 54.00) | points to better moves than chance |
| open-file | 8000 | 4000 | -43.31 (-44.56 to -42.08) | -42.50 (-44.30 to -40.75) | 11.53 (10.39 to 12.70) | 11.05 (9.43 to 12.72) | points to better moves than chance |
| rook-on-the-seventh | 8000 | 4000 | -52.45 (-53.65 to -51.25) | -52.55 (-54.20 to -50.82) | 23.41 (22.25 to 24.59) | 22.80 (21.22 to 24.40) | points to better moves than chance |
| outpost | 8000 | 4000 | -52.20 (-53.39 to -51.04) | -53.57 (-55.23 to -51.85) | 20.00 (18.85 to 21.15) | 21.95 (20.35 to 23.60) | points to better moves than chance |
| pawn-break | 8000 | 4000 | -52.58 (-53.76 to -51.30) | -54.15 (-55.77 to -52.55) | 3.72 (2.69 to 4.72) | 4.60 (3.10 to 6.08) | points to better moves than chance |
| passed-pawn | 8000 | 4000 | -45.64 (-46.86 to -44.39) | -48.80 (-50.48 to -47.17) | 12.53 (11.36 to 13.71) | 15.15 (13.58 to 16.78) | points to better moves than chance |
| worst-piece | 8000 | 4000 | -45.76 (-46.91 to -44.51) | -43.50 (-45.30 to -41.77) | 5.50 (4.35 to 6.58) | 2.67 (1.12 to 4.32) | points to better moves than chance |

## Identity and the lift where the moves differ

The conditional lift is the original S(R) − S(N), restricted to R ≠ N. It uses the same game resamples as the other measures. It is undefined if no positions remain.

| Rule | Period | R = N | R0 = N | Positions with R ≠ N | Lift where R ≠ N |
|---|---|---|---|---:|---|
| active-king | train | 21.79 (20.86 to 22.71) | 10.88 (10.24 to 11.56) | 6257 | -32.24 (-33.55 to -30.82) |
| active-king | heldout | 22.53 (21.30 to 23.80) | 10.90 (9.98 to 11.85) | 3099 | -32.43 (-34.39 to -30.41) |
| opposition | train | 32.65 (30.85 to 34.38) | 23.32 (21.73 to 24.97) | 1869 | -13.86 (-15.84 to -11.96) |
| opposition | heldout | 32.68 (30.24 to 35.12) | 25.85 (23.62 to 28.08) | 966 | -16.36 (-19.14 to -13.71) |
| square-rule | train | 67.26 (65.94 to 68.60) | 8.18 (7.47 to 8.91) | 1661 | -6.20 (-7.76 to -4.66) |
| square-rule | heldout | 67.27 (65.45 to 69.05) | 7.36 (6.43 to 8.40) | 845 | -6.51 (-8.71 to -4.37) |
| rook-behind-passer | train | 7.22 (6.68 to 7.76) | 4.56 (4.14 to 5.03) | 7422 | -45.59 (-46.84 to -44.34) |
| rook-behind-passer | heldout | 7.07 (6.33 to 7.90) | 4.32 (3.75 to 4.95) | 3717 | -45.41 (-47.22 to -43.75) |
| cut-off-king | train | 4.80 (4.08 to 5.59) | 8.04 (7.03 to 9.05) | 2639 | -43.77 (-45.92 to -41.81) |
| cut-off-king | heldout | 6.22 (5.01 to 7.44) | 9.94 (8.44 to 11.52) | 1311 | -44.09 (-46.88 to -41.13) |
| outside-passer | train | 69.80 (68.09 to 71.58) | 6.99 (6.02 to 8.00) | 778 | -54.88 (-58.80 to -50.71) |
| outside-passer | heldout | 69.46 (66.92 to 71.91) | 7.98 (6.60 to 9.52) | 398 | -55.78 (-61.07 to -50.36) |
| trade-when-ahead | train | 62.48 (61.41 to 63.51) | 3.67 (3.26 to 4.10) | 3002 | -31.61 (-33.87 to -29.50) |
| trade-when-ahead | heldout | 62.05 (60.65 to 63.50) | 3.20 (2.65 to 3.73) | 1518 | -33.66 (-36.86 to -30.31) |
| open-file | train | 15.82 (14.99 to 16.64) | 9.36 (8.72 to 9.99) | 6734 | -37.76 (-39.20 to -36.32) |
| open-file | heldout | 15.93 (14.88 to 17.03) | 8.90 (8.03 to 9.78) | 3363 | -37.41 (-39.39 to -35.28) |
| rook-on-the-seventh | train | 22.53 (21.61 to 23.44) | 3.17 (2.81 to 3.56) | 6198 | -37.48 (-38.98 to -36.00) |
| rook-on-the-seventh | heldout | 20.77 (19.53 to 22.03) | 3.00 (2.48 to 3.55) | 3169 | -37.55 (-39.57 to -35.50) |
| outpost | train | 24.26 (23.35 to 25.21) | 4.12 (3.67 to 4.56) | 6059 | -42.52 (-44.04 to -41.04) |
| outpost | heldout | 24.70 (23.35 to 26.02) | 3.62 (3.05 to 4.23) | 3012 | -42.00 (-44.06 to -39.83) |
| pawn-break | train | 5.67 (5.19 to 6.16) | 3.96 (3.55 to 4.42) | 7546 | -51.79 (-53.08 to -50.48) |
| pawn-break | heldout | 5.53 (4.80 to 6.22) | 4.03 (3.45 to 4.62) | 3779 | -52.45 (-54.30 to -50.55) |
| passed-pawn | train | 23.82 (22.91 to 24.74) | 6.11 (5.60 to 6.64) | 6094 | -43.47 (-44.91 to -42.00) |
| passed-pawn | heldout | 23.47 (22.18 to 24.80) | 6.38 (5.67 to 7.10) | 3061 | -43.97 (-45.91 to -41.84) |
| worst-piece | train | 10.46 (9.76 to 11.14) | 8.09 (7.50 to 8.71) | 7163 | -44.97 (-46.33 to -43.61) |
| worst-piece | heldout | 10.97 (10.05 to 12.05) | 7.70 (6.88 to 8.53) | 3561 | -45.86 (-47.77 to -43.99) |

## Null move soundness

| Rule | Period | Both bands | His band (1300) | Band above (1500) |
|---|---|---|---|---|
| active-king | train | 51.04 (49.93 to 52.13) | 51.50 (49.91 to 53.19) | 50.71 (49.21 to 52.12) |
| active-king | heldout | 50.72 (49.08 to 52.25) | 51.55 (49.02 to 54.00) | 50.11 (48.10 to 52.20) |
| opposition | train | 73.62 (71.96 to 75.24) | 74.40 (71.90 to 76.95) | 73.09 (70.87 to 75.13) |
| opposition | heldout | 75.33 (73.03 to 77.56) | 74.75 (71.18 to 78.16) | 75.75 (72.78 to 78.55) |
| square-rule | train | 81.51 (80.41 to 82.52) | 83.15 (81.66 to 84.65) | 80.07 (78.44 to 81.54) |
| square-rule | heldout | 81.45 (79.82 to 82.92) | 82.67 (80.37 to 84.75) | 80.38 (78.30 to 82.40) |
| rook-behind-passer | train | 29.39 (28.40 to 30.39) | 30.40 (28.96 to 31.88) | 28.58 (27.25 to 29.91) |
| rook-behind-passer | heldout | 29.48 (28.05 to 30.90) | 31.24 (29.10 to 33.39) | 27.99 (26.16 to 29.87) |
| cut-off-king | train | 41.41 (39.57 to 43.18) | 41.44 (38.59 to 44.18) | 41.40 (38.98 to 43.68) |
| cut-off-king | heldout | 42.06 (39.56 to 44.64) | 41.85 (37.95 to 45.77) | 42.21 (38.67 to 45.53) |
| outside-passer | train | 39.75 (37.73 to 41.62) | 41.47 (38.35 to 44.47) | 38.52 (35.98 to 40.93) |
| outside-passer | heldout | 39.29 (36.68 to 41.90) | 41.21 (36.87 to 45.33) | 37.98 (34.56 to 41.43) |
| trade-when-ahead | train | 20.77 (19.86 to 21.68) | 20.25 (18.95 to 21.57) | 21.21 (19.92 to 22.35) |
| trade-when-ahead | heldout | 19.20 (17.95 to 20.50) | 20.50 (18.68 to 22.41) | 18.05 (16.41 to 19.69) |
| open-file | train | 31.09 (30.05 to 32.15) | 31.46 (29.95 to 32.97) | 30.79 (29.38 to 32.16) |
| open-file | heldout | 31.62 (30.25 to 33.08) | 31.95 (29.91 to 34.13) | 31.36 (29.38 to 33.32) |
| rook-on-the-seventh | train | 24.04 (23.09 to 24.96) | 24.81 (23.35 to 26.26) | 23.43 (22.22 to 24.63) |
| rook-on-the-seventh | heldout | 24.20 (22.80 to 25.55) | 25.17 (23.08 to 27.16) | 23.42 (21.64 to 25.33) |
| outpost | train | 22.32 (21.44 to 23.28) | 23.04 (21.67 to 24.44) | 21.78 (20.58 to 22.95) |
| outpost | heldout | 21.38 (20.12 to 22.65) | 22.75 (20.79 to 24.69) | 20.33 (18.70 to 21.99) |
| pawn-break | train | 20.29 (19.41 to 21.20) | 20.91 (19.58 to 22.22) | 19.79 (18.63 to 21.04) |
| pawn-break | heldout | 20.23 (18.98 to 21.40) | 21.30 (19.45 to 23.17) | 19.36 (17.75 to 21.03) |
| passed-pawn | train | 31.50 (30.44 to 32.57) | 32.61 (31.00 to 34.14) | 30.60 (29.32 to 32.01) |
| passed-pawn | heldout | 29.10 (27.72 to 30.50) | 28.24 (26.24 to 30.32) | 29.77 (27.82 to 31.67) |
| worst-piece | train | 29.35 (28.36 to 30.36) | 29.43 (27.97 to 30.95) | 29.28 (27.98 to 30.65) |
| worst-piece | heldout | 31.97 (30.58 to 33.42) | 32.17 (29.98 to 34.28) | 31.81 (29.98 to 33.79) |

## Fresh searches

These counts cover positions where R0 needed a fresh Stockfish reading. The best was searched after clearing the hash, then R0 was scored against it. Stored-move reuse and tablebase probes are outside this denominator.

| Rule | Period | Fresh searches | Best changed | Share changed |
|---|---|---:|---:|---|
| active-king | train | 5397 | 0 | 0.00% |
| active-king | heldout | 2722 | 0 | 0.00% |
| opposition | train | 724 | 0 | 0.00% |
| opposition | heldout | 358 | 0 | 0.00% |
| square-rule | train | 2197 | 0 | 0.00% |
| square-rule | heldout | 1075 | 0 | 0.00% |
| rook-behind-passer | train | 7007 | 0 | 0.00% |
| rook-behind-passer | heldout | 3504 | 0 | 0.00% |
| cut-off-king | train | 1889 | 0 | 0.00% |
| cut-off-king | heldout | 928 | 0 | 0.00% |
| outside-passer | train | 1970 | 0 | 0.00% |
| outside-passer | heldout | 995 | 0 | 0.00% |
| trade-when-ahead | train | 7492 | 0 | 0.00% |
| trade-when-ahead | heldout | 3778 | 0 | 0.00% |
| open-file | train | 6479 | 0 | 0.00% |
| open-file | heldout | 3263 | 0 | 0.00% |
| rook-on-the-seventh | train | 7398 | 0 | 0.00% |
| rook-on-the-seventh | heldout | 3705 | 0 | 0.00% |
| outpost | train | 7245 | 0 | 0.00% |
| outpost | heldout | 3635 | 0 | 0.00% |
| pawn-break | train | 7262 | 0 | 0.00% |
| pawn-break | heldout | 3648 | 0 | 0.00% |
| passed-pawn | train | 6797 | 0 | 0.00% |
| passed-pawn | heldout | 3381 | 0 | 0.00% |
| worst-piece | train | 6673 | 0 | 0.00% |
| worst-piece | heldout | 3365 | 0 | 0.00% |

## Rules left out

The addition leaves out rules with fewer than 300 held-out positions. No addition measure or content reading is computed for them.

| Rule | Train positions | Held-out positions |
|---|---:|---:|
| lucena | 19 | 6 |
| philidor | 52 | 30 |

## Run times

Worker time sums elapsed time across workers and resumes. It is not CPU time. Completed-row instrument time excludes failed attempts, which are kept separately in `null.json`. Missing values stay unknown.

| Month | Completed rows | Cumulative worker seconds | Completed Maia seconds | Completed engine seconds | Failed engine seconds | Stopped worker jobs |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07 | 42656 | 18,797.61 | 2,333.51 | 16,448.61 | 0.00 | 0 |
| 2026-08 | 42611 | 16,454.22 | 2,238.41 | 14,201.51 | 0.00 | 0 |
| 2026-09 | 42754 | 52,978.90 | 32,540.64 | 20,418.40 | 0.00 | 0 |

Analysis took 19.72 elapsed seconds.
