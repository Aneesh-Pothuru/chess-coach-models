# Repertoire recommendations: 1100-1400

Source: Lichess 2019-04; strict minimum N = 2,000.
Findability is the geometric mean of Maia2 probabilities for the target player's moves.

## White systems

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| e4 e5 Nf3 | Scotch Game | 53.0% | 52.2–53.8% | 14,423 | 19.6% | 30.5% | 8.7% |
| d4 d5 c4 | Queen's Gambit Accepted: Old Variation | 54.3% | 52.6–56.0% | 3,309 | 4.5% | 21.3% | 3.7% |
| e4 e5 Bc4 | Bishop's Opening | 53.3% | 51.3–55.2% | 2,419 | 3.3% | 37.9% | 7.0% |
| d4 | Queen's Pawn Game: Mason Attack | 52.2% | 51.4–53.0% | 16,406 | 22.3% | 22.8% | 7.1% |
| e4 d5 exd5 | Scandinavian Defense: Mieses-Kotroc Variation | 52.0% | 50.1–53.9% | 2,667 | 3.6% | 27.3% | 14.0% |

## Black defenses vs 1.e4

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| e4 d5 | Scandinavian Defense: Mieses-Kotroc Variation | 49.3% | 47.9–50.7% | 4,679 | 6.4% | 33.6% | 4.2% |
| e4 c5 | Sicilian Defense | 49.3% | 48.2–50.5% | 6,860 | 9.3% | 24.2% | 1.9% |
| e4 e6 | French Defense: Knight Variation | 47.8% | 46.3–49.3% | 4,247 | 5.8% | 23.8% | 5.1% |
| e4 e5 | Scotch Game | 46.0% | 45.4–46.6% | 23,404 | 31.8% | 35.5% | 6.4% |
| e4 e5 Nf3 Nc6 | Scotch Game | 45.8% | 44.8–46.9% | 8,624 | 11.7% | 28.4% | 13.4% |

## Black defenses vs 1.d4

| Line | Opening | Score | Wilson 95% CI | N | Popularity | Trap density | Maia findability |
|---|---|---:|---:|---:|---:|---:|---:|
| d4 Nf6 | Indian Game | 47.2% | 45.2–49.3% | 2,207 | 3.0% | 16.8% | 29.8% |
| d4 d5 | Queen's Pawn Game: Mason Attack | 45.5% | 44.4–46.5% | 8,567 | 11.6% | 23.0% | 12.0% |

Trap density is the fraction of eval-annotated games with a >20 Win% swing after the node and by ply 15.

<!-- FINDINGS_START -->

## Sanity checks and surprises

- 12 lines clear the strict N≥2,000 threshold across the three sections; no sub-threshold line is promoted.
- The highest-scoring eligible line is **d4 d5 c4** at 54.3% (N=3,309, 95% CI 52.6–56.0%).
- Gambit check: **King's Gambit Accepted, Schallopp Defense** scores +13.8 points above the band average (N=72) while its representative eight-ply line evaluates at -60 cp for White.
<!-- FINDINGS_END -->
