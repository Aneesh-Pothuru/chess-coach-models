# Maia player offsets: phase-2 runtime

Written by run-phase2.mjs. Status: complete. Protocol manifest SHA-256 02c9bfe673f63c64ca90985b982b4f047cb628a12a1c9f6a07c227c198fc8c5a; frozen protocol SHA-256 03433885daa5fc45e1bde0ae6fd3bf4dc632e267bb73840ea1bc0d9c0ff3607f. App f4bd63f19b343f686fb97ea4cf70b211c0bddc0a; records aed714ada579782ce73630596e59c8b65e74cb30.

At most 2 heavy workers ran together, each with nice increment 10 from a coordinator at priority 0. Overall elapsed span: 33.74 hours; measured active coordinator time: 32.24 hours; gaps and unmeasured time: 1.50 hours.

| Stage | Status | Attempts | Measured active wall seconds |
|---|---|---:|---:|
| move-policies | complete | 2 | 23997.98 |
| reviews | complete | 2 | 87592.54 |
| events | complete | 1 | 1.30 |
| punish-policies | complete | 1 | 4450.73 |
| fit | complete | 1 | 13.23 |

move-policies: 33522 positions, 900016 policy calls; 47957.42 committed worker seconds, 4 first calls across restarts, 0 rows without durable timing.
punish-policies: 3818 positions, 19276 policy calls; 8897.41 committed worker seconds, 2 first calls across restarts, 0 rows without durable timing.

Reviews: 324 selected games completed, 2 reused and 322 newly completed. New work took 97452.73 worker seconds; 0 timing records were recovered from journals.

Supervisor wall time includes serial bookkeeping. Stage attempt wall times count concurrent workers once. Policy row timings sum worker computation and exclude discarded partial rows and append overhead. Overall span includes resume gaps; abruptly killed sessions have unknown duration and are shown separately. No game identifiers, positions, fitted values or outcome measures are read into this report. The JSON retains code fingerprints, aggregate timings and every stage attempt, including failures.
