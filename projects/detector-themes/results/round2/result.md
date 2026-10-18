# Detector themes, round 2

The test measures app commit `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The candidates, measurement scripts and app-pool results were frozen at `da8a4cb1d3ef23ad4a71703dd09967f072b2e851` before the held-out test. The report checked every frozen file against its Git blob.

The app pool contains 4630 puzzles. The held-out set contains 20000 other puzzles, sampled with seed 20261014 from 4682966 eligible puzzles rated 400 to 1899. The compressed source has SHA256 `76335bfa7d7c4a7f93c1366d81549e53951ebb79dd43d34904cab8f22d962f8d`; the serialized sample has SHA256 `98c6777e6dbc7b81e0a7763d8005f3c12eb5ccc01da41a208103fa036614037a`.

Each candidate is compared independently with the pinned app. Keep requires the paired agreement interval's lower end above zero and the disagreement interval's upper end at or below 1 percentage point on both sets. The comparisons use 2000 puzzle-bootstrap draws, seed 20261014, and 95% intervals.

| Candidate | Set | Agreement: app → candidate | Paired change (points), 95% interval | Disagreement: app → candidate | Paired change (points), 95% interval |
|---|---|---|---|---|---|
| `best-deflection` | app | 2269 (49.01%) → 2308 (49.85%) | +0.842 [+0.583, +1.102] | 1058 (22.85%) → 1044 (22.55%) | -0.302 [-0.562, -0.043] |
| `best-deflection` | heldout | 7179 (35.90%) → 7526 (37.63%) | +1.735 [+1.565, +1.920] | 6759 (33.80%) → 6712 (33.56%) | -0.235 [-0.420, -0.055] |
| `best-trapped` | app | 2269 (49.01%) → 2376 (51.32%) | +2.311 [+1.901, +2.765] | 1058 (22.85%) → 1044 (22.55%) | -0.302 [-0.454, -0.151] |
| `best-trapped` | heldout | 7179 (35.90%) → 7324 (36.62%) | +0.725 [+0.615, +0.850] | 6759 (33.80%) → 6769 (33.85%) | +0.050 [-0.020, +0.115] |

| Candidate | Set | New word said | Agrees | Disagrees | Precision | Verdict on both sets |
|---|---|---:|---:|---:|---:|---|
| `best-deflection` | app | 57 | 39 | 18 | 68.42% | keep |
| `best-deflection` | heldout | 553 | 348 | 205 | 62.93% | keep |
| `best-trapped` | app | 107 | 107 | 0 | 100.00% | keep |
| `best-trapped` | heldout | 182 | 146 | 36 | 80.22% | keep |

Recorded held-out scoring work totals 44.096 seconds: baseline 12.209, best-deflection 13.151, best-trapped 18.737. Sum of recorded per-puzzle elapsed times across the two scoring shards; excludes setup, launch, merge and comparison time. This is work time, not elapsed wall time for the full run.

These results measure agreement with Lichess’s tagger. They do not establish that every label is correct. The two candidates were tested independently; their combination has not been measured. The defensive-move and hanging-piece changes were deferred and have no verdict in this test.

The JSON report records every aggregate input checksum and frozen Git blob. It verifies the archive and sample against their frozen hashes, and links the sample’s canonical-array hash to the held-out scores. It emits no puzzle rows or tags.
