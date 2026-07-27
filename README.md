# Chess Coach Models

Reproducible danger, difficulty, and punishment models for a chess coaching
platform. The project deliberately complements Stockfish and Maia rather than
trying to replace either:

- **Graded-opponent scorer:** how bad was the move objectively, and how likely is
  the next rating band to find the punishment?
- **Blunder-hazard classifier:** before the player moves, how likely are they to
  lose more than 20 percentage points of win probability?
- **Elo-conditioned repertoire optimizer:** which opening lines score well,
  contain practical traps, and remain findable at the target band?

The deployed coaching platform pulls chess.com Published-Data API PGNs. Those
files have no engine evals and use a different clock representation, so runtime
PGNs are evaluated with Stockfish. Training and the committed evaluation reports
use Lichess data only.

## Results

<!-- RESULTS_START -->
| Model | Result |
|---|---|
| Graded-opponent scorer | Maia2 smoke on 2,500 held-out positions; sample PGN annotation complete |
| Blunder hazard v0 | PR-AUC 0.197 vs absolute-eval baseline 0.055; Brier 0.049 |
| Repertoire optimizer | 7 strict-N rows below 1100; 12 at 1100–1400 |
<!-- RESULTS_END -->

See [reports/SUMMARY.md](reports/SUMMARY.md) for the complete findings and the
per-model reports for calibration, band-level metrics, sample annotations, and
repertoire tables.

## Reproduce from a fresh clone

Prerequisites: macOS or Linux, Python 3.11–3.13, `zstd`, and Stockfish. Apple
Silicon is the reference environment. The committed batch eval pins Maia2 to
CPU: MPS worked for interactive inference but segfaulted on the 5,000-position
batch. Evaluation stages also run in isolated Python processes because mixing
LightGBM's OpenMP pool and subsequent Torch inference in one process can stall
on macOS. Both workarounds preserve the configured sample size.

```bash
brew install zstd stockfish gh
make setup
make test
make data
make eval
make reports
```

`make data` streams April 2019 directly from Lichess and terminates the download
at the configured caps. The 9.87 GB archive is never stored. All tunables live
in [`configs/config.yaml`](configs/config.yaml), including URL, rating bands,
sample caps, thresholds, Stockfish budget, and device choice.

Useful individual commands:

```bash
# Model 1: annotate arbitrary PGNs
.venv/bin/python scripts/score_pgn.py my_games.pgn --output scored.json

# Model 2: score one FEN or mine an arbitrary PGN for puzzle candidates
.venv/bin/python scripts/mine_hazard.py --fen "$FEN" --elo 1250
.venv/bin/python scripts/mine_hazard.py --pgn my_games.pgn --top-n 20

# Model 3: rebuild the tree and target-band recommendations
.venv/bin/python scripts/build_repertoire.py
.venv/bin/python scripts/build_repertoire.py --query-pgn my_games.pgn \
  --band 1100-1400 --perspective white

# Train only the models
make train
```

Downloaded PGNs, Parquet datasets, Maia2 weights, and trained model binaries are
gitignored. Reports, plots, JSON recommendations, code, config, and tiny PGN
fixtures are committed.

## Data pipeline

One decompressed stream feeds two collections:

1. A seeded reservoir of labeled positions from eval-annotated games. Reservoir
   sampling avoids filling the cap with the first few hundred complete games.
2. A capped sample of all rated standard games for the opening tree.

The parser retains ratings, bands, time control, result, ECO/opening, UCI/SAN
move prefixes, `[%eval]`, and `[%clk]`. Train/validation/test assignment hashes
whole game IDs within band strata; a game can never leak positions across
splits. April 2019 is intentionally after Lichess clock tags began in April
2017 and is far smaller than recent 30+ GB months.

Rating bands are `<1100`, `1100–1400`, `1400–1700`, `1700–2000`, and `2000+`.
Lichess ratings are Glicko-2 and are often roughly 200–400 points higher than
chess.com at the low end. This repository intentionally documents that mapping
assumption instead of pretending to solve it.

## Label correctness

Lichess evals are always from White's perspective. Before computing a move loss,
the code flips the probability for Black. The published conversion is used with
centipawns clamped to ±1000:

```text
Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
```

Mate scores map to ±10000 cp and saturate near 100/0 Win%. Move quality is Win%
before minus Win% after from the mover's perspective. A label is positive only
when the played move loses **more than 20 Win%**. Pytest covers mate parsing,
Black-side flips, clocks, labels, game splitting, features, Wilson intervals,
and opening-tree counts.

## Model details

### 1. Graded-opponent scorer

Stockfish 18 evaluates every pre/post-move position with MultiPV 3. Any move
losing more than 10 Win% becomes a candidate. The top Stockfish reply is then
looked up in Maia2's Elo-conditioned policy twice: at the player's representative
band and at band +200. The JSON output retains objective cost, reply, and both
punishment probabilities.

### 2. Blunder-hazard classifier

The shipped v0 is a calibrated LightGBM over board, material, phase, check,
mobility, hanging-piece proxy, passed-pawn, king-pressure, castling, rating, and
current-eval features. Class-balanced training improves ranking; a Platt model
fit only on validation games converts raw scores into usable probabilities.

The v1 experiment adds Maia2 policy entropy, top-1 probability, and
`P(Stockfish best move | Maia2)` on a capped CPU subset. A matched hand-feature
model is trained on that same subset, so any claimed delta is apples-to-apples.
The product API remains:

```python
from chess_coach_models.hazard import hazard

probability = hazard(fen, elo=1250)
```

### 3. Repertoire optimizer

The first 12 plies form an opening tree. Every node/band stores N, score,
Wilson 95% CI, popularity, common continuations, and early trap density. Final
lines receive Maia2 findability from the geometric mean of the target player's
critical move probabilities. Recommendation reports never relax N≥2,000; a
section can contain fewer than five lines when the capped local sample cannot
support five honest recommendations.

## Data and software licenses

- [Lichess Open Database](https://database.lichess.org/) exports are **CC0**.
- [`maia2`](https://pypi.org/project/maia2/) is MIT-licensed and its weights are
  downloaded locally on first use.
- Original Maia weights are GPL. They are not bundled or used here.
- This repository's code is MIT-licensed.

## Limitations and next steps

- Eval-annotated Lichess games are not a random sample of all play.
- The committed run is intentionally laptop-sized; config can scale unchanged on
  a larger CPU/GPU box.
- Maia2 smoke accuracy on April 2019 is not training-independent.
- The hanging-piece feature is a fast SEE proxy, not a full exchange search.
- Recalibration should be repeated on chess.com runtime traffic because labels,
  clocks, and rating populations differ.
- The neural-head stretch experiment is deferred unless it can beat LightGBM on
  a larger, independently held-out sample.
