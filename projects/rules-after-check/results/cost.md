# Cost before reading a position

This estimate uses the completed rules-of-thumb null run's public operation totals. It reads no private row and measures no new position.

| Reference month | Rows | Worker hours | Maia hours | Engine hours |
|---|---:|---:|---:|---:|
| 2026-07 | 42,656 | 5.222 | 0.648 | 4.569 |
| 2026-08 | 42,611 | 4.571 | 0.622 | 3.945 |
| 2026-09 | 42,754 | 14.716 | 9.039 | 5.672 |

| Scoring scenario | Worker hours | Ideal elapsed hours at two workers |
|---|---:|---:|
| Predecessor reference | 24.509 | 12.254 |
| Three new moves, predecessor fresh-search share | 38.694 | 19.347 |
| Three new moves, every predecessor row | 45.625 | 22.813 |

The reference contains 205,774 fixed-budget searches. Their average recorded time is 0.248178 seconds, including engine clearing inside that timer. The scenarios retain the reference's non-engine worker time and price one best search plus up to three new move searches at that average.

The every-row scenario includes all predecessor rows, even its excluded rules, and assumes no saved move or tablebase probe avoids a search. It is a conservative scenario, not a runtime bound. The new quiet share, safe-move counts and reuse rate have not been read.

The board pass calls the app's check on every legal move. Its cost is unmeasured. No whole-run duration or claim that one step dominates is available before that pass is timed.

These are elapsed worker and instrument timers, not CPU time. They include waiting, and the supervisor and worker clocks can behave differently across machine suspension. The large September Maia total is retained as recorded. Worker-hours divided by two assumes balanced workers and adds neither board processing nor the daily blackout, restart overhead or later machine pauses.

Heavy work stops at 12:59:50 UTC, ten seconds before the 13:00–15:30 blackout. The supervisor allows up to three seconds for shutdown, then kills the stage group. It resumes from the checkpoint at or after 15:30 UTC. Calendar time depends on the start time.

The scoring app is `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; the board app is `3437a711843006926c0804394b9087c5a55d4bcf`. The records pin is `aed714ada579782ce73630596e59c8b65e74cb30`. No package is installed for this estimate.

The numbers come from `projects/rules-of-thumb/results/null.json`, `operations.byMonth`: `cumulativeWorkerSeconds`, `completedRowTotals` and `failedAttemptTotals`. That analysis copied the private null shard manifests' `workerSeconds`, `totals`, `failedAttemptTotals` and `stoppedJobs`. Its source paths are listed in `cost.json`. This generator does not open those private manifests or logs.
