# Rules of thumb: results

Written by `analyze.py` on the app at `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The data are rated standard Lichess 600+0 games (CC0), July and August 2026 pooled for train and September 2026 held out.

Intervals are 95% percentile intervals from 2,000 bootstrap samples over games, seed 20261018. Shares and differences below are percentage points. Undefined subgroup draws are counted in `rules.json`.

| Rule | Train positions | Held-out positions | Train lift | Held-out lift | Verdict | A step up |
|---|---:|---:|---|---|---|---|
| active-king | 8000 | 4000 | -25.21 (-26.30 to -24.11) | -25.12 (-26.75 to -23.50) | It misleads | no |
| opposition | 2775 | 1435 | -9.33 (-10.70 to -8.04) | -11.01 (-12.89 to -9.13) | It misleads | no |
| square-rule | 5073 | 2582 | -2.03 (-2.56 to -1.52) | -2.13 (-2.83 to -1.43) | It misleads | no |
| rook-behind-passer | 8000 | 4000 | -42.30 (-43.51 to -41.14) | -42.20 (-43.90 to -40.58) | It misleads | no |
| cut-off-king | 2772 | 1398 | -41.67 (-43.72 to -39.72) | -41.34 (-44.06 to -38.56) | It misleads | no |
| outside-passer | 2576 | 1303 | -16.58 (-18.05 to -14.91) | -17.04 (-19.19 to -14.89) | It misleads | no |
| trade-when-ahead | 8000 | 4000 | -11.86 (-12.79 to -11.00) | -12.78 (-14.12 to -11.43) | It misleads | no |
| lucena | 19 | 6 | 0.00 (0.00 to 0.00) | 0.00 (0.00 to 0.00) | not enough data (n=6) | no |
| philidor | 52 | 30 | -9.62 (-21.15 to 1.92) | -6.67 (-20.00 to 6.67) | not enough data (n=30) | no |
| open-file | 8000 | 4000 | -31.79 (-33.04 to -30.56) | -31.45 (-33.18 to -29.62) | It misleads | no |
| rook-on-the-seventh | 8000 | 4000 | -29.04 (-30.26 to -27.84) | -29.75 (-31.47 to -28.05) | It misleads | no |
| outpost | 8000 | 4000 | -32.20 (-33.41 to -30.99) | -31.62 (-33.30 to -29.90) | It misleads | yes |
| pawn-break | 8000 | 4000 | -48.85 (-50.06 to -47.57) | -49.55 (-51.30 to -47.75) | It misleads | no |
| passed-pawn | 8000 | 4000 | -33.11 (-34.30 to -31.92) | -33.65 (-35.25 to -31.92) | It misleads | no |
| worst-piece | 8000 | 4000 | -40.26 (-41.55 to -39.00) | -40.83 (-42.62 to -39.10) | It misleads | no |

## Counts and run times

| Rule | Month | Available positions | Games with availability | Retained positions | Scored positions |
|---|---|---:|---:|---:|---:|
| active-king | 2026-07 | 135340 | 7787 | 4000 | 4000 |
| active-king | 2026-08 | 136917 | 7780 | 4000 | 4000 |
| active-king | 2026-09 | 136138 | 7824 | 4000 | 4000 |
| opposition | 2026-07 | 14014 | 1402 | 1402 | 1402 |
| opposition | 2026-08 | 13060 | 1373 | 1373 | 1373 |
| opposition | 2026-09 | 13783 | 1435 | 1435 | 1435 |
| square-rule | 2026-07 | 10157 | 2557 | 2557 | 2557 |
| square-rule | 2026-08 | 10094 | 2516 | 2516 | 2516 |
| square-rule | 2026-09 | 10202 | 2582 | 2582 | 2582 |
| rook-behind-passer | 2026-07 | 114966 | 15068 | 4000 | 4000 |
| rook-behind-passer | 2026-08 | 113188 | 14973 | 4000 | 4000 |
| rook-behind-passer | 2026-09 | 113595 | 15025 | 4000 | 4000 |
| cut-off-king | 2026-07 | 10360 | 1382 | 1382 | 1382 |
| cut-off-king | 2026-08 | 10058 | 1390 | 1390 | 1390 |
| cut-off-king | 2026-09 | 10328 | 1398 | 1398 | 1398 |
| outside-passer | 2026-07 | 2522 | 1283 | 1283 | 1283 |
| outside-passer | 2026-08 | 2506 | 1293 | 1293 | 1293 |
| outside-passer | 2026-09 | 2683 | 1303 | 1303 | 1303 |
| trade-when-ahead | 2026-07 | 24948 | 12192 | 4000 | 4000 |
| trade-when-ahead | 2026-08 | 24701 | 12127 | 4000 | 4000 |
| trade-when-ahead | 2026-09 | 24709 | 12196 | 4000 | 4000 |
| lucena | 2026-07 | 14 | 8 | 8 | 8 |
| lucena | 2026-08 | 17 | 11 | 11 | 11 |
| lucena | 2026-09 | 8 | 6 | 6 | 6 |
| philidor | 2026-07 | 56 | 24 | 24 | 24 |
| philidor | 2026-08 | 58 | 28 | 28 | 28 |
| philidor | 2026-09 | 49 | 30 | 30 | 30 |
| open-file | 2026-07 | 944868 | 29737 | 4000 | 4000 |
| open-file | 2026-08 | 940326 | 29734 | 4000 | 4000 |
| open-file | 2026-09 | 940832 | 29752 | 4000 | 4000 |
| rook-on-the-seventh | 2026-07 | 95447 | 18787 | 4000 | 4000 |
| rook-on-the-seventh | 2026-08 | 95465 | 18635 | 4000 | 4000 |
| rook-on-the-seventh | 2026-09 | 95814 | 18606 | 4000 | 4000 |
| outpost | 2026-07 | 74796 | 14990 | 4000 | 4000 |
| outpost | 2026-08 | 75637 | 14936 | 4000 | 4000 |
| outpost | 2026-09 | 74537 | 14984 | 4000 | 4000 |
| pawn-break | 2026-07 | 354203 | 27121 | 4000 | 4000 |
| pawn-break | 2026-08 | 348416 | 27121 | 4000 | 4000 |
| pawn-break | 2026-09 | 353013 | 27028 | 4000 | 4000 |
| passed-pawn | 2026-07 | 307287 | 23276 | 4000 | 4000 |
| passed-pawn | 2026-08 | 308472 | 23347 | 4000 | 4000 |
| passed-pawn | 2026-09 | 308609 | 23203 | 4000 | 4000 |
| worst-piece | 2026-07 | 903389 | 29327 | 4000 | 4000 |
| worst-piece | 2026-08 | 898592 | 29276 | 4000 | 4000 |
| worst-piece | 2026-09 | 903422 | 29317 | 4000 | 4000 |

## Availability after the amendments

These counts compare board availability before sampling. The removed definitions appear only in this audit and receive no score or verdict.

| Definition | Month | Original gain-only positions | Amended positions | Gained positions | Lost positions |
|---|---|---:|---:|---:|---:|
| active-king | 2026-07 | 135340 | 135340 | 0 | 0 |
| opposition | 2026-07 | 14014 | 14014 | 0 | 0 |
| square-rule | 2026-07 | 10157 | 10157 | 0 | 0 |
| rook-behind-passer | 2026-07 | 114966 | 114966 | 0 | 0 |
| cut-off-king | 2026-07 | 10360 | 10360 | 0 | 0 |
| outside-passer | 2026-07 | 0 | 2522 | 2522 | 0 |
| trade-when-ahead | 2026-07 | 0 | 24948 | 24948 | 0 |
| lucena | 2026-07 | 0 | 14 | 14 | 0 |
| philidor | 2026-07 | 0 | 56 | 56 | 0 |
| open-file | 2026-07 | 944868 | 944868 | 0 | 0 |
| rook-on-the-seventh | 2026-07 | 95447 | 95447 | 0 | 0 |
| outpost | 2026-07 | 74796 | 74796 | 0 | 0 |
| pawn-break | 2026-07 | 354203 | 354203 | 0 | 0 |
| passed-pawn | 2026-07 | 307287 | 307287 | 0 | 0 |
| bishop-pair (removed) | 2026-07 | 0 | 0 | 0 | 0 |
| king-shelter (removed) | 2026-07 | 0 | 0 | 0 | 0 |
| worst-piece | 2026-07 | 903389 | 903389 | 0 | 0 |
| active-king | 2026-08 | 136917 | 136917 | 0 | 0 |
| opposition | 2026-08 | 13060 | 13060 | 0 | 0 |
| square-rule | 2026-08 | 10094 | 10094 | 0 | 0 |
| rook-behind-passer | 2026-08 | 113188 | 113188 | 0 | 0 |
| cut-off-king | 2026-08 | 10058 | 10058 | 0 | 0 |
| outside-passer | 2026-08 | 0 | 2506 | 2506 | 0 |
| trade-when-ahead | 2026-08 | 0 | 24701 | 24701 | 0 |
| lucena | 2026-08 | 0 | 17 | 17 | 0 |
| philidor | 2026-08 | 0 | 58 | 58 | 0 |
| open-file | 2026-08 | 940326 | 940326 | 0 | 0 |
| rook-on-the-seventh | 2026-08 | 95465 | 95465 | 0 | 0 |
| outpost | 2026-08 | 75637 | 75637 | 0 | 0 |
| pawn-break | 2026-08 | 348416 | 348416 | 0 | 0 |
| passed-pawn | 2026-08 | 308472 | 308472 | 0 | 0 |
| bishop-pair (removed) | 2026-08 | 0 | 0 | 0 | 0 |
| king-shelter (removed) | 2026-08 | 0 | 0 | 0 | 0 |
| worst-piece | 2026-08 | 898592 | 898592 | 0 | 0 |
| active-king | 2026-09 | 136138 | 136138 | 0 | 0 |
| opposition | 2026-09 | 13783 | 13783 | 0 | 0 |
| square-rule | 2026-09 | 10202 | 10202 | 0 | 0 |
| rook-behind-passer | 2026-09 | 113595 | 113595 | 0 | 0 |
| cut-off-king | 2026-09 | 10328 | 10328 | 0 | 0 |
| outside-passer | 2026-09 | 0 | 2683 | 2683 | 0 |
| trade-when-ahead | 2026-09 | 0 | 24709 | 24709 | 0 |
| lucena | 2026-09 | 0 | 8 | 8 | 0 |
| philidor | 2026-09 | 0 | 49 | 49 | 0 |
| open-file | 2026-09 | 940832 | 940832 | 0 | 0 |
| rook-on-the-seventh | 2026-09 | 95814 | 95814 | 0 | 0 |
| outpost | 2026-09 | 74537 | 74537 | 0 | 0 |
| pawn-break | 2026-09 | 353013 | 353013 | 0 | 0 |
| passed-pawn | 2026-09 | 308609 | 308609 | 0 | 0 |
| bishop-pair (removed) | 2026-09 | 0 | 0 | 0 | 0 |
| king-shelter (removed) | 2026-09 | 0 | 0 | 0 | 0 |
| worst-piece | 2026-09 | 903422 | 903422 | 0 | 0 |

| Position pattern | Month | Earlier raw mover-note positions | Positions for the intended side | Removed positions | Earlier raw mover-note moves | Moves for the intended side | Removed moves |
|---|---|---:|---:|---:|---:|---:|---:|
| lucena | 2026-07 | 16 | 14 | 2 | 20 | 15 | 5 |
| philidor | 2026-07 | 78 | 56 | 22 | 104 | 76 | 28 |
| lucena | 2026-08 | 17 | 17 | 0 | 17 | 17 | 0 |
| philidor | 2026-08 | 65 | 58 | 7 | 92 | 82 | 10 |
| lucena | 2026-09 | 11 | 8 | 3 | 15 | 9 | 6 |
| philidor | 2026-09 | 60 | 49 | 11 | 84 | 67 | 17 |

Worker seconds sum across workers and resumes. Instrument times cover completed rows; failed attempts are separate. Missing timings are not counted as zero.

| Month | Stream checkpointed seconds | Completed availability seconds | Cumulative score worker seconds | Maia seconds | Engine seconds | Tablebase seconds | Completed-row tablebase retries | Failed-attempt tablebase retries |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-07 | 136.45 | 9,098.02 | 39,490.38 | 3,077.65 | 34,687.85 | 1,636.16 | 176 | 12 |
| 2026-08 | 215.40 | 3,930.53 | 38,600.68 | 2,646.73 | 30,123.39 | 2,990.09 | 309 | 12 |
| 2026-09 | 299.71 | 3,403.65 | 44,747.80 | 2,846.67 | 31,833.34 | 2,133.46 | 354 | 21 |

| Month | Backfilled games | Backfilled positions | Backfill seconds | Reused describeMove calls | Fresh describeMove calls | Trade reader calls | Trade reader seconds |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-07 | 9849 | 472696 | 36.36 | 13094213 | 26515012 | 697995 | 28.54 |
| 2026-08 | 0 | 0 | 0 | 0 | 39419768 | 696526 | 5.62 |
| 2026-09 | 0 | 0 | 0 | 0 | 39479836 | 700205 | 4.97 |

| Stage | Month | Attempts | Completed jobs | Stopped jobs | Unfinished jobs | Stopped durations unknown | Cumulative finished invocation seconds | Known elapsed seconds |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| stream | 2026-07 | 1 | 1 | 0 | 0 | 0 | 136.91 | 136.91 |
| stream | 2026-08 | 1 | 1 | 0 | 0 | 0 | 216.06 | 216.06 |
| stream | 2026-09 | 1 | 1 | 0 | 0 | 0 | 300.38 | 300.38 |
| positions | 2026-07 | 2 | 1 | 1 | 0 | 1 | unrecorded | 3,011.01 |
| positions | 2026-08 | 1 | 1 | 0 | 0 | 0 | 1,984.05 | 1,984.05 |
| positions | 2026-09 | 1 | 1 | 0 | 0 | 0 | 1,720.40 | 1,720.40 |
| score | 2026-07 | 4 | 1 | 3 | 0 | 0 | 19,820.11 | 19,820.11 |
| score | 2026-08 | 9 | 1 | 8 | 0 | 0 | 17,153.59 | 17,153.59 |
| score | 2026-09 | 9 | 1 | 8 | 0 | 0 | 18,482.59 | 18,482.59 |
| backfill | 2026-07 | 20 | 20 | 0 | 0 | 0 | 145.94 | 145.94 |
| backfill | 2026-08 | 20 | 20 | 0 | 0 | 0 | 105.50 | 105.50 |
| backfill | 2026-09 | 20 | 20 | 0 | 0 | 0 | 104.61 | 104.61 |

| Stage | Month | Stop reason | Jobs |
|---|---|---|---:|
| positions | 2026-07 | reviewer-amendment-sigterm | 1 |
| score | 2026-07 | stage-failure | 3 |
| score | 2026-08 | stage-failure | 8 |
| score | 2026-09 | stage-failure | 8 |

Analysis elapsed seconds are recorded separately. Stage restart backoffs and checks that found a completed stage are in `rules.json`.

## active-king

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 58.60 (57.45 to 59.61) | 83.81 (82.94 to 84.58) | 78.89 (78.03 to 79.72) | -25.21 (-26.30 to -24.11) | 18.45 (17.57 to 19.29) | 17.06 (16.55 to 17.58) |
| train, 1300 | 3344 | 58.55 (56.94 to 60.22) | 84.00 (82.78 to 85.24) | 78.62 (77.26 to 80.07) | -25.45 (-27.26 to -23.56) | 17.34 (16.07 to 18.75) | 16.62 (15.87 to 17.48) |
| train, 1500 | 4656 | 58.63 (57.22 to 60.03) | 83.68 (82.59 to 84.69) | 79.08 (77.92 to 80.20) | -25.04 (-26.47 to -23.53) | 19.24 (18.10 to 20.35) | 17.38 (16.70 to 18.07) |
| heldout, both | 4000 | 57.75 (56.23 to 59.30) | 82.88 (81.67 to 84.00) | 78.72 (77.42 to 79.97) | -25.12 (-26.75 to -23.50) | 18.50 (17.32 to 19.70) | 17.34 (16.61 to 18.06) |
| heldout, 1300 | 1713 | 56.86 (54.46 to 59.24) | 83.19 (81.42 to 84.92) | 78.28 (76.30 to 80.19) | -26.33 (-28.87 to -23.97) | 17.45 (15.72 to 19.31) | 17.61 (16.49 to 18.78) |
| heldout, 1500 | 2287 | 58.42 (56.40 to 60.48) | 82.64 (81.03 to 84.16) | 79.06 (77.39 to 80.64) | -24.22 (-26.32 to -22.09) | 19.28 (17.74 to 20.93) | 17.13 (16.14 to 18.06) |

Adoption above minus his band: train 1.90 (0.09 to 3.65); held out 1.83 (-0.67 to 4.13).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 408395/4294043 (9.51%) | 174257/1893561 (9.20%) | 234138/2400482 (9.75%) |
| train | 272257/2863318 (9.51%) | 115767/1258820 (9.20%) | 156490/1604498 (9.75%) |
| heldout | 136138/1430725 (9.52%) | 58490/634741 (9.21%) | 77648/795984 (9.75%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 5496/2504 | 67.79 (66.55 to 69.00) | 29.38 (27.07 to 31.65) | 2734/1266 | 67.23 (65.37 to 68.94) | 29.94 (26.75 to 33.21) | no |
| opponentThreat | true | 2504/5496 | 38.42 (36.47 to 40.30) | -29.38 (-31.65 to -27.07) | 1266/2734 | 37.28 (34.69 to 39.98) | -29.94 (-33.21 to -26.75) | yes |
| material | ahead | 2898/5102 | 68.12 (66.54 to 69.78) | 14.92 (12.74 to 17.07) | 1366/2634 | 68.30 (65.63 to 70.63) | 16.02 (12.80 to 19.11) | no |
| material | level | 3017/4983 | 47.00 (45.18 to 48.75) | -18.62 (-20.92 to -16.47) | 1536/2464 | 46.35 (43.82 to 48.93) | -18.50 (-21.70 to -15.42) | yes |
| material | behind | 2085/5915 | 62.16 (60.01 to 64.27) | 4.81 (2.28 to 7.30) | 1098/2902 | 60.56 (57.63 to 63.48) | 3.88 (0.61 to 7.26) | no |
| phase | middlegame | 0/8000 | undefined | undefined | 0/4000 | undefined | undefined | no |
| phase | endgame | 8000/0 | 58.60 (57.45 to 59.61) | undefined | 4000/0 | 57.75 (56.23 to 59.30) | undefined | no |
| forcing | false | 7998/2 | 58.59 (57.44 to 59.61) | -41.41 (-42.54 to -40.39) | 3999/1 | 57.74 (56.20 to 59.30) | -42.26 (-43.79 to -40.76) | yes |
| forcing | true | 2/7998 | 100.00 (100.00 to 100.00) | 41.41 (40.39 to 42.54) | 1/3999 | 100.00 (100.00 to 100.00) | 42.26 (40.76 to 43.79) | no |
| kingDanger | false | 8000/0 | 58.60 (57.45 to 59.61) | undefined | 4000/0 | 57.75 (56.23 to 59.30) | undefined | no |
| kingDanger | true | 0/8000 | undefined | undefined | 0/4000 | undefined | undefined | no |

The descriptive tree's held-out accuracy is 65.80 (64.28 to 67.20); his band 65.79 (63.55 to 68.02), the band above 65.81 (63.88 to 67.77). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 3312,
  "predictUnsound": false,
  "feature": "opponentThreat",
  "equals": false,
  "giniGain": 0.03711275326813342,
  "yes": {
    "positions": 5496,
    "unsound": 1770,
    "predictUnsound": false,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 0.01560687289138815,
    "yes": {
      "positions": 2082,
      "unsound": 435,
      "predictUnsound": false
    },
    "no": {
      "positions": 3414,
      "unsound": 1335,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 2504,
    "unsound": 1542,
    "predictUnsound": true,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.01569075307767258,
    "yes": {
      "positions": 993,
      "unsound": 720,
      "predictUnsound": true
    },
    "no": {
      "positions": 1511,
      "unsound": 822,
      "predictUnsound": true
    }
  }
}
```

## opposition

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 2775 | 82.49 (81.12 to 83.82) | 91.82 (90.77 to 92.79) | 90.23 (89.12 to 91.24) | -9.33 (-10.70 to -8.04) | 29.73 (28.04 to 31.46) | 29.62 (28.26 to 30.98) |
| train, 1300 | 1129 | 83.08 (80.90 to 85.20) | 92.21 (90.72 to 93.71) | 90.70 (89.05 to 92.36) | -9.12 (-11.33 to -6.97) | 28.88 (26.25 to 31.59) | 28.38 (26.26 to 30.46) |
| train, 1500 | 1646 | 82.08 (80.22 to 83.86) | 91.56 (90.24 to 92.80) | 89.91 (88.44 to 91.32) | -9.48 (-11.19 to -7.80) | 30.32 (28.17 to 32.48) | 30.47 (28.71 to 32.17) |
| heldout, both | 1435 | 82.30 (80.35 to 84.25) | 93.31 (91.98 to 94.56) | 91.36 (89.83 to 92.75) | -11.01 (-12.89 to -9.13) | 31.36 (29.06 to 33.73) | 29.83 (27.97 to 31.70) |
| heldout, 1300 | 602 | 82.23 (79.04 to 85.12) | 93.19 (91.10 to 95.14) | 91.69 (89.58 to 93.89) | -10.96 (-13.78 to -8.33) | 32.23 (28.45 to 35.98) | 31.54 (28.73 to 34.49) |
| heldout, 1500 | 833 | 82.35 (79.75 to 84.98) | 93.40 (91.70 to 94.99) | 91.12 (89.12 to 92.98) | -11.04 (-13.51 to -8.53) | 30.73 (27.72 to 33.88) | 28.59 (26.28 to 31.04) |

Adoption above minus his band: train 1.44 (-2.05 to 4.75); held out -1.49 (-6.26 to 3.30).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 40857/4294043 (0.95%) | 17331/1893561 (0.92%) | 23526/2400482 (0.98%) |
| train | 27074/2863318 (0.95%) | 11178/1258820 (0.89%) | 15896/1604498 (0.99%) |
| heldout | 13783/1430725 (0.96%) | 6153/634741 (0.97%) | 7630/795984 (0.96%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 2382/393 | 84.63 (83.24 to 86.06) | 15.17 (10.61 to 19.90) | 1252/183 | 84.11 (82.06 to 86.04) | 14.16 (7.26 to 21.19) | no |
| opponentThreat | true | 393/2382 | 69.47 (64.84 to 73.71) | -15.17 (-19.90 to -10.61) | 183/1252 | 69.95 (63.13 to 76.56) | -14.16 (-21.19 to -7.26) | yes |
| material | ahead | 506/2269 | 93.08 (90.83 to 95.19) | 12.96 (10.21 to 15.61) | 293/1142 | 94.54 (91.82 to 97.02) | 15.38 (11.92 to 18.93) | no |
| material | level | 1745/1030 | 78.11 (76.21 to 80.00) | -11.79 (-14.37 to -9.05) | 880/555 | 77.16 (74.41 to 79.89) | -13.29 (-17.08 to -9.46) | yes |
| material | behind | 524/2251 | 86.83 (83.71 to 89.52) | 5.36 (1.93 to 8.69) | 262/1173 | 85.88 (81.50 to 90.23) | 4.38 (-0.55 to 9.17) | no |
| phase | middlegame | 0/2775 | undefined | undefined | 0/1435 | undefined | undefined | no |
| phase | endgame | 2775/0 | 82.49 (81.12 to 83.82) | undefined | 1435/0 | 82.30 (80.35 to 84.25) | undefined | no |
| forcing | false | 2535/240 | 81.66 (80.17 to 83.06) | -9.59 (-13.22 to -5.67) | 1294/141 | 81.99 (79.83 to 84.02) | -3.11 (-9.17 to 3.33) | no |
| forcing | true | 240/2535 | 91.25 (87.39 to 94.54) | 9.59 (5.67 to 13.22) | 141/1294 | 85.11 (78.95 to 90.71) | 3.11 (-3.33 to 9.17) | no |
| kingDanger | false | 2742/33 | 82.31 (80.92 to 83.66) | -14.66 (-18.76 to -7.53) | 1423/12 | 82.15 (80.14 to 84.10) | -17.85 (-19.86 to -15.90) | yes |
| kingDanger | true | 33/2742 | 96.97 (89.74 to 100.00) | 14.66 (7.53 to 18.76) | 12/1423 | 100.00 (100.00 to 100.00) | 17.85 (15.90 to 19.86) | no |

The descriptive tree's held-out accuracy is 82.30 (80.35 to 84.25); his band 82.23 (79.04 to 85.12), the band above 82.35 (79.75 to 84.98). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 2775,
  "unsound": 486,
  "predictUnsound": false,
  "feature": "material",
  "equals": "level",
  "giniGain": 0.006493235290824511,
  "yes": {
    "positions": 1745,
    "unsound": 382,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.007230624212236327,
    "yes": {
      "positions": 1486,
      "unsound": 288,
      "predictUnsound": false
    },
    "no": {
      "positions": 259,
      "unsound": 94,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 1030,
    "unsound": 104,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.0025902598389225965,
    "yes": {
      "positions": 896,
      "unsound": 78,
      "predictUnsound": false
    },
    "no": {
      "positions": 134,
      "unsound": 26,
      "predictUnsound": false
    }
  }
}
```

## square-rule

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 5073 | 96.29 (95.78 to 96.79) | 98.32 (97.95 to 98.68) | 97.14 (96.65 to 97.60) | -2.03 (-2.56 to -1.52) | 59.81 (58.43 to 61.19) | 57.63 (56.57 to 58.68) |
| train, 1300 | 2368 | 96.37 (95.59 to 97.08) | 98.65 (98.17 to 99.09) | 97.30 (96.66 to 97.93) | -2.28 (-3.00 to -1.58) | 58.91 (56.90 to 60.93) | 56.53 (54.92 to 58.02) |
| train, 1500 | 2705 | 96.23 (95.48 to 96.95) | 98.04 (97.49 to 98.56) | 97.01 (96.33 to 97.65) | -1.81 (-2.57 to -1.08) | 60.59 (58.78 to 62.47) | 58.59 (57.24 to 60.05) |
| heldout, both | 2582 | 96.09 (95.31 to 96.82) | 98.22 (97.71 to 98.68) | 96.86 (96.20 to 97.48) | -2.13 (-2.83 to -1.43) | 60.26 (58.40 to 62.20) | 58.03 (56.55 to 59.47) |
| heldout, 1300 | 1206 | 95.69 (94.47 to 96.77) | 98.18 (97.36 to 98.88) | 97.18 (96.17 to 98.03) | -2.49 (-3.62 to -1.37) | 59.04 (56.23 to 61.92) | 56.28 (54.19 to 58.40) |
| heldout, 1500 | 1376 | 96.44 (95.38 to 97.36) | 98.26 (97.54 to 98.93) | 96.58 (95.61 to 97.50) | -1.82 (-2.79 to -0.87) | 61.34 (58.72 to 63.81) | 59.57 (57.47 to 61.54) |

Adoption above minus his band: train 1.68 (-1.00 to 4.35); held out 2.30 (-1.51 to 6.01).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 30453/4294043 (0.71%) | 14394/1893561 (0.76%) | 16059/2400482 (0.67%) |
| train | 20251/2863318 (0.71%) | 9505/1258820 (0.76%) | 10746/1604498 (0.67%) |
| heldout | 10202/1430725 (0.71%) | 4889/634741 (0.77%) | 5313/795984 (0.67%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4091/982 | 97.63 (97.16 to 98.07) | 6.90 (5.02 to 8.84) | 2053/529 | 96.88 (96.12 to 97.60) | 3.88 (1.59 to 6.26) | no |
| opponentThreat | true | 982/4091 | 90.73 (88.83 to 92.54) | -6.90 (-8.84 to -5.02) | 529/2053 | 93.01 (90.71 to 95.09) | -3.88 (-6.26 to -1.59) | no |
| material | ahead | 4039/1034 | 96.91 (96.37 to 97.43) | 3.00 (1.49 to 4.61) | 2038/544 | 96.22 (95.36 to 97.01) | 0.63 (-1.18 to 2.59) | no |
| material | level | 948/4125 | 93.88 (92.27 to 95.33) | -2.97 (-4.58 to -1.38) | 498/2084 | 95.38 (93.48 to 97.14) | -0.88 (-3.00 to 1.10) | no |
| material | behind | 86/4987 | 94.19 (88.51 to 98.67) | -2.14 (-7.86 to 2.27) | 46/2536 | 97.83 (92.50 to 100.00) | 1.77 (-3.66 to 4.54) | no |
| phase | middlegame | 2/5071 | 100.00 (100.00 to 100.00) | 3.71 (3.21 to 4.22) | 1/2581 | 100.00 (100.00 to 100.00) | 3.91 (3.18 to 4.73) | no |
| phase | endgame | 5071/2 | 96.29 (95.78 to 96.79) | -3.71 (-4.22 to -3.21) | 2581/1 | 96.09 (95.31 to 96.82) | -3.91 (-4.73 to -3.18) | no |
| forcing | false | 4823/250 | 96.27 (95.73 to 96.77) | -0.53 (-2.60 to 1.82) | 2460/122 | 95.98 (95.17 to 96.74) | -2.39 (-4.37 to 0.31) | no |
| forcing | true | 250/4823 | 96.80 (94.44 to 98.79) | 0.53 (-1.82 to 2.60) | 122/2460 | 98.36 (95.87 to 100.00) | 2.39 (-0.31 to 4.37) | no |
| kingDanger | false | 5045/28 | 96.33 (95.83 to 96.85) | 7.05 (-3.64 to 19.71) | 2573/9 | 96.07 (95.29 to 96.81) | -3.93 (-4.71 to -3.19) | no |
| kingDanger | true | 28/5045 | 89.29 (76.66 to 100.00) | -7.05 (-19.71 to 3.64) | 9/2573 | 100.00 (100.00 to 100.00) | 3.93 (3.19 to 4.71) | no |

The descriptive tree's held-out accuracy is 96.09 (95.31 to 96.82); his band 95.69 (94.47 to 96.77), the band above 96.44 (95.38 to 97.36). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 5073,
  "unsound": 188,
  "predictUnsound": false,
  "feature": "opponentThreat",
  "equals": false,
  "giniGain": 0.0014845796449529992,
  "yes": {
    "positions": 4091,
    "unsound": 97,
    "predictUnsound": false,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 3.991566114658178e-05,
    "yes": {
      "positions": 3299,
      "unsound": 71,
      "predictUnsound": false
    },
    "no": {
      "positions": 792,
      "unsound": 26,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 982,
    "unsound": 91,
    "predictUnsound": false,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.002979061660089309,
    "yes": {
      "positions": 210,
      "unsound": 35,
      "predictUnsound": false
    },
    "no": {
      "positions": 772,
      "unsound": 56,
      "predictUnsound": false
    }
  }
}
```

## rook-behind-passer

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 35.08 (34.05 to 36.10) | 77.38 (76.46 to 78.31) | 71.25 (70.24 to 72.29) | -42.30 (-43.51 to -41.14) | 7.01 (6.45 to 7.56) | 6.30 (5.98 to 6.61) |
| train, 1300 | 3536 | 36.48 (34.92 to 38.05) | 77.71 (76.38 to 79.07) | 70.62 (69.11 to 72.19) | -41.23 (-43.06 to -39.41) | 6.59 (5.79 to 7.40) | 5.96 (5.50 to 6.45) |
| train, 1500 | 4464 | 33.96 (32.54 to 35.31) | 77.11 (75.84 to 78.34) | 71.75 (70.44 to 73.06) | -43.15 (-44.77 to -41.66) | 7.35 (6.57 to 8.12) | 6.56 (6.14 to 7.00) |
| heldout, both | 4000 | 35.25 (33.80 to 36.75) | 77.45 (76.15 to 78.77) | 71.40 (69.92 to 72.85) | -42.20 (-43.90 to -40.58) | 6.60 (5.83 to 7.38) | 6.24 (5.78 to 6.71) |
| heldout, 1300 | 1831 | 36.26 (34.14 to 38.51) | 77.66 (75.73 to 79.63) | 70.40 (68.38 to 72.65) | -41.40 (-44.06 to -39.03) | 6.50 (5.38 to 7.69) | 5.90 (5.26 to 6.63) |
| heldout, 1500 | 2169 | 34.39 (32.44 to 36.30) | 77.27 (75.50 to 78.92) | 72.25 (70.26 to 74.10) | -42.88 (-45.16 to -40.58) | 6.69 (5.65 to 7.74) | 6.54 (5.89 to 7.16) |

Adoption above minus his band: train 0.76 (-0.31 to 1.86); held out 0.19 (-1.46 to 1.73).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 341749/4294043 (7.96%) | 154382/1893561 (8.15%) | 187367/2400482 (7.81%) |
| train | 228154/2863318 (7.97%) | 103353/1258820 (8.21%) | 124801/1604498 (7.78%) |
| heldout | 113595/1430725 (7.94%) | 51029/634741 (8.04%) | 62566/795984 (7.86%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4038/3962 | 45.49 (43.93 to 47.02) | 21.04 (19.05 to 23.06) | 2021/1979 | 46.21 (44.10 to 48.45) | 22.16 (19.36 to 25.05) | no |
| opponentThreat | true | 3962/4038 | 24.46 (23.10 to 25.81) | -21.04 (-23.06 to -19.05) | 1979/2021 | 24.05 (22.18 to 25.88) | -22.16 (-25.05 to -19.36) | yes |
| material | ahead | 3704/4296 | 43.28 (41.72 to 44.85) | 15.27 (13.19 to 17.32) | 1771/2229 | 45.00 (42.70 to 47.20) | 17.50 (14.48 to 20.48) | no |
| material | level | 2418/5582 | 21.55 (19.92 to 23.16) | -19.39 (-21.36 to -17.28) | 1287/2713 | 21.37 (19.20 to 23.65) | -20.47 (-23.37 to -17.50) | yes |
| material | behind | 1878/6122 | 36.32 (34.13 to 38.60) | 1.62 (-0.94 to 4.12) | 942/3058 | 35.88 (32.76 to 38.84) | 0.83 (-2.75 to 4.31) | no |
| phase | middlegame | 3152/4848 | 21.86 (20.44 to 23.31) | -21.81 (-23.74 to -19.75) | 1576/2424 | 21.95 (20.10 to 23.89) | -21.94 (-24.80 to -19.09) | yes |
| phase | endgame | 4848/3152 | 43.67 (42.27 to 45.06) | 21.81 (19.75 to 23.74) | 2424/1576 | 43.89 (41.85 to 45.87) | 21.94 (19.09 to 24.80) | no |
| forcing | false | 7852/148 | 34.59 (33.57 to 35.63) | -26.22 (-34.12 to -18.52) | 3919/81 | 34.42 (32.94 to 35.92) | -40.89 (-50.27 to -31.02) | yes |
| forcing | true | 148/7852 | 60.81 (53.23 to 68.75) | 26.22 (18.52 to 34.12) | 81/3919 | 75.31 (65.79 to 84.62) | 40.89 (31.02 to 50.27) | no |
| kingDanger | false | 7036/964 | 36.34 (35.24 to 37.46) | 10.51 (7.41 to 13.35) | 3542/458 | 36.67 (35.09 to 38.24) | 12.44 (8.28 to 16.55) | no |
| kingDanger | true | 964/7036 | 25.83 (23.14 to 28.71) | -10.51 (-13.35 to -7.41) | 458/3542 | 24.24 (20.38 to 28.17) | -12.44 (-16.55 to -8.28) | yes |

The descriptive tree's held-out accuracy is 67.15 (65.70 to 68.60); his band 66.58 (64.37 to 68.55), the band above 67.63 (65.74 to 69.58). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 5194,
  "predictUnsound": true,
  "feature": "phase",
  "equals": "middlegame",
  "giniGain": 0.022711438661188424,
  "yes": {
    "positions": 3152,
    "unsound": 2463,
    "predictUnsound": true,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.011744360364835286,
    "yes": {
      "positions": 1304,
      "unsound": 900,
      "predictUnsound": true
    },
    "no": {
      "positions": 1848,
      "unsound": 1563,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 4848,
    "unsound": 2731,
    "predictUnsound": true,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.019787797042022586,
    "yes": {
      "positions": 2734,
      "unsound": 1301,
      "predictUnsound": false
    },
    "no": {
      "positions": 2114,
      "unsound": 1430,
      "predictUnsound": true
    }
  }
}
```

## cut-off-king

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 2772 | 41.67 (39.79 to 43.43) | 83.33 (81.96 to 84.67) | 79.40 (77.96 to 80.88) | -41.67 (-43.72 to -39.72) | 5.88 (5.05 to 6.78) | 5.67 (5.11 to 6.27) |
| train, 1300 | 1139 | 41.79 (38.88 to 44.52) | 82.88 (80.78 to 84.93) | 77.35 (75.00 to 79.71) | -41.09 (-44.29 to -38.05) | 5.88 (4.56 to 7.30) | 5.44 (4.56 to 6.34) |
| train, 1500 | 1633 | 41.58 (39.10 to 43.84) | 83.65 (81.86 to 85.37) | 80.83 (78.89 to 82.77) | -42.07 (-44.73 to -39.56) | 5.88 (4.80 to 7.05) | 5.83 (5.09 to 6.64) |
| heldout, both | 1398 | 42.42 (39.70 to 45.06) | 83.76 (81.76 to 85.69) | 78.90 (76.68 to 80.97) | -41.34 (-44.06 to -38.56) | 6.51 (5.22 to 7.80) | 6.59 (5.70 to 7.51) |
| heldout, 1300 | 583 | 44.08 (40.29 to 48.26) | 82.85 (79.64 to 85.69) | 78.22 (74.88 to 81.55) | -38.77 (-42.93 to -34.19) | 7.72 (5.56 to 9.97) | 7.14 (5.67 to 8.73) |
| heldout, 1500 | 815 | 41.23 (37.85 to 44.51) | 84.42 (81.91 to 86.92) | 79.39 (76.63 to 82.07) | -43.19 (-46.72 to -39.70) | 5.64 (4.11 to 7.31) | 6.19 (5.11 to 7.31) |

Adoption above minus his band: train -0.00 (-1.78 to 1.78); held out -2.07 (-4.91 to 0.67).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 30746/4294043 (0.72%) | 12509/1893561 (0.66%) | 18237/2400482 (0.76%) |
| train | 20418/2863318 (0.71%) | 8282/1258820 (0.66%) | 12136/1604498 (0.76%) |
| heldout | 10328/1430725 (0.72%) | 4227/634741 (0.67%) | 6101/795984 (0.77%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 1808/964 | 45.69 (43.33 to 47.92) | 11.56 (7.73 to 15.38) | 896/502 | 44.53 (41.12 to 47.79) | 5.89 (0.36 to 11.18) | no |
| opponentThreat | true | 964/1808 | 34.13 (31.02 to 37.00) | -11.56 (-15.38 to -7.73) | 502/896 | 38.65 (34.49 to 43.06) | -5.89 (-11.18 to -0.36) | no |
| material | ahead | 988/1784 | 48.89 (45.82 to 51.95) | 11.22 (7.29 to 14.99) | 462/936 | 57.36 (52.93 to 61.82) | 22.32 (17.18 to 27.45) | no |
| material | level | 1630/1142 | 37.98 (35.49 to 40.12) | -8.96 (-12.57 to -5.33) | 838/560 | 35.56 (32.29 to 38.92) | -17.12 (-22.29 to -12.04) | no |
| material | behind | 154/2618 | 34.42 (26.95 to 41.83) | -7.68 (-15.55 to -0.02) | 98/1300 | 30.61 (21.98 to 40.00) | -12.70 (-21.66 to -2.80) | no |
| phase | middlegame | 0/2772 | undefined | undefined | 0/1398 | undefined | undefined | no |
| phase | endgame | 2772/0 | 41.67 (39.79 to 43.43) | undefined | 1398/0 | 42.42 (39.70 to 45.06) | undefined | no |
| forcing | false | 2675/97 | 40.22 (38.31 to 41.95) | -41.22 (-48.80 to -32.66) | 1334/64 | 41.23 (38.42 to 43.85) | -25.96 (-37.60 to -14.12) | yes |
| forcing | true | 97/2675 | 81.44 (72.92 to 88.64) | 41.22 (32.66 to 48.80) | 64/1334 | 67.19 (55.38 to 78.38) | 25.96 (14.12 to 37.60) | no |
| kingDanger | false | 2748/24 | 41.63 (39.75 to 43.44) | -4.20 (-25.10 to 16.66) | 1382/16 | 42.62 (39.87 to 45.22) | 17.62 (-7.29 to 38.29) | no |
| kingDanger | true | 24/2748 | 45.83 (25.00 to 66.67) | 4.20 (-16.66 to 25.10) | 16/1382 | 25.00 (5.55 to 50.00) | -17.62 (-38.29 to 7.29) | no |

The descriptive tree's held-out accuracy is 59.16 (56.58 to 61.80); his band 57.80 (53.72 to 61.70), the band above 60.12 (56.86 to 63.56). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 2772,
  "unsound": 1617,
  "predictUnsound": true,
  "feature": "forcing",
  "equals": false,
  "giniGain": 0.011474505143933765,
  "yes": {
    "positions": 2675,
    "unsound": 1599,
    "predictUnsound": true,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 0.007415475840876055,
    "yes": {
      "positions": 976,
      "unsound": 505,
      "predictUnsound": true
    },
    "no": {
      "positions": 1699,
      "unsound": 1094,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 97,
    "unsound": 18,
    "predictUnsound": false,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 0.00972285608897614,
    "yes": {
      "positions": 12,
      "unsound": 0,
      "predictUnsound": false
    },
    "no": {
      "positions": 85,
      "unsound": 18,
      "predictUnsound": false
    }
  }
}
```

## outside-passer

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 2576 | 66.81 (65.02 to 68.63) | 83.39 (81.87 to 84.90) | 82.07 (80.55 to 83.66) | -16.58 (-18.05 to -14.91) | 65.88 (64.09 to 67.86) | 62.09 (60.69 to 63.58) |
| train, 1300 | 1078 | 67.90 (65.13 to 70.62) | 82.37 (80.07 to 84.62) | 81.35 (78.90 to 83.65) | -14.47 (-16.73 to -12.23) | 67.72 (65.02 to 70.41) | 64.11 (61.92 to 66.28) |
| train, 1500 | 1498 | 66.02 (63.74 to 68.60) | 84.11 (82.25 to 85.98) | 82.58 (80.56 to 84.57) | -18.09 (-20.05 to -15.88) | 64.55 (62.14 to 67.22) | 60.64 (58.77 to 62.68) |
| heldout, both | 1303 | 67.77 (65.31 to 70.30) | 84.80 (82.89 to 86.72) | 81.27 (79.20 to 83.42) | -17.04 (-19.19 to -14.89) | 65.39 (62.78 to 68.00) | 61.88 (59.80 to 64.03) |
| heldout, 1300 | 529 | 66.73 (62.75 to 70.63) | 86.01 (83.15 to 88.71) | 81.85 (78.38 to 85.09) | -19.28 (-22.83 to -15.83) | 62.00 (58.14 to 66.15) | 61.05 (57.82 to 64.31) |
| heldout, 1500 | 774 | 68.48 (65.21 to 71.72) | 83.98 (81.48 to 86.50) | 80.88 (78.18 to 83.67) | -15.50 (-18.42 to -12.87) | 67.70 (64.41 to 71.01) | 62.45 (59.63 to 65.25) |

Adoption above minus his band: train -3.17 (-6.73 to 0.64); held out 5.70 (0.28 to 10.83).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 7711/4294043 (0.18%) | 3188/1893561 (0.17%) | 4523/2400482 (0.19%) |
| train | 5028/2863318 (0.18%) | 2070/1258820 (0.16%) | 2958/1604498 (0.18%) |
| heldout | 2683/1430725 (0.19%) | 1118/634741 (0.18%) | 1565/795984 (0.20%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 1538/1038 | 68.01 (65.68 to 70.30) | 2.98 (-0.72 to 6.70) | 748/555 | 66.98 (63.66 to 70.28) | -1.85 (-7.10 to 3.31) | no |
| opponentThreat | true | 1038/1538 | 65.03 (62.12 to 67.88) | -2.98 (-6.70 to 0.72) | 555/748 | 68.83 (65.12 to 72.68) | 1.85 (-3.31 to 7.10) | no |
| material | ahead | 783/1793 | 77.65 (74.68 to 80.53) | 15.58 (11.67 to 19.03) | 394/909 | 75.89 (71.69 to 80.16) | 11.64 (6.70 to 16.84) | no |
| material | level | 1148/1428 | 61.15 (58.39 to 63.98) | -10.21 (-13.72 to -6.43) | 584/719 | 64.38 (60.51 to 68.27) | -6.13 (-11.29 to -1.09) | no |
| material | behind | 645/1931 | 63.72 (60.28 to 67.40) | -4.12 (-8.25 to 0.03) | 325/978 | 64.00 (58.60 to 69.29) | -5.02 (-11.13 to 0.80) | no |
| phase | middlegame | 0/2576 | undefined | undefined | 0/1303 | undefined | undefined | no |
| phase | endgame | 2576/0 | 66.81 (65.02 to 68.63) | undefined | 1303/0 | 67.77 (65.31 to 70.30) | undefined | no |
| forcing | false | 0/2576 | undefined | undefined | 0/1303 | undefined | undefined | no |
| forcing | true | 2576/0 | 66.81 (65.02 to 68.63) | undefined | 1303/0 | 67.77 (65.31 to 70.30) | undefined | no |
| kingDanger | false | 2559/17 | 66.78 (65.02 to 68.62) | -3.80 (-24.73 to 20.47) | 1293/10 | 67.67 (65.22 to 70.23) | -12.33 (-33.26 to 18.39) | no |
| kingDanger | true | 17/2559 | 70.59 (46.65 to 91.67) | 3.80 (-20.47 to 24.73) | 10/1293 | 80.00 (50.00 to 100.00) | 12.33 (-18.39 to 33.26) | no |

The descriptive tree's held-out accuracy is 67.77 (65.31 to 70.30); his band 66.73 (62.75 to 70.63), the band above 68.48 (65.21 to 71.72). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 2576,
  "unsound": 855,
  "predictUnsound": false,
  "feature": "material",
  "equals": "ahead",
  "giniGain": 0.010264901246889007,
  "yes": {
    "positions": 783,
    "unsound": 175,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.0015897295231323604,
    "yes": {
      "positions": 508,
      "unsound": 103,
      "predictUnsound": false
    },
    "no": {
      "positions": 275,
      "unsound": 72,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 1793,
    "unsound": 680,
    "predictUnsound": false,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.00030451624006088627,
    "yes": {
      "positions": 1148,
      "unsound": 446,
      "predictUnsound": false
    },
    "no": {
      "positions": 645,
      "unsound": 234,
      "predictUnsound": false
    }
  }
}
```

## trade-when-ahead

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 72.36 (71.39 to 73.29) | 84.23 (83.45 to 85.03) | 76.94 (75.98 to 77.85) | -11.86 (-12.79 to -11.00) | 53.09 (51.96 to 54.15) | 44.99 (44.39 to 45.58) |
| train, 1300 | 3624 | 71.83 (70.35 to 73.27) | 84.93 (83.79 to 86.08) | 75.63 (74.22 to 76.98) | -13.11 (-14.46 to -11.78) | 51.88 (50.26 to 53.46) | 44.58 (43.66 to 45.47) |
| train, 1500 | 4376 | 72.81 (71.52 to 74.00) | 83.64 (82.53 to 84.71) | 78.02 (76.76 to 79.23) | -10.83 (-12.06 to -9.68) | 54.09 (52.56 to 55.60) | 45.33 (44.50 to 46.16) |
| heldout, both | 4000 | 71.43 (70.05 to 72.85) | 84.20 (83.08 to 85.35) | 76.35 (75.02 to 77.73) | -12.78 (-14.12 to -11.43) | 51.30 (49.78 to 52.83) | 44.62 (43.81 to 45.49) |
| heldout, 1300 | 1873 | 72.61 (70.59 to 74.63) | 85.00 (83.40 to 86.63) | 77.26 (75.30 to 79.24) | -12.39 (-14.29 to -10.45) | 51.09 (48.73 to 53.35) | 44.84 (43.58 to 46.11) |
| heldout, 1500 | 2127 | 70.38 (68.46 to 72.36) | 83.50 (81.91 to 85.04) | 75.55 (73.72 to 77.32) | -13.12 (-14.91 to -11.36) | 51.48 (49.37 to 53.63) | 44.43 (43.30 to 45.63) |

Adoption above minus his band: train 2.21 (0.05 to 4.36); held out 0.39 (-2.69 to 3.56).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 74358/4294043 (1.73%) | 34483/1893561 (1.82%) | 39875/2400482 (1.66%) |
| train | 49649/2863318 (1.73%) | 22989/1258820 (1.83%) | 26660/1604498 (1.66%) |
| heldout | 24709/1430725 (1.73%) | 11494/634741 (1.81%) | 13215/795984 (1.66%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 3341/4659 | 75.85 (74.38 to 77.27) | 5.98 (4.01 to 7.94) | 1593/2407 | 75.08 (72.94 to 77.22) | 6.07 (3.19 to 8.73) | no |
| opponentThreat | true | 4659/3341 | 69.86 (68.51 to 71.10) | -5.98 (-7.94 to -4.01) | 2407/1593 | 69.01 (67.25 to 70.86) | -6.07 (-8.73 to -3.19) | no |
| material | ahead | 8000/0 | 72.36 (71.39 to 73.29) | undefined | 4000/0 | 71.43 (70.05 to 72.85) | undefined | no |
| material | level | 0/8000 | undefined | undefined | 0/4000 | undefined | undefined | no |
| material | behind | 0/8000 | undefined | undefined | 0/4000 | undefined | undefined | no |
| phase | middlegame | 5985/2015 | 70.14 (68.99 to 71.25) | -8.82 (-11.01 to -6.73) | 2969/1031 | 68.84 (67.22 to 70.61) | -10.01 (-13.13 to -7.07) | no |
| phase | endgame | 2015/5985 | 78.96 (77.20 to 80.71) | 8.82 (6.73 to 11.01) | 1031/2969 | 78.86 (76.45 to 81.47) | 10.01 (7.07 to 13.13) | no |
| forcing | false | 0/8000 | undefined | undefined | 0/4000 | undefined | undefined | no |
| forcing | true | 8000/0 | 72.36 (71.39 to 73.29) | undefined | 4000/0 | 71.43 (70.05 to 72.85) | undefined | no |
| kingDanger | false | 7220/780 | 72.96 (71.97 to 73.93) | 6.17 (2.74 to 9.78) | 3618/382 | 72.47 (71.06 to 74.01) | 10.95 (5.98 to 16.18) | no |
| kingDanger | true | 780/7220 | 66.79 (63.39 to 70.06) | -6.17 (-9.78 to -2.74) | 382/3618 | 61.52 (56.66 to 66.39) | -10.95 (-16.18 to -5.98) | no |

The descriptive tree's held-out accuracy is 71.43 (70.05 to 72.85); his band 72.61 (70.59 to 74.63), the band above 70.38 (68.46 to 72.36). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 2211,
  "predictUnsound": false,
  "feature": "phase",
  "equals": "middlegame",
  "giniGain": 0.0029289513517691147,
  "yes": {
    "positions": 5985,
    "unsound": 1787,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.0028499890718059117,
    "yes": {
      "positions": 2558,
      "unsound": 652,
      "predictUnsound": false
    },
    "no": {
      "positions": 3427,
      "unsound": 1135,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 2015,
    "unsound": 424,
    "predictUnsound": false,
    "feature": "kingDanger",
    "equals": false,
    "giniGain": 0.0014305366380232309,
    "yes": {
      "positions": 1840,
      "unsound": 372,
      "predictUnsound": false
    },
    "no": {
      "positions": 175,
      "unsound": 52,
      "predictUnsound": false
    }
  }
}
```

## lucena

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 19 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 36.84 (15.79 to 57.89) | 25.25 (11.48 to 41.07) |
| train, 1300 | 7 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 28.57 (0.00 to 66.67) | 23.31 (4.70 to 51.28) |
| train, 1500 | 12 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 41.67 (15.38 to 70.00) | 26.38 (7.27 to 45.93) |
| heldout, both | 6 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 33.33 (0.00 to 66.67) | 11.46 (3.41 to 21.68) |
| heldout, 1300 | 1 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 0.00 (0.00 to 0.00) | 0.21 (0.21 to 0.21) |
| heldout, 1500 | 5 | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 40.00 (0.00 to 83.33) | 13.71 (4.47 to 24.32) |

Adoption above minus his band: train 13.10 (-35.23 to 56.26); held out 40.00 (0.00 to 80.00).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 39/4294043 (0.00%) | 15/1893561 (0.00%) | 24/2400482 (0.00%) |
| train | 31/2863318 (0.00%) | 14/1258820 (0.00%) | 17/1604498 (0.00%) |
| heldout | 8/1430725 (0.00%) | 1/634741 (0.00%) | 7/795984 (0.00%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 17/2 | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 5/1 | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | no |
| opponentThreat | true | 2/17 | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | 1/5 | 100.00 (100.00 to 100.00) | 0.00 (0.00 to 0.00) | no |
| material | ahead | 0/19 | undefined | undefined | 0/6 | undefined | undefined | no |
| material | level | 19/0 | 100.00 (100.00 to 100.00) | undefined | 6/0 | 100.00 (100.00 to 100.00) | undefined | no |
| material | behind | 0/19 | undefined | undefined | 0/6 | undefined | undefined | no |
| phase | middlegame | 0/19 | undefined | undefined | 0/6 | undefined | undefined | no |
| phase | endgame | 19/0 | 100.00 (100.00 to 100.00) | undefined | 6/0 | 100.00 (100.00 to 100.00) | undefined | no |
| forcing | false | 19/0 | 100.00 (100.00 to 100.00) | undefined | 6/0 | 100.00 (100.00 to 100.00) | undefined | no |
| forcing | true | 0/19 | undefined | undefined | 0/6 | undefined | undefined | no |
| kingDanger | false | 19/0 | 100.00 (100.00 to 100.00) | undefined | 6/0 | 100.00 (100.00 to 100.00) | undefined | no |
| kingDanger | true | 0/19 | undefined | undefined | 0/6 | undefined | undefined | no |

The descriptive tree's held-out accuracy is 100.00 (100.00 to 100.00); his band 100.00 (100.00 to 100.00), the band above 100.00 (100.00 to 100.00). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 19,
  "unsound": 0,
  "predictUnsound": false
}
```

## philidor

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 52 | 86.54 (76.92 to 94.23) | 96.15 (90.38 to 100.00) | 94.23 (86.54 to 100.00) | -9.62 (-21.15 to 1.92) | 21.15 (9.62 to 32.69) | 18.16 (11.20 to 25.86) |
| train, 1300 | 25 | 80.00 (62.96 to 94.44) | 96.00 (86.66 to 100.00) | 92.00 (79.17 to 100.00) | -16.00 (-35.01 to 0.00) | 24.00 (8.33 to 42.11) | 19.75 (10.25 to 30.89) |
| train, 1500 | 27 | 92.59 (81.82 to 100.00) | 96.30 (88.00 to 100.00) | 96.30 (88.00 to 100.00) | -3.70 (-16.67 to 8.33) | 18.52 (4.35 to 33.33) | 16.70 (7.04 to 28.37) |
| heldout, both | 30 | 86.67 (73.33 to 96.67) | 93.33 (83.33 to 100.00) | 96.67 (90.00 to 100.00) | -6.67 (-20.00 to 6.67) | 10.00 (0.00 to 23.33) | 14.60 (8.66 to 21.39) |
| heldout, 1300 | 10 | 90.00 (66.67 to 100.00) | 90.00 (66.67 to 100.00) | 90.00 (70.00 to 100.00) | 0.00 (-28.57 to 28.61) | 20.00 (0.00 to 50.00) | 24.62 (11.25 to 40.20) |
| heldout, 1500 | 20 | 85.00 (68.14 to 100.00) | 95.00 (83.98 to 100.00) | 100.00 (100.00 to 100.00) | -10.00 (-25.00 to 0.00) | 5.00 (0.00 to 15.79) | 9.59 (4.75 to 15.35) |

Adoption above minus his band: train -5.48 (-27.45 to 16.67); held out -15.00 (-45.00 to 9.52).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 163/4294043 (0.00%) | 69/1893561 (0.00%) | 94/2400482 (0.00%) |
| train | 114/2863318 (0.00%) | 57/1258820 (0.00%) | 57/1604498 (0.00%) |
| heldout | 49/1430725 (0.00%) | 12/634741 (0.00%) | 37/795984 (0.00%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 44/8 | 84.09 (72.72 to 93.62) | -15.91 (-27.28 to -6.38) | 23/7 | 86.96 (71.99 to 100.00) | 1.24 (-23.08 to 35.74) | no |
| opponentThreat | true | 8/44 | 100.00 (100.00 to 100.00) | 15.91 (6.38 to 27.28) | 7/23 | 85.71 (50.00 to 100.00) | -1.24 (-35.74 to 23.08) | no |
| material | ahead | 0/52 | undefined | undefined | 0/30 | undefined | undefined | no |
| material | level | 48/4 | 85.42 (75.00 to 94.00) | -14.58 (-25.00 to -6.00) | 28/2 | 85.71 (71.99 to 96.55) | -14.29 (-28.57 to -3.45) | yes |
| material | behind | 4/48 | 100.00 (100.00 to 100.00) | 14.58 (6.00 to 25.00) | 2/28 | 100.00 (100.00 to 100.00) | 14.29 (3.45 to 28.57) | no |
| phase | middlegame | 0/52 | undefined | undefined | 0/30 | undefined | undefined | no |
| phase | endgame | 52/0 | 86.54 (76.92 to 94.23) | undefined | 30/0 | 86.67 (73.33 to 96.67) | undefined | no |
| forcing | false | 47/5 | 85.11 (74.47 to 93.88) | -14.89 (-25.53 to -6.12) | 28/2 | 85.71 (71.99 to 96.55) | -14.29 (-28.57 to -3.45) | yes |
| forcing | true | 5/47 | 100.00 (100.00 to 100.00) | 14.89 (6.12 to 25.53) | 2/28 | 100.00 (100.00 to 100.00) | 14.29 (3.45 to 28.57) | no |
| kingDanger | false | 52/0 | 86.54 (76.92 to 94.23) | undefined | 30/0 | 86.67 (73.33 to 96.67) | undefined | no |
| kingDanger | true | 0/52 | undefined | undefined | 0/30 | undefined | undefined | no |

The descriptive tree's held-out accuracy is 86.67 (73.33 to 96.67); his band 90.00 (66.67 to 100.00), the band above 85.00 (68.14 to 100.00). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 52,
  "unsound": 7,
  "predictUnsound": false,
  "feature": "opponentThreat",
  "equals": false,
  "giniGain": 0.006589564281871954,
  "yes": {
    "positions": 44,
    "unsound": 7,
    "predictUnsound": false,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.002410468319559257,
    "yes": {
      "positions": 42,
      "unsound": 7,
      "predictUnsound": false
    },
    "no": {
      "positions": 2,
      "unsound": 0,
      "predictUnsound": false
    }
  },
  "no": {
    "positions": 8,
    "unsound": 0,
    "predictUnsound": false
  }
}
```

## open-file

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 42.61 (41.54 to 43.66) | 74.40 (73.44 to 75.38) | 65.90 (64.82 to 66.94) | -31.79 (-33.04 to -30.56) | 13.23 (12.50 to 13.95) | 12.85 (12.40 to 13.29) |
| train, 1300 | 3586 | 42.75 (41.18 to 44.41) | 73.76 (72.42 to 75.15) | 65.56 (63.99 to 67.15) | -31.01 (-32.95 to -29.13) | 12.97 (11.89 to 14.06) | 13.00 (12.32 to 13.65) |
| train, 1500 | 4414 | 42.50 (41.12 to 43.94) | 74.92 (73.68 to 76.17) | 66.18 (64.76 to 67.55) | -32.42 (-34.05 to -30.77) | 13.43 (12.46 to 14.44) | 12.73 (12.14 to 13.36) |
| heldout, both | 4000 | 42.68 (41.20 to 44.25) | 74.12 (72.78 to 75.48) | 67.83 (66.38 to 69.15) | -31.45 (-33.18 to -29.62) | 12.97 (11.95 to 14.05) | 12.71 (12.10 to 13.34) |
| heldout, 1300 | 1809 | 44.22 (41.96 to 46.49) | 73.80 (71.82 to 75.73) | 65.73 (63.52 to 67.87) | -29.57 (-32.16 to -26.99) | 13.10 (11.63 to 14.65) | 13.19 (12.22 to 14.14) |
| heldout, 1500 | 2191 | 41.40 (39.25 to 43.57) | 74.40 (72.55 to 76.22) | 69.56 (67.65 to 71.35) | -33.00 (-35.42 to -30.46) | 12.87 (11.43 to 14.37) | 12.31 (11.49 to 13.24) |

Adoption above minus his band: train 0.47 (-0.98 to 1.97); held out -0.23 (-2.35 to 1.88).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 2826026/4294043 (65.81%) | 1239071/1893561 (65.44%) | 1586955/2400482 (66.11%) |
| train | 1885194/2863318 (65.84%) | 822942/1258820 (65.37%) | 1062252/1604498 (66.20%) |
| heldout | 940832/1430725 (65.76%) | 416129/634741 (65.56%) | 524703/795984 (65.92%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4321/3679 | 49.53 (48.02 to 51.11) | 15.03 (12.86 to 17.21) | 2175/1825 | 49.43 (47.40 to 51.56) | 14.80 (11.78 to 17.87) | no |
| opponentThreat | true | 3679/4321 | 34.49 (32.95 to 36.02) | -15.03 (-17.21 to -12.86) | 1825/2175 | 34.63 (32.44 to 36.85) | -14.80 (-17.87 to -11.78) | yes |
| material | ahead | 2083/5917 | 59.00 (56.94 to 61.19) | 22.16 (19.73 to 24.57) | 1031/2969 | 56.35 (53.38 to 59.38) | 18.43 (14.91 to 21.96) | no |
| material | level | 3682/4318 | 31.42 (30.02 to 32.95) | -20.73 (-22.83 to -18.60) | 1852/2148 | 31.70 (29.69 to 33.85) | -20.45 (-23.39 to -17.49) | yes |
| material | behind | 2235/5765 | 45.77 (43.75 to 47.72) | 4.38 (2.03 to 6.70) | 1117/2883 | 48.25 (45.35 to 51.17) | 7.74 (4.30 to 11.27) | no |
| phase | middlegame | 5521/2479 | 37.29 (36.08 to 38.58) | -17.16 (-19.36 to -14.86) | 2768/1232 | 36.89 (35.15 to 38.74) | -18.80 (-22.11 to -15.58) | yes |
| phase | endgame | 2479/5521 | 54.46 (52.59 to 56.33) | 17.16 (14.86 to 19.36) | 1232/2768 | 55.68 (53.06 to 58.39) | 18.80 (15.58 to 22.11) | no |
| forcing | false | 7089/911 | 38.78 (37.67 to 39.86) | -33.67 (-36.88 to -30.60) | 3530/470 | 38.61 (37.07 to 40.31) | -34.58 (-38.89 to -30.26) | yes |
| forcing | true | 911/7089 | 72.45 (69.54 to 75.39) | 33.67 (30.60 to 36.88) | 470/3530 | 73.19 (69.34 to 77.19) | 34.58 (30.26 to 38.89) | no |
| kingDanger | false | 7070/930 | 42.73 (41.62 to 43.87) | 1.01 (-2.32 to 4.30) | 3537/463 | 42.47 (40.90 to 44.13) | -1.81 (-6.81 to 3.18) | no |
| kingDanger | true | 930/7070 | 41.72 (38.62 to 44.86) | -1.01 (-4.30 to 2.32) | 463/3537 | 44.28 (39.61 to 49.10) | 1.81 (-3.18 to 6.81) | no |

The descriptive tree's held-out accuracy is 62.78 (61.22 to 64.25); his band 62.13 (59.87 to 64.26), the band above 63.30 (61.19 to 65.34). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 4591,
  "predictUnsound": true,
  "feature": "forcing",
  "equals": false,
  "giniGain": 0.022878415686774817,
  "yes": {
    "positions": 7089,
    "unsound": 4340,
    "predictUnsound": true,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.016747154716386773,
    "yes": {
      "positions": 3438,
      "unsound": 2429,
      "predictUnsound": true
    },
    "no": {
      "positions": 3651,
      "unsound": 1911,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 911,
    "unsound": 251,
    "predictUnsound": false,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 0.013284350868500586,
    "yes": {
      "positions": 372,
      "unsound": 66,
      "predictUnsound": false
    },
    "no": {
      "positions": 539,
      "unsound": 185,
      "predictUnsound": false
    }
  }
}
```

## rook-on-the-seventh

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 47.45 (46.39 to 48.55) | 76.49 (75.56 to 77.41) | 70.31 (69.23 to 71.33) | -29.04 (-30.26 to -27.84) | 20.38 (19.54 to 21.24) | 18.01 (17.47 to 18.56) |
| train, 1300 | 3519 | 48.08 (46.44 to 49.74) | 76.75 (75.35 to 78.14) | 69.17 (67.62 to 70.73) | -28.67 (-30.51 to -26.88) | 20.03 (18.74 to 21.35) | 18.31 (17.45 to 19.18) |
| train, 1500 | 4481 | 46.95 (45.49 to 48.40) | 76.28 (75.06 to 77.54) | 71.21 (69.88 to 72.46) | -29.32 (-30.89 to -27.66) | 20.64 (19.54 to 21.80) | 17.78 (17.08 to 18.52) |
| heldout, both | 4000 | 47.00 (45.40 to 48.58) | 76.75 (75.42 to 78.08) | 70.25 (68.88 to 71.67) | -29.75 (-31.47 to -28.05) | 18.88 (17.65 to 20.10) | 16.73 (16.00 to 17.50) |
| heldout, 1300 | 1788 | 48.71 (46.38 to 51.06) | 77.13 (75.24 to 78.99) | 70.19 (68.11 to 72.27) | -28.41 (-30.91 to -25.91) | 18.57 (16.75 to 20.38) | 16.95 (15.85 to 18.05) |
| heldout, 1500 | 2212 | 45.61 (43.50 to 47.70) | 76.45 (74.78 to 78.15) | 70.30 (68.39 to 72.17) | -30.83 (-33.09 to -28.53) | 19.12 (17.55 to 20.78) | 16.55 (15.56 to 17.57) |

Adoption above minus his band: train 0.61 (-1.11 to 2.49); held out 0.55 (-1.94 to 3.11).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 286726/4294043 (6.68%) | 127853/1893561 (6.75%) | 158873/2400482 (6.62%) |
| train | 190912/2863318 (6.67%) | 84809/1258820 (6.74%) | 106103/1604498 (6.61%) |
| heldout | 95814/1430725 (6.70%) | 43044/634741 (6.78%) | 52770/795984 (6.63%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4029/3971 | 57.66 (56.20 to 59.17) | 20.56 (18.54 to 22.68) | 2084/1916 | 57.01 (54.76 to 59.12) | 20.89 (17.81 to 23.85) | no |
| opponentThreat | true | 3971/4029 | 37.09 (35.60 to 38.57) | -20.56 (-22.68 to -18.54) | 1916/2084 | 36.12 (34.09 to 38.26) | -20.89 (-23.85 to -17.81) | yes |
| material | ahead | 3019/4981 | 58.60 (56.84 to 60.34) | 17.90 (15.76 to 20.07) | 1485/2515 | 60.07 (57.53 to 62.55) | 20.78 (17.51 to 24.01) | no |
| material | level | 2757/5243 | 37.83 (36.04 to 39.62) | -14.68 (-16.94 to -12.43) | 1433/2567 | 35.94 (33.38 to 38.35) | -17.24 (-20.35 to -14.17) | yes |
| material | behind | 2224/5776 | 44.24 (42.25 to 46.38) | -4.44 (-6.90 to -1.98) | 1082/2918 | 43.72 (40.79 to 46.63) | -4.50 (-7.98 to -1.12) | no |
| phase | middlegame | 3366/4634 | 42.10 (40.44 to 43.74) | -9.24 (-11.40 to -7.02) | 1677/2323 | 39.18 (36.87 to 41.49) | -13.47 (-16.53 to -10.53) | no |
| phase | endgame | 4634/3366 | 51.34 (49.88 to 52.72) | 9.24 (7.02 to 11.40) | 2323/1677 | 52.65 (50.68 to 54.65) | 13.47 (10.53 to 16.53) | no |
| forcing | false | 5945/2055 | 42.61 (41.39 to 43.87) | -18.85 (-21.30 to -16.26) | 3040/960 | 42.30 (40.55 to 44.04) | -19.57 (-23.07 to -15.99) | yes |
| forcing | true | 2055/5945 | 61.46 (59.31 to 63.56) | 18.85 (16.26 to 21.30) | 960/3040 | 61.88 (58.76 to 64.91) | 19.57 (15.99 to 23.07) | no |
| kingDanger | false | 6887/1113 | 49.60 (48.44 to 50.79) | 15.46 (12.39 to 18.50) | 3467/533 | 49.18 (47.45 to 50.83) | 16.34 (12.15 to 20.69) | no |
| kingDanger | true | 1113/6887 | 34.14 (31.36 to 37.00) | -15.46 (-18.50 to -12.39) | 533/3467 | 32.83 (28.97 to 36.77) | -16.34 (-20.69 to -12.15) | yes |

The descriptive tree's held-out accuracy is 63.35 (61.95 to 64.83); his band 63.93 (61.79 to 66.16), the band above 62.88 (60.81 to 64.94). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 4204,
  "predictUnsound": true,
  "feature": "opponentThreat",
  "equals": false,
  "giniGain": 0.021140852011065078,
  "yes": {
    "positions": 4029,
    "unsound": 1706,
    "predictUnsound": false,
    "feature": "material",
    "equals": "ahead",
    "giniGain": 0.022475029071778365,
    "yes": {
      "positions": 1641,
      "unsound": 485,
      "predictUnsound": false
    },
    "no": {
      "positions": 2388,
      "unsound": 1221,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 3971,
    "unsound": 2498,
    "predictUnsound": true,
    "feature": "forcing",
    "equals": false,
    "giniGain": 0.017604531903733185,
    "yes": {
      "positions": 2880,
      "unsound": 1978,
      "predictUnsound": true
    },
    "no": {
      "positions": 1091,
      "unsound": 520,
      "predictUnsound": false
    }
  }
}
```

## outpost

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 42.33 (41.23 to 43.41) | 74.52 (73.57 to 75.42) | 66.50 (65.46 to 67.54) | -32.20 (-33.41 to -30.99) | 21.51 (20.66 to 22.41) | 18.21 (17.72 to 18.72) |
| train, 1300 | 3463 | 43.14 (41.41 to 44.80) | 74.96 (73.51 to 76.33) | 67.43 (65.89 to 69.01) | -31.82 (-33.68 to -30.02) | 20.13 (18.84 to 21.44) | 17.80 (17.02 to 18.61) |
| train, 1500 | 4537 | 41.70 (40.36 to 43.15) | 74.19 (72.96 to 75.46) | 65.79 (64.36 to 67.13) | -32.49 (-34.06 to -30.88) | 22.57 (21.34 to 23.79) | 18.53 (17.87 to 19.19) |
| heldout, both | 4000 | 43.33 (41.83 to 44.93) | 74.95 (73.58 to 76.30) | 66.95 (65.50 to 68.42) | -31.62 (-33.30 to -29.90) | 21.30 (20.05 to 22.60) | 18.96 (18.24 to 19.72) |
| heldout, 1300 | 1723 | 44.28 (41.96 to 46.68) | 74.93 (72.81 to 77.03) | 66.22 (64.05 to 68.44) | -30.64 (-33.29 to -27.96) | 19.56 (17.57 to 21.40) | 18.40 (17.30 to 19.48) |
| heldout, 1500 | 2277 | 42.60 (40.53 to 44.71) | 74.97 (73.23 to 76.70) | 67.50 (65.60 to 69.47) | -32.37 (-34.54 to -30.09) | 22.62 (20.88 to 24.26) | 19.38 (18.40 to 20.36) |

Adoption above minus his band: train 2.44 (0.64 to 4.30); held out 3.06 (0.56 to 5.64).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 224970/4294043 (5.24%) | 95647/1893561 (5.05%) | 129323/2400482 (5.39%) |
| train | 150433/2863318 (5.25%) | 63957/1258820 (5.08%) | 86476/1604498 (5.39%) |
| heldout | 74537/1430725 (5.21%) | 31690/634741 (4.99%) | 42847/795984 (5.38%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 3960/4040 | 47.15 (45.61 to 48.69) | 9.55 (7.35 to 11.53) | 1946/2054 | 48.46 (46.36 to 50.79) | 10.00 (7.02 to 13.07) | no |
| opponentThreat | true | 4040/3960 | 37.60 (36.14 to 39.13) | -9.55 (-11.53 to -7.35) | 2054/1946 | 38.46 (36.41 to 40.59) | -10.00 (-13.07 to -7.02) | no |
| material | ahead | 2755/5245 | 56.73 (54.90 to 58.52) | 21.98 (19.70 to 24.14) | 1362/2638 | 56.61 (54.00 to 59.35) | 20.14 (16.92 to 23.45) | no |
| material | level | 3703/4297 | 33.16 (31.65 to 34.77) | -17.06 (-19.18 to -15.02) | 1875/2125 | 34.72 (32.65 to 36.87) | -16.20 (-19.21 to -13.14) | yes |
| material | behind | 1542/6458 | 38.59 (36.28 to 41.10) | -4.63 (-7.29 to -1.86) | 763/3237 | 40.76 (37.25 to 44.35) | -3.17 (-7.13 to 0.62) | no |
| phase | middlegame | 5183/2817 | 37.20 (35.89 to 38.52) | -14.56 (-16.86 to -12.38) | 2589/1411 | 37.62 (35.79 to 39.57) | -16.17 (-19.29 to -12.93) | yes |
| phase | endgame | 2817/5183 | 51.76 (49.91 to 53.57) | 14.56 (12.38 to 16.86) | 1411/2589 | 53.79 (51.27 to 56.37) | 16.17 (12.93 to 19.29) | no |
| forcing | false | 6910/1090 | 39.32 (38.20 to 40.50) | -22.06 (-25.16 to -18.72) | 3400/600 | 39.79 (38.18 to 41.46) | -23.54 (-27.77 to -19.30) | yes |
| forcing | true | 1090/6910 | 61.38 (58.43 to 64.21) | 22.06 (18.72 to 25.16) | 600/3400 | 63.33 (59.59 to 67.21) | 23.54 (19.30 to 27.77) | no |
| kingDanger | false | 7331/669 | 42.89 (41.74 to 44.03) | 6.71 (2.81 to 10.37) | 3687/313 | 43.97 (42.40 to 45.58) | 8.18 (2.36 to 13.68) | no |
| kingDanger | true | 669/7331 | 36.17 (32.74 to 39.97) | -6.71 (-10.37 to -2.81) | 313/3687 | 35.78 (30.60 to 41.33) | -8.18 (-13.68 to -2.36) | no |

The descriptive tree's held-out accuracy is 62.90 (61.42 to 64.43); his band 61.35 (59.02 to 63.71), the band above 64.08 (62.11 to 66.07). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 4614,
  "predictUnsound": true,
  "feature": "material",
  "equals": "ahead",
  "giniGain": 0.02180852567413615,
  "yes": {
    "positions": 2755,
    "unsound": 1192,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.014121648483523958,
    "yes": {
      "positions": 1423,
      "unsound": 500,
      "predictUnsound": false
    },
    "no": {
      "positions": 1332,
      "unsound": 692,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 5245,
    "unsound": 3422,
    "predictUnsound": true,
    "feature": "forcing",
    "equals": false,
    "giniGain": 0.011551744489519325,
    "yes": {
      "positions": 4526,
      "unsound": 3090,
      "predictUnsound": true
    },
    "no": {
      "positions": 719,
      "unsound": 332,
      "predictUnsound": false
    }
  }
}
```

## pawn-break

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 24.01 (23.05 to 24.89) | 72.86 (71.83 to 73.83) | 63.04 (61.98 to 64.09) | -48.85 (-50.06 to -47.57) | 7.56 (7.01 to 8.15) | 5.63 (5.40 to 5.86) |
| train, 1300 | 3563 | 24.39 (22.97 to 25.74) | 72.97 (71.44 to 74.46) | 63.01 (61.39 to 64.56) | -48.58 (-50.52 to -46.70) | 7.49 (6.61 to 8.35) | 5.56 (5.20 to 5.92) |
| train, 1500 | 4437 | 23.71 (22.47 to 24.91) | 72.77 (71.43 to 74.01) | 63.06 (61.68 to 64.53) | -49.06 (-50.70 to -47.38) | 7.62 (6.84 to 8.42) | 5.70 (5.39 to 6.01) |
| heldout, both | 4000 | 24.82 (23.47 to 26.15) | 74.38 (72.97 to 75.72) | 64.88 (63.42 to 66.33) | -49.55 (-51.30 to -47.75) | 7.05 (6.28 to 7.90) | 5.55 (5.24 to 5.86) |
| heldout, 1300 | 1784 | 24.38 (22.40 to 26.44) | 73.82 (71.76 to 75.93) | 63.51 (61.15 to 65.74) | -49.44 (-52.02 to -46.82) | 7.12 (5.95 to 8.35) | 5.63 (5.13 to 6.16) |
| heldout, 1500 | 2216 | 25.18 (23.33 to 26.94) | 74.82 (72.96 to 76.51) | 65.97 (64.05 to 67.92) | -49.64 (-52.00 to -47.15) | 6.99 (5.95 to 8.08) | 5.48 (5.09 to 5.89) |

Adoption above minus his band: train 0.12 (-0.97 to 1.34); held out -0.12 (-1.79 to 1.42).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 1055632/4294043 (24.58%) | 451908/1893561 (23.87%) | 603724/2400482 (25.15%) |
| train | 702619/2863318 (24.54%) | 298348/1258820 (23.70%) | 404271/1604498 (25.20%) |
| heldout | 353013/1430725 (24.67%) | 153560/634741 (24.19%) | 199453/795984 (25.06%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4666/3334 | 31.91 (30.59 to 33.19) | 18.95 (17.30 to 20.76) | 2381/1619 | 32.05 (30.18 to 33.90) | 17.84 (15.31 to 20.37) | no |
| opponentThreat | true | 3334/4666 | 12.96 (11.81 to 14.05) | -18.95 (-20.76 to -17.30) | 1619/2381 | 14.21 (12.46 to 15.81) | -17.84 (-20.37 to -15.31) | yes |
| material | ahead | 1639/6361 | 34.90 (32.67 to 37.21) | 13.69 (11.17 to 16.24) | 800/3200 | 37.25 (33.96 to 40.69) | 15.53 (11.98 to 19.41) | no |
| material | level | 4539/3461 | 18.48 (17.29 to 19.54) | -12.78 (-14.68 to -10.94) | 2308/1692 | 18.67 (17.12 to 20.28) | -14.54 (-17.25 to -11.65) | yes |
| material | behind | 1822/6178 | 27.99 (25.93 to 30.14) | 5.15 (2.82 to 7.46) | 892/3108 | 29.60 (26.59 to 32.65) | 6.14 (2.75 to 9.44) | no |
| phase | middlegame | 6386/1614 | 21.16 (20.13 to 22.09) | -14.16 (-16.77 to -11.71) | 3151/849 | 21.14 (19.72 to 22.61) | -17.38 (-20.93 to -13.87) | yes |
| phase | endgame | 1614/6386 | 35.32 (33.04 to 37.66) | 14.16 (11.71 to 16.77) | 849/3151 | 38.52 (35.30 to 41.72) | 17.38 (13.87 to 20.93) | no |
| forcing | false | 7989/11 | 23.95 (22.98 to 24.82) | -48.78 (-76.05 to -17.42) | 3993/7 | 24.74 (23.41 to 26.04) | -46.69 (-75.76 to -4.50) | yes |
| forcing | true | 11/7989 | 72.73 (41.67 to 100.00) | 48.78 (17.42 to 76.05) | 7/3993 | 71.43 (28.57 to 100.00) | 46.69 (4.50 to 75.76) | no |
| kingDanger | false | 7390/610 | 24.30 (23.30 to 25.21) | 3.81 (0.25 to 7.12) | 3709/291 | 25.10 (23.65 to 26.49) | 3.80 (-1.13 to 8.69) | no |
| kingDanger | true | 610/7390 | 20.49 (17.28 to 23.94) | -3.81 (-7.12 to -0.25) | 291/3709 | 21.31 (16.73 to 26.16) | -3.80 (-8.69 to 1.13) | no |

The descriptive tree's held-out accuracy is 75.17 (73.85 to 76.53); his band 75.62 (73.56 to 77.60), the band above 74.82 (73.06 to 76.67). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 6079,
  "predictUnsound": true,
  "feature": "opponentThreat",
  "equals": false,
  "giniGain": 0.01746527942254187,
  "yes": {
    "positions": 4666,
    "unsound": 3177,
    "predictUnsound": true,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.013369706640429607,
    "yes": {
      "positions": 2810,
      "unsound": 2100,
      "predictUnsound": true
    },
    "no": {
      "positions": 1856,
      "unsound": 1077,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 3334,
    "unsound": 2902,
    "predictUnsound": true,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.006508999927542681,
    "yes": {
      "positions": 1729,
      "unsound": 1600,
      "predictUnsound": true
    },
    "no": {
      "positions": 1605,
      "unsound": 1302,
      "predictUnsound": true
    }
  }
}
```

## passed-pawn

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 44.02 (42.89 to 45.07) | 77.14 (76.26 to 78.05) | 70.85 (69.88 to 71.86) | -33.11 (-34.30 to -31.92) | 20.94 (20.03 to 21.84) | 19.02 (18.43 to 19.62) |
| train, 1300 | 3579 | 43.11 (41.47 to 44.70) | 78.04 (76.66 to 79.42) | 70.77 (69.27 to 72.25) | -34.93 (-36.78 to -33.15) | 19.45 (18.12 to 20.72) | 17.74 (16.81 to 18.60) |
| train, 1500 | 4421 | 44.76 (43.27 to 46.20) | 76.41 (75.20 to 77.60) | 70.91 (69.61 to 72.22) | -31.64 (-33.20 to -30.03) | 22.14 (20.96 to 23.36) | 20.07 (19.27 to 20.86) |
| heldout, both | 4000 | 44.25 (42.75 to 45.82) | 77.90 (76.62 to 79.20) | 70.60 (69.20 to 72.05) | -33.65 (-35.25 to -31.92) | 20.52 (19.30 to 21.75) | 18.83 (17.99 to 19.68) |
| heldout, 1300 | 1753 | 44.44 (42.05 to 46.74) | 77.58 (75.54 to 79.50) | 70.11 (67.98 to 72.20) | -33.14 (-35.71 to -30.62) | 19.45 (17.58 to 21.32) | 18.73 (17.46 to 20.07) |
| heldout, 1500 | 2247 | 44.10 (42.04 to 46.20) | 78.15 (76.48 to 79.81) | 70.98 (69.09 to 72.83) | -34.05 (-36.39 to -31.75) | 21.36 (19.68 to 22.99) | 18.91 (17.80 to 20.00) |

Adoption above minus his band: train 2.70 (0.96 to 4.40); held out 1.91 (-0.71 to 4.45).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 924368/4294043 (21.53%) | 412732/1893561 (21.80%) | 511636/2400482 (21.31%) |
| train | 615759/2863318 (21.51%) | 274284/1258820 (21.79%) | 341475/1604498 (21.28%) |
| heldout | 308609/1430725 (21.57%) | 138448/634741 (21.81%) | 170161/795984 (21.38%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 3928/4072 | 54.43 (52.80 to 56.04) | 20.44 (18.36 to 22.63) | 1930/2070 | 54.77 (52.48 to 57.02) | 20.32 (17.27 to 23.31) | no |
| opponentThreat | true | 4072/3928 | 33.99 (32.53 to 35.43) | -20.44 (-22.63 to -18.36) | 2070/1930 | 34.44 (32.39 to 36.56) | -20.32 (-23.31 to -17.27) | yes |
| material | ahead | 3356/4644 | 54.41 (52.68 to 56.05) | 17.89 (15.61 to 19.94) | 1637/2363 | 53.82 (51.32 to 56.19) | 16.20 (12.91 to 19.25) | no |
| material | level | 2758/5242 | 33.03 (31.24 to 34.77) | -16.78 (-19.01 to -14.64) | 1404/2596 | 33.62 (31.24 to 36.00) | -16.38 (-19.46 to -13.26) | yes |
| material | behind | 1886/6114 | 41.62 (39.38 to 43.98) | -3.14 (-5.60 to -0.54) | 959/3041 | 43.48 (40.49 to 46.66) | -1.01 (-4.54 to 2.54) | no |
| phase | middlegame | 3936/4064 | 32.80 (31.32 to 34.23) | -22.10 (-24.13 to -19.98) | 1919/2081 | 33.04 (30.94 to 35.25) | -21.55 (-24.68 to -18.47) | yes |
| phase | endgame | 4064/3936 | 54.90 (53.35 to 56.39) | 22.10 (19.98 to 24.13) | 2081/1919 | 54.59 (52.52 to 56.74) | 21.55 (18.47 to 24.68) | no |
| forcing | false | 5945/2055 | 40.57 (39.30 to 41.82) | -13.44 (-15.97 to -10.86) | 3034/966 | 40.38 (38.63 to 42.11) | -16.04 (-19.70 to -12.38) | yes |
| forcing | true | 2055/5945 | 54.01 (51.81 to 56.22) | 13.44 (10.86 to 15.97) | 966/3034 | 56.42 (53.33 to 59.55) | 16.04 (12.38 to 19.70) | no |
| kingDanger | false | 7070/930 | 44.96 (43.74 to 46.12) | 8.08 (4.94 to 11.32) | 3521/479 | 45.70 (44.14 to 47.36) | 12.09 (7.54 to 16.40) | no |
| kingDanger | true | 930/7070 | 36.88 (33.88 to 39.82) | -8.08 (-11.32 to -4.94) | 479/3521 | 33.61 (29.41 to 37.87) | -12.09 (-16.40 to -7.54) | no |

The descriptive tree's held-out accuracy is 65.12 (63.62 to 66.55); his band 64.58 (62.38 to 66.76), the band above 65.55 (63.59 to 67.57). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 4478,
  "predictUnsound": true,
  "feature": "phase",
  "equals": "middlegame",
  "giniGain": 0.024407304141860323,
  "yes": {
    "positions": 3936,
    "unsound": 2645,
    "predictUnsound": true,
    "feature": "forcing",
    "equals": false,
    "giniGain": 0.02046056161287423,
    "yes": {
      "positions": 2613,
      "unsound": 1944,
      "predictUnsound": true
    },
    "no": {
      "positions": 1323,
      "unsound": 701,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 4064,
    "unsound": 1833,
    "predictUnsound": false,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.02218752996330034,
    "yes": {
      "positions": 2321,
      "unsound": 835,
      "predictUnsound": false
    },
    "no": {
      "positions": 1743,
      "unsound": 998,
      "predictUnsound": true
    }
  }
}
```

## worst-piece

| Period and band | Positions | Sound R | Sound N | Sound A | Lift | Adoption | Maia probability of R at his band |
|---|---:|---|---|---|---|---|---|
| train, both | 8000 | 34.85 (33.82 to 35.90) | 75.11 (74.12 to 76.08) | 67.50 (66.45 to 68.51) | -40.26 (-41.55 to -39.00) | 8.90 (8.28 to 9.50) | 8.92 (8.52 to 9.32) |
| train, 1300 | 3571 | 34.78 (33.19 to 36.22) | 75.27 (73.78 to 76.60) | 66.96 (65.38 to 68.46) | -40.49 (-42.43 to -38.63) | 8.65 (7.76 to 9.50) | 9.13 (8.53 to 9.74) |
| train, 1500 | 4429 | 34.91 (33.55 to 36.28) | 74.98 (73.74 to 76.24) | 67.94 (66.64 to 69.26) | -40.08 (-41.85 to -38.44) | 9.10 (8.26 to 9.92) | 8.74 (8.22 to 9.27) |
| heldout, both | 4000 | 34.65 (33.23 to 36.12) | 75.48 (74.15 to 76.83) | 67.62 (66.17 to 69.00) | -40.83 (-42.62 to -39.10) | 8.48 (7.65 to 9.32) | 9.05 (8.52 to 9.65) |
| heldout, 1300 | 1806 | 34.66 (32.49 to 36.85) | 75.42 (73.34 to 77.41) | 67.17 (64.98 to 69.39) | -40.75 (-43.50 to -38.15) | 8.03 (6.76 to 9.31) | 9.13 (8.25 to 10.06) |
| heldout, 1500 | 2194 | 34.64 (32.74 to 36.61) | 75.52 (73.74 to 77.43) | 68.00 (66.12 to 69.90) | -40.88 (-43.32 to -38.49) | 8.84 (7.69 to 10.03) | 8.99 (8.27 to 9.76) |

Adoption above minus his band: train 0.45 (-0.74 to 1.68); held out 0.81 (-0.95 to 2.52).

| Availability period | Both bands | His band | Band above |
|---|---|---|---|
| all | 2705403/4294043 (63.00%) | 1169769/1893561 (61.78%) | 1535634/2400482 (63.97%) |
| train | 1801981/2863318 (62.93%) | 775949/1258820 (61.64%) | 1026032/1604498 (63.95%) |
| heldout | 903422/1430725 (63.14%) | 393820/634741 (62.04%) | 509602/795984 (64.02%) |

Each split compares one cell with all the other cells. Both periods must fall at least ten points with the interval below zero to name a failure.

| Split | Cell | Train cell/rest positions | Train R soundness | Train cell minus rest | Held-out cell/rest positions | Held-out R soundness | Held-out cell minus rest | Failure |
|---|---|---:|---|---|---:|---|---|---|
| opponentThreat | false | 4344/3656 | 43.35 (41.87 to 44.85) | 18.59 (16.61 to 20.61) | 2134/1866 | 42.92 (40.84 to 44.99) | 17.74 (14.90 to 20.59) | no |
| opponentThreat | true | 3656/4344 | 24.75 (23.34 to 26.17) | -18.59 (-20.61 to -16.61) | 1866/2134 | 25.19 (23.25 to 27.08) | -17.74 (-20.59 to -14.90) | yes |
| material | ahead | 2070/5930 | 49.47 (47.19 to 51.64) | 19.72 (17.21 to 22.17) | 1010/2990 | 49.31 (46.23 to 52.24) | 19.61 (16.07 to 22.92) | no |
| material | level | 3482/4518 | 24.38 (22.94 to 25.78) | -18.53 (-20.61 to -16.56) | 1811/2189 | 24.24 (22.29 to 26.21) | -19.02 (-21.82 to -16.13) | yes |
| material | behind | 2448/5552 | 37.38 (35.47 to 39.25) | 3.64 (1.33 to 5.94) | 1179/2821 | 38.08 (35.26 to 40.77) | 4.87 (1.45 to 8.02) | no |
| phase | middlegame | 5185/2815 | 27.62 (26.40 to 28.78) | -20.55 (-22.83 to -18.45) | 2521/1479 | 26.97 (25.21 to 28.72) | -20.76 (-23.94 to -17.70) | yes |
| phase | endgame | 2815/5185 | 48.17 (46.38 to 50.04) | 20.55 (18.45 to 22.83) | 1479/2521 | 47.73 (45.29 to 50.29) | 20.76 (17.70 to 23.94) | no |
| forcing | false | 7252/748 | 33.56 (32.48 to 34.69) | -13.76 (-17.41 to -10.00) | 3593/407 | 33.15 (31.64 to 34.68) | -14.76 (-19.80 to -9.66) | yes |
| forcing | true | 748/7252 | 47.33 (43.76 to 50.81) | 13.76 (10.00 to 17.41) | 407/3593 | 47.91 (42.96 to 52.82) | 14.76 (9.66 to 19.80) | no |
| kingDanger | false | 7093/907 | 34.67 (33.59 to 35.76) | -1.61 (-4.90 to 1.89) | 3550/450 | 34.82 (33.31 to 36.38) | 1.48 (-3.06 to 6.13) | no |
| kingDanger | true | 907/7093 | 36.27 (32.99 to 39.32) | 1.61 (-1.89 to 4.90) | 450/3550 | 33.33 (28.97 to 37.56) | -1.48 (-6.13 to 3.06) | no |

The descriptive tree's held-out accuracy is 67.92 (66.50 to 69.38); his band 68.55 (66.32 to 70.70), the band above 67.41 (65.43 to 69.33). The tree and every split's measures apart by band are in `rules.json`.

```json
{
  "positions": 8000,
  "unsound": 5212,
  "predictUnsound": true,
  "feature": "phase",
  "equals": "middlegame",
  "giniGain": 0.01926644878483671,
  "yes": {
    "positions": 5185,
    "unsound": 3753,
    "predictUnsound": true,
    "feature": "opponentThreat",
    "equals": false,
    "giniGain": 0.012550225130974134,
    "yes": {
      "positions": 2642,
      "unsound": 1707,
      "predictUnsound": true
    },
    "no": {
      "positions": 2543,
      "unsound": 2046,
      "predictUnsound": true
    }
  },
  "no": {
    "positions": 2815,
    "unsound": 1459,
    "predictUnsound": true,
    "feature": "material",
    "equals": "level",
    "giniGain": 0.021443374643739705,
    "yes": {
      "positions": 928,
      "unsound": 618,
      "predictUnsound": true
    },
    "no": {
      "positions": 1887,
      "unsound": 841,
      "predictUnsound": false
    }
  }
}
```
