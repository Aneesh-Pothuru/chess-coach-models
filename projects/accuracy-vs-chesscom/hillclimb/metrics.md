# Accuracy vs chess.com: what the metrics mean

**What is measured.** For each of 60 of the player's games, the Game Review's
accuracy for each side (White and Black) is compared with chess.com's accuracy
for the same side in the same game. Our number is what the review service
computes from its own engine evidence, re-read under the code in the working
tree. chess.com's number is the one the routine stored when it fetched the
game (`accuracies` in `coach-log/review-analysis/<day>.json`), which is
chess.com's Game Review accuracy (CAPS2).

**What it is not.** chess.com's formula is proprietary and is not ground truth
about how well anyone played. This eval measures parity with the number the
player sees on chess.com, which was the product decision behind building it.

**Evidence.** Each game is reviewed once per profile through the real entry
point (`coach review cc:<id> --profile <p> --json --no-cache`) and the
documents are frozen under `evidence/<profile>/`. `routine` (1M-node sweep,
every flag verified, tablebase, teaching pass) gives the headline metrics;
`phone` (100k-node sweep, a quarter of the plies verified) is the guardrail,
the number the app shows on a phone. The engine is deterministic at fixed
nodes on one thread, so one rep is the whole measurement. The interval on a
number comes from which games were drawn (bootstrap over games).

## Per-case metrics (one row per game, two sides)

| id | kind | better | meaning |
|---|---|---|---|
| `abs_err` | float | lower | Mean over the two sides of \|ours - chess.com\|, routine evidence. **Headline.** |
| `within5` | float | higher | Share of the two sides within 5 points of chess.com (0, 0.5 or 1). |
| `bias` | float | closer to 0 | Mean signed error (ours - chess.com): negative means we score lower. |
| `abs_err_me` | float | lower | The player's side only. |
| `abs_err_opp` | float | lower | The opponent's side only. |
| `null_sides` | float | lower | Sides the review could not score (no graded move). Excluded from the errors above and counted here, never scored as 0. |
| `abs_err_phone`, `within5_phone`, `bias_phone` | float | as above | The same on phone evidence (guardrail). |

Every row also carries `ours_white`, `ours_black` (and `_phone`), `cc_white`
and `cc_black`, so every aggregate below recomputes from raw rows.

## Set-level numbers

Pearson's r over sides, MAE, bias and within-5 per split come from
`projects/accuracy-vs-chesscom/summarize.mjs`, with 95% bootstrap intervals
over games and each variant's paired difference from the baseline on the
same games.

## Aggregates per variant

<!-- aggregates:start -->
Recomputed from each variant's results.jsonl; 95% intervals from 4000 bootstrap draws over games (seeded). MAE and bias in accuracy points, ours minus chess.com.

### routine evidence (headline)

| variant | change | test MAE | train MAE | test within 5 | test bias | test r | test MAE vs baseline (paired) |
|---|---|---|---|---|---|---|---|
| baseline | baseline | 7.5 [5.3, 10.0] | 8.3 [5.9, 10.9] | 50 [35, 63]% | -0.5 [-4.1, 2.8] | 0.49 [0.29, 0.73] | - |
| v1 | Plain mean of per-move scores on a steep per-move curve (coach-accuracy/3) | 4.9 [3.7, 6.2] | 3.6 [2.7, 4.6] | 63 [50, 77]% | +0.5 [-1.6, 2.6] | 0.76 [0.61, 0.88] | -2.6 [-4.8, -0.9] |
| v2 | The merged instrument: plain mean, steep curve, tablebase outcomes graded | 5.0 [3.8, 6.3] | 3.6 [2.7, 4.6] | 63 [50, 77]% | +0.6 [-1.5, 2.7] | 0.76 [0.61, 0.88] | -2.5 [-4.7, -0.7] |

### phone evidence

| variant | change | test MAE | train MAE | test within 5 | test bias | test r | test MAE vs baseline (paired) |
|---|---|---|---|---|---|---|---|
| baseline | baseline | 7.5 [5.5, 9.8] | 8.1 [5.8, 10.6] | 48 [35, 62]% | +0.2 [-3.3, 3.3] | 0.50 [0.30, 0.74] | - |
| v1 | Plain mean of per-move scores on a steep per-move curve (coach-accuracy/3) | 5.4 [4.0, 6.8] | 4.6 [3.6, 5.6] | 57 [42, 72]% | +0.0 [-2.3, 2.4] | 0.72 [0.54, 0.86] | -2.1 [-4.1, -0.5] |
| v2 | The merged instrument: plain mean, steep curve, tablebase outcomes graded | 5.4 [4.0, 6.8] | 4.6 [3.6, 5.6] | 57 [42, 72]% | +0.0 [-2.3, 2.4] | 0.72 [0.54, 0.86] | -2.1 [-4.1, -0.5] |

<!-- aggregates:end -->
