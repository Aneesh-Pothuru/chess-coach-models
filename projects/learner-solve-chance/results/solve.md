# The learner's solve chances: results

Written by fit.mjs. App commit 50de20ccbf1336f0a902156445359a02068517e3. Bootstrap: 1000 draws over days, seed 7.

## Round 1, on the rebuilt record

His puzzle first tries rebuilt from 429 memory cards: the 365 reviewed once (24 of them with the app's own event), 365 first tries from 2026-07-21 to 2026-10-05; 354 scored on 21 days. The 64 cards reviewed more than once are left out.

**Verdict 1, as computed.** He solved 99.7% of the scored first tries; the headline rating's mean solve chance was 52.0%, a gap of +47.7 points (95% interval +40.5 to +56.8): by the rule, the headline under-predicts.

**Verdict 2, as computed.** Mean log loss per attempt, the view of the set's own channel against the headline: half 1 (11 days, 124 attempts) 0.269 against 0.694, a difference of -0.426 (95% interval -0.569 to -0.266); half 2 (10 days, 230 attempts) 0.270 against 0.779, a difference of -0.509 (95% interval -0.729 to -0.348). By the rule, both halves pass.

**Neither verdict stands.** A miss comes back as a redemption card, so a card reviewed once is nearly always a solve: the 365 cards reviewed once hold 1 miss, the 64 reviewed more than once hold 26 on 25 cards. Leaving those cards out kept his solves and dropped his misses, which is the outcome the rule measures.

## The profile as the app holds it

The legacy log, the puzzle totals as the seed and the events, as the app folds them: 100 scored attempts on 7 days (2026-08-28 to 2026-10-05), 4 misses, 96.0% solved. Every attempt in this record was logged when it was played, so nothing in it selects on the result. Named before the run, deciding nothing.

The headline's mean solve chance was 58.0% (gap +38.0, 95% interval +31.3 to +42.7); the view's 82.4% (gap +13.6, +8.9 to +22.1). The view's log loss minus the headline's: -0.292 (-0.366 to -0.161). The shift that best fits the headline's chances takes 500 (385 to 500, at the grid's edge) points off every item's rating; the view's, 305 (160 to 500, at the grid's edge).

| Estimate | Mean chance | Brier | Log loss |
|---|---:|---:|---:|
| Headline rating | 58.0% | 0.191 | 0.568 |
| View of the channel | 82.4% | 0.069 | 0.276 |
| Running rate | 93.1% | 0.064 | 0.298 |

| Solve chance | Headline: attempts | mean chance | solved | View: attempts | mean chance | solved |
|---|---:|---:|---:|---:|---:|---:|
| 0.0 to 0.5 | 22 | 45.2% | 90.9% | 3 | 37.4% | 100.0% |
| 0.5 to 0.6 | 37 | 55.2% | 100.0% | 0 | n/a | n/a |
| 0.6 to 0.7 | 29 | 63.7% | 93.1% | 2 | 65.5% | 100.0% |
| 0.7 to 0.8 | 8 | 74.2% | 100.0% | 17 | 75.8% | 100.0% |
| 0.8 to 0.9 | 4 | 81.9% | 100.0% | 67 | 85.0% | 94.0% |
| 0.9 to 1.0 | 0 | n/a | n/a | 11 | 92.1% | 100.0% |

| Bucket | Scored | Mean rating | Solved | Headline's chance | View's chance |
|---|---:|---:|---:|---:|---:|
| fork | 11 | 906 | 100.0% | 60.0% | 84.0% |
| hangingPiece | 16 | 1511 | 87.5% | 59.4% | 82.4% |
| mateIn1 | 37 | 1436 | 94.6% | 49.4% | 82.9% |
| mateIn2 | 11 | 693 | 100.0% | 61.4% | 85.8% |
| mateIn3 | 1 | 1075 | 100.0% | 47.6% | 27.0% |
| planning | 24 | 716 | 100.0% | 68.5% | 81.5% |

The learner's own self-check on this profile: 40 held-out attempts, Brier 0.0751 against 0.0704 for its constant, log loss 0.2878 against 0.2946; mean predicted 0.8525, observed 0.925.

## What each estimate would aim a set at on 2026-10-14, the profile's last sync

| Bucket | Phase | Headline | Its target | Themed view | Its target | The app aims from | Its target | Hardest in the bank |
|---|---|---:|---:|---:|---:|---|---:|---:|
| planning | core | 918 ± 222 | 725 | 1123 ± 94 (n=25) | 930 | view, 1123 ± 94 | 930 | 1878 |
| hangingPiece | core | 1608 ± 245 | 1415 | 1797 ± 109 (n=17) | 1604 | view, 1797 ± 109 | 1604 | 1899 |
| defensiveMove | core | 1096 ± 246 | 903 | none | n/a | totals, 1182 ± 70 | 989 | 1898 |
| mateIn1 | core | 1587 ± 247 | 1394 | 1833 ± 82 (n=38) | 1640 | view, 1833 ± 82 | 1640 | 1896 |
| fork | core | 1006 ± 280 | 813 | 1282 ± 119 (n=12) | 1089 | view, 1282 ± 119 | 1089 | 1897 |
| mateIn2 | core | 796 ± 290 | 603 | 1083 ± 119 (n=12) | 890 | view, 1083 ± 119 | 890 | 1897 |
| mateIn3 | core | 1066 ± 315 | 873 | 1084 ± 212 (n=2) | 891 | view, 1084 ± 212 | 891 | 1899 |
| pawnEndgame | core | 1223 ± 318 | 1030 | none | n/a | totals, 1418 ± 112 | 1225 | 1887 |
| discoveredAttack | core | 1056 ± 328 | 863 | none | n/a | totals, 1362 ± 112 | 1169 | 1899 |
| op:london | core | 1056 ± 328 | 863 | none | n/a | totals, 1362 ± 112 | 1169 | 1494 |
| attackingF2F7 | core | 1040 ± 337 | 847 | none | n/a | totals, 1349 ± 85 | 1156 | 1889 |

## Round 1's rebuilt record, for completeness

| Estimate | Mean chance | Brier | Log loss |
|---|---:|---:|---:|
| Headline rating | 52.0% | 0.265 | 0.749 |
| View of the channel | 78.1% | 0.069 | 0.269 |
| Running rate | 98.1% | 0.005 | 0.033 |

| Solve chance | Headline: attempts | mean chance | solved | View: attempts | mean chance | solved |
|---|---:|---:|---:|---:|---:|---:|
| 0.0 to 0.5 | 125 | 32.0% | 100.0% | 23 | 42.7% | 100.0% |
| 0.5 to 0.6 | 114 | 55.2% | 99.1% | 25 | 55.8% | 100.0% |
| 0.6 to 0.7 | 72 | 65.2% | 100.0% | 23 | 65.5% | 100.0% |
| 0.7 to 0.8 | 23 | 74.0% | 100.0% | 87 | 75.7% | 98.9% |
| 0.8 to 0.9 | 20 | 86.2% | 100.0% | 115 | 84.3% | 100.0% |
| 0.9 to 1.0 | 0 | n/a | n/a | 81 | 92.5% | 100.0% |

| Bucket | Scored | Mean rating | Solved | Headline's chance | View's chance |
|---|---:|---:|---:|---:|---:|
| attackingF2F7 | 22 | 810 | 100.0% | 47.3% | 81.2% |
| defensiveMove | 19 | 817 | 100.0% | 52.8% | 78.7% |
| discoveredAttack | 11 | 531 | 100.0% | 55.5% | 80.8% |
| fork | 35 | 681 | 100.0% | 51.9% | 78.0% |
| hangingPiece | 61 | 1132 | 98.4% | 62.2% | 79.0% |
| mateIn1 | 122 | 860 | 100.0% | 42.5% | 72.6% |
| mateIn2 | 32 | 653 | 100.0% | 53.7% | 83.3% |
| mateIn3 | 10 | 642 | 100.0% | 52.5% | 82.0% |
| op:london | 11 | 502 | 100.0% | 55.7% | 80.9% |
| pawnEndgame | 7 | 1144 | 100.0% | 57.6% | 81.4% |
| planning | 24 | 712 | 100.0% | 70.7% | 89.0% |
