# Clock budget: phase-one counts

Written by `analyze.py` on app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. Data: 2026-09, 2026-08; stream prefixes and cohort selection are in `cohort-counts.md`.

No budget effect, error rate, per-moment mean think, bootstrap interval or trigger verdict was computed.

Built 81,847 games; 2,720,022 timed moves. Checked 160 real Black builds and 5,288,580 clock readings.

| Set | Budget | Moves | Players | Overall mean think (s) |
|---|---|---:|---:|---:|
| eligible | fast | 1,324,733 | 5,113 | 10.545 |
| eligible | slow | 899,712 | 5,113 | 18.567 |
| primary | fast | 447,879 | 2,019 | 10.793 |
| primary | slow | 353,496 | 2,019 | 17.121 |

| Primary moment | Fast moves | Slow moves | Players both budgets | Supported players | Fast coverage: moment / none |
|---|---:|---:|---:|---:|---|
| book-end | 17,442 | 13,148 | 2,018 | 1,815 | 62.6% / 85.3% |
| conversion | 101,281 | 76,373 | 1,828 | 1,805 | 85.1% / 93.6% |
| forcing | 196,223 | 156,099 | 2,018 | 2,010 | 97.0% / 94.0% |
| structure | 3,226 | 2,510 | 660 | 371 | 38.2% / 54.5% |
| none | 129,707 | 105,366 | 2,016 | 2,012 | 94.1% |
| in-check | 27,218 | 21,668 | 1,736 | 1,562 | 65.9% / 86.1% |
| after-capture | 115,677 | 88,887 | 2,019 | 2,012 | 95.4% / 94.1% |
| own-hanging | 166,830 | 132,181 | 2,019 | 2,012 | 97.0% / 94.1% |
| opp-hanging | 113,647 | 86,215 | 2,018 | 2,009 | 94.0% / 94.0% |
| after-opp-error | 60,022 | 44,869 | 2,007 | 1,982 | 85.5% / 93.3% |
| defending | 67,353 | 57,195 | 1,565 | 1,502 | 79.6% / 92.1% |
| early | 87,755 | 66,203 | 2,019 | 2,012 | 93.2% / 94.1% |
| high-danger | 109,366 | 86,926 | 2,014 | 2,003 | 94.0% / 93.9% |
| all | 447,879 | 353,496 | 2,019 | 2,019 | 99.8% |
| placebo | 174,852 | 99,747 | 2,000 | 1,998 | 94.0% |

Bridge work: 21077.4 worker-seconds; ideal two-process time 175.6 minutes. Load and prepare: 17.5 seconds. Fixed danger fit and scoring: 157.6 seconds at one thread.

Trigger and candidate support is paired to none. All-move, placebo and standalone none support is unpaired.
High-danger membership comes from the fixed cross-fitted nuisance model. Only its counts and run time are reported. Scores, cell boundaries and move rows stay private.
