# Maia-2 rating offset: results

Written by fit.mjs. App commit 3a377486e8ae214f86f1e948f69231248f79f8a0; 656 games and 34025 counted moves from its archive (fitting half 328 games, 17242 moves; held-out half 328 games, 16783 moves). Bootstrap: 1000 draws over games, seed 7.

**Verdict.** The fitting half's best offset is 250, the app's own, so 250 stays. The held-out half's best is 250.

Beside it: the best offset over all the games is 250 (95% interval over draws 250 to 275); for the player's own moves alone 175 (150 to 200), for his opponents' 425 (350 to 425). By the mover's chess.com rating, in thirds: 513 to 936, 400 (325 to 425); 937 to 1077, 250 (200 to 250); 1078 to 1228, 275 (225 to 275).

| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2's first choice, all games |
|---:|---:|---:|---:|---:|
| 0 | -1.4165 | -1.4120 | -1.4143 | 53.5% |
| 25 | -1.4110 | -1.4085 | -1.4098 | 53.6% |
| 50 | -1.4083 | -1.4057 | -1.4070 | 53.7% |
| 75 | -1.4067 | -1.4030 | -1.4049 | 53.7% |
| 100 | -1.4040 | -1.4008 | -1.4025 | 53.7% |
| 125 | -1.4018 | -1.3985 | -1.4002 | 53.8% |
| 150 | -1.3997 | -1.3964 | -1.3981 | 53.8% |
| 175 | -1.3978 | -1.3938 | -1.3958 | 53.9% |
| 200 | -1.3966 | -1.3931 | -1.3948 | 53.9% |
| 225 | -1.3958 | -1.3928 | -1.3943 | 53.9% |
| 250 (app) (fitted) | -1.3941 | -1.3917 | -1.3929 | 54.0% |
| 275 | -1.3942 | -1.3919 | -1.3930 | 54.0% |
| 300 | -1.3948 | -1.3928 | -1.3938 | 54.0% |
| 325 | -1.3947 | -1.3931 | -1.3939 | 54.0% |
| 350 | -1.3947 | -1.3937 | -1.3942 | 54.0% |
| 375 | -1.3961 | -1.3946 | -1.3954 | 53.9% |
| 400 | -1.3971 | -1.3968 | -1.3970 | 53.9% |
| 425 | -1.3987 | -1.3979 | -1.3983 | 53.8% |
| 450 | -1.4004 | -1.4004 | -1.4004 | 53.8% |
| 475 | -1.4032 | -1.4033 | -1.4032 | 53.7% |
| 500 | -1.4065 | -1.4078 | -1.4072 | 53.7% |
