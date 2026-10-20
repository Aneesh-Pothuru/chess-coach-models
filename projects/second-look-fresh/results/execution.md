# Phase-two execution time

Written by execution.mjs. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`; design manifest SHA-256 `9bcb9d0512a763dd352dab9d8585988a02160fe7abda3b478585c688a2dc1161`. 60 frozen games.

At report generation, all 11 measurement source files and the fixed protocol match the committed design manifest. execution.json records the expected and actual SHA-256 digests. A mismatch stops the report.

6 wrapper invocations: 0 succeeded, 5 have known unsuccessful ends, and 1 have unknown interruption times. The last invocation succeeded: false.

1 invocations used the separately approved candidate routine acquisition amendment, SHA-256 `c301bc3e56ec45b233b3868d231e4e602719e97bfab511468058359a4cab2c54`. Each invocation retains its command and amendment identity. Earlier acquisition logs retain their original identity.

The unchanged replay equality check rejected 4 attempts. No accepted timing file was kept for a rejected attempt. The amendment separately retains each first observed output before that check. Counts identify the arm and profile, not the game. The log establishes the rejection, not its cause.

| Rejected replay attempts | Phone | Desktop | Routine |
|---|---:|---:|---:|
| baseline | 0 | 0 | 1 |
| candidate | 0 | 0 | 3 |

The CLI logged 10 timeout failures. Their configured per-game limits were 3600 seconds. These are logged timeout outcomes, not measurements of CPU use or the cause of delay.

| CLI stage | Logged timeout failures | Configured limits in seconds |
|---|---:|---:|
| baseline/CLI/phone | 0 | none logged |
| baseline/CLI/desktop | 0 | none logged |
| baseline/CLI/routine | 0 | none logged |
| candidate/CLI/phone | 0 | none logged |
| candidate/CLI/desktop | 0 | none logged |
| candidate/CLI/routine | 10 | 3600 |

Logged monotonic elapsed lower bound: 64153.11 seconds (17.82 hours). Logged calendar elapsed lower bound across invocation windows: 126725.93 seconds. Calendar minus monotonic elapsed across those observed windows: 62572.83 seconds. This is an unattributed clock difference; it does not measure CPU time or establish downtime.

Full calendar span through the last observation: 144568.76 seconds. Known gaps between invocations: 12576.79 seconds. Unallocated gaps after unknown ends: 5266.04 seconds; these are not asserted idle and are separate from the within-invocation clock difference. Started 2026-10-18T18:23:41.347630+00:00; observed through 2026-10-20T10:33:10.106068+00:00.

| Stage | Monotonic seconds | Calendar seconds | Calendar minus monotonic | Complete invocations | Failed invocations | Incomplete invocations |
|---|---:|---:|---:|---:|---:|---:|
| preparation | 55.63 | 55.63 | 0.00 | 6 | 0 | 0 |
| baseline/CLI/phone | 1225.13 | 1225.12 | -0.01 | 6 | 0 | 0 |
| baseline/CLI/desktop | 2743.94 | 2743.93 | -0.01 | 6 | 0 | 0 |
| baseline/CLI/routine | at least 12489.75 | at least 12489.78 | 0.04 | 5 | 0 | 1 |
| baseline/observed/phone | 1641.91 | 1641.92 | 0.02 | 5 | 0 | 0 |
| baseline/observed/desktop | 1951.24 | 1951.19 | -0.05 | 5 | 0 | 0 |
| baseline/observed/routine | 8697.89 | 8697.94 | 0.05 | 4 | 1 | 0 |
| candidate/CLI/phone | 1242.45 | 1242.45 | 0.00 | 4 | 0 | 0 |
| candidate/CLI/desktop | 1569.64 | 1569.64 | 0.00 | 4 | 0 | 0 |
| candidate/CLI/routine | 21616.90 | 84189.66 | 62572.76 | 3 | 1 | 0 |
| candidate/observed/phone | 1371.14 | 1371.15 | 0.01 | 3 | 0 | 0 |
| candidate/observed/desktop | 1663.15 | 1663.16 | 0.02 | 3 | 0 | 0 |
| candidate/observed/routine | 7884.35 | 7884.36 | 0.01 | 0 | 3 | 0 |
| references | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |
| analysis | 0.00 | 0.00 | 0.00 | 0 | 0 | 0 |

Output-observation boundaries: preparation ends at the last line before the first CLI start; every later stage begins at the preceding stage closing line. Each boundary uses both the exact logged calendar timestamp and the wrapper monotonic timestamp. The legacy activeWallSecondsLowerBound and exactActiveWallSeconds fields measure monotonic elapsed time, not CPU time or guaranteed awake time. Calendar elapsed is measured over the same observed windows. observedClockDifferenceSeconds is calendar minus monotonic elapsed; it is an unattributed clock difference, consistent with sleep but not proof of sleep, CPU use or downtime. A recorded wrapper end closes analysis or an interrupted stage. An interruption with an unknown end is censored at its last output: both elapsed totals and its final stage durations are lower bounds. The clock difference describes only the observed windows and is not a bound on any unobserved difference. Time after the last output and before the next invocation is unallocated, not asserted idle; it can contain unlogged runtime. Known end-to-next-start gaps are reported separately. Calendar invocation windows plus both kinds of between-invocation gap equal the full observed calendar span. Launch and exit overhead are included when observed. Stage times are approximate output-observation intervals, not summed worker seconds. Counts sum logged attempts and resumptions, not distinct games or positions; interrupted work after the final line may first be counted on resumption.

The script refuses running metadata, undocumented unknown ends, missing or out-of-order stage markers, overlapping observed intervals, inconsistent counts or changed provenance. It reads no review document and interprets no deciding measure. Per-invocation stage counts are in execution.json; raw logs remain private.
