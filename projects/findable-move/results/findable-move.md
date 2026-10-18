# Findable move: results

Written by `projects/findable-move/analyze.mjs` on app commit `f4bd63f`, from 543 of 543 positions (16 rollouts of 12 plies per move, ends scored at the `check` budget).

**Verdict: unclear.**

| | Train | Held out |
|---|---|---|
| Positions | 352 | 191 |
| Null: B's halves, mean difference | -0.32 (-1.62 to 1.02) | 0.63 (-1 to 2.31) |
| Decoy: his move against B, D_P | -15.8 (-18.2 to -13.37) | -18.71 (-21.82 to -15.67) |
| D_F = V(F) − V(B), win% | -0.93 (-2.18 to 0.28) | -1.88 (-3.37 to -0.46) |

Means in win% with 95% intervals from 2,000 bootstrap draws over games. The rule is in the README.

## Described, not tested (both sets)

- The engine's root gap B − F: 1.01 (0.94 to 1.08) win%; in human hands, −D_F: 1.27 (0.34 to 2.21).
- Share of positions where F scores above B: 0.4401.
- F over the move he played, at turning points: 14.64 (12.81 to 16.44) win%.
- Maia-2 at his band plays B 0.0911 and F 0.3318 of the time (means).
- D_F by the best move's kind: quiet -0.85 (-1.85 to 0.16); forcing -3.24 (-6.17 to -0.44).
- D_F by position: turning -1.55 (-2.86 to -0.29); plan -0.68 (-2.05 to 0.66).
- D_F by phase: opening -0.1 (-1.93 to 1.63); endgame -1.78 (-3.92 to 0.11); middlegame -1.57 (-2.93 to -0.21).
