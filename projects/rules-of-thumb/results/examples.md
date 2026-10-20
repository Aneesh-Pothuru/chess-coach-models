# Held-out examples

App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. Lichess standard rated 600+0, 2026-09. Positions are CC0.

104 positions: 8 for each of 13 rules with a registered verdict. They are drawn without replacement among held-out rows where R differs from N, seeded by the rule id. No result is used to choose them.

Win% is from the original mover's side through the app's score conversion. Soundness is checked against the stored referee evidence. The best is the original Stockfish first line, or the app's fifty-move tablebase best. Tablebase win% is an outcome conversion; it is not a human win probability.

| Rule | Examples | Stockfish | Tablebase | R sound | N sound | Played sound | Best sound |
|---|---:|---:|---:|---:|---:|---:|---:|
| active-king | 8 | 7 | 1 | 5 | 5 | 6 | 8 |
| opposition | 8 | 4 | 4 | 5 | 8 | 7 | 8 |
| square-rule | 8 | 4 | 4 | 8 | 7 | 7 | 8 |
| rook-behind-passer | 8 | 8 | 0 | 4 | 7 | 6 | 8 |
| cut-off-king | 8 | 7 | 1 | 2 | 7 | 6 | 8 |
| outside-passer | 8 | 6 | 2 | 2 | 6 | 7 | 8 |
| trade-when-ahead | 8 | 8 | 0 | 4 | 7 | 7 | 8 |
| open-file | 8 | 8 | 0 | 4 | 6 | 3 | 8 |
| rook-on-the-seventh | 8 | 8 | 0 | 4 | 8 | 8 | 8 |
| outpost | 8 | 8 | 0 | 2 | 6 | 5 | 8 |
| pawn-break | 8 | 8 | 0 | 3 | 7 | 5 | 8 |
| passed-pawn | 8 | 8 | 0 | 1 | 7 | 4 | 8 |
| worst-piece | 8 | 7 | 1 | 4 | 5 | 6 | 8 |

Excluded for fewer than 300 held-out positions: lucena (6), philidor (30).

## active-king

Registered verdict: It misleads. Eligible held-out positions: 3099.

### Example 1

Band 1300. Referee: stockfish.

FEN: `1R6/5p2/5Pkp/1P2P2p/4K1b1/4B1r1/8/8 w - - 1 41`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kf4 | no | 74.07 |
| N | Rg8+ | yes | 87.36 |
| Played | Rg8+ | yes | 87.36 |
| Referee best | Rg8+ | yes | 82.33 |

### Example 2

Band 1500. Referee: stockfish.

FEN: `8/2pk4/3b1p2/3p4/1P6/2P1B1pP/P6r/R5K1 b - - 5 37`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kc6 | no | 54.86 |
| N | Rxh3 | no | 58.03 |
| Played | Rxh3 | no | 58.03 |
| Referee best | f5 | yes | 69.45 |

### Example 3

Band 1500. Referee: tablebase.

FEN: `4k3/8/8/5NKP/8/4P3/8/8 b - - 4 59`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kf7 | yes | 0.00 |
| N | Kf8 | yes | 0.00 |
| Played | Kf7 | yes | 0.00 |
| Referee best | Kd7 | yes | 0.00 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `6k1/p6p/6p1/P1R2p2/8/8/5PK1/r7 w - - 1 51`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kf3 | no | 22.36 |
| N | Rc8+ | no | 24.34 |
| Played | Kf3 | no | 22.36 |
| Referee best | Rc8+ | yes | 31.82 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `8/pp6/2pb1k2/5p2/1nP5/1P4pP/P5K1/8 b - - 3 47`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kg5 | yes | 97.45 |
| N | Nxa2 | no | 94.55 |
| Played | Kg5 | yes | 97.45 |
| Referee best | Nc2 | yes | 98.44 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `3r2k1/5pp1/7p/pNp4P/P6P/4P3/3P1P2/1b2K3 w - - 0 31`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ke2 | yes | 10.78 |
| N | Nc3 | yes | 11.62 |
| Played | Nc3 | yes | 11.62 |
| Referee best | Na7 | yes | 12.36 |

### Example 7

Band 1300. Referee: stockfish.

FEN: `2r5/pp3k2/8/8/Pn3P2/5K2/8/8 w - - 3 41`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ke4 | yes | 0.00 |
| N | f5 | yes | 0.00 |
| Played | Ke4 | yes | 0.00 |
| Referee best | Ke4 | yes | 0.00 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `8/6pp/8/8/PKP3kP/3R2P1/4r3/8 w - - 1 48`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kc5 | yes | 87.07 |
| N | a5 | yes | 90.14 |
| Played | c5 | yes | 88.97 |
| Referee best | a5 | yes | 88.90 |

## opposition

Registered verdict: It misleads. Eligible held-out positions: 966.

### Example 1

Band 1500. Referee: tablebase.

FEN: `8/8/8/8/K7/1pk5/8/8 b - - 1 57`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kc2 | yes | 100.00 |
| N | b2 | yes | 100.00 |
| Played | Kc2 | yes | 100.00 |
| Referee best | b2 | yes | 100.00 |

### Example 2

Band 1500. Referee: tablebase.

FEN: `8/8/8/2p5/p7/P2k4/1K6/8 w - - 4 55`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kb1 | yes | 0.00 |
| N | Kc1 | yes | 0.00 |
| Played | Ka2 | yes | 0.00 |
| Referee best | Ka1 | yes | 0.00 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `4K3/8/6p1/1p5p/1P5P/3k4/1P3p2/8 w - - 0 54`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kd7 | no | 0.07 |
| N | Kf7 | yes | 3.26 |
| Played | Ke7 | no | 0.46 |
| Referee best | Kf7 | yes | 4.32 |

### Example 4

Band 1300. Referee: tablebase.

FEN: `8/2p5/8/8/1p1K4/k7/8/8 w - - 0 70`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kc5 | yes | 0.00 |
| N | Kd3 | yes | 0.00 |
| Played | Kd3 | yes | 0.00 |
| Referee best | Kd3 | yes | 0.00 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `8/6p1/3kPp1p/1p3P1P/1PpP1P2/p1K5/8/8 b - - 7 48`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kc7 | yes | 50.00 |
| N | Ke7 | yes | 50.00 |
| Played | Ke7 | yes | 50.00 |
| Referee best | Kc6 | yes | 50.00 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `4k3/2P5/8/1p4p1/1P3p2/P2Kp2P/6P1/8 w - - 1 49`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ke2 | no | 49.82 |
| N | c8=Q+ | yes | 99.61 |
| Played | c8=Q+ | yes | 99.61 |
| Referee best | c8=Q+ | yes | 95.75 |

### Example 7

Band 1500. Referee: tablebase.

FEN: `8/8/7k/6pP/8/6K1/8/8 w - - 1 73`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kh2 | yes | 50.00 |
| N | Kg4 | yes | 50.00 |
| Played | Kg4 | yes | 50.00 |
| Referee best | Kf2 | yes | 50.00 |

### Example 8

Band 1300. Referee: stockfish.

FEN: `8/8/1k6/1P3pp1/2K4p/6P1/7P/8 w - - 0 49`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kd4 | no | 44.14 |
| N | gxh4 | yes | 50.00 |
| Played | gxh4 | yes | 50.00 |
| Referee best | gxh4 | yes | 50.55 |

## square-rule

Registered verdict: It misleads. Eligible held-out positions: 845.

### Example 1

Band 1300. Referee: stockfish.

FEN: `8/8/1p1p4/p1p3k1/P1PpP3/1P6/7K/8 b - - 0 51`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | d3 | yes | 99.10 |
| N | Kf4 | yes | 96.04 |
| Played | Kf4 | yes | 96.04 |
| Referee best | Kf4 | yes | 95.74 |

### Example 2

Band 1300. Referee: tablebase.

FEN: `8/1k1b4/1p6/5P2/4K3/p7/8/8 b - - 0 45`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | a2 | yes | 100.00 |
| N | Bxf5+ | yes | 100.00 |
| Played | Bxf5+ | yes | 100.00 |
| Referee best | a2 | yes | 100.00 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `8/6p1/2p1pqP1/1k1b3K/1Pp4P/8/8/8 b - - 3 50`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | c3 | yes | 100.00 |
| N | Bf3# | yes | 100.00 |
| Played | Kxb4 | yes | 100.00 |
| Referee best | Bf3# | yes | 100.00 |

### Example 4

Band 1500. Referee: stockfish.

FEN: `8/8/3Q1p2/1P1p1k2/8/5P2/1P4PP/6K1 w - - 1 43`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | b6 | yes | 100.00 |
| N | Qxd5+ | yes | 100.00 |
| Played | b6 | yes | 100.00 |
| Referee best | b6 | yes | 100.00 |

### Example 5

Band 1300. Referee: tablebase.

FEN: `6k1/6p1/7p/6n1/5P2/8/1K6/8 b - - 0 42`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | h5 | yes | 100.00 |
| N | Ne6 | yes | 100.00 |
| Played | Ne4 | yes | 100.00 |
| Referee best | h5 | yes | 100.00 |

### Example 6

Band 1500. Referee: tablebase.

FEN: `8/8/8/p1p5/2P2kp1/8/1r6/6K1 b - - 0 53`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | a4 | yes | 100.00 |
| N | Kf3 | yes | 100.00 |
| Played | Rc2 | yes | 100.00 |
| Referee best | g3 | yes | 100.00 |

### Example 7

Band 1500. Referee: stockfish.

FEN: `7r/pk2n3/5p1p/3p3P/3P2P1/2r2PK1/8/8 b - - 1 39`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | a5 | yes | 100.00 |
| N | Rd3 | no | 96.66 |
| Played | f5 | no | 96.03 |
| Referee best | Rb8 | yes | 100.00 |

### Example 8

Band 1300. Referee: tablebase.

FEN: `8/3K2bk/6p1/q6p/3P4/8/8/8 b - - 0 50`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | h4 | yes | 100.00 |
| N | Bxd4 | yes | 100.00 |
| Played | Qd5+ | yes | 100.00 |
| Referee best | Bxd4 | yes | 100.00 |

## rook-behind-passer

Registered verdict: It misleads. Eligible held-out positions: 3717.

### Example 1

Band 1300. Referee: stockfish.

FEN: `2k2r2/pp4Q1/2pP4/5r2/8/8/PPK5/8 b - - 7 42`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd5 | no | 0.00 |
| N | R5f7 | yes | 53.58 |
| Played | R8f7 | no | 50.00 |
| Referee best | R5f7 | yes | 54.04 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `1r2r1k1/5ppp/p2nb3/8/3P4/KP3P2/6PP/2R4R w - - 1 26`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rhd1 | yes | 6.15 |
| N | Rc6 | yes | 5.68 |
| Played | Rc3 | yes | 7.23 |
| Referee best | d5 | yes | 7.87 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `1n1q1knQ/3r1p2/p6p/3B2p1/1Pp1P3/8/P4PPP/R3R1K1 b - - 0 19`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc7 | yes | 15.72 |
| N | c3 | no | 13.09 |
| Played | Rd6 | yes | 14.63 |
| Referee best | Rd6 | yes | 16.57 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `2r4r/5p1p/4p1p1/P1P5/2p3kP/6P1/P7/b3q1NK b - - 0 35`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rhe8 | yes | 100.00 |
| N | Rxc5 | yes | 100.00 |
| Played | Rxc5 | yes | 100.00 |
| Referee best | Bd4 | yes | 100.00 |

### Example 5

Band 1300. Referee: stockfish.

FEN: `1k6/p1pB4/8/6b1/2KPP1P1/P1P2r1p/1P2R2P/8 b - - 8 38`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re3 | yes | 9.63 |
| N | Rf7 | yes | 10.19 |
| Played | Rf7 | yes | 10.19 |
| Referee best | Kb7 | yes | 11.81 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `1r6/4Kpkp/4p1p1/4P3/2R1b1B1/8/7b/8 b - - 13 39`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rh8 | no | 85.87 |
| N | Bd5 | yes | 94.38 |
| Played | h5 | no | 90.84 |
| Referee best | Bd5 | yes | 94.26 |

### Example 7

Band 1300. Referee: stockfish.

FEN: `4rr1k/Q1pq1p2/3p1p1p/8/P2nP3/7P/4BPP1/R4RK1 b - - 0 20`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc8 | no | 14.27 |
| N | Nxe2+ | yes | 73.28 |
| Played | Nxe2+ | yes | 73.28 |
| Referee best | Nxe2+ | yes | 71.74 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `2rqk2r/pQ1n1ppp/R3p3/8/1b1P4/4P3/3N1PPP/2B1K2R b Kk - 5 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ra8 | no | 14.91 |
| N | Rxc1+ | yes | 79.91 |
| Played | Rxc1+ | yes | 79.91 |
| Referee best | Rxc1+ | yes | 79.49 |

## cut-off-king

Registered verdict: It misleads. Eligible held-out positions: 1311.

### Example 1

Band 1300. Referee: stockfish.

FEN: `3k4/p1pp3P/1p2p1R1/4K3/7r/8/P1P5/8 w - - 3 37`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rf6 | no | 13.96 |
| N | Rg8+ | yes | 78.70 |
| Played | Rg8+ | yes | 78.70 |
| Referee best | Kf6 | yes | 77.57 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `1k3r2/1pp5/p7/5P2/5p2/1P6/P3K3/R7 w - - 0 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd1 | yes | 24.41 |
| N | Kf3 | yes | 23.47 |
| Played | Kf3 | yes | 23.47 |
| Referee best | Kf3 | yes | 25.93 |

### Example 3

Band 1500. Referee: stockfish.

FEN: `8/8/7k/P5pp/8/KP4R1/5rP1/8 w - - 0 37`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc3 | no | 71.36 |
| N | a6 | no | 50.00 |
| Played | b4 | yes | 82.17 |
| Referee best | b4 | yes | 81.35 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `8/2p2ppk/4p2p/4P3/R3p3/2P1P2P/P4PPK/2r5 w - - 3 27`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd4 | yes | 52.94 |
| N | Rc4 | yes | 54.32 |
| Played | Rc4 | yes | 54.32 |
| Referee best | Rc4 | yes | 55.68 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `8/6p1/6k1/5p2/P3rPP1/1P2PKP1/3R4/8 w - - 1 45`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc2 | no | 89.81 |
| N | gxf5+ | yes | 100.00 |
| Played | g5 | no | 90.68 |
| Referee best | gxf5+ | yes | 98.97 |

### Example 6

Band 1500. Referee: stockfish.

FEN: `3r2k1/p4pp1/7p/2Pp4/P2R4/5P2/5KPP/8 b - - 1 35`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re8 | no | 36.62 |
| N | Kf8 | yes | 39.04 |
| Played | Kh7 | no | 24.54 |
| Referee best | Kf8 | yes | 40.63 |

### Example 7

Band 1500. Referee: tablebase.

FEN: `8/3R4/6k1/8/P2p1K2/r4P2/8/8 w - - 3 39`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re7 | no | 50.00 |
| N | Rxd4 | yes | 100.00 |
| Played | Rxd4 | yes | 100.00 |
| Referee best | Rxd4 | yes | 100.00 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `8/8/5p2/1pRp4/p6k/P4r2/1PP3p1/1K6 b - - 1 46`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re3 | no | 96.70 |
| N | g1=Q+ | yes | 100.00 |
| Played | g1=Q+ | yes | 100.00 |
| Referee best | g1=Q+ | yes | 100.00 |

## outside-passer

Registered verdict: It misleads. Eligible held-out positions: 398.

### Example 1

Band 1500. Referee: stockfish.

FEN: `2r5/5k2/8/3p3p/pB6/P1P3K1/6p1/8 b - - 1 53`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxc3+ | no | 90.99 |
| N | g1=Q+ | yes | 100.00 |
| Played | g1=Q+ | yes | 100.00 |
| Referee best | g1=Q+ | yes | 100.00 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `6k1/5pp1/3Bp2p/1p6/rP2P1P1/5K1P/8/8 b - - 1 32`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxb4 | no | 34.93 |
| N | Ra3+ | yes | 86.91 |
| Played | f6 | yes | 86.65 |
| Referee best | Ra3+ | yes | 84.90 |

### Example 3

Band 1500. Referee: tablebase.

FEN: `8/p5p1/1p6/7k/7P/K7/2p5/8 b - - 0 56`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kxh4 | yes | 100.00 |
| N | c1=Q+ | yes | 100.00 |
| Played | c1=Q+ | yes | 100.00 |
| Referee best | Kxh4 | yes | 100.00 |

### Example 4

Band 1500. Referee: stockfish.

FEN: `8/1p3p2/4k1p1/7p/1P1RKP2/6PP/1r6/8 b - - 0 42`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxb4 | no | 7.64 |
| N | f5+ | no | 52.39 |
| Played | Rb3 | yes | 66.24 |
| Referee best | Rb3 | yes | 62.87 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `6k1/6b1/8/1pB5/1P3KP1/1r6/8/4N3 b - - 0 43`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxb4+ | no | 17.67 |
| N | Bc3 | no | 52.21 |
| Played | Bf8 | no | 50.37 |
| Referee best | Kf7 | yes | 55.77 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `5r2/3k2Kp/3P4/8/p7/3R3P/1p6/8 w - - 0 52`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Kxh7 | no | 0.00 |
| N | Kxf8 | yes | 10.33 |
| Played | Kxf8 | yes | 10.33 |
| Referee best | Kxf8 | yes | 11.28 |

### Example 7

Band 1500. Referee: tablebase.

FEN: `8/3P4/8/1pK5/3N4/P2kp3/8/8 w - - 1 64`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nxb5 | yes | 100.00 |
| N | d8=Q | yes | 100.00 |
| Played | d8=Q | yes | 100.00 |
| Referee best | Nxb5 | yes | 100.00 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `8/8/7k/p4R1P/r4P2/7K/1P6/8 w - - 0 47`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxa5 | no | 15.82 |
| N | Kg4 | yes | 53.31 |
| Played | Kg4 | yes | 53.31 |
| Referee best | Kg4 | yes | 55.05 |

## trade-when-ahead

Registered verdict: It misleads. Eligible held-out positions: 1518.

### Example 1

Band 1500. Referee: stockfish.

FEN: `2kr3r/pppqnp2/2np4/1B5p/4P1p1/5PBP/PP3P2/RN1QR1K1 w - - 0 15`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bxc6 | no | 67.22 |
| N | fxg4 | no | 67.70 |
| Played | fxg4 | no | 67.70 |
| Referee best | h4 | yes | 71.06 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `2B2k2/pp4pp/6nq/3Q4/3P3N/4P1P1/PP5P/6K1 w - - 1 24`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nxg6+ | no | 90.81 |
| N | Qd8+ | yes | 100.00 |
| Played | Qf5+ | yes | 100.00 |
| Referee best | Qd8+ | yes | 98.00 |

### Example 3

Band 1500. Referee: stockfish.

FEN: `r3k2r/p1pn1ppp/2p1p3/3p4/1P1Pb1P1/b1P2N1P/P3PPB1/R4RK1 b kq - 0 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bxf3 | yes | 82.97 |
| N | Bb2 | yes | 84.81 |
| Played | Bb2 | yes | 84.81 |
| Referee best | a5 | yes | 84.33 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `rn4n1/pp6/1kpq4/3p4/3PbPp1/4B3/PPP2K2/RN2QR1r b - - 6 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxf1+ | no | 83.83 |
| N | Rh2+ | yes | 100.00 |
| Played | Rh2+ | yes | 100.00 |
| Referee best | Rh2+ | yes | 100.00 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `1r2r1k1/p1n2pbp/2p1p1p1/2PpP3/3P1P2/P1N3q1/1B4Q1/1R3RK1 b - - 1 21`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Qxg2+ | yes | 73.78 |
| N | Qe3+ | yes | 74.70 |
| Played | Qe3+ | yes | 74.70 |
| Referee best | Qxg2+ | yes | 75.25 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `1nkr3r/Rpp2p2/3pqp1p/1P2p3/2Q1P2B/2PP1N2/5RPP/6K1 w - - 1 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Qxe6+ | yes | 87.24 |
| N | Qa4 | yes | 85.37 |
| Played | Qxe6+ | yes | 87.24 |
| Referee best | Qxe6+ | yes | 88.07 |

### Example 7

Band 1300. Referee: stockfish.

FEN: `3r4/pp3kb1/3p3p/4P1p1/4n3/P1NR1qBb/1PP4P/1K6 b - - 2 25`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nxc3+ | yes | 97.50 |
| N | Qf1+ | yes | 97.61 |
| Played | Nxc3+ | yes | 97.50 |
| Referee best | Qf1+ | yes | 97.27 |

### Example 8

Band 1300. Referee: stockfish.

FEN: `4r1k1/pppr1ppp/2p2q1n/2P2b2/4P3/2P2P1P/P2BQ1P1/RN2KB1R w KQ - 1 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bxh6 | no | 63.64 |
| N | g4 | yes | 77.51 |
| Played | g4 | yes | 77.51 |
| Referee best | g4 | yes | 79.07 |

## open-file

Registered verdict: It misleads. Eligible held-out positions: 3363.

### Example 1

Band 1500. Referee: stockfish.

FEN: `k4qr1/1p6/p1ppQ3/3nP3/5P2/4P3/PPP2KR1/RNB5 b - - 3 32`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rh8 | no | 13.69 |
| N | Rxg2+ | yes | 16.77 |
| Played | Rh8 | no | 13.69 |
| Referee best | Rxg2+ | yes | 17.61 |

### Example 2

Band 1500. Referee: stockfish.

FEN: `4rrk1/1p1q2pp/pB6/P2p1p2/1P2p3/2P3P1/3Q1P1P/3R1RK1 w - - 0 23`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rfe1 | no | 80.09 |
| N | Qxd5+ | yes | 84.66 |
| Played | Rfe1 | no | 80.09 |
| Referee best | Qxd5+ | yes | 83.93 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `r1bqr1k1/ppbn1ppp/2p2n2/2PpP3/7P/2NBPN2/PPQB1PP1/R3K2R b KQ - 0 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Qe7 | no | 22.11 |
| N | Nxe5 | yes | 58.12 |
| Played | Nxe5 | yes | 58.12 |
| Referee best | Nxe5 | yes | 58.92 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `r2qrk2/p1p2p2/1p1p2p1/2n5/3QP3/7R/P1PN1PPP/1R4K1 w - - 8 21`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd1 | no | 62.35 |
| N | Rh8+ | no | 54.77 |
| Played | Rh8+ | no | 54.77 |
| Referee best | Re1 | yes | 65.41 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `8/1pkr2p1/p1p4p/4b3/8/PP4PP/1P3P2/5RK1 w - - 1 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re1 | yes | 11.25 |
| N | Rb1 | yes | 12.24 |
| Played | Re1 | yes | 11.25 |
| Referee best | Rb1 | yes | 11.93 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `r4rk1/pbp2pp1/1p5p/8/1P3P1q/P1NP3P/2PB1b1R/R1Q2K2 b - - 2 18`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rfe8 | yes | 85.73 |
| N | Bg3 | no | 80.32 |
| Played | Bg3 | no | 80.32 |
| Referee best | Rae8 | yes | 85.23 |

### Example 7

Band 1500. Referee: stockfish.

FEN: `r1b2rk1/p3b1p1/1p1p3p/1PpPppqN/4P3/P2P1Q1P/5PP1/R4R1K w - - 0 21`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rac1 | yes | 12.89 |
| N | Ng3 | yes | 15.10 |
| Played | g3 | no | 9.01 |
| Referee best | Ng3 | yes | 13.22 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `8/8/1p6/2p5/3pk3/5r1p/P1K5/7R w - - 2 58`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re1+ | yes | 7.69 |
| N | Kd2 | yes | 8.01 |
| Played | Rd1 | yes | 7.11 |
| Referee best | Kd2 | yes | 8.83 |

## rook-on-the-seventh

Registered verdict: It misleads. Eligible held-out positions: 3169.

### Example 1

Band 1500. Referee: stockfish.

FEN: `6k1/1b4b1/p4p2/1p4nP/2p1Pq2/P1Q3N1/1P3PP1/3rR1K1 b - - 6 32`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd2 | yes | 86.18 |
| N | Rxe1+ | yes | 86.61 |
| Played | Rxe1+ | yes | 86.61 |
| Referee best | Rd3 | yes | 86.86 |

### Example 2

Band 1500. Referee: stockfish.

FEN: `8/1p2k3/6pp/5p2/1PR2P2/r1P2K1P/6P1/8 w - - 0 52`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc7+ | yes | 60.25 |
| N | g4 | yes | 64.74 |
| Played | Rc7+ | yes | 60.25 |
| Referee best | g4 | yes | 61.57 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `3r3k/p5p1/1p3p1P/8/8/P1p1KBR1/b1P2PP1/8 b - - 0 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rd2 | no | 26.43 |
| N | gxh6 | yes | 48.71 |
| Played | gxh6 | yes | 48.71 |
| Referee best | gxh6 | yes | 49.63 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `3q1rk1/2p2ppp/1p2p3/1R1pP3/r1n2B1P/2P3P1/4PPK1/5R2 b - - 0 21`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ra2 | yes | 91.96 |
| N | Qd7 | yes | 91.35 |
| Played | Ra2 | yes | 91.96 |
| Referee best | Ra2 | yes | 91.52 |

### Example 5

Band 1300. Referee: stockfish.

FEN: `7r/P4p1p/4p1p1/r7/2p3kP/6P1/P7/b3q1NK b - - 0 37`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rxa2 | yes | 100.00 |
| N | Rxa7 | yes | 100.00 |
| Played | Rxa7 | yes | 100.00 |
| Referee best | Bd4 | yes | 100.00 |

### Example 6

Band 1500. Referee: stockfish.

FEN: `5k2/ppK1N1pp/8/Nb6/3r4/7P/P3r1P1/8 b - - 7 35`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rdd2 | no | 95.11 |
| N | Rxe7+ | yes | 100.00 |
| Played | Rxe7+ | yes | 100.00 |
| Referee best | Rxe7+ | yes | 100.00 |

### Example 7

Band 1300. Referee: stockfish.

FEN: `5r2/Bp6/6RP/8/8/1P1K1p2/P1P4k/2b5 w - - 1 37`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rg7 | no | 63.30 |
| N | h7 | yes | 86.91 |
| Played | h7 | yes | 86.91 |
| Referee best | h7 | yes | 86.95 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `r3k3/pp3p2/2pp1pr1/4p3/2P1P3/1nP1Q2P/1qN1NP2/3RK2R b q - 9 24`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rg2 | no | 36.36 |
| N | Qxc2 | yes | 69.45 |
| Played | Qxc2 | yes | 69.45 |
| Referee best | Qxc2 | yes | 69.13 |

## outpost

Registered verdict: It misleads. Eligible held-out positions: 3012.

### Example 1

Band 1500. Referee: stockfish.

FEN: `r3k1nr/2q2ppp/4p3/p2pn3/P7/NQP2N2/5PPP/R4RK1 w kq - 0 15`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nb5 | no | 38.00 |
| N | Nxe5 | yes | 59.37 |
| Played | Nxe5 | yes | 59.37 |
| Referee best | Nxe5 | yes | 57.67 |

### Example 2

Band 1500. Referee: stockfish.

FEN: `1r4k1/NpN2p1p/6p1/2p1b2b/P4P2/6P1/1r5P/6K1 w - - 0 28`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nab5 | yes | 0.00 |
| N | fxe5 | yes | 0.00 |
| Played | fxe5 | yes | 0.00 |
| Referee best | Nd5 | yes | 0.00 |

### Example 3

Band 1500. Referee: stockfish.

FEN: `r3q1k1/pp4p1/2p1p1rp/6bR/3P2NQ/3R4/PP4PP/6K1 w - - 8 32`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ne5 | no | 13.35 |
| N | Qh3 | no | 34.09 |
| Played | Qh3 | no | 34.09 |
| Referee best | Qe1 | yes | 39.39 |

### Example 4

Band 1500. Referee: stockfish.

FEN: `r4rk1/n4p1p/5qp1/1p1Q1p2/pP1n4/P1RB3R/5PPP/2B3K1 b - - 0 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nb3 | no | 48.90 |
| N | Rad8 | yes | 79.49 |
| Played | Rad8 | yes | 79.49 |
| Referee best | Rad8 | yes | 79.37 |

### Example 5

Band 1300. Referee: stockfish.

FEN: `3r1r2/p1q1k3/2p2n2/1p3pp1/3PP2p/P1P1P3/3NQ1PP/R4RK1 b - - 0 25`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nxe4 | yes | 28.41 |
| N | fxe4 | yes | 31.98 |
| Played | Ng4 | no | 26.94 |
| Referee best | fxe4 | yes | 31.26 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `2kr4/5p2/1n1p3p/p1pP1P2/PpP1P3/1P6/N3K3/1B1Rb1r1 b - - 3 32`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bc3 | no | 59.64 |
| N | Rdg8 | yes | 91.49 |
| Played | Bf2 | yes | 87.84 |
| Referee best | Rdg8 | yes | 88.42 |

### Example 7

Band 1500. Referee: stockfish.

FEN: `4r1k1/p4p2/2p2n2/1pNp2pp/6P1/3P1P1P/PPPb1KN1/R7 b - - 1 23`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bf4 | no | 35.60 |
| N | hxg4 | yes | 47.42 |
| Played | Be3+ | no | 16.32 |
| Referee best | Ba5 | yes | 48.80 |

### Example 8

Band 1300. Referee: stockfish.

FEN: `r1bq1rk1/pp2bpp1/3p1n1p/2p5/2BQP3/1P6/PBPN1PPP/R4RK1 w - - 0 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Bd5 | no | 11.14 |
| N | Qe3 | no | 56.50 |
| Played | Qc3 | yes | 57.13 |
| Referee best | Qd3 | yes | 59.72 |

## pawn-break

Registered verdict: It misleads. Eligible held-out positions: 3779.

### Example 1

Band 1300. Referee: stockfish.

FEN: `r2q1rk1/1bppbppp/p4n2/3P2B1/2p5/2N2N2/PPP1QPPP/R3R1K1 b - - 5 12`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | c6 | no | 14.96 |
| N | Re8 | yes | 36.36 |
| Played | Re8 | yes | 36.36 |
| Referee best | h6 | yes | 38.08 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `r2qkb1r/ppp2ppp/3p1n2/8/4P3/3P1Q2/PPP2PPP/RNB1K2R b KQkq - 0 9`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | d5 | yes | 34.51 |
| N | Be7 | yes | 35.94 |
| Played | Qe7 | no | 29.78 |
| Referee best | Be7 | yes | 35.43 |

### Example 3

Band 1500. Referee: stockfish.

FEN: `rn3rk1/ppp2ppp/5q2/3p4/5NnP/PPP1P3/2P5/R1BQK2R w KQ - 2 15`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | c4 | no | 17.45 |
| N | Qxg4 | no | 25.03 |
| Played | Qd3 | no | 20.87 |
| Referee best | Bd2 | yes | 38.17 |

### Example 4

Band 1300. Referee: stockfish.

FEN: `rk1q3r/pp3Q1p/2p2p2/2Pppb2/5b2/5N2/PPP2PPP/R4RK1 w - - 0 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | c4 | yes | 18.32 |
| N | Nh4 | yes | 16.88 |
| Played | Rfe1 | yes | 16.47 |
| Referee best | c4 | yes | 18.32 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `r3k2r/2pq2p1/p2p1b2/1p2pP1p/3nP3/1BN4P/PPP3P1/R2Q1RK1 w kq - 0 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | a4 | yes | 59.19 |
| N | Nd5 | yes | 58.12 |
| Played | Nd5 | yes | 58.12 |
| Referee best | a4 | yes | 57.76 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `1rb1kbnr/pp4pp/4p3/1Np1P3/4p3/8/PPP2PPP/RNB1K2R w KQk - 0 10`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | f3 | no | 50.92 |
| N | Nxa7 | yes | 62.18 |
| Played | N1c3 | no | 57.58 |
| Referee best | Be3 | yes | 61.22 |

### Example 7

Band 1300. Referee: stockfish.

FEN: `1k1r1b1r/pb3ppp/1p1np3/4N3/1qPP4/4P1P1/1B3PBP/R2QR1K1 w - - 3 19`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | d5 | no | 61.74 |
| N | Bxb7 | yes | 88.34 |
| Played | Bxb7 | yes | 88.34 |
| Referee best | Bxb7 | yes | 88.34 |

### Example 8

Band 1300. Referee: stockfish.

FEN: `8/pkp2PR1/2n1N2B/1p6/8/2P3b1/PP6/3K4 b - - 1 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | b4 | no | 1.33 |
| N | Bd6 | yes | 5.43 |
| Played | Bd6 | yes | 5.43 |
| Referee best | Bd6 | yes | 7.64 |

## passed-pawn

Registered verdict: It misleads. Eligible held-out positions: 3061.

### Example 1

Band 1500. Referee: stockfish.

FEN: `3Q4/6q1/3p1bk1/3P4/4n1N1/1P6/P1n3PP/5R1K w - - 2 38`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | h4 | no | 3.26 |
| N | Qe8+ | yes | 100.00 |
| Played | Qe8+ | yes | 100.00 |
| Referee best | Qe8+ | yes | 98.45 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `2kr2r1/1p6/p7/2p1p3/2P3qb/P2PB2R/3Q2P1/R5K1 w - - 3 24`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | g3 | no | 5.21 |
| N | Bxc5 | no | 10.92 |
| Played | Bxc5 | no | 10.92 |
| Referee best | Rh2 | yes | 30.01 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `2Q2b1r/p5pk/7p/4p3/8/N1P5/PPqP1P1R/R1B3K1 b - - 4 23`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | h5 | no | 2.59 |
| N | Qd1+ | yes | 12.36 |
| Played | Qd1+ | yes | 12.36 |
| Referee best | Bxa3 | yes | 13.39 |

### Example 4

Band 1500. Referee: stockfish.

FEN: `rn3rk1/pp3ppp/8/3q4/1P6/8/P6P/RK3BNR b - - 0 23`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | f5 | no | 95.77 |
| N | Qxh1 | yes | 97.15 |
| Played | Nc6 | no | 96.59 |
| Referee best | Rc8 | yes | 100.00 |

### Example 5

Band 1500. Referee: stockfish.

FEN: `3r3k/1R6/3bQpPp/p1p3r1/P1P5/8/6PP/5R1K w - - 5 33`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | g7+ | yes | 100.00 |
| N | Qxf6+ | yes | 100.00 |
| Played | Qxf6+ | yes | 100.00 |
| Referee best | Rh7# | yes | 100.00 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `5rk1/p4ppp/4b3/8/4Q2R/1r6/q4PPP/5RK1 b - - 1 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | a5 | no | 0.00 |
| N | g6 | yes | 84.37 |
| Played | Qb2 | no | 0.00 |
| Referee best | g6 | yes | 82.76 |

### Example 7

Band 1500. Referee: stockfish.

FEN: `r3kb1r/pb3p1p/4p1p1/2PpP3/1n1P4/2N5/P3NPPP/2KR1B1R w kq - 2 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | c6 | no | 38.34 |
| N | a3 | yes | 61.39 |
| Played | Kb1 | no | 56.23 |
| Referee best | a3 | yes | 60.34 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `rn2kbnr/p5pp/2qPpp2/1p2P3/2p3b1/2N2NP1/1P3PBP/R1BQK1R1 w Qkq - 0 14`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | d7+ | no | 60.96 |
| N | h3 | yes | 83.98 |
| Played | h3 | yes | 83.98 |
| Referee best | h3 | yes | 84.08 |

## worst-piece

Registered verdict: It misleads. Eligible held-out positions: 3561.

### Example 1

Band 1500. Referee: tablebase.

FEN: `8/8/4k3/8/3K4/1P6/P1R5/8 w - - 7 52`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rc5 | yes | 100.00 |
| N | b4 | yes | 100.00 |
| Played | Rc5 | yes | 100.00 |
| Referee best | b4 | yes | 100.00 |

### Example 2

Band 1300. Referee: stockfish.

FEN: `2kr3r/pp1n1ppp/2pbbq2/1P1np2P/8/P1N1PN2/2QP1PP1/R1B1KB1R b KQ - 0 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rde8 | no | 28.19 |
| N | c5 | no | 45.78 |
| Played | cxb5 | no | 15.72 |
| Referee best | Nxc3 | yes | 50.00 |

### Example 3

Band 1300. Referee: stockfish.

FEN: `4r3/2k5/8/2PKp3/4Rp2/6pP/6P1/8 b - - 4 46`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rf8 | no | 49.91 |
| N | f3 | no | 50.00 |
| Played | Rd8+ | yes | 78.39 |
| Referee best | Rd8+ | yes | 69.13 |

### Example 4

Band 1500. Referee: stockfish.

FEN: `r3kb1r/6pb/p2qpp1p/1p1p3P/6P1/1PN5/1PP2P2/R1BQK2R b KQkq - 0 18`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Be7 | yes | 72.99 |
| N | Qe5+ | no | 71.36 |
| Played | Qe5+ | no | 71.36 |
| Referee best | Qc6 | yes | 74.91 |

### Example 5

Band 1300. Referee: stockfish.

FEN: `r3r1k1/pp1q1ppp/5n2/3p4/1P4b1/P3PN2/2Q1BPPP/R4RK1 b - - 7 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Ne4 | yes | 46.78 |
| N | Rac8 | yes | 46.97 |
| Played | Rac8 | yes | 46.97 |
| Referee best | Rac8 | yes | 46.05 |

### Example 6

Band 1300. Referee: stockfish.

FEN: `2r1k2r/1b3pbp/1q3np1/4p3/1BP1P3/5N2/P1BN1PPP/R2Q1RK1 w k - 1 19`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Re1 | no | 74.77 |
| N | Ba4+ | yes | 89.19 |
| Played | Rb1 | yes | 89.47 |
| Referee best | Ba4+ | yes | 89.54 |

### Example 7

Band 1500. Referee: stockfish.

FEN: `r4rk1/1b1p1ppp/pq2p3/1p2n3/4PN2/2P1P3/PPB3PP/R2Q1RK1 b - - 3 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Rfc8 | no | 59.19 |
| N | Qxe3+ | yes | 72.85 |
| Played | Qxe3+ | yes | 72.85 |
| Referee best | Qxe3+ | yes | 74.00 |

### Example 8

Band 1500. Referee: stockfish.

FEN: `r3n1k1/2p3pp/4qp2/4p3/1Q4P1/3P3P/1PP2P2/2K1R3 b - - 0 26`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| R | Nd6 | yes | 81.63 |
| N | Ra1+ | yes | 81.63 |
| Played | Ra1+ | yes | 81.63 |
| Referee best | Qc6 | yes | 80.84 |

