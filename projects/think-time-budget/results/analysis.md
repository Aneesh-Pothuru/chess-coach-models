# Clock budget: effect estimates

Written by `analyze.py` on app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; data 2026-09, 2026-08; frozen input `aab77f5f1ebb53ad65c7`.

Differences are slow minus fast. Error differences use percentage points; thinks use seconds; value uses serious errors saved per extra minute. Intervals are the fixed player bootstrap.

| Check | Δ errors (pp) | Matched players | Coverage |
|---|---|---:|---:|
| all | -0.289 (-0.563 to -0.009) | 2,019 | 99.8% |
| placebo | -0.596 (-1.026 to -0.148) | 1,998 | 94.0% |

Overall check passed: True. Placebo: inconclusive. Both gates passed: False.

| Moment | Δ errors (pp) | Δ think (s) | Value / minute | Value minus paired none | Holm p | Verdict |
|---|---|---|---|---|---:|---|
| book-end | -0.641 (-1.490 to +0.227) | +3.172 (+2.677 to +3.670) | +0.121 (-0.044 to +0.291) | cannot tell | 1.00000 | cannot tell; leave unchanged |
| conversion | -0.189 (-1.354 to +0.973) | +5.299 (+4.723 to +5.859) | +0.021 (-0.110 to +0.156) | +0.041 (-0.102 to +0.184) | 1.00000 | cannot tell; leave unchanged |
| forcing | -0.547 (-0.974 to -0.123) | +4.967 (+4.646 to +5.297) | +0.066 (+0.015 to +0.119) | +0.110 (+0.035 to +0.186) | 0.02000 | cannot tell; leave unchanged |
| structure | -2.947 (-6.477 to +0.488) | +7.638 (+4.989 to +11.015) | +0.231 (-0.037 to +0.573) | cannot tell | 1.00000 | cannot tell; leave unchanged |
| in-check | -1.186 (-2.273 to -0.131) | +3.432 (+2.744 to +4.241) | +0.207 (+0.024 to +0.416) | cannot tell | 1.00000 | cannot tell; leave unchanged |
| after-capture | -0.121 (-0.606 to +0.364) | +3.535 (+3.240 to +3.852) | +0.020 (-0.061 to +0.103) | +0.063 (-0.039 to +0.162) | 0.68083 | cannot tell; leave unchanged |
| own-hanging | -0.420 (-0.893 to +0.050) | +5.323 (+4.979 to +5.674) | +0.047 (-0.006 to +0.100) | +0.090 (+0.015 to +0.166) | 0.13497 | cannot tell; leave unchanged |
| opp-hanging | -0.696 (-1.261 to -0.124) | +4.127 (+3.800 to +4.455) | +0.101 (+0.018 to +0.184) | +0.144 (+0.048 to +0.242) | 0.05249 | cannot tell; leave unchanged |
| after-opp-error | -0.502 (-1.600 to +0.568) | +6.089 (+5.538 to +6.659) | +0.049 (-0.055 to +0.160) | +0.089 (-0.022 to +0.204) | 0.45589 | cannot tell; leave unchanged |
| defending | +0.597 (-0.350 to +1.513) | +5.928 (+5.080 to +6.840) | -0.060 (-0.155 to +0.036) | cannot tell | 1.00000 | cannot tell; leave unchanged |
| early | -0.258 (-0.745 to +0.217) | +3.545 (+3.235 to +3.876) | +0.044 (-0.036 to +0.128) | +0.086 (-0.006 to +0.178) | 0.37741 | cannot tell; leave unchanged |
| high-danger | -0.873 (-1.763 to -0.023) | +6.918 (+6.410 to +7.446) | +0.076 (+0.002 to +0.155) | +0.115 (+0.034 to +0.200) | 0.04399 | cannot tell; leave unchanged |

| Moment | Paired players before matching | Matched players | Fast coverage: moment / none | Paired none Δ errors (pp) | Paired none Δ think (s) | Paired none value |
|---|---:|---:|---|---|---|---|
| book-end | 2,015 | 1,815 | 62.6% / 85.3% | +0.348 (-0.227 to +0.929) | +6.103 (+5.675 to +6.530) | -0.034 (-0.091 to +0.023) |
| conversion | 1,825 | 1,805 | 85.1% / 93.6% | +0.202 (-0.383 to +0.781) | +6.151 (+5.723 to +6.596) | -0.020 (-0.076 to +0.037) |
| forcing | 2,015 | 2,010 | 97.0% / 94.0% | +0.440 (-0.129 to +1.006) | +5.999 (+5.608 to +6.407) | -0.044 (-0.100 to +0.013) |
| structure | 660 | 371 | 38.2% / 54.5% | +0.793 (-0.212 to +1.785) | +6.496 (+5.726 to +7.340) | -0.073 (-0.166 to +0.020) |
| in-check | 1,733 | 1,562 | 65.9% / 86.1% | +0.413 (-0.213 to +1.027) | +6.208 (+5.779 to +6.646) | -0.040 (-0.099 to +0.021) |
| after-capture | 2,016 | 2,012 | 95.4% / 94.1% | +0.422 (-0.148 to +0.988) | +6.003 (+5.613 to +6.409) | -0.042 (-0.098 to +0.015) |
| own-hanging | 2,016 | 2,012 | 97.0% / 94.1% | +0.422 (-0.148 to +0.988) | +6.003 (+5.613 to +6.409) | -0.042 (-0.098 to +0.015) |
| opp-hanging | 2,015 | 2,009 | 94.0% / 94.0% | +0.433 (-0.129 to +1.001) | +6.023 (+5.636 to +6.429) | -0.043 (-0.099 to +0.013) |
| after-opp-error | 2,004 | 1,982 | 85.5% / 93.3% | +0.397 (-0.167 to +0.958) | +6.016 (+5.621 to +6.421) | -0.040 (-0.096 to +0.017) |
| defending | 1,563 | 1,502 | 79.6% / 92.1% | +0.365 (-0.254 to +1.005) | +5.766 (+5.346 to +6.184) | -0.038 (-0.104 to +0.027) |
| early | 2,016 | 2,012 | 93.2% / 94.1% | +0.422 (-0.148 to +0.988) | +6.003 (+5.613 to +6.409) | -0.042 (-0.098 to +0.015) |
| high-danger | 2,011 | 2,003 | 94.0% / 93.9% | +0.397 (-0.168 to +0.967) | +5.999 (+5.607 to +6.409) | -0.040 (-0.097 to +0.017) |

Descriptions only, on each moment’s own supported players:

| Moment | Raw fast error rate | Raw slow error rate | Δ errors (pp) | Δ think (s) | Value / minute |
|---|---:|---:|---|---|---|
| book-end | 4.71% | 4.21% | -0.634 (-1.500 to +0.244) | +3.148 (+2.652 to +3.646) | +0.121 (-0.048 to +0.294) |
| conversion | 13.46% | 12.64% | -0.217 (-1.374 to +0.941) | +5.293 (+4.718 to +5.850) | +0.025 (-0.107 to +0.158) |
| forcing | 14.96% | 13.97% | -0.512 (-0.942 to -0.085) | +4.948 (+4.630 to +5.277) | +0.062 (+0.010 to +0.116) |
| structure | 10.20% | 8.76% | -2.947 (-6.477 to +0.488) | +7.638 (+4.989 to +11.015) | +0.231 (-0.037 to +0.573) |
| none | 12.66% | 12.52% | +0.422 (-0.148 to +0.988) | +6.003 (+5.613 to +6.409) | -0.042 (-0.098 to +0.015) |
| in-check | 8.77% | 8.08% | -1.182 (-2.266 to -0.131) | +3.422 (+2.737 to +4.229) | +0.207 (+0.024 to +0.417) |
| after-capture | 11.70% | 11.00% | -0.100 (-0.584 to +0.381) | +3.526 (+3.229 to +3.843) | +0.017 (-0.065 to +0.099) |
| own-hanging | 15.75% | 14.63% | -0.407 (-0.878 to +0.063) | +5.308 (+4.963 to +5.659) | +0.046 (-0.007 to +0.099) |
| opp-hanging | 13.57% | 12.57% | -0.681 (-1.240 to -0.116) | +4.120 (+3.792 to +4.445) | +0.099 (+0.017 to +0.182) |
| after-opp-error | 33.42% | 32.39% | -0.433 (-1.509 to +0.635) | +6.100 (+5.560 to +6.672) | +0.043 (-0.061 to +0.151) |
| defending | 4.21% | 3.93% | +0.529 (-0.424 to +1.459) | +5.926 (+5.077 to +6.838) | -0.054 (-0.150 to +0.044) |
| early | 8.16% | 7.61% | -0.276 (-0.772 to +0.192) | +3.533 (+3.218 to +3.861) | +0.047 (-0.033 to +0.131) |
| high-danger | 31.81% | 30.40% | -0.851 (-1.742 to -0.006) | +6.919 (+6.414 to +7.436) | +0.074 (+0.000 to +0.152) |
| all | 13.52% | 12.85% | -0.289 (-0.563 to -0.009) | +5.236 (+4.972 to +5.508) | +0.033 (+0.001 to +0.065) |
| placebo | 8.75% | 7.86% | -0.596 (-1.026 to -0.148) | +0.107 (+0.085 to +0.127) | cannot tell |

Rating trend: Δ errors in percentage points, described without a rule.

| Mean rating | none | book-end | conversion | forcing | structure |
|---|---|---|---|---|---|
| 900-1099 | -0.456 (-1.901 to +0.915) | +1.177 (-0.864 to +3.281) | -0.240 (-2.467 to +1.995) | +0.270 (-0.716 to +1.279) | +3.142 (-6.086 to +12.135) |
| 1100-1299 | +0.591 (-0.456 to +1.598) | -1.358 (-3.060 to +0.292) | -0.316 (-2.277 to +1.605) | -0.396 (-1.154 to +0.394) | -3.375 (-10.441 to +3.565) |
| 1300-1499 | +0.290 (-0.505 to +1.080) | -0.234 (-1.664 to +1.109) | -0.819 (-2.468 to +0.923) | -0.472 (-1.187 to +0.227) | -2.559 (-7.738 to +2.552) |
| 1500-1699 | +0.536 (-0.200 to +1.286) | -0.278 (-1.419 to +0.803) | -0.795 (-2.396 to +0.855) | -0.012 (-0.603 to +0.578) | +0.973 (-3.228 to +5.154) |
| 1700-1899 | -0.071 (-0.700 to +0.602) | -0.220 (-1.177 to +0.708) | -0.195 (-1.855 to +1.450) | -0.015 (-0.617 to +0.624) | -2.869 (-6.209 to +0.392) |
| 1900-2099 | -0.453 (-1.131 to +0.243) | -0.751 (-1.651 to +0.097) | -2.371 (-4.435 to -0.375) | -0.103 (-0.762 to +0.552) | -0.470 (-5.102 to +3.927) |

Sensitivity descriptions: Δ errors in percentage points; they do not change the verdict.

| Moment | Ten strata | Zero-increment slow |
|---|---|---|
| none | +0.345 (-0.269 to +0.925) | +0.114 (-1.005 to +1.236) |
| book-end | -0.718 (-1.737 to +0.331) | -0.802 (-2.669 to +1.069) |
| conversion | -0.465 (-1.654 to +0.732) | -0.614 (-2.554 to +1.348) |
| forcing | -0.406 (-0.877 to +0.052) | -0.629 (-1.519 to +0.316) |
| structure | -0.077 (-4.246 to +4.003) | -5.412 (-11.511 to +0.444) |
| in-check | -1.787 (-2.984 to -0.600) | -0.631 (-2.682 to +1.344) |
| after-capture | -0.152 (-0.691 to +0.384) | -0.206 (-1.269 to +0.871) |
| own-hanging | -0.336 (-0.873 to +0.191) | -0.987 (-1.929 to -0.068) |
| opp-hanging | -0.684 (-1.277 to -0.078) | -0.536 (-1.601 to +0.528) |
| after-opp-error | -1.166 (-2.421 to +0.071) | -1.686 (-3.647 to +0.283) |
| defending | +0.516 (-0.425 to +1.494) | +1.597 (-0.211 to +3.461) |
| early | -0.134 (-0.649 to +0.395) | +0.058 (-0.917 to +1.011) |
| high-danger | -1.213 (-2.170 to -0.275) | -2.979 (-4.631 to -1.407) |

The JSON report also contains full trend and sensitivity thinks, values, support and model diagnostics. The ratio is an observational budget association, not a causal return to assigning extra time to a move.
