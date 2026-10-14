# Plain mean of per-move scores on a steep per-move curve (coach-accuracy/3)

**Thesis.** chess.com's accuracy is close to an average of per-move scores
("we then mostly average everything", chess.com's reply quoted by Justesen,
2024), each move scored on a curve much steeper than Lichess's. Lichess's
aggregation (volatility-weighted mean + harmonic mean) lets one bad move sink
a short game, through the harmonic term's 1/acc, and its volatility weights
tilt long games upward. That gives the length-dependent bias seen on the dev
pool: short games about 7 points too low, long games about 6 too high.

**Change.** `moveAccuracy` keeps Lichess's curve shape and offsets with decay
0.14 instead of 0.0435 (2% lost scores about 76, 5% about 49, 10% about 23).
`gameAccuracy` becomes the plain mean of per-move accuracies. The tag moves to
`coach-accuracy/3-plain-mean-steep`. The graded set (book, forced and unknown
left out) is unchanged.

**Evidence before this round (never the test split).**
- Dev pool (132 games outside the eval, archived evidence): MAE 8.0 to 4.3,
  paired 95% CI of the change [-4.90, -2.61]; r 0.61 to 0.86.
- Train split (30 games, phone evidence): MAE 8.1 to 4.6, CI [-6.08, -1.21].
- Decay 0.12 to 0.16 all land within 0.6 points of each other on both pools,
  so the gain is the shape, not a tuned constant. An independent public
  replication of chess.com's accuracy (Backrank, r 0.93 over 928 games)
  publishes example points implying decay of about 0.123.
- Flooring per-move scores (current aggregation) reached only 6.4 on dev.

**Expected to hurt.** Sides already over-scored in long games stay over; the
plain mean halves the long-minus-short gap but does not close it.
