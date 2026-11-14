# The learner's solve chances, round 2: results

Written by round2.mjs. Rules 1 and 2: app commit d18d5d2e53d1903e13aa2622d7815232aff7d451, its profile (synced 2026-11-13) read with that commit's own learner. Bootstrap: 1000 draws over days, seed 7.

## The attempts

Every puzzle attempt in a bucket's own set that the app counts as a first exposure, recorded after the last attempt of the profile round 1 read (app commit d8b771238c11c84d0c4b2a8010bb75f5f756b8d9), which was played at 09:27 on 2026-10-07, Los Angeles time: 188 attempts on 10 days (2026-10-15 to 2026-11-13), 30 of one move and 158 of two or more. Left out: 8 attempts on a puzzle he had seen before.

180 of them are scored, on 9 days: an attempt is scored when its skill already has a rated attempt in its own sets, so both estimates exist, and the other 8 opened a bucket's record there. Each is scored on the profile as it stood just before it: the legacy log, the puzzle totals as the seed and the events, as the app folds them.

## Rule 1: how well the headline predicts

He solved 77.8% of the scored attempts (40 misses); the headline rating's mean solve chance was 56.0%, a gap of +21.8 points (95% interval +14.8 to +26.9). By the rule, the headline under-predicts him.

## Rule 2: the view of a set's own channel

Mean log loss per attempt, the view against the headline: half 1 (5 days, 134 attempts) 0.609 against 0.709, a difference of -0.100 (95% interval -0.155 to -0.019); half 2 (4 days, 46 attempts) 0.495 against 0.568, a difference of -0.072 (95% interval -0.156 to 0.020). By the rule, it does not pass: the view does not stay, and a set's solve chance goes back to the headline.

## Reported beside rules 1 and 2, deciding nothing

The halves' days hold, in time order, 35, 24, 33, 20 and 22 scored attempts, and 13, 12, 20 and 1 scored attempts.

The view's mean solve chance was 72.7% (gap +5.1 points, 95% interval +0.9 to +8.3). Over all the days, the view's log loss minus the headline's is -0.093 (-0.142 to -0.034). The shift that best fits the headline's chances takes 190 (130 to 240) points off every item's rating; the view's, 55 (10 to 90).

| Estimate | Mean chance | Brier | Log loss |
|---|---:|---:|---:|
| Headline rating | 56.0% | 0.238 | 0.673 |
| View of the channel | 72.7% | 0.194 | 0.580 |
| Running rate | 81.3% | 0.203 | 0.695 |

| Solve chance | Headline: attempts | mean chance | solved | View: attempts | mean chance | solved |
|---|---:|---:|---:|---:|---:|---:|
| 0.0 to 0.5 | 54 | 39.6% | 74.1% | 14 | 40.4% | 71.4% |
| 0.5 to 0.6 | 54 | 55.2% | 77.8% | 14 | 55.1% | 85.7% |
| 0.6 to 0.7 | 50 | 64.8% | 82.0% | 26 | 66.6% | 80.8% |
| 0.7 to 0.8 | 15 | 73.7% | 73.3% | 70 | 75.4% | 77.1% |
| 0.8 to 0.9 | 4 | 84.4% | 100.0% | 51 | 83.9% | 76.5% |
| 0.9 to 1.0 | 3 | 92.0% | 66.7% | 5 | 91.8% | 80.0% |

| Bucket | Scored | Mean rating | Solved | Headline's chance | View's chance |
|---|---:|---:|---:|---:|---:|
| backRankMate | 11 | 1196 | 90.9% | 60.1% | 81.9% |
| defensiveMove | 8 | 756 | 87.5% | 76.3% | 68.1% |
| discoveredAttack | 11 | 1246 | 90.9% | 62.1% | 83.3% |
| fork | 24 | 1138 | 83.3% | 53.3% | 77.5% |
| hangingPiece | 35 | 1484 | 62.9% | 60.3% | 74.1% |
| mateIn1 | 12 | 1652 | 66.7% | 41.8% | 68.7% |
| op:caroKann | 35 | 1165 | 77.1% | 51.2% | 68.4% |
| op:london | 11 | 1395 | 72.7% | 57.0% | 60.5% |
| pawnEndgame | 2 | 1219 | 50.0% | 60.5% | 75.8% |
| planning | 12 | 926 | 100.0% | 57.5% | 80.1% |
| promotion | 11 | 1203 | 90.9% | 56.6% | 78.8% |
| queenEndgame | 8 | 1261 | 62.5% | 48.0% | 50.0% |

The learner's own self-check on this profile: 100 held-out attempts, Brier 0.1645 against 0.1605 for its constant, log loss 0.5142 against 0.5426; mean predicted 0.7636, observed 0.81.

What each estimate would aim a set at on 2026-11-13, when this profile was synced:

| Bucket | Phase | Headline | Its target | Themed view | Its target | The app aims from | Its target | Hardest in the bank |
|---|---|---:|---:|---:|---:|---|---:|---:|
| hangingPiece | core | 1544 ± 105 | 1351 | 1627 ± 63 (n=52) | 1434 | view, 1627 ± 63 | 1434 | 1899 |
| op:caroKann | core | 1247 ± 132 | 1054 | 1375 ± 73 (n=36) | 1182 | view, 1375 ± 73 | 1182 | 1486 |
| fork | core | 1259 ± 152 | 1066 | 1401 ± 77 (n=36) | 1208 | view, 1401 ± 77 | 1208 | 1897 |
| planning | core | 1047 ± 184 | 854 | 1222 ± 78 (n=37) | 1029 | view, 1222 ± 78 | 1029 | 1878 |
| defensiveMove | core | 988 ± 187 | 795 | 1022 ± 129 (n=9) | 829 | view, 1022 ± 129 | 829 | 1898 |
| mateIn1 | core | 1655 ± 200 | 1462 | 1821 ± 72 (n=50) | 1628 | view, 1821 ± 72 | 1628 | 1896 |
| op:london | core | 1528 ± 210 | 1335 | 1564 ± 103 (n=12) | 1371 | view, 1564 ± 103 | 1371 | 1494 |
| queenEndgame | core | 1283 ± 216 | 1090 | 1290 ± 116 (n=9) | 1097 | view, 1290 ± 116 | 1097 | 1888 |
| discoveredAttack | core | 1358 ± 226 | 1165 | 1547 ± 116 (n=12) | 1354 | view, 1547 ± 116 | 1354 | 1899 |
| promotion | core | 1317 ± 243 | 1124 | 1498 ± 111 (n=12) | 1305 | view, 1498 ± 111 | 1305 | 1899 |
| backRankMate | core | 1319 ± 244 | 1126 | 1498 ± 113 (n=12) | 1305 | view, 1498 ± 113 | 1305 | 1893 |
| pawnEndgame | core | 1287 ± 264 | 1094 | 1317 ± 180 (n=3) | 1124 | view, 1317 ± 180 | 1124 | 1887 |
| mateIn2 | core | 796 ± 291 | 603 | 1083 ± 121 (n=12) | 890 | view, 1083 ± 121 | 890 | 1897 |
| mateIn3 | core | 1066 ± 316 | 873 | 1084 ± 214 (n=2) | 891 | view, 1084 ± 214 | 891 | 1899 |
| attackingF2F7 | core | 1040 ± 338 | 847 | none | n/a | totals, 1349 ± 89 | 1156 | 1889 |

## Rule 3: a target by depth

**Not enough data.** Rule 3 needs 30 scored attempts at each level, and the profile at app commit d18d5d2e53d1903e13aa2622d7815232aff7d451 (synced 2026-11-13) holds 29 one-move attempts on 5 days and 151 of two moves or more on 9 days. It is checked again at each later check-in, unchanged, on every round 2 attempt recorded by then, with the chance from the headline rating, the estimate rule 2 leaves serving. Nothing of the attempts' results by depth is reported until it runs.
