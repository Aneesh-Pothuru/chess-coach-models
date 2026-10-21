# Before the rule: how often each unit comes up

June 2026 Lichess games (a month outside the study's), rated standard 600+0, both players 1250-1649 on Lichess, ended normally or on time, 30 plies or more, file order: 600 games, 42025 positions, 13265 entering the scan (from ply 8, after a move that captured nothing, quiet), 5560 of them in at least one unit's situation and 5308 in at least one rule unit's. App `ffee8dbb166f77dcc75721b6cca28d37703f4515`. Maia-2 at the mover's band read each entering position in at least one unit's situation, 0.0584 s a call. Nothing was scored.

| Unit | In its situation | Split | Follow first | Break first | Close calls | Games with a split |
|---|---:|---:|---:|---:|---:|---:|
| `tension` | 1078 | 447 | 171 | 276 | 49.4% | 249 (41.5%) |
| `trades-ahead` | 47 | 24 | 6 | 18 | 66.7% | 20 (3.3%) |
| `trades-behind` | 139 | 48 | 30 | 18 | 54.2% | 41 (6.8%) |
| `bishop-for-knight` | 969 | 253 | 132 | 121 | 58.1% | 169 (28.2%) |
| `knight-for-bishop` | 155 | 112 | 89 | 23 | 44.6% | 87 (14.5%) |
| `bishop-colour` | 3712 | 149 | 77 | 72 | 64.4% | 107 (17.8%) |
| `trades-level` | 1205 | 569 | 203 | 366 | 53.8% | 291 (48.5%) |
| `hang` | 5308 | 24 | 14 | 10 | 66.7% | 23 (3.8%) |

A position splits when one of the two moves Maia-2 rates most likely follows the unit's rule and the other breaks it. A close call: the second move's probability is at least 0.5 of the first's. The control's situation is every entering position in at least one rule unit's situation.
