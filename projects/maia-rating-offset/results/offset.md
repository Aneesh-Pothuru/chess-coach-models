# Maia-2 rating offset: results

Written by fit.mjs. App commit 509dc8603c09e9d966871aad3954b8bd41eb9fd7; 648 games and 33522 counted moves from its archive (fitting half 324 games, 17055 moves; held-out half 324 games, 16467 moves). Bootstrap: 1000 draws over games, seed 7.

**Verdict.** The fitting half's best offset is 250, the app's own, so 250 stays. The held-out half's best is 250.

Beside it: the best offset over all the games is 250 (95% interval over draws 250 to 275); for the player's own moves alone 175 (150 to 200), for his opponents' 425 (350 to 450). By the mover's chess.com rating, in thirds: 513 to 934, 400 (325 to 425); 935 to 1075, 250 (200 to 275); 1076 to 1228, 250 (225 to 275).

| Offset | Mean log-likelihood, fitting half | Held-out half | All games | Maia-2's first choice, all games |
|---:|---:|---:|---:|---:|
| 0 | -1.4182 | -1.4164 | -1.4173 | 53.4% |
| 25 | -1.4128 | -1.4128 | -1.4128 | 53.5% |
| 50 | -1.4100 | -1.4099 | -1.4100 | 53.6% |
| 75 | -1.4084 | -1.4073 | -1.4079 | 53.7% |
| 100 | -1.4058 | -1.4051 | -1.4055 | 53.7% |
| 125 | -1.4036 | -1.4028 | -1.4032 | 53.7% |
| 150 | -1.4015 | -1.4006 | -1.4011 | 53.7% |
| 175 | -1.3995 | -1.3980 | -1.3988 | 53.8% |
| 200 | -1.3984 | -1.3972 | -1.3978 | 53.8% |
| 225 | -1.3976 | -1.3969 | -1.3973 | 53.9% |
| 250 (app) (fitted) | -1.3959 | -1.3959 | -1.3959 | 53.9% |
| 275 | -1.3959 | -1.3960 | -1.3960 | 53.9% |
| 300 | -1.3966 | -1.3969 | -1.3967 | 53.9% |
| 325 | -1.3965 | -1.3972 | -1.3968 | 53.9% |
| 350 | -1.3965 | -1.3979 | -1.3972 | 53.9% |
| 375 | -1.3979 | -1.3988 | -1.3983 | 53.8% |
| 400 | -1.3989 | -1.4009 | -1.3999 | 53.8% |
| 425 | -1.4005 | -1.4020 | -1.4013 | 53.7% |
| 450 | -1.4022 | -1.4046 | -1.4034 | 53.7% |
| 475 | -1.4050 | -1.4075 | -1.4062 | 53.6% |
| 500 | -1.4083 | -1.4119 | -1.4101 | 53.6% |
