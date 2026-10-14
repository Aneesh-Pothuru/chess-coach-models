# Phone against routine: results

Written by `compare.mjs` on the app at `d8b771238c11c84d0c4b2a8010bb75f5f756b8d9` (stockfish@18.0.8/stockfish-18-lite-single/nn-9067e33176e8). 60 games; intervals are 95% from 2000 bootstrap draws over games.

| Profile | Sweep nodes | Second looks (flags) | Serious, routine | Serious, device | Miss share | Extra share | Verdict |
|---|---|---|---|---|---|---|---|
| phone | 100000 | 999 (1788) | 341 | 336 | 9.1% (5.9% to 12.6%; 31 of 341) | 7.7% (4.9% to 10.7%; 26 of 336) | differs |
| desktop | 250000 | 994 (1786) | 341 | 346 | 7.3% (4.4% to 10.5%; 25 of 341) | 8.7% (5.7% to 11.7%; 30 of 346) | differs |

The routine: 1000000 nodes a position, 1738 second looks.

| Profile | Blunders missed | Blunders extra | Inaccuracies missed | Inaccuracies extra | Plies whose class differs | Accuracy bias (MAE, largest) |
|---|---|---|---|---|---|---|
| phone | 8.1% (3.7% to 12.3%; 11 of 136) | 6.0% (2.2% to 10.0%; 8 of 133) | 35.8% (29.4% to 42.5%; 116 of 324) | 27.0% (21.9% to 32.0%; 77 of 285) | 26.1% (24.0% to 28.2%; 1021 of 3917) | -0.57 (1.99, 6.38) over 120 sides |
| desktop | 6.6% (2.7% to 10.7%; 9 of 136) | 6.6% (2.8% to 10.8%; 9 of 136) | 32.7% (27.0% to 38.8%; 106 of 324) | 24.6% (19.2% to 29.9%; 71 of 289) | 23.1% (21.1% to 25.2%; 903 of 3917) | -0.72 (1.59, 7.25) over 120 sides |

## Where the differences come from

| Profile | Missed: second look | Missed: sweep only | Missed: routine read the tablebase | Extra: second look | Extra: sweep only | Extra: routine read the tablebase |
|---|---|---|---|---|---|---|
| phone | 26 | 5 | 0 | 26 | 0 | 1 |
| desktop | 23 | 2 | 0 | 30 | 0 | 0 |

## Why the reviews part (added after the results were read; it tests nothing)

| Profile | Plies both looked at twice | Same depth | Same numbers | Loss gap: median (90th percentile, largest) | Serious disagreements | Of them, both losses within 3 points of the 10-point mistake line | Of them, an extra look changed the verdict | Classes (routine/device) |
|---|---|---|---|---|---|---|---|---|
| phone | 880 | 260 | 17 | 0.57 (2.60, 17.56) | 57 | 40 | 26 | mistake/inaccuracy 26, inaccuracy/mistake 24, mistake/good 3, good/mistake 1, blunder/inaccuracy 1, mistake/best 1, excellent/mistake 1 |
| desktop | 905 | 245 | 18 | 0.63 (2.43, 17.35) | 55 | 49 | 25 | inaccuracy/mistake 30, mistake/inaccuracy 24, mistake/good 1 |

The phone against the desktop: the phone misses 9.8% (6.5% to 13.4%; 34 of 346) of the desktop's serious errors and adds 7.1% (4.6% to 9.9%; 24 of 336).
