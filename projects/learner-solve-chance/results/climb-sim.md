# A faster climb after an aced set, simulated

Written by climb-sim.mjs with the learner and serving code of app commit 4ba253b9e654248622c0069c62fbe72f26f316ee. Every player here is made up: he solves a puzzle with the chance the app's own `solveChance` gives his rating in the bucket, and no attempt of the real player is read. His level in a bucket is the difficulty he solves 75.0% of the time there, which is where the app means a set to start. A set is 12 puzzles at the difficulty it aims at, and a bucket's sets are 14 days apart.

Three ways to aim a set:

- **the view**: from the view of the bucket's own sets, as the app aims;
- **the climb**: from the higher of the view's rating and the rating the last set gives by itself (the bucket's last 12 first tries, once it has 6);
- **the climb after a perfect set**: the same, only when every one of those first tries was solved.

## What the last set alone reads as

The rating that maximizes the likelihood of a set's 12 attempts under the app's solve chance, with one solve and one miss added at their median difficulty, against the set's difficulty, and where a set aimed from it for a 75.0% chance would start.

| Solved of 12 | Its own rating, above the set | The next set's aim, against this set |
|---:|---:|---:|
| 12 | +451 | +258 |
| 11 | +315 | +122 |
| 10 | +229 | +36 |
| 9 | +161 | -32 |
| 8 | +103 | -90 |

## Every set solved

Each set's aim when every set is solved 12 of 12. The sets before the first aimed one are at the difficulty named.

After a first set at 700:

| Aimed from | Set 1 | Set 2 | Set 3 | Set 4 | Set 5 | Set 6 | Set 7 | Set 8 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| The view (the app) | 700 | 882 | 1064 | 1166 | 1341 | 1426 | 1551 | 1620 |
| The climb | 700 | 958 | 1216 | 1474 | 1732 | 1990 | 2200 | 2200 |

Set to set, from the last one at the difficulty named, the app's steps are 182, 182, 102, 175, 85, 125, 69 points and the climb's 258, 258, 258, 258, 258, 210, 0.

After three sets at 800, as serving once held a bucket near one difficulty:

| Aimed from | Set 1 | Set 2 | Set 3 | Set 4 | Set 5 | Set 6 | Set 7 | Set 8 | Set 9 | Set 10 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| The view (the app) | 800 | 800 | 800 | 1090 | 1182 | 1254 | 1424 | 1499 | 1604 | 1667 |
| The climb | 800 | 800 | 800 | 1090 | 1348 | 1606 | 1864 | 2122 | 2200 | 2200 |

Set to set, from the last one at the difficulty named, the app's steps are 290, 92, 72, 170, 75, 105, 63 points and the climb's 290, 258, 258, 258, 258, 78, 0.

## Reaching a level, and the cost once there

One bucket, 1000 random runs of 30 aimed sets after the sets named. "Sets to his level" counts the aimed sets until one starts within 100 points of his level (30 when none does). The other columns are the last 10 sets, long after every way of aiming has arrived: the share of puzzles solved, the share of sets aimed where his chance is under 60%, and the mean distance of a set's aim from his level.

| Player | Aimed from | Sets to his level | Solved, late | Sets under a 60% chance, late | Distance from his level, late |
|---|---|---:|---:|---:|---:|
| Rated 1700 (level 1507), far under his level: one set at 700 | the view (the app) | 7.1 | 74.9% | 0.1% | 31 |
| Rated 1700 (level 1507), far under his level: one set at 700 | the climb | 4.1 | 71.7% | 8.1% | 49 |
| Rated 1700 (level 1507), far under his level: one set at 700 | the climb after a perfect set | 4.5 | 73.9% | 3.5% | 38 |
| Rated 1500 (level 1307), far under it, held there: three sets at 800 | the view (the app) | 4.6 | 74.9% | 0.0% | 31 |
| Rated 1500 (level 1307), far under it, held there: three sets at 800 | the climb | 2.7 | 71.7% | 8.1% | 49 |
| Rated 1500 (level 1307), far under it, held there: three sets at 800 | the climb after a perfect set | 3.4 | 73.9% | 3.5% | 37 |
| Rated 1400 (level 1207), under it: one set at 900 | the view (the app) | 3.0 | 74.8% | 0.1% | 31 |
| Rated 1400 (level 1207), under it: one set at 900 | the climb | 1.8 | 71.7% | 8.2% | 49 |
| Rated 1400 (level 1207), under it: one set at 900 | the climb after a perfect set | 2.2 | 73.8% | 3.5% | 37 |
| Rated 1100 (level 907), at his level: one set there | the view (the app) | 1.4 | 74.8% | 0.1% | 31 |
| Rated 1100 (level 907), at his level: one set there | the climb | 1.3 | 71.7% | 8.2% | 49 |
| Rated 1100 (level 907), at his level: one set there | the climb after a perfect set | 1.4 | 73.8% | 3.5% | 37 |

## A round on twelve buckets

200 made-up players, each with 12 buckets rated from 1150 to 1700. Each bucket has two sets on record: a first one at the difficulty the row names against the bucket's level, and a second aimed as the app aims. Then a round like round 3: 32 sets on 20 days, the bucket of each drawn at random. The last two columns are over the twelve buckets at the round's end: how far under his level the next set would aim, on average, and the mean distance either way.

| The buckets began | The round is aimed from | Solved in the round | Sets under a 60% chance | The next aim, under his level | Its distance from his level |
|---|---|---:|---:|---:|---:|
| at his level | the view (the app) | 75.5% | 1.8% | +10 | 45 |
| at his level | the climb | 72.8% | 8.6% | -14 | 59 |
| at his level | the climb after a perfect set | 74.3% | 5.9% | +1 | 52 |
| half of them 400 points under it | the view (the app) | 78.6% | 1.0% | +30 | 56 |
| half of them 400 points under it | the climb | 75.1% | 6.7% | -2 | 63 |
| half of them 400 points under it | the climb after a perfect set | 76.8% | 4.6% | +15 | 61 |
| 400 points under it | the view (the app) | 81.8% | 0.3% | +49 | 69 |
| 400 points under it | the climb | 77.5% | 4.7% | +9 | 69 |
| 400 points under it | the climb after a perfect set | 79.1% | 3.5% | +29 | 71 |
| 800 points under it | the view (the app) | 93.4% | 0.0% | +203 | 204 |
| 800 points under it | the climb | 87.1% | 2.9% | +79 | 118 |
| 800 points under it | the climb after a perfect set | 88.7% | 2.5% | +114 | 139 |

## Which of these rounds round 2 looks like

The view's gap, as round 2 reports it: the share solved minus the view's mean chance, each attempt scored on the record as it stood just before it. Here on the rounds aimed from the view, as the app aims: the mean over the 200 players and the range the middle 95% of them fall in. Round 2 itself (results/round2.json, app commit d18d5d2e53d1903e13aa2622d7815232aff7d451): he solved 77.8% where the view gave him 72.7%, a gap of +5.1 points (95% interval +0.9 to +8.3).

| The buckets began | The view's gap in the round | The middle 95% of players |
|---|---:|---:|
| at his level | +0.6 | -3.1 to +4.6 |
| half of them 400 points under it | +3.1 | -0.6 to +7.2 |
| 400 points under it | +5.7 | +2.9 to +9.1 |
| 800 points under it | +15.1 | +13.2 to +17.4 |

## What a rule on such a round could tell

The climb's rule, read on the same rounds with the app unchanged (every set aimed from the view): on the sittings where the climb's rating is at least 100 points above the view's, the view must under-predict him and the climb must not over-predict him, each by its 95% interval over the days, once those sittings hold 30 attempts on 5 days. The shares are of all 200 players.

| The buckets began | Attempts in raised sittings | Enough to read | View under-predicts | Climb over-predicts | Kept |
|---|---:|---:|---:|---:|---:|
| at his level | 22.5 | 4.0% | 0.0% | 3.5% | 0.0% |
| half of them 400 points under it | 38.4 | 16.5% | 11.0% | 4.0% | 9.5% |
| 400 points under it | 57.1 | 50.0% | 33.5% | 4.0% | 32.5% |
| 800 points under it | 114.9 | 98.5% | 98.0% | 0.0% | 98.0% |
