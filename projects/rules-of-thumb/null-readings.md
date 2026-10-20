# Readings for the addition

The README's section “Added after the rule was applied” governs this work.
The original verdicts and phase-two files remain the run's record. This
addition has its own content manifest and private input hashes. No result
of the addition was computed before these readings and sources were frozen.

The lab's current bridge pin has moved. This addition uses the original
measured app, `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`, and the original
records pin, `aed714ada579782ce73630596e59c8b65e74cb30`. The runner points the
bridge at those cached checkouts. It does not change the bridge pin or fetch
an app. The addition imports the original scorer's soundness helpers and
the original analysis's game bootstrap.

## The null draw

“In each scored position” means every row of all fifteen rules, including
the two rules with too few held-out positions. The analysis leaves out
those rules before calculating their addition measures. The original
positions file fixes the row order and the two shards use alternating
rows. September runs first, then July, then August.

The candidate population is every legal move returned by the app board,
sorted by UCI. The sample size is the number of distinct recorded moves
that show the rule. The sample uses partial Fisher–Yates, without
replacement, with `detect.mjs`'s `seeded()` and the string
`month:game:rule`, a NUL separator, and `null`. The original position draw
also separates its two seed parts with NUL. No outcome enters the draw.
Maia's most likely sampled move is chosen with the original `pick()`,
including its lexical UCI tie break.

The saved run did not store the complete Maia policy. The addition calls
the app's `humanPolicy` again with the same mover band, opponent band and
requested bands as the original scorer. It must reproduce both original
R and N before the row can proceed. A mismatch stops the worker.

## The referee

Seven men or fewer always use the row's saved tablebase probe, including
when R0 matches an original move. The exact outcome comparison is the
original `tablebaseSound()`. The saved probe must also reproduce R, N and
the played move's recorded soundness. There are no new tablebase requests.
A missing outcome stops the row.

At more than seven men, a match with R, N or the played move copies its
stored Boolean soundness. Multiple matching labels must agree. Otherwise
one app engine per worker clears its hash with `newGame()`, searches the
best at `grade` with one principal variation, then scores only R0 at
`grade`. Evaluation caching is off. Both readings must be complete and
exact, and the move reading must have the requested root. The original
app acceptance window decides soundness against this fresh best.

“Best differs” compares the fresh first exact line's UCI move with the
stored first exact line's UCI move, not their evaluations. These are the
lines whose scores act as the referee. The app also returns the engine's
final `bestmove`, which can differ from the deepest completed exact line;
that final field does not supply the original referee score. The
denominator includes only positions
that needed these fresh searches. Reused moves and tablebase rows do not
enter it.

## The analysis

Train is July and August pooled; held out is September. The original
game-bootstrap implementation supplies 2,000 game resamples with seed
20261018. All measures for a rule and period share those game
multiplicities. The differences are paired within positions. The lift
where R differs from N is the original S(R) minus S(N), restricted to that
subset. Band soundness and identity shares receive the same bootstrap
intervals. Undefined subgroup ratios remain undefined and are counted.

The content reading requires the whole 95% interval to be above zero in
both periods, or below zero in both. Otherwise it is “no differently from
chance”. No original verdict changes. Rules with fewer than 300 held-out
positions receive only exclusion counts in the addition.

## The examples

“Each rule with a verdict” means the rules with sufficient held-out data
and a registered verdict, excluding “not enough data”. For each, the
population is the original September rows where R differs from N,
restored to the original positions file order. Eight rows are drawn
without replacement with the same partial Fisher–Yates sampler, seeded
by the rule id alone through `seeded()`.

The example shows the original R, N, played move and referee best. SAN
comes from the app's `uciToSan()`. Stockfish win% comes from the stored
score through `winPercentFor()` for the original mover. Stored soundness
is checked against its evidence. The original best's first line supplies
its score and is compared with itself.

Tablebase rows did not store a separate selected best. The app's
`bestUciFor(probe, 'fifty-move')` chooses it from the saved probe, as the
app's tablebase evaluation does. For each move, `tablebaseWdl()` maps its
stored child category at its child FEN with that policy, then
`winPercentFor()` converts it for the original mover. This is an outcome
conversion, not a human win probability. Exact tablebase soundness still
distinguishes cursed wins, draws and blessed losses as the original run
did. An unavailable conversion stops generation. The selected tablebase
best is also given its exact-outcome soundness, even if it differs from
the probe's root outcome.

The public examples contain FEN, band, referee source, moves and their
readings. They contain no game id, link, username or private row key.
The selection uses no result.

## Completion and interruptions

Each worker appends completed rows to its own private journal and saves
counts and timings. A partial final journal line is discarded only in the
new journal. The original files are never repaired or rewritten. A resume
checks the addition's source hashes, original input hashes, row keys and
completed output hashes. Completed stages are skipped.

The driver and score coordinator do no heavy work and run at nice 0.
Each heavy worker runs at nice 10. Analysis and examples run at nice 10
after scoring. Long stages have their own session, closed standard input
and file logs. A failed worker stops its sibling. The driver records the
failed stage and requires a deliberate resume after the log is checked.
Completed and failed-attempt instrument time are separate. Worker elapsed
time includes time spent waiting and time across resumes; it is not CPU
time. No new package is required.
