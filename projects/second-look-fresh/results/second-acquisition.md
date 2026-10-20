# Second acquisition report

Written by `second-report.mjs`. This is an acquisition and timing report. No deciding metric was read.

App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`. Data: 60 frozen games; cases SHA256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`. Candidate SHA256 `8f1d16bc8d412dd2f9584c6eec3aea82ac3eefa22d15aed9be4ff6b05f0e89e1`.

Recorded driver state: stopped. Acquisition completion manifest: absent. There are 53 accepted routine replays and 7 games without one. The preserved first-output count is 50; the total first-output count is 54. 1 retries are accepted. Rejected first outputs remain preserved.

The new attempts have produced 5 outputs: 4 accepted, 0 matching but not yet copied to the accepted namespace, 0 eligible infrastructure failures and 1 blocking failures. 0 started attempts have no saved output. These counts do not turn a missing output into an incomplete look.

The registered exact-reproduction gate stopped acquisition. The blocked output does not qualify for the allowed human-policy fallback retry. No further replay or retry is allowed under the current amendment. Reference processes started: 0; analysis processes started: 0. The reference manifest and deciding outputs are absent. This is an acquisition stop, not a verdict on the candidate.

Across 1 blocked new outputs, 1 position rows and 1 record rows differ from their canonical documents. The completeness guard passes for 34/34 raw verification looks. 33/34 latest canonical verification readings match and 1 differ. There are 0 failed engine calls, 0 failed human-policy calls and 0 other failed calls. 1 differing rows remain outside the registered teaching-fallback explanation. Complete evidence does not imply exact reproduction.

The quiet gate has 979 recorded samples and 5 receipts. Its latest sample is 2026-10-20T12:33:45.523265+00:00: load 3.2060546875, 0 npm verify processes and 0 Vitest processes, with 301.999 continuous quiet seconds. A running record is a saved status, not proof that the process remains alive.

Completed quiet waits total 4996.273 monotonic seconds across 5 passages. Waits that ended before passage total 0.000 monotonic seconds. The 0 recorded pending waits have reached at least 0.000 monotonic seconds and 0.000 calendar seconds. Pending values are lower bounds from saved samples, not a forecast. Waiting includes time before the continuous quiet interval began.

| Driver step | Started/finished processes | Process seconds, sum | Calendar seconds per process, sum | Calendar span from first start to last finish | Nonzero exits |
| --- | ---: | ---: | ---: | ---: | ---: |
| acquisition-helpers | 12/12 | 9.482 | 9.457 | 20666.145 | 1 |
| replay-processes | 5/5 | 820.958 | 15660.295 | 16878.533 | 1 |
| reference-workers | 0/0 | 0.000 | 0.000 | unknown | 0 |
| analysis | 0/0 | 0.000 | 0.000 | unknown | 0 |

Process-time sums include both reference workers when they run together. Calendar spans include gaps between finished processes in the same step. Unfinished processes are not assigned a completed duration.

The reviewer reported heavy outside work from 2026-10-20T09:00:00.000Z to 2026-10-20T10:40:00.000Z. Every preserved first interval that overlaps that window is grouped below. Old intervals are bounded by log lines; new intervals use recorded review boundaries. Overlap is not proof of causation.

| Timing group | Produced attempts | Review seconds, sum | Verification seconds, sum | Look seconds, mean | Look depth, mean | Incomplete/all raw looks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Preserved first; log window overlaps reported load | 29 | 5609.950 | 2051.394 | 1.765 | 23.460 | 0/1162 |
| Preserved first; log window outside reported load | 21 | 1588.619 | 652.311 | 0.836 | 19.415 | 0/780 |
| New quiet-gated first | 4 | 15544.956 | 15137.424 | 88.523 | 16.895 | 0/171 |
| New quiet-gated retry | 1 | 111.437 | 41.565 | 1.188 | 16.800 | 0/35 |

| Timing group | Recorded interval UTC seconds, sum | Recorded elapsed seconds, sum | UTC minus elapsed seconds, sum | Elapsed timer |
| --- | ---: | ---: | ---: | --- |
| Preserved first; log window overlaps reported load | 5610.729 | 5610.687 | 0.042 | Python driver time.monotonic between log lines |
| Preserved first; log window outside reported load | 1589.010 | 1589.028 | -0.018 | Python driver time.monotonic between log lines |
| New quiet-gated first | 15545.112 | 15544.956 | 0.156 | Node review performance.now |
| New quiet-gated retry | 111.439 | 111.437 | 0.002 | Node review performance.now |

The 1 blocked new process interval(s) run from 2026-10-20T12:33:45.531365+00:00 to 2026-10-20T16:45:12.875878+00:00. Their summed UTC duration is 15087.345 seconds; the Python driver's time.monotonic records 248.001 seconds, a difference of 14839.343 seconds. Their retained Node review clocks record 15086.074 seconds, beside 15086.221 seconds between the journal's UTC boundaries. Node review elapsed time and Python child elapsed time remain separate. These clock differences do not uniquely establish sleep or the cause of the changed reading.

For 1/1 differing raw verification readings, the replay's retained reading equals the canonical history's initial verification reading. The raw retained budget(s) are 750000 nodes; the latest canonical verification budget(s) are 1500000 nodes. 1 differing rows have a recorded adaptive bestMoves call. Across all new attempts, 1 calls exceed the descriptive 120-second cutoff; 1 are adaptive verification calls, and 0 failed. The long-call interval runs from 2026-10-20T12:36:09.231Z to 2026-10-20T16:43:49.132Z; its Node timer totals 14859.764 seconds and its UTC intervals total 14859.901 seconds. The call budget(s) are 1500000 nodes. The app's strongerEvidence can keep the preceding reading. Returned adaptive payloads were saved for 0 differing rows, so the exact condition that rejected the adaptive evidence remains unknown. This timing cutoff decides nothing.

The registered comparison's cost summary uses accepted observations. Its accepted pool includes accepted retries and retained first outputs whose log windows overlap the reported load. The groups above keep these timings separate; quiet retry timings do not replace retained first-output timings.

The new attempts contain 0 failed engine calls, 0 failed human-policy calls and 0 other failed calls. Exception text and per-attempt rows remain private.

| Arm/profile and batch | Saved games | Final post-teaching incomplete/all | App coverage.partial | Accepted observed games | Raw incomplete/all | Games without accepted raw evidence | Full-batch raw incomplete |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| baseline/phone, frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| baseline/desktop, frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| baseline/routine, frozen | 60 | 0/2384 | 0 | 60 | 0/2384 | 0 | 0 |
| candidate/phone, frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| candidate/desktop, frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| candidate/routine, original-superseded | 60 | 8/2388 | 8 | 3 | 0/99 | 57 | unknown |
| candidate/routine, rebuilt-current-accepted | 60 | 0/2384 | 0 | 53 | 0/2079 | 7 | unknown |

Before the second amendment, the rebuilt routine had 49 accepted replays, containing 0/1907 incomplete/all raw looks. All its produced first outputs, including rejected outputs, now contain 0/2113 incomplete/all raw looks across 54 games. The original superseded routine still has 57 games without raw replay evidence; their raw completeness remains unknown.

The completeness guard uses the app's exact-score instrument and the registered evidence conditions. Its counts describe retained verification events and cannot establish completeness of a discarded adaptive result. Saved app coverage.partial is reported separately. Final post-teaching evidence is not substituted for raw verification evidence.

Second amendment SHA256 `17b5be4e594e5d3a7aa705c75f039b68d253d761d1bd5d2b6a44e093515d7742`; code manifest SHA256 `511240c42034cb5aca5cc12e40f6ee8e7af8031085be6ff87b74aa2f1c502121`; preserved diagnosis SHA256 `f105ba8a8c1cd5713299c26acae0a6267a2c7ee685ff891a7e311e6abee5d7d6`; frozen binding SHA256 `03a4895e83f4b4a9ea9cd2cd264e5a4c3cd223780a4b87b9397beb78a85d074b`; stopped manifest SHA256 `80627e461645b670f18b38cce57f78f5d956deb7d360b2167cb20f920796b931`; reporting script SHA256 `656081983ae957374f92deb2dd4e9687c02e64d9e6e9a1c0ff6d0068d3bbc6b5`; input snapshot SHA256 `b8f92f611a70298a2f3ad0a229d0b174ecd93f7576d7fa8bee0f189732bb010c`. No lab-branch commit identity is used.
