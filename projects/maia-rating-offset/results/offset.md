# Maia-2 rating offset: results

Written by fit.mjs. App commit 4ba253b9e654248622c0069c62fbe72f26f316ee; 705 games and 36702 counted moves from its archive (fitting half 353 games, 18630 moves; held-out half 352 games, 18072 moves). Bootstrap: 1000 draws over games, seed 7.

**Verdict.** The fitting half's best offset is 250, the app's own, so 250 stays. The held-out half's best is 250.

Beside it: the best offset over all the games is 250 (95% interval over draws 250 to 275); for the player's own moves alone 175 (150 to 175), for his opponents' 425 (350 to 425). By the mover's chess.com rating, in thirds: 513 to 943, 400 (325 to 425); 944 to 1084, 250 (250 to 250); 1085 to 1228, 275 (225 to 275).

| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2's first choice, all games |
|---:|---:|---:|---:|---:|
| 0 | -1.4137 | -1.4108 | -1.4123 | 53.5% |
| 25 | -1.4075 | -1.4065 | -1.4070 | 53.7% |
| 50 | -1.4045 | -1.4030 | -1.4038 | 53.8% |
| 75 | -1.4029 | -1.4006 | -1.4018 | 53.8% |
| 100 | -1.4003 | -1.3983 | -1.3994 | 53.8% |
| 125 | -1.3980 | -1.3960 | -1.3970 | 53.9% |
| 150 | -1.3960 | -1.3938 | -1.3949 | 53.9% |
| 175 | -1.3942 | -1.3914 | -1.3928 | 54.0% |
| 200 | -1.3931 | -1.3906 | -1.3919 | 54.0% |
| 225 | -1.3922 | -1.3903 | -1.3913 | 54.0% |
| 250 (app) (fitted) | -1.3907 | -1.3892 | -1.3900 | 54.0% |
| 275 | -1.3907 | -1.3893 | -1.3901 | 54.0% |
| 300 | -1.3915 | -1.3904 | -1.3909 | 54.0% |
| 325 | -1.3915 | -1.3907 | -1.3911 | 54.1% |
| 350 | -1.3916 | -1.3913 | -1.3915 | 54.1% |
| 375 | -1.3929 | -1.3922 | -1.3925 | 54.0% |
| 400 | -1.3941 | -1.3944 | -1.3942 | 53.9% |
| 425 | -1.3957 | -1.3957 | -1.3957 | 53.9% |
| 450 | -1.3974 | -1.3981 | -1.3978 | 53.9% |
| 475 | -1.4000 | -1.4007 | -1.4004 | 53.8% |
| 500 | -1.4036 | -1.4054 | -1.4045 | 53.8% |
