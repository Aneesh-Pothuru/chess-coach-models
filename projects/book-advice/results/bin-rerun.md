# 6b after correcting the post-move bins

The August recheck still holds after the bin correction. It is the evidence used by chess PR 124. The original September rule still does not hold.

The old aggregates are from lab commit `6daa2212d870ce189fd8b37e7ed07d8de4918921`. Both reruns measured app `fa07ea1ed8f4a17ec0c3df26cf15d54fea36d3b0`. September includes the archive; August does not.

The original rules are unchanged. Every stored count, estimate, interval and verdict is identical, including every post-move estimate. The source commit and all rule constants are identical too. Only runtime changed. Equality is at the precision written by the study; this comparison does not count individual positions that changed bins.

| Month | Strata | Quantity | Old | Corrected | Rule |
| --- | --- | --- | ---: | ---: | --- |
| 2026-09 | Before the move | Matched plain trades | 3007 | 3007 | at least 300 |
| 2026-09 | Before the move | Dropped plain trades | 1 | 1 | reported |
| 2026-09 | Before the move | Difference, points | -1.70 | -1.70 | at or below −3.00 |
| 2026-09 | Before the move | 95% interval, points | -3.43 to 0.03 | -3.43 to 0.03 | upper end below zero |
| 2026-09 | Before the move | Holds | false | false | all three tests |
| 2026-09 | After the move | Matched plain trades | 3001 | 3001 | at least 300 |
| 2026-09 | After the move | Dropped plain trades | 7 | 7 | reported |
| 2026-09 | After the move | Difference, points | -3.43 | -3.43 | at or below −3.00 |
| 2026-09 | After the move | 95% interval, points | -5.22 to -1.69 | -5.22 to -1.69 | upper end below zero |
| 2026-09 | After the move | Holds | true | true | all three tests |
| 2026-08 | Before the move | Matched plain trades | 2997 | 2997 | at least 300 |
| 2026-08 | Before the move | Dropped plain trades | 0 | 0 | reported |
| 2026-08 | Before the move | Difference, points | -2.31 | -2.31 | at or below −3.00 |
| 2026-08 | Before the move | 95% interval, points | -4.10 to -0.59 | -4.10 to -0.59 | upper end below zero |
| 2026-08 | Before the move | Holds | false | false | all three tests |
| 2026-08 | After the move | Matched plain trades | 2991 | 2991 | at least 300 |
| 2026-08 | After the move | Dropped plain trades | 6 | 6 | reported |
| 2026-08 | After the move | Difference, points | -3.93 | -3.93 | at or below −3.00 |
| 2026-08 | After the move | 95% interval, points | -5.62 to -2.16 | -5.62 to -2.16 | upper end below zero |
| 2026-08 | After the move | Holds | true | true | all three tests |

September’s before-move estimate decides the original 6b rule. August’s after-move estimate decides the recheck. The other two estimates are reported without a decision rule for that month.

The JSON beside this file retains both estimates for every band and the archive, and all rule constants.
