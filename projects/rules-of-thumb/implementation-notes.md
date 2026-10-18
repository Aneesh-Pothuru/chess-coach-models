# Reviewed readings for the literal scan

The README's rule is unchanged. The reviewer accepted the phase-one
readings with the changes below and authorized the literal full run with
two heavy workers. The rule's owner has not amended the detector filter.

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
owner will decide whether to amend this definition. The availability scan
also records mover-actor note findings for the four note-only concepts at
every eligible position. Their seeded draws and monthly caps are kept in
separate alternative files. Only literal gain rows are scored and analyzed.
No alternative row may enter the analysis without a committed README
amendment and a new frozen content manifest. King-shelter has no alternative
definition in this run.

`worst-piece` uses the piece and tie-breaking already chosen by
`ActivityFacts`. Its after-move mobility is the app's `squaresToGo` on the
piece's destination. This returns null when the move checks the other king.
Null does not establish an increase, so such a move does not qualify. This
is the reading through the app's activity instrument accepted by the
reviewer.

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
wrong-root readings stop the job and leave the row pending. Before each
position's searches the scorer awaits the app's `newGame`, clearing the
engine's previous-game search state. Searches within a position keep their
fixed order: unrestricted best, then distinct R, N and A. A restarted
worker therefore starts each position in the same engine state.

At seven men or fewer, the tablebase decides instead of Stockfish. "Keeps
the outcome" means exact equality between `moveOutcomeForMover(move)` and
`outcomeForPlayer(probe, true)`, using their default fifty-move policy.
The app distinguishes cursed, blessed and uncertain outcomes; this code
does not collapse them into win, draw and loss. Missing or unknown probes,
missing move entries, and positions with castling rights that the tablebase
does not cover stop full scoring. The README supplies no fallback or
exclusion. Timing mode may count an unavailable probe without deciding
soundness. Network failures receive bounded retries with backoff, logged
privately with their outcomes. The app's tablebase negative cache is cleared
before each retry so a failed request is actually retried. Unsupported or
unknown outcomes never become engine decisions. Each worker's tablebase
cache is private and separate.

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
code, and analysis rejects incompatible versions. A committed manifest
freezes content hashes of the rule and code; no branch commit identifier is
used as provenance. The app and records pins remain recorded. Completed games survive
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

The phase-two runner streams the months in one background process, which
may overlap the two availability or scoring workers. It completes all
availability scans before scoring the literal rows. Each stage logs its
start, completion or failure and elapsed wall time privately. A completed
stage with unchanged output hashes is not repeated. Streaming retries a
failed invocation up to three times, resuming durable chunks. A referee
failure stops the run after its bounded probe retries, preserving all
completed rows for inspection and resume. The answer and paper remain
unwritten until the rule's owner reviews the aggregate results.
