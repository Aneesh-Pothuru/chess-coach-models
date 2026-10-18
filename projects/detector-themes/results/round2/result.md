# Detector themes, round 2

The test measures app commit `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The independent candidates, measurement scripts and app-pool results were frozen at reviewer commit `da8a4cb1d3ef23ad4a71703dd09967f072b2e851` before their held-out tests. The report checked those frozen files against their Git blobs.

The combined candidate is `best-deflection-trapped`. Its replacement files, tests, wrapper, measurement scripts and prior evidence were frozen by content before its scores. The manifest is `combined-design.json`, SHA256 `01ee90236bcdf9928e70b827c3fdb9a8697373a4e395980791c6f64c3415c05e`. Its registered priority is `trappedPiece` before `deflection` after the existing named tactics. The report checked every manifest file hash.

The app pool contains 4630 puzzles. The held-out set contains 20000 other puzzles, sampled with seed 20261014 from 4682966 eligible puzzles rated 400 to 1899. The compressed source has SHA256 `76335bfa7d7c4a7f93c1366d81549e53951ebb79dd43d34904cab8f22d962f8d`; the serialized sample has SHA256 `98c6777e6dbc7b81e0a7763d8005f3c12eb5ccc01da41a208103fa036614037a`.

Each candidate is compared independently with the pinned app. Keep requires the paired agreement interval's lower end above zero and the disagreement interval's upper end at or below 1 percentage point on both sets. The comparisons use 2000 puzzle-bootstrap draws, seed 20261014, and 95% intervals.

| Candidate | Set | Agreement: app → candidate | Paired change (points), 95% interval | Disagreement: app → candidate | Paired change (points), 95% interval |
|---|---|---|---|---|---|
| `best-deflection` | app | 2269 (49.01%) → 2308 (49.85%) | +0.842 [+0.583, +1.102] | 1058 (22.85%) → 1044 (22.55%) | -0.302 [-0.562, -0.043] |
| `best-deflection` | heldout | 7179 (35.90%) → 7526 (37.63%) | +1.735 [+1.565, +1.920] | 6759 (33.80%) → 6712 (33.56%) | -0.235 [-0.420, -0.055] |
| `best-trapped` | app | 2269 (49.01%) → 2376 (51.32%) | +2.311 [+1.901, +2.765] | 1058 (22.85%) → 1044 (22.55%) | -0.302 [-0.454, -0.151] |
| `best-trapped` | heldout | 7179 (35.90%) → 7324 (36.62%) | +0.725 [+0.615, +0.850] | 6759 (33.80%) → 6769 (33.85%) | +0.050 [-0.020, +0.115] |
| `best-deflection-trapped` | app | 2269 (49.01%) → 2415 (52.16%) | +3.153 [+2.678, +3.650] | 1058 (22.85%) → 1030 (22.25%) | -0.605 [-0.907, -0.302] |
| `best-deflection-trapped` | heldout | 7179 (35.90%) → 7671 (38.36%) | +2.460 [+2.245, +2.680] | 6759 (33.80%) → 6722 (33.61%) | -0.185 [-0.385, 0.000] |

| Candidate | Set | Word | Said | Agrees | Disagrees | Precision | Verdict on both sets |
|---|---|---|---:|---:|---:|---:|---|
| `best-deflection` | app | `deflection` | 57 | 39 | 18 | 68.42% | keep |
| `best-deflection` | heldout | `deflection` | 553 | 348 | 205 | 62.93% | keep |
| `best-trapped` | app | `trappedPiece` | 107 | 107 | 0 | 100.00% | keep |
| `best-trapped` | heldout | `trappedPiece` | 182 | 146 | 36 | 80.22% | keep |
| `best-deflection-trapped` | app | `deflection` | 57 | 39 | 18 | 68.42% | keep |
| `best-deflection-trapped` | app | `trappedPiece` | 107 | 107 | 0 | 100.00% | keep |
| `best-deflection-trapped` | heldout | `deflection` | 553 | 348 | 205 | 62.93% | keep |
| `best-deflection-trapped` | heldout | `trappedPiece` | 182 | 146 | 36 | 80.22% | keep |

A new word is available when its independent candidate emits that word for the same puzzle, after the existing higher-priority tactics. Both means best-deflection emits deflection and best-trapped emits trappedPiece. This does not count raw findings hidden by an earlier tactic.

| Set | Availability | Puzzles | Baseline wins | Deflection wins | Trapped piece wins | Other wins |
|---|---|---:|---:|---:|---:|---:|
| app | neither | 4466 | 4466 | 0 | 0 | 0 |
| app | deflectionOnly | 57 | 0 | 57 | 0 | 0 |
| app | trappedOnly | 107 | 0 | 0 | 107 | 0 |
| app | both | 0 | 0 | 0 | 0 | 0 |
| heldout | neither | 19265 | 19265 | 0 | 0 | 0 |
| heldout | deflectionOnly | 553 | 0 | 553 | 0 | 0 |
| heldout | trappedOnly | 182 | 0 | 0 | 182 | 0 |
| heldout | both | 0 | 0 | 0 | 0 | 0 |

The combined candidate's fixed-rule verdict is **keep**. The overlap counts are descriptive; they have no separate decision rule.

Recorded held-out scoring work totals 76.442 seconds across the independent and combined runs: baseline 12.209, best-deflection 13.151, best-trapped 18.737, best-deflection-trapped 32.346. Sum of recorded per-puzzle elapsed times across the two scoring shards; excludes setup, launch, merge and comparison time. This is work time, not elapsed wall time for the full run.

These results measure agreement with Lichess’s tagger. They do not establish that every label is correct. The combined test reuses the previously scored held-out sample; its priority was fixed before its own scores. The defensive-move and hanging-piece changes were deferred and have no verdict in this test.

The JSON report records every aggregate input checksum, historical frozen Git blob and combined content-manifest hash. It verifies the archive and sample against their frozen hashes, and links the sample’s canonical-array hash to the held-out scores. It emits no puzzle rows or tags.
