# Model 1: Graded-opponent scorer

The scorer uses Stockfish MultiPV for objective cost and Maia2 for the probability that the best refutation is found. Probabilities are evaluated at the target band and at a hypothetical opponent 200 Elo stronger.

## Maia2 move-match smoke test

| Band | N | Top-1 move match |
|---|---:|---:|
| 1100-1400 | 500 | 47.0% |
| 1400-1700 | 500 | 44.6% |
| 1700-2000 | 500 | 49.6% |
| 2000+ | 500 | 51.4% |
| <1100 | 500 | 47.0% |
| **Overall** | **2,500** | **47.9%** |

These 2,500 positions come only from held-out games in a capped, band-balanced smoke test on cpu. It is not a training-independent benchmark because April 2019 may overlap Maia2 training data.
The nominal ≥50% smoke expectation is **not met** overall; band non-monotonicity is retained rather than smoothed away.

## Three sample games

| Game | Ply | Move | Objective cost | Punishing reply | At band | At +200 |
|---|---:|---|---:|---|---:|---:|
| BandPlayer–PeerOpponent | 12 | g6 | 15.6 Win% | `e4e5` | 3.8% | 5.3% |
| BandPlayer–PeerOpponent | 14 | Nd5 | 21.7 Win% | `c1g5` | 27.7% | 24.5% |
| BandPlayer–PeerOpponent | 15 | Ne4 | 10.4 Win% | `f8g7` | 85.7% | 87.6% |
| Beginner–Improver | 7 | Ng4 | 10.3 Win% | `h7h5` | 16.8% | 28.5% |
| Beginner–Improver | 11 | dxe5 | 12.2 Win% | `c8g4` | 32.5% | 57.4% |
| Improver–ClubPlayer | 6 | Nf6 | 51.5 Win% | `h5f7` | 92.7% | 89.8% |

A large objective cost with low punishment probability is the product's “bad but likely unpunished here” case. High probability at both levels is immediately coachable.

## Limitations

- The punishing reply is Stockfish's top reply at the configured short time budget.
- Maia2 ratings are Lichess Glicko-2; no chess.com conversion is claimed.
- Tactical mate positions can saturate the win-probability formula.
