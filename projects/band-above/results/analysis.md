# The band above: results

Written by `analyze.py` for the Lichess month 2026-09 on the app at `d8b771238c11c84d0c4b2a8010bb75f5f756b8d9`. Points are percent of a game given away on the band curve, per player-game, with 95% bootstrap intervals over games.

## Data

- Games: 74,000 built of 74,000 read. Black's flipped build matched its own build on all 800 games checked. 148,000 player-games.
- The yardstick: k = 0.002222 per centipawn, fitted on his band's 39,903 player-games (2,276,949 positions); the Lichess curve's k is 0.003682.
- Bands: 850-1049: 13,282 player-games, k 0.001759; 1050-1249: 21,692 player-games, k 0.002011; 1250-1449: 39,903 player-games, k 0.002222; 1450-1649: 34,973 player-games, k 0.002449; 1650-1849: 15,268 player-games, k 0.002718; 1850-2049: 12,424 player-games, k 0.003039.

## What separates the bands (1450-1649 against 1250-1449)

| Cause | His band | The band above | Δ | Holm p | Separates | Share of the difference |
|---|---|---|---|---|---|---|
| opening, tense positions | 13.77 (13.56 to 13.98) | 11.26 (11.06 to 11.45) | -2.51 (-2.79 to -2.24) | 0.0100 | yes | 0.45 (0.37 to 0.58) |
| opening, quiet positions | 12.06 (11.93 to 12.18) | 11.33 (11.21 to 11.47) | -0.72 (-0.89 to -0.53) | 0.0100 | yes | 0.13 (0.10 to 0.18) |
| middlegame, tense positions | 38.17 (37.71 to 38.60) | 35.12 (34.68 to 35.56) | -3.05 (-3.67 to -2.42) | 0.0100 | yes | 0.55 (0.45 to 0.67) |
| middlegame, quiet positions | 14.77 (14.56 to 14.99) | 15.74 (15.51 to 15.98) | +0.97 (+0.66 to +1.26) | 0.0100 | no | -0.18 (-0.26 to -0.11) |
| endgame, tense positions | 18.90 (18.52 to 19.30) | 17.86 (17.46 to 18.26) | -1.05 (-1.60 to -0.48) | 0.0100 | yes | 0.19 (0.10 to 0.26) |
| endgame, quiet positions | 8.79 (8.54 to 9.04) | 9.36 (9.08 to 9.64) | +0.56 (+0.18 to +0.93) | 0.0100 | no | -0.10 (-0.20 to -0.03) |
| under a minute on the clock | 2.19 (2.04 to 2.33) | 2.43 (2.26 to 2.60) | +0.24 (+0.02 to +0.46) | 0.0330 | no | -0.04 (-0.09 to -0.00) |
| tense positions answered in under five seconds | 23.79 (23.49 to 24.09) | 22.38 (22.06 to 22.70) | -1.40 (-1.83 to -0.97) | 0.0100 | yes |  |
| right after the opponent's serious error | 28.52 (28.08 to 28.94) | 25.55 (25.12 to 26.01) | -2.97 (-3.56 to -2.35) | 0.0100 | yes |  |
| from move 40 | 8.94 (8.60 to 9.29) | 9.79 (9.39 to 10.19) | +0.85 (+0.31 to +1.39) | 0.0100 | no |  |
| every move | 108.64 (107.80 to 109.46) | 103.09 (102.24 to 103.96) | -5.55 (-6.70 to -4.41) |  |  |  |

Ranked: middlegame.tense, after.gift, opening.tense, fast.tense, endgame.tense, opening.quiet.

## The discount (his band; the app's 0.6)

| Cause | δ | Verdict |
|---|---|---|
| opening, tense positions | 0.30 (0.28 to 0.32) | too high |
| opening, quiet positions | 0.29 (0.25 to 0.32) | too high |
| middlegame, tense positions | 0.29 (0.28 to 0.30) | too high |
| middlegame, quiet positions | 0.24 (0.22 to 0.26) | too high |
| endgame, tense positions | 0.22 (0.21 to 0.23) | too high |
| endgame, quiet positions | 0.16 (0.15 to 0.18) | too high |
| under a minute on the clock | 0.31 (0.27 to 0.35) | too high |
| tense positions answered in under five seconds | 0.33 (0.32 to 0.35) | too high |
| right after the opponent's serious error | 0.10 (0.09 to 0.11) | too high |
| from move 40 | 0.12 (0.11 to 0.13) | too high |
| every move | 0.22 (0.21 to 0.23) | too high |

## The discount with the opponent's points (added after the results were read; not part of the rule)

| Cause | Correlation of the two players' points | δ with the opponent's points | In one fit with every partition cause |
|---|---|---|---|
| opening, tense positions | 0.61 | 0.78 (0.75 to 0.82) | 1.06 (1.04 to 1.07) |
| opening, quiet positions | 0.52 | 0.61 (0.55 to 0.67) | 1.03 (1.01 to 1.06) |
| middlegame, tense positions | 0.66 | 0.85 (0.83 to 0.87) | 1.06 (1.06 to 1.07) |
| middlegame, quiet positions | 0.56 | 0.53 (0.49 to 0.57) | 1.07 (1.05 to 1.08) |
| endgame, tense positions | 0.69 | 0.71 (0.69 to 0.74) | 1.02 (1.01 to 1.03) |
| endgame, quiet positions | 0.69 | 0.54 (0.50 to 0.58) | 1.02 (1.01 to 1.04) |
| under a minute on the clock | 0.24 | 0.41 (0.38 to 0.44) | 1.25 (1.22 to 1.27) |
| tense positions answered in under five seconds | 0.39 | 0.55 (0.53 to 0.57) |  |
| right after the opponent's serious error | 0.67 | 0.30 (0.28 to 0.32) |  |
| from move 40 | 0.87 | 0.95 (0.92 to 0.98) |  |
| every move | 0.79 | 1.05 (1.05 to 1.06) |  |

## Points per move (added after the results were read; it tests nothing)

| Cause | His band: moves a game | The band above: moves a game | His band: points a move | The band above: points a move | Δ |
|---|---|---|---|---|---|
| opening, tense positions | 4.49 | 4.23 | 3.07 (3.03 to 3.10) | 2.66 (2.62 to 2.69) | -0.41 (-0.46 to -0.36) |
| opening, quiet positions | 5.82 | 6.09 | 2.07 (2.05 to 2.09) | 1.86 (1.84 to 1.88) | -0.21 (-0.24 to -0.19) |
| middlegame, tense positions | 8.55 | 8.50 | 4.47 (4.42 to 4.51) | 4.13 (4.09 to 4.17) | -0.33 (-0.39 to -0.28) |
| middlegame, quiet positions | 3.54 | 4.07 | 4.17 (4.12 to 4.21) | 3.87 (3.83 to 3.91) | -0.29 (-0.36 to -0.24) |
| endgame, tense positions | 5.64 | 5.66 | 3.35 (3.30 to 3.39) | 3.16 (3.11 to 3.21) | -0.19 (-0.26 to -0.12) |
| endgame, quiet positions | 2.91 | 3.13 | 3.03 (2.97 to 3.09) | 2.99 (2.93 to 3.05) | -0.04 (-0.12 to +0.04) |
| under a minute on the clock | 0.59 | 0.70 | 3.71 (3.53 to 3.89) | 3.49 (3.31 to 3.67) | -0.22 (-0.46 to +0.02) |
| tense positions answered in under five seconds | 8.92 | 9.14 | 2.67 (2.64 to 2.69) | 2.45 (2.42 to 2.47) | -0.22 (-0.26 to -0.18) |
| right after the opponent's serious error | 3.62 | 3.48 | 7.88 (7.80 to 7.96) | 7.35 (7.27 to 7.43) | -0.53 (-0.64 to -0.42) |
| from move 40 | 3.08 | 3.40 | 2.90 (2.82 to 2.97) | 2.88 (2.81 to 2.96) | -0.02 (-0.12 to +0.09) |
| every move | 31.54 | 32.37 | 3.44 (3.42 to 3.47) | 3.18 (3.16 to 3.20) | -0.26 (-0.29 to -0.23) |

## Error kinds by band

| Band | serious errors per game | hanging a piece per game | allowing mate in one per game | allowing a forced mate per game | other serious errors per game | Hanging a piece: once every N games |
|---|---|---|---|---|---|---|
| 850-1049 | 4.07 (4.00 to 4.13) | 1.02 (1.00 to 1.04) | 0.07 (0.07 to 0.08) | 0.07 (0.07 to 0.08) | 2.91 (2.86 to 2.96) | 1.0 |
| 1050-1249 | 3.81 (3.76 to 3.86) | 0.90 (0.89 to 0.92) | 0.06 (0.06 to 0.06) | 0.07 (0.06 to 0.07) | 2.78 (2.74 to 2.82) | 1.1 |
| 1250-1449 | 3.67 (3.63 to 3.70) | 0.82 (0.81 to 0.83) | 0.05 (0.05 to 0.05) | 0.06 (0.06 to 0.06) | 2.73 (2.70 to 2.76) | 1.2 |
| 1450-1649 | 3.51 (3.48 to 3.55) | 0.74 (0.73 to 0.75) | 0.04 (0.04 to 0.04) | 0.06 (0.05 to 0.06) | 2.68 (2.65 to 2.71) | 1.4 |
| 1650-1849 | 3.39 (3.34 to 3.44) | 0.66 (0.65 to 0.68) | 0.03 (0.03 to 0.03) | 0.05 (0.04 to 0.05) | 2.65 (2.61 to 2.69) | 1.5 |
| 1850-2049 | 3.16 (3.11 to 3.21) | 0.59 (0.58 to 0.61) | 0.02 (0.02 to 0.03) | 0.04 (0.04 to 0.05) | 2.50 (2.46 to 2.55) | 1.7 |

Points a game they cost:

| Band | serious errors | hanging a piece | allowing mate in one | allowing a forced mate | other serious errors |
|---|---|---|---|---|---|
| 850-1049 | 83.10 (81.57 to 84.61) | 23.06 (22.51 to 23.59) | 3.82 (3.55 to 4.09) | 3.51 (3.25 to 3.81) | 52.71 (51.61 to 53.81) |
| 1050-1249 | 72.49 (71.46 to 73.56) | 19.15 (18.81 to 19.52) | 3.05 (2.88 to 3.24) | 3.05 (2.86 to 3.25) | 47.23 (46.48 to 48.00) |
| 1250-1449 | 66.59 (65.84 to 67.27) | 16.60 (16.37 to 16.84) | 2.36 (2.24 to 2.48) | 2.77 (2.64 to 2.91) | 44.85 (44.30 to 45.38) |
| 1450-1649 | 61.38 (60.66 to 62.10) | 14.23 (14.00 to 14.46) | 1.97 (1.87 to 2.09) | 2.42 (2.30 to 2.54) | 42.76 (42.17 to 43.32) |
| 1650-1849 | 56.74 (55.79 to 57.69) | 12.19 (11.90 to 12.48) | 1.45 (1.31 to 1.59) | 2.02 (1.86 to 2.20) | 41.08 (40.31 to 41.85) |
| 1850-2049 | 50.84 (49.94 to 51.80) | 10.39 (10.09 to 10.69) | 0.96 (0.85 to 1.09) | 1.73 (1.57 to 1.89) | 37.75 (36.98 to 38.59) |

The difference each kind makes, 1450-1649 against 1250-1449 (added after the results were read; it tests nothing):

| Kind | Δ points a game | Share of the difference on every move |
|---|---|---|
| serious errors | -5.20 (-6.18 to -4.23) | 0.94 (0.87 to 1.01) |
| hanging a piece | -2.38 (-2.70 to -2.07) | 0.43 (0.36 to 0.52) |
| allowing mate in one | -0.38 (-0.54 to -0.21) | 0.07 (0.04 to 0.10) |
| allowing a forced mate | -0.35 (-0.54 to -0.18) | 0.06 (0.03 to 0.10) |
| other serious errors | -2.09 (-2.86 to -1.34) | 0.38 (0.29 to 0.45) |

## The trend

| Cause | 850-1049 | 1050-1249 | 1250-1449 | 1450-1649 | 1650-1849 | 1850-2049 |
|---|---|---|---|---|---|---|
| opening, tense positions | 24.09 | 17.62 | 13.77 | 11.26 | 8.52 | 6.75 |
| opening, quiet positions | 14.10 | 13.22 | 12.06 | 11.33 | 10.33 | 9.25 |
| middlegame, tense positions | 49.56 | 41.91 | 38.17 | 35.12 | 32.59 | 28.98 |
| middlegame, quiet positions | 12.84 | 13.62 | 14.77 | 15.74 | 16.66 | 16.69 |
| endgame, tense positions | 18.55 | 19.05 | 18.90 | 17.86 | 17.46 | 16.54 |
| endgame, quiet positions | 6.36 | 7.69 | 8.79 | 9.36 | 9.99 | 10.45 |
| under a minute on the clock | 1.99 | 2.22 | 2.19 | 2.43 | 2.86 | 4.12 |
| tense positions answered in under five seconds | 27.78 | 25.03 | 23.79 | 22.38 | 20.90 | 18.96 |
| right after the opponent's serious error | 39.68 | 32.44 | 28.52 | 25.55 | 22.67 | 18.96 |
| from move 40 | 5.68 | 7.44 | 8.94 | 9.79 | 11.40 | 13.12 |
| every move | 127.50 | 115.32 | 108.64 | 103.09 | 98.42 | 92.78 |

## His games

633 of his 10-minute games, priced on the yardstick (his own slope: 0.002428).

| Cause | His games | His band | The band above |
|---|---|---|---|
| opening, tense positions | 8.66 (7.72 to 9.68) | 13.77 | 11.26 |
| opening, quiet positions | 9.28 (8.67 to 9.93) | 12.06 | 11.33 |
| middlegame, tense positions | 32.81 (30.40 to 35.36) | 38.17 | 35.12 |
| middlegame, quiet positions | 11.89 (10.70 to 13.12) | 14.77 | 15.74 |
| endgame, tense positions | 18.63 (16.48 to 20.80) | 18.90 | 17.86 |
| endgame, quiet positions | 7.02 (5.82 to 8.34) | 8.79 | 9.36 |
| under a minute on the clock | 2.07 (1.26 to 3.01) | 2.19 | 2.43 |
| tense positions answered in under five seconds | 17.34 (15.84 to 18.93) | 23.79 | 22.38 |
| right after the opponent's serious error | 18.32 (16.45 to 20.14) | 28.52 | 25.55 |
| from move 40 | 8.83 (7.12 to 10.70) | 8.94 | 9.79 |
| every move | 90.37 (85.55 to 94.85) | 108.64 | 103.09 |

| Kind | His per game | Once every N games |
|---|---|---|
| serious errors | 3.04 (2.86 to 3.23) | 0.3 |
| hanging a piece | 0.78 (0.71 to 0.85) | 1.3 |
| allowing mate in one | 0.07 (0.05 to 0.09) | 13.8 |
| allowing a forced mate | 0.10 (0.07 to 0.13) | 10.0 |
| other serious errors | 2.09 (1.95 to 2.24) | 0.5 |

How the points split between the partition's causes (added after the results were read; it tests nothing):

| Cause | His games | His band | The band above |
|---|---|---|---|
| opening, tense positions | 0.096 (0.085 to 0.108) | 0.127 (0.125 to 0.129) | 0.109 (0.107 to 0.111) |
| opening, quiet positions | 0.103 (0.094 to 0.111) | 0.111 (0.110 to 0.112) | 0.110 (0.108 to 0.111) |
| middlegame, tense positions | 0.363 (0.342 to 0.386) | 0.351 (0.348 to 0.355) | 0.341 (0.337 to 0.344) |
| middlegame, quiet positions | 0.132 (0.120 to 0.143) | 0.136 (0.134 to 0.138) | 0.153 (0.151 to 0.155) |
| endgame, tense positions | 0.206 (0.187 to 0.225) | 0.174 (0.171 to 0.177) | 0.173 (0.170 to 0.176) |
| endgame, quiet positions | 0.078 (0.066 to 0.091) | 0.081 (0.079 to 0.083) | 0.091 (0.088 to 0.093) |
| under a minute on the clock | 0.023 (0.014 to 0.033) | 0.020 (0.019 to 0.021) | 0.024 (0.022 to 0.025) |
