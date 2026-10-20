# Rules of thumb: operations

Written by `operations.py` for the app at `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a` and records pin `aed714ada579782ce73630596e59c8b65e74cb30`. The data are the completed July, August and September full run. This supplement adds no chess measure or verdict.

| Month | Completed rows | Score worker seconds | Maia seconds | Engine seconds | Tablebase seconds | Worker stops |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07 | 42656 | 39,490.384 | 3,077.650 | 34,687.845 | 1,636.155 | 6 |
| 2026-08 | 42611 | 38,600.679 | 2,646.729 | 30,123.387 | 2,990.087 | 16 |
| 2026-09 | 42754 | 44,747.799 | 2,846.670 | 31,833.337 | 2,133.459 | 16 |

| Month | Interrupted workers with unknown tail timing | Interrupted retry chains | Workers with incomplete event/manifest reconciliation |
|---|---:|---:|---:|
| 2026-07 | 0 | 0 | 0 |
| 2026-08 | 0 | 0 | 0 |
| 2026-09 | 0 | 0 | 0 |

An interrupted retry chain has no recorded terminal outcome for that invocation. Its logged retries are counted, but any additional unlogged requests remain unknown. Successful events and durable row totals remain separate when an abrupt interruption prevents reconciliation.

Instrument times above cover completed rows. Failed attempts, availability instruments and stream timings are separate in `operations.json`.

| Stage | Month | Attempts | Stopped | Recorded invocation seconds | UTC invocation seconds | UTC gaps between attempts |
|---|---|---:|---:|---:|---:|---:|
| analysis | all | 1 | 0 | 17.984 | 17.984 | 0 |
| backfill | 2026-07 | 20 | 0 | 145.940 | 159.334 | 135,013.331 |
| backfill | 2026-08 | 20 | 0 | 105.502 | 450.258 | 131,688.261 |
| backfill | 2026-09 | 20 | 0 | 104.609 | 126.425 | 130,029.691 |
| positions | 2026-07 | 2 | 1 | unknown | unknown | unknown |
| positions | 2026-08 | 1 | 0 | 1,984.055 | 1,984.068 | 0 |
| positions | 2026-09 | 1 | 0 | 1,720.401 | 1,720.387 | 0 |
| score | 2026-07 | 4 | 3 | 19,820.111 | 19,820.149 | 285.224 |
| score | 2026-08 | 9 | 8 | 17,153.593 | 19,327.012 | 65,350.977 |
| score | 2026-09 | 9 | 8 | 18,482.588 | 22,429.115 | 1,361.398 |
| stream | 2026-07 | 1 | 0 | 136.910 | 136.910 | 0 |
| stream | 2026-08 | 1 | 0 | 216.062 | 216.061 | 0 |
| stream | 2026-09 | 1 | 0 | 300.382 | 300.379 | 0 |

Supervisor seconds use its monotonic clock, as recorded; they are not replaced by UTC intervals.
Start-to-terminal intervals use the recorded UTC timestamps. Clock changes can also affect these intervals.
Between-attempt gaps are separate from invocation time. Stages may overlap, so their sums are not total study wall time.
An unknown termination time remains null even when the later audit event has a timestamp.
Worker seconds and instrument seconds are recorded elapsed times, not CPU usage. Clock behavior during sleep can differ from supervisor timings. Abruptly interrupted tails may have unrecorded work; that time is not invented or treated as zero.
Recovered failures count failed requests, not missing final scores. A terminal-unavailable attempt leaves a row pending until a later successful invocation.

The intentional reviewer amendment stop is reported separately below. Its unrecorded duration remains unknown; known subtotals and unknown interval counts are retained in `operations.json`.

| Scope | Month | Stop reason | Count |
|---|---|---|---:|
| positions stage | 2026-07 | reviewer-amendment-sigterm | 1 |
| score stage | 2026-07 | stage-failure | 3 |
| score stage | 2026-08 | stage-failure | 8 |
| score stage | 2026-09 | stage-failure | 8 |
| Score worker | 2026-07 | requested-sigterm | 2 |
| Score worker | 2026-07 | tablebase-outcome-unavailable | 4 |
| Score worker | 2026-08 | inexact-best-score | 3 |
| Score worker | 2026-08 | inexact-move-score | 4 |
| Score worker | 2026-08 | requested-sigterm | 5 |
| Score worker | 2026-08 | tablebase-outcome-unavailable | 4 |
| Score worker | 2026-09 | inexact-best-score | 1 |
| Score worker | 2026-09 | inexact-move-score | 1 |
| Score worker | 2026-09 | requested-sigterm | 7 |
| Score worker | 2026-09 | tablebase-outcome-unavailable | 7 |

| Month | Retry events | Recovered probes | Retries on recovered probes | Terminal-unavailable attempts | Retries on terminal attempts | Final unscored rows |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07 | 188 | 130 | 176 | 4 | 12 | 0 |
| 2026-08 | 321 | 226 | 309 | 4 | 12 | 0 |
| 2026-09 | 375 | 270 | 354 | 7 | 21 | 0 |

Private power records were compared with engine-stop times within 60 seconds. Only counts near study interruptions are reported; the power timeline and personal usage counts stay private.

| Month | Engine worker stops | Near DarkWake | Near Wake | Near Sleep | No nearby recorded power event |
|---|---:|---:|---:|---:|---:|
| 2026-07 | 0 | 0 | 0 | 0 | 0 |
| 2026-08 | 7 | 7 | 0 | 7 | 0 |
| 2026-09 | 2 | 0 | 2 | 0 | 0 |

Temporal coincidence is operational evidence, not a proof of the exact rejected engine flag.

Full analysis elapsed seconds: 17.385. Content hashes of this generator, the frozen measurement manifest, the full analysis and operational inputs are in `operations.json`.
