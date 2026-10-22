# Held-out tie-break examples

App `ffee8dbb166f77dcc75721b6cca28d37703f4515`. Lichess positions, 2026-09, CC0.

48 examples: six for each of the eight units, including the reference and control. The draw is independent of verdicts and control success. Each candidate has exactly one sound move of F and B.

Win% is the app's conversion for the mover. Tablebase win% converts an outcome; it is not a human probability. The played move was not scored and is shown in SAN only. The best is the referee's first exact line or the saved tablebase's best move.

| Unit | Examples | Stockfish | Tablebase | Follow first | Break first | F sound | B sound |
|---|---:|---:|---:|---:|---:|---:|---:|
| tension | 6 | 6 | 0 | 1 | 5 | 2 | 4 |
| trades-ahead | 6 | 6 | 0 | 2 | 4 | 1 | 5 |
| trades-behind | 6 | 6 | 0 | 5 | 1 | 4 | 2 |
| bishop-for-knight | 6 | 6 | 0 | 3 | 3 | 3 | 3 |
| knight-for-bishop | 6 | 6 | 0 | 2 | 4 | 2 | 4 |
| bishop-colour | 6 | 6 | 0 | 2 | 4 | 4 | 2 |
| trades-level | 6 | 6 | 0 | 0 | 6 | 1 | 5 |
| hang | 6 | 6 | 0 | 4 | 2 | 6 | 0 |

## tension

1455 one-sound candidates among 3000 held-out positions.

### Example 1

Band 1500; break-first; stockfish.

FEN: `rnb1kbnr/pp3ppp/2pp1q2/4p3/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 5`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bg5 | yes | 67.62 |
| B | dxe5 | no | 65.57 |
| Played | dxe5 | not scored | — |
| Referee best | Bg5 | — | — |

### Example 2

Band 1500; follow-first; stockfish.

FEN: `r2qkb1r/ppp1ppp1/2n2n1p/3p1b2/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQkq - 3 6`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | a3 | no | 52.94 |
| B | cxd5 | yes | 61.74 |
| Played | h3 | not scored | — |
| Referee best | cxd5 | — | — |

### Example 3

Band 1300; break-first; stockfish.

FEN: `2kr3r/1p1qb3/p2p3p/2p1ppp1/2P1P3/P2PBN1P/1P3PP1/R2Q1RK1 w - - 0 15`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | b4 | no | 69.60 |
| B | exf5 | yes | 78.89 |
| Played | exf5 | not scored | — |
| Referee best | exf5 | — | — |

### Example 4

Band 1500; break-first; stockfish.

FEN: `r1bq1rk1/ppp1b1pp/3pp3/4Pp2/5P2/2PBP1P1/PP4P1/RN1QK2R b KQ - 0 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | b6 | no | 51.20 |
| B | dxe5 | yes | 57.94 |
| Played | dxe5 | not scored | — |
| Referee best | dxe5 | — | — |

### Example 5

Band 1500; break-first; stockfish.

FEN: `1r4k1/4Rp2/7p/pp3bp1/5P2/P1r3P1/6BP/R5K1 w - - 1 28`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bd5 | yes | 44.05 |
| B | fxg5 | no | 40.45 |
| Played | fxg5 | not scored | — |
| Referee best | Bd5 | — | — |

### Example 6

Band 1300; break-first; stockfish.

FEN: `r2q1rk1/p3bppp/1p2p3/2ppP3/Q1PPnN2/4P3/PP4PP/R1B2RK1 w - - 0 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Qc2 | no | 45.41 |
| B | cxd5 | yes | 55.68 |
| Played | cxd5 | not scored | — |
| Referee best | cxd5 | — | — |


## trades-ahead

673 one-sound candidates among 1196 held-out positions.

### Example 1

Band 1500; break-first; stockfish.

FEN: `r1b1k2r/ppp1npp1/2np1q1p/4p3/2BbP3/2NPBN1P/PPP2PP1/R2Q1RK1 w kq - 1 9`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nd5 | no | 52.30 |
| B | Bxd4 | yes | 54.59 |
| Played | Nh2 | not scored | — |
| Referee best | Nb5 | — | — |

### Example 2

Band 1500; break-first; stockfish.

FEN: `r2q1rk1/p1p3pp/bpn1pp2/8/P1NP4/1P2P3/5PPP/R2QKB1R b - - 2 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nb4 | yes | 58.12 |
| B | Bxc4 | no | 49.82 |
| Played | Bxc4 | not scored | — |
| Referee best | Qe7 | — | — |

### Example 3

Band 1500; break-first; stockfish.

FEN: `1nbqk2r/r3bppp/p2p4/1ppQ2B1/4P3/2N2N2/PPP2PPP/R3K2R w KQk - 1 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | O-O | no | 49.63 |
| B | Bxe7 | yes | 55.32 |
| Played | O-O | not scored | — |
| Referee best | Bxe7 | — | — |

### Example 4

Band 1500; follow-first; stockfish.

FEN: `rnb1k2r/pp2qppp/2pp3n/2b1p3/2B1N2N/3P2PP/PPP2P1K/R1BQ1R2 w kq - 2 14`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bg5 | no | 66.40 |
| B | Bxh6 | yes | 69.53 |
| Played | Qf3 | not scored | — |
| Referee best | Bxh6 | — | — |

### Example 5

Band 1300; follow-first; stockfish.

FEN: `rnb1k2r/pp3ppp/1bpp1q2/8/3NP1n1/2N1B3/PPPQBPPP/R3K2R w KQkq - 4 10`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | O-O-O | no | 52.48 |
| B | Bxg4 | yes | 63.89 |
| Played | O-O-O | not scored | — |
| Referee best | Bxg4 | — | — |

### Example 6

Band 1500; break-first; stockfish.

FEN: `rn2kb1r/pp2pp1p/2p2np1/8/2BPb3/5NN1/PP1B1PPP/2R2RK1 w kq - 2 12`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Ne5 | no | 41.34 |
| B | Nxe4 | yes | 55.59 |
| Played | Nxe4 | not scored | — |
| Referee best | Bxf7+ | — | — |


## trades-behind

1313 one-sound candidates among 2383 held-out positions.

### Example 1

Band 1500; follow-first; stockfish.

FEN: `r2q1rk1/3pnpb1/bp2p1p1/p3n1Np/4P3/2P3Q1/PP1N1PPP/R1B1KB1R w KQ - 2 14`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bxa6 | yes | 51.84 |
| B | Ndf3 | no | 39.39 |
| Played | Bxa6 | not scored | — |
| Referee best | Bxa6 | — | — |

### Example 2

Band 1500; follow-first; stockfish.

FEN: `r2qkbnr/pp3ppp/2n1p3/2ppP3/3P2b1/2N2N2/PPP1BPPP/R1BQ1RK1 b kq - 2 7`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bxf3 | yes | 59.99 |
| B | Qb6 | no | 45.96 |
| Played | Nge7 | not scored | — |
| Referee best | Bxf3 | — | — |

### Example 3

Band 1300; follow-first; stockfish.

FEN: `rnbqkbnr/pp3ppp/8/2p1p3/2BpP3/1P3P1N/PBPP2PP/RN1QK2R b KQkq - 1 6`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bxh3 | yes | 62.44 |
| B | h6 | no | 54.50 |
| Played | Nc6 | not scored | — |
| Referee best | Bxh3 | — | — |

### Example 4

Band 1500; follow-first; stockfish.

FEN: `rnbqkb1r/1p3pp1/p2p1n1p/3Np3/4P3/3B1N2/PPP2PPP/R1BQK2R b KQkq - 1 8`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxd5 | yes | 54.22 |
| B | Be6 | no | 45.05 |
| Played | Be6 | not scored | — |
| Referee best | Nxd5 | — | — |

### Example 5

Band 1300; follow-first; stockfish.

FEN: `r1q2rk1/p2n1pbp/b1p1p1p1/1pPp1nP1/1B1P4/1P3N1B/P2QPP1P/RN2K2R w KQ - 6 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bxf5 | no | 50.28 |
| B | Nc3 | yes | 55.77 |
| Played | Bxf5 | not scored | — |
| Referee best | Nc3 | — | — |

### Example 6

Band 1500; break-first; stockfish.

FEN: `rn2kbnr/ppp1pppp/2b1q3/8/8/2N2N2/PPPPBPPP/R1BQ1RK1 b kq - 7 6`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bxf3 | no | 33.35 |
| B | Nd7 | yes | 36.19 |
| Played | Bxf3 | not scored | — |
| Referee best | Nf6 | — | — |


## bishop-for-knight

1579 one-sound candidates among 3000 held-out positions.

### Example 1

Band 1300; break-first; stockfish.

FEN: `rnbqkb1r/pp3ppp/2p1p2n/3pP3/3P4/5N2/PPP2PPP/RNBQKB1R w KQkq - 1 5`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | h3 | no | 54.95 |
| B | Bxh6 | yes | 57.13 |
| Played | Bxh6 | not scored | — |
| Referee best | Bxh6 | — | — |

### Example 2

Band 1300; break-first; stockfish.

FEN: `2kr1bnr/ppp3pp/5p2/5b2/3PN3/2P1pPB1/PP4PP/R2K1B1R b - - 1 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | c5 | yes | 40.81 |
| B | Bxe4 | no | 37.82 |
| Played | c5 | not scored | — |
| Referee best | Ne7 | — | — |

### Example 3

Band 1300; follow-first; stockfish.

FEN: `r2q1rk1/ppp1nppp/3b4/3P1n2/5p2/2NB3P/PPP2QP1/2KRR3 w - - 5 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | g4 | no | 12.52 |
| B | Bxf5 | yes | 14.54 |
| Played | g4 | not scored | — |
| Referee best | Nb5 | — | — |

### Example 4

Band 1500; break-first; stockfish.

FEN: `rnbq1rk1/ppppnppp/1b6/1P2p3/Q7/B1P5/P2PPPPP/RN2KBNR w KQ - 1 6`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | e3 | yes | 42.69 |
| B | Bxe7 | no | 35.35 |
| Played | c4 | not scored | — |
| Referee best | Nf3 | — | — |

### Example 5

Band 1500; follow-first; stockfish.

FEN: `2k5/ppp1q2p/3b4/4nb2/5B2/2P5/PP4PP/RN1BR2K w - - 1 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nd2 | yes | 55.59 |
| B | Bxe5 | no | 52.39 |
| Played | Nd2 | not scored | — |
| Referee best | Nd2 | — | — |

### Example 6

Band 1500; follow-first; stockfish.

FEN: `1k1r3r/1p1q1p2/1Q1p1nb1/1n2pN2/pP2P1P1/P2P3P/1B2BP2/R3K2R b KQ - 1 24`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Rc8 | no | 23.87 |
| B | Bxf5 | yes | 40.99 |
| Played | Rc8 | not scored | — |
| Referee best | Bxf5 | — | — |


## knight-for-bishop

1597 one-sound candidates among 3000 held-out positions.

### Example 1

Band 1500; break-first; stockfish.

FEN: `r2qkb1r/1p2p1pp/p1p2p1n/5b2/2pP4/2NnPN2/PP1Q1PPP/R1BR2K1 b kq - 1 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxc1 | no | 77.25 |
| B | e6 | yes | 79.97 |
| Played | Qc7 | not scored | — |
| Referee best | e5 | — | — |

### Example 2

Band 1500; follow-first; stockfish.

FEN: `r1bnr1k1/ppp2ppp/3b4/8/2N5/3B4/PPP2PPP/R1B2RK1 w - - 2 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxd6 | yes | 56.68 |
| B | Be3 | no | 50.46 |
| Played | Nxd6 | not scored | — |
| Referee best | Nxd6 | — | — |

### Example 3

Band 1300; break-first; stockfish.

FEN: `2r3k1/p4ppp/4p1n1/4Pb2/2pN4/6BP/5PP1/2R3K1 w - - 2 28`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxf5 | no | 22.05 |
| B | Nb5 | yes | 23.80 |
| Played | Nb5 | not scored | — |
| Referee best | Nxf5 | — | — |

### Example 4

Band 1300; break-first; stockfish.

FEN: `r5k1/5ppp/4pn2/1pNpN3/2bP1P2/2P5/1P3PPP/4K2R w K - 7 22`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxc4 | no | 32.95 |
| B | Kd2 | yes | 60.43 |
| Played | Kd2 | not scored | — |
| Referee best | Kd2 | — | — |

### Example 5

Band 1500; follow-first; stockfish.

FEN: `r2q1rk1/p1p2ppp/2pbp3/3p4/3Pn3/4P1B1/PPPN1PPP/R2Q1RK1 b - - 1 11`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxg3 | yes | 49.45 |
| B | f5 | no | 47.06 |
| Played | Nxg3 | not scored | — |
| Referee best | Nxg3 | — | — |

### Example 6

Band 1500; break-first; stockfish.

FEN: `r1b1k2r/ppqp1p2/3bp2p/4np2/1P1p1B2/P2B3N/2P1QPPP/RN3RK1 b kq - 2 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nxd3 | no | 27.74 |
| B | b6 | yes | 31.82 |
| Played | Ng4 | not scored | — |
| Referee best | Rg8 | — | — |


## bishop-colour

1262 one-sound candidates among 3000 held-out positions.

### Example 1

Band 1300; break-first; stockfish.

FEN: `5rk1/2Bbnppp/p3p3/8/1bPP4/1P4N1/P3KP1P/R2R4 w - - 6 21`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | d5 | no | 65.57 |
| B | a3 | yes | 78.46 |
| Played | c5 | not scored | — |
| Referee best | Ne4 | — | — |

### Example 2

Band 1300; break-first; stockfish.

FEN: `r1b1nrk1/pp1p1pp1/2q1p2p/2p5/2P1N3/2PP3P/P4PP1/RN1Q1RK1 b - - 2 14`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | b6 | yes | 68.82 |
| B | d5 | no | 64.15 |
| Played | b6 | not scored | — |
| Referee best | b6 | — | — |

### Example 3

Band 1300; follow-first; stockfish.

FEN: `1kr2b1r/1pp1p1p1/5n1p/Q7/2R5/8/PP3PPP/5RK1 b - - 3 20`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | e6 | yes | 12.24 |
| B | b6 | no | 0.00 |
| Played | e5 | not scored | — |
| Referee best | e6 | — | — |

### Example 4

Band 1500; break-first; stockfish.

FEN: `r4k1r/1p1n2pp/p3b3/2ppp3/8/1PNB1P2/P1P3PP/4RRK1 b - - 0 20`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | d4 | no | 54.41 |
| B | b5 | yes | 62.44 |
| Played | b5 | not scored | — |
| Referee best | b5 | — | — |

### Example 5

Band 1300; follow-first; stockfish.

FEN: `r2q1rk1/2p2pp1/bp3n1p/p3p3/1n1pP3/1P1P2NP/P1PNBPP1/R1Q2RK1 b - - 5 14`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | c5 | yes | 52.21 |
| B | b5 | no | 47.79 |
| Played | Qd7 | not scored | — |
| Referee best | Re8 | — | — |

### Example 6

Band 1300; break-first; stockfish.

FEN: `rn3rk1/1b2q1pp/2p1p3/1p1pP2B/pP2p3/P3P2R/1BPQ1PP1/1K5R b - - 1 20`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | h6 | yes | 33.85 |
| B | g6 | no | 20.75 |
| Played | h6 | not scored | — |
| Referee best | c5 | — | — |


## trades-level

1623 one-sound candidates among 3000 held-out positions.

### Example 1

Band 1300; break-first; stockfish.

FEN: `r2q1rk1/1pp1bpp1/p1npbn1p/3N4/1P2P3/P2QBN2/2P1BPPP/R4RK1 b - - 8 13`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Ne5 | no | 26.36 |
| B | Bxd5 | yes | 44.14 |
| Played | Ne5 | not scored | — |
| Referee best | Ng4 | — | — |

### Example 2

Band 1500; break-first; stockfish.

FEN: `r2q1rk1/pp3pp1/2n2bbp/8/3Np3/1BP1B2P/PP3PP1/R2QR1K1 w - - 2 17`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Qg4 | no | 43.77 |
| B | Nxc6 | yes | 57.04 |
| Played | Nxc6 | not scored | — |
| Referee best | Nxc6 | — | — |

### Example 3

Band 1500; break-first; stockfish.

FEN: `r3nrk1/2p1qpp1/b1p1p2p/p7/3P2Q1/2NB4/PPP2PPP/R4RK1 w - - 2 15`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Qe4 | no | 49.26 |
| B | Bxa6 | yes | 54.86 |
| Played | Bxa6 | not scored | — |
| Referee best | Bxa6 | — | — |

### Example 4

Band 1300; break-first; stockfish.

FEN: `r1bq1rk1/ppp2ppp/1bnp4/3Np3/1P2P1n1/P1PP1N2/3BBPPP/R2Q1RK1 w - - 1 12`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | a4 | yes | 62.95 |
| B | Nxb6 | no | 56.68 |
| Played | Nxb6 | not scored | — |
| Referee best | h3 | — | — |

### Example 5

Band 1300; break-first; stockfish.

FEN: `6k1/p3rpp1/B1P2n1p/3r4/4qP2/4p2P/P5PQ/3RR1K1 b - - 0 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | e2 | no | 62.78 |
| B | Rxd1 | yes | 84.08 |
| Played | Rxd1 | not scored | — |
| Referee best | Rxd1 | — | — |

### Example 6

Band 1300; break-first; stockfish.

FEN: `r1bqk2r/pppp1ppp/2n2n2/8/1bPN4/2N5/PP2PPPP/R1BQKB1R w KQkq - 1 6`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bd2 | no | 21.54 |
| B | Nxc6 | yes | 50.74 |
| Played | Nxc6 | not scored | — |
| Referee best | g3 | — | — |


## hang

714 one-sound candidates among 1260 held-out positions.

### Example 1

Band 1300; break-first; stockfish.

FEN: `r2q1rk1/2p2pp1/p1n4p/8/1pP1Pbb1/1P3N2/PB1NQPPP/R2R2K1 b - - 5 18`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Qe7 | yes | 46.23 |
| B | Nd4 | no | 17.19 |
| Played | Qc8 | not scored | — |
| Referee best | Qe7 | — | — |

### Example 2

Band 1500; follow-first; stockfish.

FEN: `r2qr1k1/pp1b2bp/3p2p1/3Pp3/4n3/2P1BN1P/PP3PP1/RN2RK2 w - - 6 16`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Nbd2 | yes | 12.85 |
| B | Bg5 | no | 5.88 |
| Played | Nbd2 | not scored | — |
| Referee best | Kg1 | — | — |

### Example 3

Band 1300; break-first; stockfish.

FEN: `8/2Q2ppk/p4q1p/8/b2NR2P/2P5/1P3PP1/6K1 b - - 4 30`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Qg6 | yes | 8.45 |
| B | Bc2 | no | 6.41 |
| Played | Qg6 | not scored | — |
| Referee best | Bb5 | — | — |

### Example 4

Band 1300; follow-first; stockfish.

FEN: `r4rk1/p3b1pp/2Nq4/1P1n4/p7/4PP2/P2P2PP/1RB2RK1 b - - 0 24`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Bd8 | yes | 85.37 |
| B | Nb4 | no | 83.23 |
| Played | a6 | not scored | — |
| Referee best | Bf6 | — | — |

### Example 5

Band 1300; follow-first; stockfish.

FEN: `3r1rk1/1p1q1pp1/p6p/2Q5/8/1P2B3/P4PPP/R3R1K1 w - - 0 25`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | h3 | yes | 83.88 |
| B | Rad1 | no | 20.75 |
| Played | Qc4 | not scored | — |
| Referee best | Qh5 | — | — |

### Example 6

Band 1300; follow-first; stockfish.

FEN: `3k4/1pp2p2/p6P/8/4bN2/1P2P1r1/P2P4/2R1KR2 b - - 2 28`

| Move | SAN | Sound | Win% |
|---|---|---|---:|
| F | Rg8 | yes | 10.78 |
| B | Rh3 | no | 3.07 |
| Played | Rg4 | not scored | — |
| Referee best | c6 | — | — |

