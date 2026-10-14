# The merged instrument: plain mean, steep curve, tablebase outcomes graded

Not a round: the check that merging main's tablebase grading (#59) with
round 1's instrument costs nothing. Main graded a move the tablebase decided
by its exact outcome, even without exact engine scores, and left such moves
out of ACPL. Round 1 replaced the formula. The merged instrument is
`coach-accuracy/4-plain-mean-steep-tablebase`: round 1's formula over main's
graded set.

| evidence | split | MAE (v1 → v2) | within 5 | r |
|---|---|---|---|---|
| routine | test | 4.9 → 5.0 | 63% → 63% | 0.76 → 0.76 |
| routine | train | 3.6 → 3.6 | | |
| phone | test | 5.4 → 5.4 | 57% → 57% | 0.72 → 0.72 |

The paired difference from the baseline stays clear of zero: −2.5 [−4.7, −0.7]
on routine test.
