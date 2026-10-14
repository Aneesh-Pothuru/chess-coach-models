# Accuracy vs chess.com: where the hill-climb stands

| round | change (one line) | test MAE | train MAE | test within 5 | test bias | test r | phone test MAE |
|---|---|---|---|---|---|---|---|
| 0 | baseline (Lichess-derived, coach-accuracy/2) | 7.5 [5.3, 10.0] | 8.3 | 50% | -0.5 | 0.49 | 7.5 |
| 1 | plain mean on a steep per-move curve (coach-accuracy/3) | **4.9** [3.7, 6.2] | 3.6 | 63% | +0.5 | 0.76 | 5.4 |

Paired test MAE change, round 1 vs baseline: -2.6 [-4.8, -0.9] on routine
evidence and -2.1 [-4.1, -0.5] on phone evidence (95% bootstrap over games).
Best so far: round 1.

The baseline barely carried information about chess.com's number. A constant
guess (the train games' mean chess.com accuracy, 73.8) scores 7.9 on test and
7.2 on train, against the model's 7.5 and 8.3. The cause is structural, not
a constant. Lichess's aggregation pairs a volatility-weighted mean with a
harmonic mean, and the harmonic term's 1/acc lets one bad move sink a short
game. That left short games about 7 points too low and long games about 6
too high on the dev pool.

Round 1 replaces that aggregation with a plain mean of per-move scores on a
much steeper per-move curve (decay 0.14 instead of 0.0435). That matches
chess.com's own description ("we then mostly average everything") and an
independent replication's published example points. It won on train and test
alike, and the phone guardrail improved with it. Its gain is the shape, not a
tuned constant: decays from 0.12 to 0.16 land within 0.6 points of each other.

Tried and not run as rounds, because the dev pool and train already showed
them inside the noise or worse:
- book and forced moves counted;
- a flatter cp-to-win curve;
- floors and caps on per-move scores under the old aggregation;
- book moves as "best" on top of round 1, which cut the tilt but not the MAE.
- per-category move scores, chess.com's stated construction ("each [category]
  has its own score"): a fixed score per win%-loss band or per review class,
  fitted on the dev pool, and a cap on how many blunder-band moves count.
  None beat round 1 on the dev pool even in-sample (bands 4.46, classes 4.50,
  the cap 4.30, against 4.29), and the five-fold cross-validated fits were
  worse again (4.6). The continuous curve keeps information the bands throw
  away.

The hill-climb stops at round 1. The rule for another round was a candidate
beating round 1 by more than 0.5 on the dev pool and improving train, and
nothing came within that.

The length tilt that remains (short games still 2 to 3 points low, long ones
2 to 3.5 high, in every variant tried) is the open question for any further
round.

Landing round 1 moved the history with it. The archive stores each game's
accuracy as the routine computed it, under the old instrument, and a trend
that mixed those with new days would show a jump that is only the scale: the
new instrument moves a single game by 8 points on average, and the opening
phase by 4 on the daily trend. The archive reader now carries a stored
accuracy only when it was taken under today's instrument and otherwise reads
the game again from its stored per-ply evals. That is safe because the same
evals reproduce the stored numbers under the old instrument: whole-game mean
gap 0.34, 90th percentile 1.04, over 454 sides (`projects/accuracy-vs-chesscom/
reread-check.mjs`, rule fixed before the run: at most 0.5 and 1.5). The facts
record (version 4) and the quality trend were rebuilt with the routine's own
tools; class counts and ACPL did not move. Reviews already published keep the
numbers they were published with.
