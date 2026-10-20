# Fourth acquisition report

Written by `fourth-report.mjs`. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; records `aed714ada579782ce73630596e59c8b65e74cb30`; 60 frozen games, cases SHA256 `ba26913e6c35403b132b614029216ff6209f6231c83a0fb8381140fcc9250ed6`. Fourth amendment SHA256 `d393a2f6140ca18a3a40e45c64370202979917d5057efa23a909470de6d8af48`; acquisition code SHA256 `0a4654ff4e0bb5a96d635abd0eee3d1379c5ba724fee6193044820f5d8012ce5`.

Every prescribed game has an accepted replay and the completed acquisition manifest is verified.

There were 53 accepted games at the preserved checkpoint. There are now 60 accepted games and 0 without accepted replays. 60 first outputs exist and 0 have not been produced. The fourth acquisition has produced 7 observations: accepted: 7; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 0. 0 launches have no produced output in this snapshot. It accepted 6 first outputs and 1 retries. Earlier accepted outputs retain their exact bytes.

The fourth rule recognizes 1 preserved first failure from human-policy fallback and 1 preserved first failure from suspension. These remain rejected observations. The preceding stopped report retains its original classifications; the fourth rule supplies eligibility for the prescribed retry.

The fourth traces record 0 failed calls: 0 engine, 0 human-policy, and 0 other calls. Classification of new fourth observations records 0 human-policy failures and 0 suspension failures. Failure messages, row locations and per-attempt outcomes remain in the private report.

The preserved suspension diagnosis accounts for 1 changed position rows and 1 changed record rows downstream of the adaptive search spanning the recorded suspension. Its raw trace has 34/34 complete retained looks, 1 differing canonical verification reading and 0 failed calls. The logged Sleep event is 2026-10-20T12:36:06.000Z; Wake is 2026-10-20T16:43:49.000Z. The driver records 15087.344513 UTC seconds and 248.001385 Python monotonic seconds, a divergence of 14839.343128 seconds. The review records 15086.073955 Node performance seconds.

The fourth rule qualifies this preserved first failure for its prescribed retry: 1 documented sleep interval is spanned by the search feeding 1 differing row. It does not require proof of deadline termination. The third rule's deadline condition remains unproved, and that prior refusal and its diagnostic remain unchanged. Preserved diagnostic SHA256: `e9b918131af212c9a0859bbf1e7340b356627da15d994d38b3a067045c074d1d`.

| Arm and profile | Acquisition | Saved games | Final deep incomplete / saved | App coverage.partial | Observed games | Raw incomplete / looks | Missing raw games | Full-batch raw incomplete |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| baseline phone | frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| baseline desktop | frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| baseline routine | frozen | 60 | 0/2384 | 0 | 60 | 0/2384 | 0 | 0 |
| candidate phone | frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| candidate desktop | frozen | 60 | 0/1000 | 0 | 60 | 0/1000 | 0 | 0 |
| candidate routine | original-superseded | 60 | 8/2388 | 8 | 3 | 0/99 | 57 | unknown |
| candidate routine | rebuilt-current-accepted | 60 | 0/2384 | 0 | 60 | 0/2384 | 0 | 0 |

Final deep evidence is saved after teaching. Raw evidence is captured before teaching. The app's coverage.partial counts a separate saved condition. Missing original raw replays remain unknown. Rejected first outputs are retained diagnostics; only an exactly reproducing prescribed observation enters the accepted set.

The earlier timing groups below are copied from the immutable stopped report, including its outcomes as known at that stop. The fourth groups describe new observations. The registered comparison cost summary uses accepted observations, including retained loaded firsts and accepted retries. These separate groups do not substitute quiet timings for loaded timings.

| Timing group | Observations | Outcomes | Node review seconds | Observed look seconds | Median retained depth | Raw incomplete / looks | Interval UTC seconds | Interval elapsed seconds | Elapsed clock |
|---|---:|---|---:|---:|---:|---:|---:|---:|---|
| preserved: old-first-overlaps-reported-load | 29 | accepted: 28; matching-unaccepted: 0; infrastructure-failure: 1; blocked: 0 | 5609.950 | 2051.394 | 17.000 | 0/1162 | 5610.729 | 5610.687 | Python driver time.monotonic between log lines |
| preserved: old-first-outside-reported-load | 21 | accepted: 21; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 0 | 1588.619 | 652.311 | 17.000 | 0/780 | 1589.010 | 1589.028 | Python driver time.monotonic between log lines |
| preserved: new-quiet-first | 4 | accepted: 3; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 1 | 15544.956 | 15137.424 | 17.000 | 0/171 | 15545.112 | 15544.956 | Node review performance.now |
| preserved: new-quiet-retry | 1 | accepted: 1; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 0 | 111.437 | 41.565 | 17.000 | 0/35 | 111.439 | 111.437 | Node review performance.now |
| fourth-first | 6 | accepted: 6; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 0 | 680.805 | 282.866 | 17.000 | 0/271 | 684.884 | 684.881 | Python process time.monotonic; completed processes only |
| fourth-retry | 1 | accepted: 1; matching-unaccepted: 0; infrastructure-failure: 0; blocked: 0 | 107.818 | 45.309 | 17.000 | 0/34 | 108.409 | 108.409 | Python process time.monotonic; completed processes only |

| Fourth group | Finished processes | Driver UTC seconds | Driver Python seconds | UTC minus Python seconds | Review UTC seconds | Review Node seconds |
|---|---:|---:|---:|---:|---:|---:|
| fourth-first | 6 | 684.884 | 684.881 | 0.003 | 680.819 | 680.805 |
| fourth-retry | 1 | 108.409 | 108.409 | 0.000 | 107.820 | 107.818 |

The Python driver and Node review clocks are reported separately. The preserved blocked replay's driver interval remains 15087.345 UTC seconds and 248.001 Python seconds, a divergence of 14839.343 seconds. Its review records 15086.074 Node seconds against 15086.221 review UTC seconds.

| Driver state | Started UTC | Ended UTC | Finished UTC seconds | Finished Python seconds | Exit |
|---|---|---|---:|---:|---:|
| finished-successfully | 2026-10-20T17:24:30.709160+00:00 | 2026-10-20T22:28:42.786584+00:00 | 18252.077 | 18252.013 | 0 |

| Stage | Started processes | Finished processes | UTC seconds summed | Python seconds summed | Nonzero exits |
|---|---:|---:|---:|---:|---:|
| acquisition-helpers | 19 | 19 | 20.894 | 20.894 | 0 |
| replay-processes | 7 | 7 | 793.293 | 793.289 | 0 |
| reference-workers | 2 | 2 | 20042.012 | 20041.984 | 0 |
| analysis | 1 | 1 | 1.432 | 1.432 | 0 |
| awake-assertions | 8 | 8 | 26414.076 | 26413.961 | 8 |

Stage sums are process durations; parallel reference workers overlap. Awake assertions are lightweight guard processes and overlap the work they guard.

Quiet sampling has 1437 samples and 7 completed receipts. Completed waits total 7339.452 Python seconds and 7339.499 UTC seconds. 0 waits remain recorded as pending, with 0.000 Python seconds and 0.000 UTC seconds observed as lower bounds. Waits that ended before passing total 0.000 Python seconds. There were 0 resets at the final power gate.

Power sampling has 14 readings, 14 ready readings and 7 receipts. Every saved receipt checked readiness before quiet (7) and immediately before launch (7). 8 awake-assertion checks were recorded. 7 replay power logs were captured; 0 captures failed. Their typed events contain 0 Sleep, 0 Wake and 0 DarkWake events. Raw system output stays private. A pre-launch gate does not establish that later load stayed low or that no later suspension occurred.

The unchanged registered analysis completed. Its comparison SHA256 is `889b6b50e65815200f9a378adf5b8063e84a1ccda4dc17f73f5e0d65b3f4ac58`. The copied decision is **do not keep: inconclusive**. No estimate was recomputed by this reporter.

Preserved second report SHA256 `626faf9d5b83896b63492bf734bf6ba08913e6a65ea935ef4ea826f9f1ffe5c6`; second stopped manifest SHA256 `d14ff24ed7eee03eb50a3268e1f1b90cfcbad51235bc0b4ad3892fb14c7371db`; completed manifest SHA256 `436283939bd7a466dcb05fe7ca084c3abeecc7b66ebc0c8a57cdeac7762f08c6`; report source SHA256 `a972500c08a0a6024e3f6f74e92befa180f8208c346a596f1c07509ba27b1d24`; input snapshot SHA256 `0efd61b8a673732264491c413ced3936592d9ce55fd46a5006705cd8d9d0cead`.
