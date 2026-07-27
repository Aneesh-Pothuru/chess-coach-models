# Repertoire recommendations: <1100

Source: Lichess 2019-04; strict minimum N = 2,000.
Findability is the geometric mean of Maia2 probabilities for the target player's moves.

## White systems

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| e4 e5 Nf3 | Scotch Game | 50.9% | 49.5–52.2% | 5,326 | 18.7% | 46.5% | 6.4% |
| e4 | Scandinavian Defense | 49.0% | 48.3–49.7% | 18,145 | 63.6% | 46.0% | 3.4% |
| d4 | Queen's Pawn Game: Chigorin Variation | 48.8% | 47.5–50.0% | 6,099 | 21.4% | 37.0% | 6.3% |

## Black defenses vs 1.e4

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| e4 e5 | King's Pawn Game: Wayward Queen Attack | 44.2% | 43.3–45.2% | 10,284 | 35.9% | 49.0% | 5.0% |
| e4 d5 | Scandinavian Defense | 44.4% | 42.3–46.5% | 2,165 | 7.6% | 52.3% | 4.3% |
| e4 e5 Nf3 Nc6 | Scotch Game | 44.1% | 42.3–46.0% | 2,705 | 9.4% | 39.1% | 8.7% |

## Black defenses vs 1.d4

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| d4 d5 | Queen's Pawn Game: Mason Attack | 43.9% | 42.2–45.6% | 3,327 | 11.6% | 38.9% | 10.1% |

Trap density is the fraction of eval-annotated games with a >20 Win% swing after the node and by ply 15.

<!-- FINDINGS_START -->

## Sanity checks and surprises

- 7 lines clear the strict N≥2,000 threshold across the three sections; no sub-threshold line is promoted.
- The highest-scoring eligible line is **e4 e5 Nf3** at 50.9% (N=5,326, 95% CI 49.5–52.2%).
- Gambit check: **Queen's Gambit Refused: Marshall Defense** scores +10.9 points above the band average (N=128) while its representative eight-ply line evaluates at -5 cp for White.
<!-- FINDINGS_END -->
