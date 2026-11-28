# Game rating

**The question.** What rating does a player's play in one game look like? A
rating is earned over many games, and one game is a single reading of it. If
a model can read a rating off the moves and the clock of one game, a review
can say what that game looked like beside the player's usual level, and the
runs here say first how far off one game's reading usually is, and what in a
game gives the rating away: how much the moves lost, how the clock was used,
or the positions themselves.

| | |
|---|---|
| **Reads** | Each of the player's moves from their sixth on, in order, up to 48 of them: the position before the move, the opponent's last move, the move played, both clocks, the seconds the move took, the player's winning chances before it and what it lost (from the engine evaluations Lichess attached), the number of legal moves, whether it took or gave check, and the castling rights. Beside the moves, the time control and the game's length. It reads neither player's rating and not the result. |
| **Predicts** | The player's Lichess rapid rating when the game was played. |
| **Data** | Rated Lichess rapid games of October 2026 (CC0) with engine evaluations and clocks. A row is one player in one game, and both players of a game are rows. A player gives a row with at least 10 moves that carry an evaluation and clocks. Recipe: [`datasets/games.yaml`](../../datasets/games.yaml). |
| **Split** | By game: 85% train, 5% valid, 10% test, so both players of a game are in the same part. A game falls in the same part here as in the positions of [blunder-hazard](../blunder-hazard/). |

This is the lab's first model whose row is a sequence. A network reads every
position of the row with the body the other models use, and a few more
transformer layers read the positions in order
([`docs/design.md`](../../docs/design.md), "A row that is a sequence").

## The rule

Written before the first full run.

- **Metric.** Mean absolute error in rating points on the test rows. RMSE, R²
  and Spearman's rank correlation are reported beside it.
- **Floor and baseline.** `constant` gives every player the training median.
  `gbm-context` reads the time control and the game's length with no view of a
  move, which says what is left before any play is read. `gbm-hand`, the
  reference, also reads counts over the player's moves: what they lost, how
  the clock was used, and what there was to choose from
  (`game_features` in [`encode/hand.py`](../../src/chess_coach_models/encode/hand.py)).
- **What counts as better.** A run beats the reference when its paired gain in
  MAE on the same resampled test games has a 95% interval above zero.
- **Bands.** Results are also given by the player's rating band. The bands
  are bands of the label itself, so they show who a run reads well: a run that
  pulls every reading toward the middle has an error that grows toward both
  ends.

## Runs

| Run | Learner |
|---|---|
| `constant` | The training median for every player |
| `gbm-context` | LightGBM on the time control and the game's length |
| `gbm-hand` | LightGBM with the counts over the player's moves (the reference) |
| `conv-small` | A convolutional tower reads each position, and two transformer layers read the moves in order |
| `transformer-small` | A small square-token transformer reads each position, under the same two layers; for a GPU |
| `transformer-medium` | A larger square-token transformer under two wider layers, for a GPU |
| `transformer-medium-hand` | The same, reading the counts over the player's moves beside the game |
| `steps-raw` | Per-move sequence model (BiGRU + transformer + attention pooling) over the 13 stored per-move scalars only, with no 8×8 boards |
| `steps-temporal` | The same with 27 derived within-game temporal features (opponent implied win-probability loss and think time, clock fractions, position decisiveness, move-to-move deltas) |
| `steps-board` | The same with 63 vectorised per-move board-geometry and exact attack-count features |
| `steps-board-aux` | `steps-board` with a training-only auxiliary regression head predicting `opponent_elo` |
| `conv-small-long` | `conv-small` trained for 24 epochs instead of 8 (GPU) |
| `conv-medium-skip` | Wider ResNet (`dim: 128`, `depth: 8`) with temporal step-feature skip, BiGRU, and attention pooling (GPU) |
| `transformer-medium-skip` | `transformer-medium` with temporal step-feature skip, BiGRU, and attention pooling (GPU) |
| `steps-board-quadruple` | `steps-board` trained on four times the games (`games-200k`) |
| `conv-medium-skip-quadruple` | `conv-medium-skip` trained on four times the games (`games-200k`, GPU) |

### Studies

Runs that change one thing in a run above, to say what that thing is worth
([`docs/design.md`](../../docs/design.md), "A run that changes another"). They
are listed apart on the leaderboard, and each is read against the run it
changes.

| Study | Runs | What each changes |
|---|---|---|
| `features` | `gbm-hand-no-<group>` for each of accuracy, tempo, choices | One group of the counts left out: what the moves lost, how the clock was used, what there was to choose from |
| `games` | `gbm-hand-half`, `gbm-hand-quarter` | Half and a quarter of the training games, chosen by a hash of the game |
| `opponent` | `steps-own-only` | Drops opponent clocks, `win_before`, implied opponent loss, and opponent last-move features from `steps-board` to separate the player's own signal from opponent play |
| `aux` | `steps-board-aux` | Adds a training-only auxiliary regression head predicting `opponent_elo` (`aux_weight: 0.3`) to `steps-board`; filed because validation MAE worsened and test gain did not clear noise |

### Second-pass experiment rules (written before full runs)

1. **Sequence dynamics vs raw 8×8 boards (`steps-raw` → `steps-temporal` → `steps-board`).**
   First-pass networks trained only 8 epochs, buried per-move scalars below 6–8 2D board layers with no skip connection to the sequence layers, and pooled with a plain mean. We test whether a dedicated BiGRU + transformer + attention-pooling encoder over per-move scalars, explicit temporal dynamics (especially opponent implied loss $b_{t+1} - (b_t - l_t)$, opponent think time, and decisiveness-weighted loss), and exact bitboard board-geometry features beats `conv-small` (MAE 204.1) on the identical `games-2026-10` test set.
   *Win rule:* a run is kept on the leaderboard only if it improves validation MAE over its base AND achieves a paired test MAE gain with a 95% bootstrap interval strictly above zero (and beats `gbm-hand` beyond the noise).
2. **Auxiliary opponent supervision (`steps-board-aux`).**
   Adds a training-only auxiliary head predicting `opponent_elo` (`aux_weight: 0.3`). Expects lower test MAE and/or less bias along the `rating-gap` slice by forcing the sequence encoder to represent the two sides separately. Same win rule over `steps-board`.
3. **Opponent-dependence ablation (`steps-own-only`, study `opponent`).**
   Removes opponent clock, `win_before`, opponent implied loss, and opponent last-move geometry from `steps-board`. Filed under `study: opponent` to measure directly how much accuracy comes from reading the opponent's play vs the player's own moves and clock.

## Results

[`results/leaderboard.md`](results/leaderboard.md), written by
`lab eval game-rating`, the closer look in
[`results/analysis.json`](results/analysis.json), and the paper,
[`paper/paper.tex`](paper/paper.tex) ([`paper/paper.pdf`](paper/paper.pdf)).

### First pass (commits `269bfb6` and `f56cc16`)

- **A network that reads the moves beats the counts.** All four 2D-board
  networks beat the GBDT reference (`242.7`) beyond the noise, led by
  `conv-small` (`204.1`) and `transformer-small` (`204.9`). The larger
  `transformer-medium` (`211.1`) learned more slowly and was still improving at
  epoch 8; adding hand features (`transformer-medium-hand`) hurt it.
- **What the trees lean on.** Without what the moves lost the trees lose
  most, and the clock and choices each add signal beyond the noise. On half and
  a quarter of the training games the trees lose little.

### Second pass (`games-2026-10`, identical dataset build, plus 4× training on `games-200k-2026-10`)

- **Upgraded 2D board ResNet + temporal step-feature skip + 4× data sets a new best.**
  `conv-medium-skip-quadruple` (8-block ResNet `dim: 128` per board + temporal
  step-feature skip + BiGRU + 3 transformer layers + 4-query attention pooling,
  5.4M parameters, trained on 338,809 rows of `games-200k-2026-10` on an A100)
  reaches test MAE **180.8** (95% CI 177.3–184.8; RMSE 231.7; R² 0.6318;
  Spearman 0.7908), a paired gain of **+61.92** (+57.81 to +65.84) over
  `gbm-hand` and **13.3 points** better than CPU `steps-board` (`194.1`). It
  beats `steps-board-quadruple` (`185.7`) by **+4.94** (95% CI +2.35 to +7.68)
  and `conv-medium-skip` (`192.3`) by **+11.55** (95% CI +9.41 to +13.52),
  improving on `steps-board` and `conv-small` in every rating band (`2000+`:
  226.9 vs 251.5 and 277.1). Across all 48 subgroups in `analysis.json`, it is
  significantly ahead of `gbm-hand` in 46 and significantly behind in none.
- **Both data scaling and the skip/BiGRU/attention upgrade clear the noise on GPU.**
  - `conv-small-long` (24-epoch schedule, early-stopped at epoch 20, best epoch
    14): **199.2** (valid 201.3 vs `conv-small` 206.5; test 199.2 vs 204.1),
    confirming first-pass `conv-small` was under-trained at 8 epochs.
  - `conv-medium-skip` (same 50k games, adding wider 8-block ResNet + temporal
    step-feature skip + BiGRU + attention pooling): **192.3** (valid 192.8 vs
    `steps-board` 193.8; paired gain **+6.85**, 95% CI +4.88 to +9.03, over
    `conv-small-long`), edging ahead of `steps-board` (`194.1`) on identical
    training data.
  - `transformer-medium-skip` (adding temporal skip + BiGRU + attention + 16
    epochs to `transformer-medium`): **205.4** (valid 204.2 vs 209.8; test
    205.4 vs 211.1), improving cleanly on its base while trailing the ResNet
    and sequence encoders.
  - `steps-board-quadruple` (`steps-board` on 4× games, 524k parameters, 13 min
    on A100): **185.7** (95% CI 181.9–189.8; valid 184.3 vs 193.8; +56.99 over
    `gbm-hand`), an **8.4-point** jump from 4× data alone with 10× fewer
    parameters than `conv-medium-skip-quadruple`.
  - All five GPU runs beat their respective bases on both validation and test
    and are kept on the leaderboard.
- **Per-move sequence ablations on the standard 50k build (`steps-raw` →
  `steps-temporal` → `steps-board`).** Each input addition clears the noise on
  paired test games:
  - `steps-raw` (13 stored per-move scalars only): **221.4** (+21.28 vs `gbm-hand`).
  - `steps-temporal` (+27 within-game temporal features, including opponent
    implied loss and think time, clock fractions, and position decisiveness):
    **216.1** (paired gain **+5.38**, 95% CI +3.38 to +7.21, over `steps-raw`).
  - `steps-board` (+63 vectorised bitboard geometry and exact attack-count
    features): **194.1** (paired gain **+21.91**, 95% CI +19.21 to +24.55, over
    `steps-temporal`).
- **Opponent-dependence ablation (`steps-own-only`, study `opponent`).**
  Dropping opponent clocks, `win_before`, implied opponent loss and opponent
  last-move geometry raises MAE from `194.1` to **201.6** (paired difference
  −7.50, 95% CI −9.44 to −5.55), while still beating `conv-small` (204.1). In a
  joint OLS fit $\hat{y} = \alpha + \beta_{\text{own}} r_{\text{own}} + \beta_{\text{opp}} r_{\text{opp}}$,
  the opponent share drops from 46.2% (`steps-board`) to 42.6% (`steps-own-only`),
  and sits at **43.7%** for `conv-medium-skip-quadruple` ($\beta_{\text{own}}=0.385$,
  $\beta_{\text{opp}}=0.299$) and 45.4% for `steps-board-quadruple`. Even
  without explicit opponent inputs, the opponent's play still shows through the
  positions it creates — and on `1400–1700` players, own mean loss itself rises
  from 3.48 against >200-point stronger opponents to 4.82 against 100–200-point
  weaker ones.
- **Auxiliary opponent-rating head (`steps-board-aux`, study `aux`, not
  accepted).** Adding a training-only `opponent_elo` head worsened validation
  MAE (`194.6` vs `193.8`) and gave a non-significant test gain of `+0.19`
  (95% CI −1.29 to +1.66; opponent OLS share 47.6%), so it is filed under
  `study: aux` per the acceptance rule.
- **One reading is tighter but still loose and opponent-coupled.**
  `conv-medium-skip-quadruple` lands within 200 points on **63.4%** of test
  rows (up from 59.4% for `steps-board` and 57.2% for `conv-small`) and within
  300 on **81.5%**, with p90 error **376.4** (down from 403.5). It remains
  compressed at the extremes and dependent on opponent strength.

What a review can take from this today: what a game looked like, in rating
points, for an ordinary game between players of like rating, said as a wide
band. It cannot yet say that a player played above or below their rating,
because against a much stronger or weaker opponent a reading says mostly who
the opponent was.

**Weights.** Run test predictions and logs from the `game-rating-v2` pass live
under `artifacts/runs/game-rating/<run>/` (git-ignored; none is published). The
`lab-runs-game-rating-v2.zip` archive (128,369,391 bytes, sha256
`09070a013191886ef8517b5bc8955bb836a12e9658741042dc59f5b107d63cd5`) was not
saved before the Colab runtime auto-released, so `conv-medium-skip-quadruple`
weights would need a ~41-minute A100 retrain to port; CPU `steps-board`
`model.pt` hash from the prior pass is
`e6fd841d71b28456b86de6d7613cd6c55d1e7c1c16149181b3f69ffb85df1251` (2,113,334
bytes).

## What it does not say yet

- **One game is a noisy reading.** A player rated 1500 has games that look
  like 1300 and games that look like 1700. The error left after the best run
  is partly the model's and partly the game's, and nothing here separates the
  two yet. Several games of one player would.
- **The pairing shows through.** Lichess pairs players of like rating, and a
  position is made by both of them. Even after removing explicit opponent
  inputs (`steps-own-only`), the opponent accounts for over 40% of the joint
  regression slope because the opponent's moves shape the board and the player's
  own loss opportunities. Predicting both ratings jointly (or their mean and
  difference) remains future work.
- **Every rating counts alike.** A new account's rating has not settled, and
  the model is trained on it and scored against it as on any other. The
  record of a game says by how many points it moved each rating, which the
  builder does not read yet.
- **By phase.** The idea is a rating for the opening, the middlegame and the
  ending of a game. This model gives one number for the game.
- **The engine is read.** What a move lost comes from the evaluations Lichess
  attached. A rating read from the moves and the clock alone is a different
  run.
- **Which games.** Only analysed games give a row, and players choose which
  games to analyse. The evaluation is as deep as Lichess's server analysis. A
  long game is cut at the player's 48th counted move.
- **Whose scale.** The ratings are Lichess rapid's, which is not the scale of
  the player's own site.
