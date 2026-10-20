# Is a central break right while the other king is still in the centre?

Verdict: **no signal**. Strong players: **silent**. The rule is in the README.

Rows: structure-breaks at app commit `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`; this report at lab commit `8b71473fc1745d98061f0258dbcf8b11735b5200`.

## The rule

| | First half | Second half | Strong players |
|---|---|---|---|
| Positions, king in the centre | 116 (47 games) | 83 (39 games) | 129 |
| Positions, king away | 225 (67 games) | 191 (59 games) | 428 |
| Referee: A − R (S − R) | 37.2 (30.6 to 43.3) | 38.7 (31.2 to 45.7) | 54.8 (50.4 to 59.2) |
| Null: R2 − R, centre minus away | -3.5 (-13.7 to 6.4) | -0.8 (-11.4 to 10.7) | 5.0 (-3.7 to 13.8) |
| The lift: C − R, centre minus away | 13.0 (0.0 to 25.2) | 23.0 (4.7 to 42.4) | 5.8 (-3.5 to 15.5) |
| The strike's gain: C − A (S), centre | -28.4 (-38.7 to -18.1) | -26.5 (-43.5 to -9.2) | -58.1 (-67.9 to -48.3) |

Points of soundness (percent), with 95% intervals from 2,000 bootstrap draws over games. Controls: referee passed, null passed.

## Described, not tested

| | First half, centre | First half, away | Second half, centre | Second half, away | Strong, centre | Strong, away |
|---|---|---|---|---|---|---|
| C | 31.0 (21.2 to 41.3) | 13.8 (9.2 to 19.2) | 30.1 (19.8 to 41.8) | 15.2 (8.8 to 23.0) | 19.4 (12.9 to 26.4) | 18.2 (14.8 to 21.9) |
| A | 59.5 (49.5 to 69.2) | 52.9 (45.7 to 60.2) | 56.6 (45.9 to 68.9) | 59.7 (51.2 to 67.8) | 77.5 (70.3 to 84.7) | 68.7 (64.2 to 73.0) |
| N | 69.0 (59.4 to 78.5) | 66.2 (59.8 to 73.0) | 72.3 (62.6 to 82.1) | 72.8 (65.0 to 79.9) | n/a | n/a |
| U | 69.0 (59.5 to 78.6) | 67.6 (60.6 to 74.2) | 71.1 (61.2 to 80.7) | 74.3 (66.7 to 81.3) | n/a | n/a |
| R | 20.7 (13.1 to 29.5) | 16.4 (11.3 to 22.0) | 14.5 (6.7 to 23.2) | 22.5 (15.1 to 30.1) | 12.4 (7.1 to 17.9) | 17.1 (13.6 to 20.5) |
| R2 | 19.8 (12.4 to 29.3) | 19.1 (13.8 to 25.2) | 12.0 (5.2 to 20.0) | 20.9 (13.8 to 27.9) | 16.3 (9.9 to 22.9) | 15.9 (12.4 to 19.6) |
| playedCentral | 8.6 (3.6 to 14.3) | 7.1 (4.0 to 11.1) | 7.2 (2.6 to 12.0) | 4.7 (2.0 to 7.5) | 8.5 (4.2 to 13.7) | 11.0 (8.2 to 14.2) |

- The stricter reading (king on its starting square): lift 11.0 (-5.4 to 28.2) and 19.3 (0.5 to 38.0); strong 6.7 (-3.4 to 16.9).
- With both queens on: lift 14.5 (0.8 to 27.1) and 23.3 (2.8 to 42.3); strong 4.8 (-6.8 to 15.4).
- The flank breaks: lift 6.7 (-4.2 to 17.8) and 5.0 (-8.3 to 18.7); strong 18.0 (7.5 to 28.1).
- Maia-2 at his band, per break, central against flank (positions with both on): 4.9 (3.4 to 6.5) against 3.8 (2.7 to 5.0), and 4.8 (3.3 to 6.5) against 4.3 (2.7 to 6.4).
- Win% given up, central breaks and his move, centre: 13.4 and 4.4; 13.5 and 5.7; away: 18.6 and 5.8; 17.9 and 5.9.
