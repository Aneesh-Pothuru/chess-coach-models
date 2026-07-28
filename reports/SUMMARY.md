# Chess coach models: evaluation summary

All results use a seeded stream from Lichess 2019-04 on Apple Silicon. Real data and model binaries are intentionally uncommitted.

| Model | Primary result | Status |
|---|---|---|
| Graded-opponent scorer | Maia smoke: 2,500 held-out positions on cpu | Runnable |
| Maia2 independent benchmark | Top-1 51.5% on 25,000 moves from 2025-06 rated rapid | Training-independent |
| Blunder hazard v0 | PR-AUC 0.197 vs absolute-eval 0.055 | Pass |
| Repertoire optimizer | Strict-N recommendations: 7 / 12 | Runnable |
| Concept tagger | Macro-AP 0.469 vs prevalence 0.047 over 35 themes | Runnable |

## Notable findings

- In <1100, **Queen's Gambit Refused: Marshall Defense** scored +10.9 points above the band average across N=128; its short-line engine eval was -5 cp for White.
- In 1100-1400, **King's Gambit Accepted, Schallopp Defense** scored +13.8 points above the band average across N=72; its short-line engine eval was -60 cp for White.

## Scope decisions

- v0 ships as the hazard API because it runs everywhere without Maia2 inference.
- v1 is retained and reported, but only a capped subset carries Maia2 and Stockfish-best-move features.
- The neural-head stretch model was not run: on this laptop-sized sample, LightGBM is the higher-value use of compute and remains the product model.
- Repertoire output never lowers the configured N≥2,000 rule; sections can contain fewer than five rows when the local stream cannot support five honest recommendations.
