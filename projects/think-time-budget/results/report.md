# The larger-budget result

Written by `report.mjs` from `analysis.json`; no new estimates. App
`f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. Data: 2026-09, 2026-08; frozen input
`aab77f5f1ebb53ad65c7`, cohort `e9ae68e054e97c736a9d568855ee899c69cdb9da0872355317726e04ee61ddef`.

| Check | Δerr (percentage points; 95% interval) | Verdict |
|---|---|---|
| More time at all | -0.289 (-0.563 to -0.009) | pass |
| Under-five-second placebo | -0.596 (-1.026 to -0.148) | inconclusive |

The overall check passes. The placebo is inconclusive, so every verdict is
cannot tell; leave unchanged. It is not the rule's untrustworthy outcome:
the interval crosses the boundary rather than lying wholly beyond it.

All intervals below are the registered 95% intervals from 4,000 shared player bootstrap draws.
Δthink is seconds, Δerr percentage points, and v serious errors saved per
extra minute. Each contrast uses none on that moment's same players.

| Moment | Δthink (s) | Δerr (pp) | v | v minus paired none | Verdict |
|---|---:|---:|---:|---:|---|
| Book exit | +3.172 (+2.677 to +3.670) | -0.641 (-1.490 to +0.227) | +0.121 (-0.044 to +0.291) | cannot tell | cannot tell; leave unchanged |
| Conversion | +5.299 (+4.723 to +5.859) | -0.189 (-1.354 to +0.973) | +0.021 (-0.110 to +0.156) | +0.041 (-0.102 to +0.184) | cannot tell; leave unchanged |
| Forcing | +4.967 (+4.646 to +5.297) | -0.547 (-0.974 to -0.123) | +0.066 (+0.015 to +0.119) | +0.110 (+0.035 to +0.186) | cannot tell; leave unchanged |
| Structure | +7.638 (+4.989 to +11.015) | -2.947 (-6.477 to +0.488) | +0.231 (-0.037 to +0.573) | cannot tell | cannot tell; leave unchanged |
| After the opponent's serious error | +6.089 (+5.538 to +6.659) | -0.502 (-1.600 to +0.568) | +0.049 (-0.055 to +0.160) | +0.089 (-0.022 to +0.204) | cannot tell; leave unchanged |
| In check | +3.432 (+2.744 to +4.241) | -1.186 (-2.273 to -0.131) | +0.207 (+0.024 to +0.416) | cannot tell | cannot tell; leave unchanged |
| After a capture | +3.535 (+3.240 to +3.852) | -0.121 (-0.606 to +0.364) | +0.020 (-0.061 to +0.103) | +0.063 (-0.039 to +0.162) | cannot tell; leave unchanged |
| Own piece hanging | +5.323 (+4.979 to +5.674) | -0.420 (-0.893 to +0.050) | +0.047 (-0.006 to +0.100) | +0.090 (+0.015 to +0.166) | cannot tell; leave unchanged |
| Opponent's piece hanging | +4.127 (+3.800 to +4.455) | -0.696 (-1.261 to -0.124) | +0.101 (+0.018 to +0.184) | +0.144 (+0.048 to +0.242) | cannot tell; leave unchanged |
| Defending | +5.928 (+5.080 to +6.840) | +0.597 (-0.350 to +1.513) | -0.060 (-0.155 to +0.036) | cannot tell | cannot tell; leave unchanged |
| Early | +3.545 (+3.235 to +3.876) | -0.258 (-0.745 to +0.217) | +0.044 (-0.036 to +0.128) | +0.086 (-0.006 to +0.178) | cannot tell; leave unchanged |
| High danger | +6.918 (+6.410 to +7.446) | -0.873 (-1.763 to -0.023) | +0.076 (+0.002 to +0.155) | +0.115 (+0.034 to +0.200) | cannot tell; leave unchanged |

Book exit, structure, in check and defending fail coverage, so their
contrasts are unavailable. All moment and paired-none denominators pass.
The unavailable contrasts are not zero estimates.

Forcing has Holm p 0.02000, and high danger 0.04399.
Both cut errors and have positive paired contrasts, but neither can pass the
placebo gate. Their paired-none point values are negative. The contrast is
not the same as the amount saved at the moment alone.

The all-move sensitivity estimates are -0.210 (-0.484 to +0.076) pp
with ten strata and -0.458 (-1.009 to +0.113) pp
with zero-increment slow games. Both intervals cross zero. These descriptions
do not revise the registered verdict.

No sampling, estimator or rule changed after effects were seen. Publication
added claim checks and reordered candidates to put the leading question
first. The original manifest still verifies the original documents in
`phase1/` and every frozen analysis dependency in place. No app change is made.
