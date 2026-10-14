# Maia-2 rating offset: results

Written by fit.mjs. App commit d6e155bc8ece019c0a9bfe6ed2ac31b34ab2c3ed; 640 games and 33215 counted moves from its archive (fitting half 320 games, 16860 moves; held-out half 320 games, 16355 moves). Bootstrap: 1000 draws over games, seed 7.

**Verdict.** The fitting half's best offset is 250, the app's own, so 250 stays. The held-out half's best is 250.

Beside it: the best offset over all the games is 250 (95% interval over draws 250 to 275); for the player's own moves alone 175 (150 to 200), for his opponents' 425 (350 to 425). By the mover's chess.com rating, in thirds: 513 to 934, 400 (325 to 425); 935 to 1075, 250 (200 to 275); 1076 to 1228, 250 (225 to 275).

| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2's first choice, all games |
|---:|---:|---:|---:|---:|
| 0 | -1.4201 | -1.4173 | -1.4187 | 53.4% |
| 25 | -1.4146 | -1.4137 | -1.4142 | 53.5% |
| 50 | -1.4119 | -1.4108 | -1.4113 | 53.6% |
| 75 | -1.4102 | -1.4082 | -1.4092 | 53.6% |
| 100 | -1.4077 | -1.4061 | -1.4069 | 53.7% |
| 125 | -1.4054 | -1.4037 | -1.4046 | 53.7% |
| 150 | -1.4033 | -1.4015 | -1.4024 | 53.7% |
| 175 | -1.4013 | -1.3990 | -1.4001 | 53.8% |
| 200 | -1.4002 | -1.3982 | -1.3992 | 53.8% |
| 225 | -1.3994 | -1.3979 | -1.3986 | 53.8% |
| 250 (app) (fitted) | -1.3976 | -1.3968 | -1.3972 | 53.9% |
| 275 | -1.3977 | -1.3970 | -1.3974 | 53.9% |
| 300 | -1.3983 | -1.3980 | -1.3981 | 53.9% |
| 325 | -1.3982 | -1.3982 | -1.3982 | 53.9% |
| 350 | -1.3982 | -1.3989 | -1.3985 | 53.9% |
| 375 | -1.3995 | -1.3999 | -1.3997 | 53.8% |
| 400 | -1.4006 | -1.4020 | -1.4013 | 53.8% |
| 425 | -1.4022 | -1.4031 | -1.4026 | 53.7% |
| 450 | -1.4039 | -1.4057 | -1.4048 | 53.7% |
| 475 | -1.4067 | -1.4086 | -1.4076 | 53.6% |
| 500 | -1.4099 | -1.4131 | -1.4115 | 53.6% |
