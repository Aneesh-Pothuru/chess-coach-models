# Maia-2 rating offset: results

Written by fit.mjs. App commit 784c7625198379a432943dae8bc76878d9930e09; 634 games and 32988 counted moves from its archive (fitting half 317 games, 16767 moves; held-out half 317 games, 16221 moves). Bootstrap: 1000 draws over games, seed 7.

**Verdict.** The fitting half's best offset is 250, the app's own, so 250 stays. The held-out half's best is 250.

Beside it: the best offset over all the games is 250 (95% interval over draws 250 to 325); for the player's own moves alone 175 (150 to 200), for his opponents' 425 (350 to 425). By the mover's chess.com rating, in thirds: 513 to 934, 400 (325 to 425); 935 to 1073, 250 (200 to 275); 1074 to 1228, 250 (250 to 275).

| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2's first choice, all games |
|---:|---:|---:|---:|---:|
| 0 | -1.4202 | -1.4176 | -1.4189 | 53.4% |
| 25 | -1.4147 | -1.4140 | -1.4144 | 53.5% |
| 50 | -1.4119 | -1.4111 | -1.4115 | 53.6% |
| 75 | -1.4103 | -1.4085 | -1.4094 | 53.6% |
| 100 | -1.4078 | -1.4064 | -1.4071 | 53.6% |
| 125 | -1.4055 | -1.4041 | -1.4048 | 53.7% |
| 150 | -1.4034 | -1.4019 | -1.4026 | 53.7% |
| 175 | -1.4014 | -1.3993 | -1.4004 | 53.8% |
| 200 | -1.4002 | -1.3986 | -1.3994 | 53.8% |
| 225 | -1.3995 | -1.3983 | -1.3989 | 53.8% |
| 250 (app) (fitted) | -1.3977 | -1.3972 | -1.3975 | 53.9% |
| 275 | -1.3978 | -1.3974 | -1.3976 | 53.9% |
| 300 | -1.3984 | -1.3984 | -1.3984 | 53.9% |
| 325 | -1.3983 | -1.3986 | -1.3984 | 53.9% |
| 350 | -1.3983 | -1.3993 | -1.3988 | 53.9% |
| 375 | -1.3997 | -1.4003 | -1.4000 | 53.8% |
| 400 | -1.4007 | -1.4024 | -1.4015 | 53.8% |
| 425 | -1.4024 | -1.4035 | -1.4029 | 53.7% |
| 450 | -1.4041 | -1.4061 | -1.4051 | 53.7% |
| 475 | -1.4069 | -1.4091 | -1.4080 | 53.6% |
| 500 | -1.4100 | -1.4135 | -1.4118 | 53.6% |
