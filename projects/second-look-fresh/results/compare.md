# Cleared second looks: results

Written by analyze.mjs on app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`, records `aed714ada579782ce73630596e59c8b65e74cb30`, candidate `8f1d16bc8d412dd2f9584c6eec3aea82ac3eefa22d15aed9be4ff6b05f0e89e1`. 60 frozen games, both players; cases SHA-256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`. stockfish@18.0.8/stockfish-18-lite-single/nn-9067e33176e8, one thread and 128 MB hash, no evaluation cache.

2000 paired Poisson(1) draws over games, seed 20261014. Ordinary intervals are 95%; the seven decision effects use 99.285714% Bonferroni intervals. Shares pool plies across games.

| Device | Arm | Miss share (95%) | Extra share (95%) | Predecessor status |
|---|---|---|---|---|
| phone | baseline | 8.24% (5.18% to 11.67%) | 7.14% (4.23% to 10.04%) | differs |
| phone | candidate | 3.56% (1.87% to 5.24%) | 4.13% (1.67% to 6.90%) | unclear |
| desktop | baseline | 5.88% (3.66% to 8.36%) | 7.51% (4.81% to 10.48%) | unclear |
| desktop | candidate | 2.67% (1.09% to 4.34%) | 3.24% (1.22% to 5.68%) | unclear |

| Device | Candidate minus baseline miss (corrected) | Extra (corrected) | Narrows |
|---|---|---|---|
| phone | -4.67% (-9.63% to -0.06%) | -3.01% (-7.89% to 2.65%) | true |
| desktop | -3.21% (-7.33% to 0.64%) | -4.27% (-8.78% to 0.35%) | false |

| Profile | Common looks | Unresolved references | Baseline error (95%) | Candidate error (95%) | Error change (corrected) | Guard |
|---|---|---|---|---|---|---|
| phone | 1000 | 0 | 5.80% (4.26% to 7.56%) | 5.60% (4.08% to 7.32%) | -0.20% (-1.93% to 1.45%) | unclear |
| desktop | 1000 | 0 | 4.20% (3.01% to 5.43%) | 6.00% (4.60% to 7.55%) | 1.80% (0.01% to 3.49%) | unclear |
| routine | 2384 | 0 | 2.31% (1.71% to 2.93%) | 2.85% (2.18% to 3.52%) | 0.55% (-0.27% to 1.37%) | unclear |

The reference starts fresh at 7500000 nodes, MultiPV 3; an incomplete result gets one fresh retry. The guard is the app's serious/not-serious judgment from the accepted second-look scores, captured before routine teaching. It uses a 1.00% error-rate margin. An incomplete arm look counts as wrong. Any unresolved reference prevents that profile's guard passing.

| Profile | Arm | Looks | Second-look seconds | Mean seconds/look | Median depth |
|---|---|---|---|---|---|
| phone | baseline | 1000 | 2617.22 | 2.617 | 17 |
| phone | candidate | 1000 | 2181.98 | 2.182 | 17 |
| desktop | baseline | 1000 | 2485.11 | 2.485 | 17 |
| desktop | candidate | 1000 | 2132.20 | 2.132 | 17 |
| routine | baseline | 2384 | 3498.92 | 1.468 | 17 |
| routine | candidate | 2384 | 3186.06 | 1.336 | 17 |

| Profile | Arm | Flags | Initial looks | Adaptive retries | Unknown records | Incomplete looks | Tablebase positions / records |
|---|---|---|---|---|---|---|---|
| phone | baseline | 1789 | 1000 | 270 | 0 | 0 | 0 / 0 |
| phone | candidate | 1789 | 1000 | 272 | 0 | 0 | 0 / 0 |
| desktop | baseline | 1792 | 1000 | 273 | 0 | 0 | 0 / 0 |
| desktop | candidate | 1792 | 1000 | 273 | 0 | 0 | 0 / 0 |
| routine | baseline | 2384 | 2384 | 454 | 0 | 0 | 209 / 202 |
| routine | candidate | 2384 | 2384 | 454 | 0 | 0 | 209 / 202 |

| Device | Arm | Disagreement | Plies | Device attempted look | Device verified record | Routine attempted look | Routine tablebase record |
|---|---|---|---|---|---|---|---|
| phone | baseline | missed | 28 | 23 | 23 | 28 | 0 |
| phone | baseline | extra | 24 | 24 | 24 | 23 | 1 |
| phone | candidate | missed | 12 | 9 | 9 | 12 | 0 |
| phone | candidate | extra | 14 | 14 | 14 | 14 | 1 |
| desktop | baseline | missed | 20 | 17 | 17 | 20 | 0 |
| desktop | baseline | extra | 26 | 26 | 26 | 26 | 0 |
| desktop | candidate | missed | 9 | 6 | 6 | 9 | 0 |
| desktop | candidate | extra | 11 | 11 | 11 | 11 | 1 |

| Profile | Arm | Attempt | Count | Search and reset seconds | Mean seconds | Median candidate depth | Restricted searches | Reset seconds | Failed calls |
|---|---|---|---|---|---|---|---|---|---|
| phone | baseline | initial | 1000 | 1676.91 | 1.677 | 16 | 558 (55.80%) | 0.000 | 0 |
| phone | baseline | adaptive | 270 | 940.30 | 3.483 | 18 | 153 (56.67%) | 0.000 | 0 |
| phone | candidate | initial | 1000 | 1389.17 | 1.389 | 16 | 553 (55.30%) | 7.994 | 0 |
| phone | candidate | adaptive | 272 | 792.81 | 2.915 | 18 | 154 (56.62%) | 2.225 | 0 |
| desktop | baseline | initial | 1000 | 1585.80 | 1.586 | 16 | 565 (56.50%) | 0.000 | 0 |
| desktop | baseline | adaptive | 273 | 899.31 | 3.294 | 18 | 159 (58.24%) | 0.000 | 0 |
| desktop | candidate | initial | 1000 | 1354.42 | 1.354 | 16 | 561 (56.10%) | 7.754 | 0 |
| desktop | candidate | adaptive | 273 | 777.79 | 2.849 | 18 | 158 (57.88%) | 2.116 | 0 |
| routine | baseline | initial | 2384 | 2384.73 | 1.000 | 17 | 737 (30.91%) | 0.000 | 0 |
| routine | baseline | adaptive | 454 | 1114.20 | 2.454 | 18 | 235 (51.76%) | 0.000 | 0 |
| routine | candidate | initial | 2384 | 2210.02 | 0.927 | 17 | 713 (29.91%) | 14.954 | 0 |
| routine | candidate | adaptive | 454 | 976.04 | 2.150 | 18 | 220 (48.46%) | 2.981 | 0 |

| Device | Arm | Blunders missed / extra (95%) | Inaccuracies missed / extra (95%) | Classes differing (95%) | Side accuracy bias / MAE / largest |
|---|---|---|---|---|---|
| phone | baseline | 8.15% (3.70% to 12.82%) / 6.77% (3.00% to 10.83%) | 34.46% (27.68% to 41.55%) / 25.26% (19.81% to 30.65%) | 27.65% (25.67% to 29.68%) | -0.98 / 2.12 / 7.00 |
| phone | candidate | 5.11% (1.57% to 9.38%) / 1.52% (0.00% to 3.88%) | 25.69% (20.00% to 32.11%) / 14.44% (9.56% to 19.77%) | 24.81% (22.70% to 26.98%) | -1.11 / 2.03 / 6.67 |
| desktop | baseline | 7.41% (2.96% to 12.14%) / 8.09% (4.04% to 12.27%) | 31.69% (26.28% to 37.79%) / 23.18% (18.24% to 28.30%) | 24.69% (22.80% to 26.81%) | -1.11 / 1.75 / 7.35 |
| desktop | candidate | 5.11% (1.57% to 9.38%) / 1.52% (0.00% to 3.88%) | 17.13% (12.68% to 21.96%) / 12.30% (8.05% to 16.78%) | 21.29% (19.44% to 23.19%) | -1.15 / 1.82 / 7.49 |

compare.json also reports full review seconds, the count, mean, median and 90th percentile of search times and depths, their paired changes on common plies, restricted-search depth and time, flags without an attempted look, and each record evidence status. Attempt times include reset, candidate and any restricted played-move search; retained depth is read before teaching.

Narrows for both devices: false. Both devices meet the predecessor's agreement bar: false. Every quality guard passes: false. Decision: **do not keep: inconclusive**.

Costs, blunders, inaccuracies, class changes and accuracy are descriptive. This run does not measure the phone hardware, its smaller hash, cached evidence, or migration of reviews already kept.
