# Think time in rapid: results

Written by `analyze.py` for the Lichess month 2026-09 on the app at `d8b771238c11c84d0c4b2a8010bb75f5f756b8d9`. Rates are serious errors per move; Δ is long minus quick in percentage points, adjusted by the danger score's strata, with its 95% bootstrap interval over games.

## Data

- Games: 74,000 built of 74,000 kept from 6,185,560 read. Black's flipped build matched its own build on all 800 games checked.
- Moves: 4,721,351 timed, 3,738,138 analysed, 980,946 in the primary set (39,902 player-games; 668,544 quick, 54,331 long).
- Danger score: AUC 0.799 on quick moves and 0.762 on the others, each scored by the half that never saw its game.

## The triggers

| Moment | Per game | Quick | Long | Errors, quick | Errors, long | Δ | Δ − Δ none | Holm p | Verdict | Errors saved per extra minute |
|---|---|---|---|---|---|---|---|---|---|---|
| book-end | 1.0 | 33,996 | 437 | 5.0% | 12.1% | +1.6 (-0.1 to +3.4) | -3.1 (-4.9 to -1.2) | 0.008 | no sign it pays | -0.021 (-0.047 to 0.002) |
| conversion | 5.3 | 134,722 | 13,192 | 11.9% | 23.4% | +8.8 (+8.2 to +9.5) | +4.1 (+3.3 to +5.0) | 0.004 | no sign it pays | -0.128 (-0.137 to -0.118) |
| forcing | 11.2 | 306,030 | 24,636 | 13.0% | 26.9% | +7.6 (+7.1 to +8.0) | +2.9 (+2.1 to +3.6) | 0.004 | no sign it pays | -0.106 (-0.113 to -0.100) |
| structure | 0.2 | 4,871 | 307 | 9.7% | 13.7% | +0.6 (-2.3 to +3.7) | -4.1 (-6.9 to -1.0) | 0.010 | no sign it pays | -0.008 (-0.051 to 0.031) |
| none | 7.0 | 188,925 | 15,759 | 11.0% | 23.1% | +4.7 (+4.1 to +5.3) | | | | |

## Candidates

| Candidate | Per game | Quick | Long | Δ | Δ − Δ none | Holm p | Pays | Should join |
|---|---|---|---|---|---|---|---|---|
| in check | 1.5 | 50,679 | 959 | +3.7 (+1.7 to +5.7) | -1.0 (-3.1 to +1.0) | 0.648 | no | no |
| just after a capture | 6.3 | 194,911 | 9,034 | +8.2 (+7.5 to +8.9) | +3.5 (+2.6 to +4.4) | 0.008 | no | no |
| one of his pieces hanging | 9.4 | 241,606 | 25,008 | +8.7 (+8.2 to +9.2) | +4.0 (+3.3 to +4.7) | 0.008 | no | no |
| one of the opponent's pieces hanging | 6.3 | 186,669 | 11,791 | +10.6 (+9.9 to +11.3) | +5.9 (+5.0 to +6.8) | 0.008 | no | no |
| just after the opponent's serious error | 3.4 | 85,675 | 8,489 | +16.3 (+15.1 to +17.5) | +11.6 (+10.4 to +12.8) | 0.008 | no | no |
| defending: eval −3 or worse | 4.5 | 116,842 | 11,270 | +2.3 (+1.9 to +2.7) | -2.4 (-3.0 to -1.8) | 0.008 | no | no |
| the book-end move and his next four | 4.8 | 159,050 | 4,040 | +4.6 (+3.7 to +5.5) | -0.1 (-1.0 to +0.8) | 0.901 | no | no |
| high danger: the top fifth of the danger score | 5.7 | 133,709 | 18,266 | +12.9 (+12.2 to +13.7) | +8.2 (+7.4 to +9.1) | 0.008 | no | no |

## The bars

**book-end.** A think of 60 seconds or more: Δ +0.1 (-3.4 to +3.9). Bar: none; the app's: 45 s (no bar).

| Think (s) | Moves | Δ |
|---|---|---|
| 10-14 | 2,297 | +2.3 (+1.4 to +3.2) |
| 15-19 | 938 | +3.8 (+2.3 to +5.4) |
| 20-29 | 743 | +2.9 (+1.5 to +4.4) |
| 30-44 | 285 | +1.8 (-0.3 to +4.2) |
| 45-59 | 79 | +2.1 (-2.3 to +7.8) |
| 60-89 | 53 | +0.0 (-4.0 to +4.8) |
| 90+ | 20 | +0.1 (-6.3 to +9.6) |

**conversion.** A think of 60 seconds or more: Δ +13.3 (+11.5 to +15.1). Bar: none; the app's: 30 s (no bar).

| Think (s) | Moves | Δ |
|---|---|---|
| 10-14 | 29,571 | +3.7 (+3.3 to +4.1) |
| 15-19 | 16,418 | +5.6 (+5.1 to +6.2) |
| 20-29 | 15,933 | +6.4 (+5.8 to +6.9) |
| 30-44 | 8,469 | +7.8 (+7.1 to +8.6) |
| 45-59 | 2,733 | +8.6 (+7.2 to +10.0) |
| 60-89 | 1,539 | +13.6 (+11.5 to +15.7) |
| 90+ | 451 | +11.9 (+8.5 to +15.4) |

**forcing.** A think of 60 seconds or more: Δ +8.1 (+7.0 to +9.2). Bar: none; the app's: 30 s (no bar).

| Think (s) | Moves | Δ |
|---|---|---|
| 10-14 | 55,526 | +3.5 (+3.2 to +3.8) |
| 15-19 | 30,280 | +4.5 (+4.2 to +4.9) |
| 20-29 | 28,971 | +5.4 (+5.0 to +5.8) |
| 30-44 | 15,485 | +7.1 (+6.5 to +7.7) |
| 45-59 | 5,223 | +8.5 (+7.5 to +9.5) |
| 60-89 | 2,932 | +7.4 (+6.2 to +8.7) |
| 90+ | 996 | +10.0 (+7.8 to +12.3) |

**structure.** A think of 60 seconds or more: Δ -0.5 (-6.0 to +5.5). Bar: none; the app's: 30 s (no bar).

| Think (s) | Moves | Δ |
|---|---|---|
| 10-14 | 893 | +2.4 (+0.2 to +4.7) |
| 15-19 | 455 | +3.5 (+0.9 to +6.5) |
| 20-29 | 403 | +0.8 (-1.9 to +3.7) |
| 30-44 | 189 | +0.8 (-2.8 to +4.8) |
| 45-59 | 55 | +1.1 (-5.8 to +8.4) |
| 60-89 | 48 | -1.1 (-7.0 to +5.4) |
| 90+ | 15 | +0.3 (-11.7 to +13.5) |

## The trend with rating

| Mover's rating | none | book-end | conversion | forcing | structure |
|---|---|---|---|---|---|
| 900-1099 | +5.3 (+4.2 to +6.4) | +8.8 (+4.3 to +14.2) | +10.0 (+8.9 to +11.1) | +7.8 (+6.9 to +8.7) | +1.1 (-5.6 to +7.6) |
| 1100-1299 | +4.9 (+4.2 to +5.6) | +2.8 (+0.7 to +5.0) | +8.7 (+7.9 to +9.4) | +7.6 (+7.0 to +8.2) | +3.9 (-0.4 to +8.3) |
| 1300-1499 | +4.6 (+4.0 to +5.1) | +2.2 (+0.3 to +4.2) | +8.9 (+8.2 to +9.6) | +7.7 (+7.2 to +8.1) | -0.1 (-3.0 to +3.1) |
| 1500-1699 | +4.5 (+3.9 to +5.1) | +1.2 (-0.7 to +3.3) | +8.8 (+8.1 to +9.6) | +8.2 (+7.6 to +8.7) | +3.8 (+0.3 to +7.5) |
| 1700-1899 | +5.0 (+4.3 to +5.7) | +1.3 (-0.8 to +3.8) | +8.9 (+7.9 to +10.0) | +7.1 (+6.4 to +7.8) | -3.0 (-6.0 to +0.5) |
| 1900-2099 | +4.0 (+3.4 to +4.6) | +0.8 (-1.0 to +2.9) | +8.8 (+7.7 to +9.9) | +7.4 (+6.8 to +8.1) | +5.8 (+1.4 to +10.7) |

## The same position

Book-end moves in 292 positions reached with both a quick and a long think (9,974 quick, 386 long): Δ +1.9 (-1.0 to +5.0).

## Sensitivity

| Moment | Δ, ten strata | Δ − Δ none, ten strata | Δ, quick from 6 s | Δ − Δ none, quick from 6 s |
|---|---|---|---|---|
| book-end | +1.2 (-0.4 to +3.0) | -3.6 (-5.3 to -1.8) | +0.5 (-1.7 to +2.8) | -3.5 (-5.8 to -1.2) |
| conversion | +8.8 (+8.1 to +9.4) | +3.9 (+3.1 to +4.8) | +7.2 (+6.5 to +8.0) | +3.2 (+2.3 to +4.2) |
| forcing | +7.4 (+6.9 to +7.9) | +2.6 (+1.9 to +3.3) | +6.4 (+5.9 to +7.0) | +2.4 (+1.6 to +3.2) |
| structure | +0.8 (-2.2 to +3.9) | -4.0 (-7.0 to -0.9) | -1.2 (-4.8 to +2.7) | -5.2 (-8.9 to -1.3) |

## Where the errors are

Added after the rule was committed, before the month's results; it tests nothing. Every think, primary set; its serious-error rate is 14.5%.

| Moment | Moves | Share of moves | Share of serious errors |
|---|---|---|---|
| book-end | 38,411 | 3.9% | 1.6% |
| conversion | 209,836 | 21.4% | 21.2% |
| forcing | 445,443 | 45.4% | 49.9% |
| structure | 6,929 | 0.7% | 0.5% |
| none | 280,327 | 28.6% | 26.8% |
| in check | 61,508 | 6.3% | 4.4% |
| just after a capture | 253,356 | 25.8% | 22.5% |
| one of his pieces hanging | 375,658 | 38.3% | 44.1% |
| one of the opponent's pieces hanging | 252,969 | 25.8% | 26.6% |
| just after the opponent's serious error | 133,873 | 13.6% | 33.1% |
| defending: eval −3 or worse | 178,114 | 18.2% | 6.0% |
| the book-end move and his next four | 193,286 | 19.7% | 12.4% |
| high danger: the top fifth of the danger score | 227,445 | 23.2% | 54.8% |

## His games

632 of his 10-minute games, 16,290 moves analysed. Raw rates, no adjustment.

| Moment | His per game | Peers per game | His long share | Peers' long share | His errors quick | His errors long | Peers' errors quick | Peers' errors long |
|---|---|---|---|---|---|---|---|---|
| book-end | 0.9 | 1.0 | 1.4% | 1.1% | 1.5% (n=525) | 0.0% (n=8) | 5.0% | 12.1% |
| conversion | 4.8 | 5.3 | 8.3% | 6.3% | 8.6% (n=1735) | 18.2% (n=253) | 11.9% | 23.4% |
| forcing | 12.2 | 11.2 | 6.1% | 5.5% | 9.7% (n=5040) | 23.7% (n=473) | 13.0% | 26.9% |
| structure | 0.2 | 0.2 | 3.8% | 4.4% | 10.3% (n=107) | 33.3% (n=6) | 9.7% | 13.7% |
| none | 7.6 | 7.0 | 5.7% | 5.6% | 6.9% (n=3163) | 16.7% (n=270) | 11.0% | 23.1% |
