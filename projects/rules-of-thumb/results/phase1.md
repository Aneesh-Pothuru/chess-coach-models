# Rules of thumb: implementation and timing

Written by `phase1.py`. App `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. Data: the first 300 eligible July 2026 Lichess rated standard 600+0 games, both players 1250 to 1649, Normal or Time forfeit, at least 30 plies. The stream read 8,012 games. No August or September data were read.

The fixed README is unchanged except for its files and commands. The streamer, complete availability scan, seeded position draw, monthly caps, app Maia/engine/tablebase scorer, game bootstrap, verdict logic, five splits and descriptive tree are implemented. The full analysis has not run. Real-game soundness, lift, adoption, failure conditions and verdicts were not calculated.

| Step | Work | Seconds |
|---|---:|---:|
| Stream | 300 games kept / 8,012 read | 2.829 |
| Availability, wall time | 2 workers | 37.072 |
| Availability, summed worker work | 14,181 positions / 391,761 legal moves | 72.898 |
| describeMove within availability | 391,761 calls | 70.089 |
| Maia | 60 calls / 94 band inferences | 5.166 |
| Stockfish | 57 best searches / 123 move searches | 54.366 |
| Tablebase | 3 probes / 0 unavailable | 1.667 |

The games contained 20,977 plies. The draw retained 1,741 game-rule rows. Referee timing used 60 evenly spaced retained rows, with one worker; its wall time was 61.237 seconds. The first Maia call, including model loading, took 0.601 seconds. The app's Node ONNX Maia and Stockfish build were used; no Python model or native Stockfish substitute was used.

| Rule | Available positions | Games with availability | Kept rows |
|---|---:|---:|---:|
| active-king | 1,397 | 80 | 80 |
| opposition | 153 | 12 | 12 |
| square-rule | 82 | 22 | 22 |
| rook-behind-passer | 1,201 | 154 | 154 |
| cut-off-king | 135 | 17 | 17 |
| outside-passer | 0 | 0 | 0 |
| trade-when-ahead | 0 | 0 | 0 |
| lucena | 0 | 0 | 0 |
| philidor | 0 | 0 | 0 |
| open-file | 9,482 | 298 | 298 |
| rook-on-the-seventh | 952 | 189 | 189 |
| outpost | 775 | 164 | 164 |
| pawn-break | 3,274 | 265 | 265 |
| passed-pawn | 3,204 | 242 | 242 |
| bishop-pair | 0 | 0 | 0 |
| king-shelter | 0 | 0 | 0 |
| worst-piece | 8,877 | 298 | 298 |

For the full 90,000-game cap, the slice projects 4,254,300 eligible positions and 117,528,300 detector calls. Scaling each rule's available-game count and applying its monthly cap projects 111,300 retained rows.

| Full-run step | Worker hours | Ideal wall hours at three workers |
|---|---:|---:|
| availability | 6.07 | 2.02 |
| maia | 2.66 | 0.89 |
| engine | 28.01 | 9.34 |
| tablebase | 0.86 | 0.29 |

The stream estimate is 14.14 minutes, run serially. The total is 37.61 worker-hours and 12.77 ideal wall-hours. **Engine dominates.** If every rule reached every monthly cap, 204,000 retained rows at the same average timing would give 21.53 ideal wall-hours. That is a workload scenario, not a latency bound.

These estimates exclude analysis, final reporting and startup outside the measured calls. They are not a promise of sustained laptop throughput. The slice sampled a file prefix, not the month; rare-rule frequencies, thermal throttling, tablebase and network delays, concurrent work and restart re-streaming can change the cost. The JSON preserves first-call timing and all count denominators. No package was installed.

Tests use synthetic inputs only: stream filter boundaries and multiline input; FEN/UCI detector cases for every rule; seeded draws and caps; referee score orientation, exactness, root integrity, tablebase outcomes and timing-mode nonmeasurement; clustered resampling, intervals, verdict boundaries, failures, tree fitting and full-input gates. The paper directory is a deferred scaffold. Its generator checks the timing-only status; it prints no study result.

## Readings for review before the full scan

The README's rule is unchanged. These are implementation choices where it
leaves a detail open. The full scan waits for the reviewer to answer them.

The game-rule draw spans both players. It is one uniform index in that
rule's chronological eligible positions, using FNV-1a followed by
mulberry32, seeded by the game id, a NUL separator and the rule id. The
monthly cap pools both bands. Workers merge in file order before applying
that cap. They still scan every eligible position after a cap fills, since
availability describes the whole scan. July and August are pooled for
train. September is separate.

The move's finding is matched by `conceptId`, actor equal to the mover and
exactly `tone: gain`. `describeMove` receives only FEN and UCI. No optional
engine evidence is supplied. At this pin, the technique readers for
`outside-passer`, `lucena`, `philidor` and `bishop-pair` return `note`;
`king-shelter` needs best-move evidence and returns `concession`. Those
findings cannot pass the registered filter. The app can also suppress a
technique when the moved piece hangs. The tests preserve the app's output;
they do not add positive findings to make these rules available. The
reviewer must decide whether this is the intended study. The implementation
does not repair the definition.

`worst-piece` uses the piece and tie-breaking already chosen by
`ActivityFacts`. Its after-move mobility is the app's `squaresToGo` on the
piece's destination. This returns null when the move checks the other king.
Null does not establish an increase, so such a move does not qualify. This
is the literal reading through the app's activity instrument; it needs
review because the README does not specify the null case.

An opponent threat means a nonempty opponent-indexed `mateInOne` or
`winningCaptures` array. The unindexed `stalemateTraps` describes the mover
and is not counted as the opponent's threat. The material difference is
`materialCount.diff`, oriented to the mover. Its integer points leave no
gap between ahead, level and behind. A danger sign means any entry in
`kingDanger.signs`. The phase is `phaseOf(fen)` on each position, without a
chronological divider or a book-exit filter. Forcing means the rule move
captures or its child board is in check; promotion alone is not forcing.

Maia ties use ascending UCI text for both R and N. Maia is queried at the
mover's band against the opponent's band. The description "probability of R
at his band" is read as a second probability at 1300 even when R was
selected at 1500; the opponent keeps its actual band. The scorer also keeps
R's probability at the mover's band. A policy missing a legal candidate
stops the job rather than substituting a move.

The referee uses the app's default Node Stockfish build, one engine per
worker, its `grade` node budget and no eval cache. It uses FEN alone, not
the game's repetition history. The unrestricted best comes from the first
line of a one-line `bestMoves` search. Each distinct R, N or A gets its own
`scoreMove` search; identical moves share that reading. It does not replace
a move's restricted search with the unrestricted best's score. Soundness
calls `acceptsAlternative` on exact White-oriented scores, so the app's
`core/score` supplies the win-percent conversion. Incomplete, incoherent or
wrong-root readings stop the job and leave the row pending. The app's
default engine hash persists between calls; worker assignment and restarts
can therefore affect the search even at a fixed node budget.

At seven men or fewer, the tablebase decides instead of Stockfish. "Keeps
the outcome" means exact equality between `moveOutcomeForMover(move)` and
`outcomeForPlayer(probe, true)`, using their default fifty-move policy.
The app distinguishes cursed, blessed and uncertain outcomes; this code
does not collapse them into win, draw and loss. Missing or unknown probes,
missing move entries, and positions with castling rights that the tablebase
does not cover stop full scoring. The README supplies no fallback or
exclusion. Timing mode may count an unavailable probe without deciding
soundness. Each worker's tablebase cache is private and separate.

Bootstrap draws are ordinary fixed-size resamples of games with
replacement, not the predecessor's Poisson approximation. The seed is
20261018 and there are 2000 draws. Within each rule and train/held-out set,
all comparisons and both bands share game weights. A game has at most one
position for that rule. The main verdict and failures pool both bands;
the separate-band measures describe. A missing group or rest has no
estimate. A bootstrap draw with an empty denominator has no estimate for
that comparison, is omitted from its percentile interval, and is counted.
No minimum or multiplicity correction is added. The held-out minimum
applies to the main verdict; the beside-verdict step-up flag and failure
conditions retain their own registered tests. Failure compares a cell with
all other cells of that split, and requires both the point drop and the
interval test in each data set.

The descriptive tree uses binary tests of categorical cell membership,
greedy Gini impurity, maximum depth two, no minimum leaf size beyond one,
and deterministic listed feature/cell order for ties. Leaves predict the
majority class and predict sound on a tie. The tree pools the bands in
train and reports held-out accuracy overall and by band. These choices
are descriptive and do not decide a verdict. Availability is reported as
counts and shares of the complete scan. Bootstrap intervals cover the
sampled measures and the descriptive tree accuracy. Availability has no
interval.

The streamer accepts standard rated games matching the stated time control,
termination, rating and length filters. It does not require evals, clocks,
a maximum rating gap or a particular result. Eligible malformed PGNs stop
the stream rather than silently changing the sample. Mainline PGN is kept
without comments or player names. A restart re-streams the compressed
source and skips records already checkpointed; it never stores the monthly
archive. Full-run stream, availability and scoring checkpoints pin their source
code, and analysis rejects incompatible versions. Completed games survive
interrupted availability and scoring writes. An incomplete last journal line is discarded and recomputed.

The timing sample is the first 300 eligible July games. The availability
pass reads all of them. Referee timing uses 60 evenly spaced rows in the
ordered retained position file, including repeated boards when different
rules draw them. Its policies and engine scores exist only long enough to
select the workload and validate the service response. It never computes
real-game soundness, lift, adoption, failure conditions or a verdict, and
writes only per-row counts and elapsed times privately. Synthetic tests
exercise the decision code with invented data.

Full-run cost is an extrapolation from this July prefix. The scan scales
by the ratio of the full game cap to the slice. Per-rule retained workloads
scale available games and stop at the registered monthly cap. Maia, engine
and tablebase time scale by retained rows. The projected wall time divides
worker work by three and adds the serial stream estimate. It assumes the
same game mix, uninterrupted input and unchanged per-worker throughput.
The average includes the measured model startup and tablebase requests. Network contention, fanless thermal limits, tablebase latency,
rare rules absent in the slice and restart overhead can change it. This is
summed worker elapsed time, including waits, not a cloud charge. No packages were installed.

## Exact phase 2 commands

Run only after the reviewer answers the readings above. The script runs three heavy workers at a time and resumes existing complete records.

```bash
projects/rules-of-thumb/phase2.sh --reviewed
```

Its commands are:

```bash
for month in 2026-07 2026-08 2026-09; do
  nice -n 10 .venv/bin/python projects/rules-of-thumb/stream.py --run full --month "$month" --phase2-reviewed
  nice -n 10 bridge/run.sh projects/rules-of-thumb/positions.mjs --run full --month "$month" --pool 3 --phase2-reviewed
  nice -n 10 bridge/run.sh projects/rules-of-thumb/score.mjs --run full --month "$month" --pool 3 --phase2-reviewed
done
nice -n 10 .venv/bin/python projects/rules-of-thumb/analyze.py --run full --phase2-reviewed
```

The script stops after aggregate analysis. The answer and paper are written after the full run. No push is part of either phase.
