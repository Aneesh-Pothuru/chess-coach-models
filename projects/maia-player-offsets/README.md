# Does Maia need a different offset for the player?

**The question.** Does a side split, or a conversion that changes with the
rating, predict the moves in the player's games better than the app's single
250? If it does, does it keep the punish odds as useful as they are at 250?

**This run.** Phase 1 fixes the rule and counts and times the work. No fitted
value, likelihood, first-choice share, Brier score, interval or verdict is
computed. `results/phase1.md` is written by `count.mjs`. The paper is a
protocol and cost report, not an answer. The app stays unchanged.

## The data

The app and records are the commits in `bridge/chess.json`, checked against
the cached checkouts. Reports name both full commits. The moves and halves
are exactly `maia-rating-offset/positions.mts`'s: every archived game from
the standard start with both ratings and all clocks; ply 11 onward when both
clocks at the position are at least 30 seconds. Both sides count. Games sort
by end time, with the archive record id breaking ties; even indices fit and
odd indices are held out. Games with no counted move remain bootstrap units.
There is no new time-control filter. Ratings are those recorded after games.

`prepare.mjs` runs that predecessor's source, changing only its private
output directory. The relocated source and its hash are kept privately. No
predecessor or shared file is edited. The archive stores record ids as URLs;
the app's `gameIdOf` maps them to the review service's game keys.
The original ids and order stay unchanged in the move files.

The punish guard uses every held-out game, including games with no counted
move. The reviewer expanded the guard from the 28 frozen held-out cases to
all 324 held-out games before any effect was computed. The small frozen
subset might not distinguish the fixed margin from sampling noise. Only the
evidence set changes; every other part of the rule below is unchanged.

Routine evidence is rebuilt at the pinned app, through the same archive
conversion and review service as the accuracy project's builder. It starts
a fresh engine for each game, with no eval cache. The CLI still saves reviews
even with `--no-cache`, so `review-one.mts` calls the app service directly
with review storage and archive key caching disabled. Tablebases are disabled
to keep the run local. These settings are unchanged from phase 1 and recorded
in the evidence manifest. The two completed timing reviews are retained after
checking that their cases and all instrument settings match the expanded set.

The frozen records' old event counts describe that subset only. They do not
bound the guard, and their probabilities, outcomes and verdicts are not
reused. The full guard is extracted from the rebuilt reviews on all held-out
games, without an extra move-clock or ply filter.

## The instruments

Every band comes from the app's `defaultMaiaElo`; every policy comes from
`createNodeEngine().humanPolicy`. The baseline is 250 for both people. The
move measure is natural log probability of the move played, averaged over
moves, not an average of game averages. Policies retain full precision and
legal-move order. We keep full precision rather than the predecessor's six
significant digits to avoid rounding ties in the larger grid. A missing or zero played probability stops the fit; it is
not silently floored. Only distinct band pairs are run for a position.

Candidate A has two offsets, each on the app's allowed 0 to 500 range in
steps of 25: 441 combinations. The player's offset follows him into either
input of Maia, and the opponents' follows them. On his moves, self is his
converted rating and opponent is theirs; on their moves these roles reverse.

Candidate B is one function for both people:

    o(r) = clampOffset(a + b * (r - 1000))

Here `clampOffset` is the app's rounding and clamping function, followed by
its `defaultMaiaElo(r, o(r))`. The intercept a runs from 0 to 500 in steps
of 25; b is one of -0.75, -0.50, -0.25, 0, 0.25, 0.50, 0.75: 147
combinations. The anchor is a round chess.com rating, chosen without a new
fit. A straight line is the smallest family with a slope that can follow the
predecessor's thirds. Symmetric slopes leave the direction to the fitting
half, and keep converted rating increasing with rating before rounding.
Clamping keeps every offset allowed, even outside this sample. Constants,
including 250, are in the family. No knots, extra groups or grid expansion
will be chosen after the run.

Both candidates maximize mean log-likelihood over every fitting move, jointly
in their two parameters. Exact ties for A minimize squared distance from
(250,250), then the absolute difference of its offsets, then player offset,
then opponent offset. B ties minimize absolute slope, then distance of a
from 250, then a, then b. No tolerance turns nearly equal fits into ties.

## The estimate

For each fitted candidate, the gain is its held-out mean log-likelihood minus
250's. The fit is held fixed. Draw 324 games with replacement from the 324
held-out games (in general the full held-out game count) for each of 1,000
draws. All comparisons use the same draws, from the predecessor's
mulberry32 generator, seed 7, in game order. Sum the paired log-probability
differences and divide by the number of counted moves in that draw. No game
is divided between halves and no bootstrap draw refits a candidate.

Quantiles sort the 1,000 draw values and take zero-based index
round(q * (1000 - 1)), just as the predecessor does. Report the 95%
percentile interval at q = 0.025 and 0.975. A zero denominator makes a
comparison inconclusive; it is not dropped to improve its interval.

## The rule, fixed before any effect is computed

A candidate must improve the fitting half strictly and win the held-out
comparison. Across A and B, use Holm at family level 0.05. The doubled
lower-tail bootstrap p for positive gain is
min(1, 2 * (1 + number of draws <= 0) / 1001). The added draw avoids zero
p-values. Doubling matches the lower tail of a two-sided confidence interval;
a convincing loss receives a large p and cannot block a convincing gain.
Sort the two p's,
breaking an exact tie by A first. Adjusted p's are min(1, 2*p_first) and
min(1, max(2*p_first, p_second)). A win requires adjusted p < 0.05 and the
ordinary 95% interval entirely above zero. It also requires the stage's
percentile interval entirely above zero: 97.5% (0.0125, 0.9875) for the first
comparison, 95% for the second. The second cannot win if the first held-out
test fails. These are step-down decision intervals, not a claim that two
unadjusted 95% intervals are simultaneous. The bootstrap tail procedure is
the lab's approximation, with finite-draw resolution reported.

A likelihood winner must also pass the punish guard. Events follow
`maia-punish/events.mts`: an error costs at least 5 points of the mover's
winning chances in the app's routine review; the next reply is non-book
(`judged !== null`) and has a `bestUci`. E1 is whether that best reply was
played. The primary set keeps replies with verified or terminal evidence.
All non-book replies form a second guard set, because verification selects
partly on the reply's quality. Neither set adds the move-likelihood clock or
ply filter. Both error directions are checked separately.

For each event q is the probability of `bestUci` at the replier's converted
band, with the other input at that same band. This is the app's current
punish instrument and the predecessors' calibrated instrument. For A the
opponent offset applies after the player's error and the player offset
after an opponent's. B converts the replier's rating. The baseline uses 250.
We do not change punish to actual-opponent conditioning in this port.

The guard measure is mean (q - E1)^2, the predecessors' Brier score. Its
difference is candidate minus 250; lower is better. Use the same held-game
draws as above over all held-out games, retaining games with no qualifying
event, and divide by each draw's event count. Require the upper end of the
97.5% percentile interval (q = 0.9875) to be at most 0.005 in each of four
cells: verified and all replies, each in both directions. Report ordinary
95% intervals too. This is Bonferroni over the two candidate guards;
within a candidate all four conditions must hold, an intersection-union
guard. The extra conservatism is deliberate. No events in a cell, missing
evidence, or a draw with no events means no adoption, not a pass.

The fixed margin, 0.005 absolute Brier, permits at most half a percentage
point of mean squared probability error by the upper bound. It is a small
practical tolerance on a [0,1] score, chosen before a candidate score. It is
not a five-point probability error. Brier measures predictive accuracy,
including calibration and resolution; passing does not prove calibration
in every subgroup. This is positive evidence of noninferiority, stricter
than the calibration predecessor's absence of significant harm.

If exactly one candidate wins and passes, it is adopted for a later port.
If both do, adopt the larger observed held-out gain. An exact tie goes to B,
which does not require owner identity. This tie-break compares gains; it
does not establish that the chosen winner significantly beats the other.
A likelihood gain with a failed or inconclusive guard is not adopted. If
neither is eligible, 250 stays. Fine-tuning is a separate round and is not
started here. This project writes no app port.

## Also reported, without a rule

Report fitted parameters, fitting and held-out gains, gain by mover side and
by mover-rating third, and Maia's first-choice share at each fitted candidate
and at 250 on fitting, held-out and all moves. Thirds use the predecessor's
all-move rating cuts: nearest quantiles at 1/3 and 2/3, with r below the first
cut, below the second, and the rest. Draws and fixed fits remain the same.
Tied first choices use the app policy's first legal-move entry, as the
predecessor did. These groups and shares never decide adoption.

Report the punish probability bins from the predecessor: [0,.1), [.1,.2),
[.2,.4), [.4,.6), [.6,.8), [.8,1], with mean probability, E1 share and
95% Wilson intervals, separately for every guard cell and baseline/candidate.
The old bin rule (at least 15 events and mean q at most .10 beyond the Wilson
interval) is shown descriptively. It adds no new decision rule here.

`call-sites.md` lists every conversion call and the side it models, including
injected callbacks, exports, tools and tests. It is the map for a later port.

## Compute

Use Node Maia through the app. The phase-1 timing sample is 32 eligible moves
selected by Fisher-Yates with mulberry32 seed 7, split alternately between
two processes, all distinct candidate pairs per move. Timing caches are
separate and excluded from the fit. The review timing slice is the held
frozen cases nearest the 25th and 75th percentiles of game length, ties by id.
Completed review files can be reused in phase 2. Every held-out game is then
reviewed for the guard; the frozen timing slice does not restrict that set. Timings do not score E1 or
candidate gains. The app may compute its own ordinary review probabilities
internally; these are not candidate comparisons.

Run at most two heavy workers at once, each nice 10. Policy caches resume by
completed position, repair only an incomplete final JSONL append, and reject
changed app, inputs or design. Review caches resume by completed game and
check provenance. Cost is the maximum of the two shard workloads times the
measured seconds per policy call, plus review seconds per ply times held
game plies divided by two. Punish-policy cost is provisionally scaled from
the old frozen subset by held-out plies; actual event counts are unknown
until the full evidence is rebuilt. Report startup separately, a 1.5x planning
allowance for the fanless machine, and cache size extrapolated from the slice.
This is a projection, not a sustained thermal benchmark. Other projects
share this machine, so the full run may take longer; worker count stays at two.

`run-phase2.mjs` runs the stages below in order, records their elapsed time,
and checks that the analysis source and inputs stay fixed. Its private state
and worker journals let an interrupted run resume without starting another
pair beside surviving workers. It writes aggregate runtime reports after the
fit. The controller and journal recovery were added before the full run;
they do not change the instruments or the rule.

`protocol.md` preserves the approved all-held-games README byte for byte;
its SHA256 matches the phase-1 report. `protocol-manifest.json` freezes that
text and the execution sources by content hash. The controller checks each
hash against the working file and its committed content. Lab branch commit
ids are not provenance, because review rebases change them. The pinned app
and records commits remain provenance. The one-time pre-effect migration
preserves completed policies and timing records, and permits only process
control and provenance changes to the controller.

Long jobs start in independent OS sessions with output attached directly to
private log files. `launch.py` detaches the controller; the controller detaches
its workers. No job depends on an interactive session's output pipe. Resume
uses the same launcher and first checks the saved worker identities and groups.
Interrupted attempt time is reported separately from the gap before resuming.

A review timeout leaves its completed predecessors intact and makes the
review stage fail before event extraction. `recover-review-timeouts.mjs`
inspects such a stopped attempt without changing it. Its explicit `--resume`
accepts only a fully accounted timeout-only failure before any later stage,
with no surviving or ambiguous worker groups and unchanged committed source
and input hashes. It preserves the failed attempt and a private state backup,
records the reviewed restart, and invokes the same detached launcher. It
does not change the timeout, review settings, games or analysis. The helper
and launcher must themselves match committed content before a restart.

The helper's separate execution report distinguishes completed review worker
time, failed timeout wall time, and stage wall time. These are elapsed times,
not CPU-active time; scheduling gaps or machine suspension can lengthen them.
A temporary AC-only sleep guard may follow the verified launcher process.
It ends with that process and changes no permanent power setting.

The review timing invocation also lowered the coordinator's priority before
its workers ran `nice -n 10`; that reduced their priority twice. The commands
below leave the lightweight coordinator at its normal priority and apply
nice once to each heavy worker. The projection retains the measured time.

No Python replacement is used. If a future run changes that decision, before
using it fix a new parity protocol in a reviewed commit: 64 seeded positions
(seed 7), both sides and every pair those positions reach, compare every
legal move to Node, require maximum absolute difference <= 1e-5 and identical
legal-move sets, and report the maximum and timing. No Python policy may
enter this study without that check. This is not permission to select a
backend by its fitted result.

## What the app would take

A needs separate player and opponent profile offsets, explicit owner identity
in review/defense calls, and the correct offset wherever that person's band
appears. B needs a shared rating function, profile parameters and consistent
inverse labels for Maia bot levels. The bot's explicit self band stays a Maia
band; its human opponent input uses the player's conversion. Punish and
defense currently ignore the profile's offset and need their own plumbing.
Findability keeps equal-band conditioning. Unknown-owner games keep 250 for
A, outside the supported personal setting. B's clamped linear conversion is
monotone; displayed inverse ratings must be derived from the forward map,
with rounding ties defined in the port. Cached learner levels must refresh.
The experiment validates human move probabilities, not synthetic bot strength.

## Caveats

The predecessor's exploratory findings used all these games and motivated
this project. The requested halves are held out from this fit, not a fresh
confirmatory sample independent of that exploration. A later archive is
needed for that stronger claim. Alternating games also share opponents and
the player's learning over time; the game bootstrap treats games as the units
and does not model serial dependence or repeated opponents.

One player, his opponents and post-game ratings are the population. Maia's
lowest band merges weak ratings. A fitted offset absorbs model mismatch and
is not a general conversion between chess sites. The guard uses every
held-out game, but uses the engine's single best reply as its outcome and
retains the verified set's outcome selection. Its all-reply
check helps expose that selection but cannot remove it.

## Files and running it

| File | What it does |
|---|---|
| `design.mjs`, `io.mjs` | Fixed grids, app conversions, seeds and cache provenance. |
| `prepare.mjs` | Runs predecessor positions with only its output redirected; builds all held-out review cases and counts the frozen timing subset. |
| `weights.mts` | Gets and verifies the app's pinned Maia weights inside this clone. |
| `policies.mts` | Resumable two-shard move or punish policies; separate timing mode. |
| `evidence.mjs`, `review-one.mts`, `events.mjs` | Rebuild routine evidence through the app service and extract the predecessor's event definition. |
| `count.mjs` | Writes aggregate counts, timing and cost, without scoring effects. |
| `fit.mjs` | Phase 2 only: applies the fixed rule, after an explicit `--phase2`. |
| `run-phase2.mjs` | Runs phase 2 in order with two heavy workers, resumable private state and aggregate stage timings. |
| `launch.py` | Starts the controller detached, with a private log and PID record. |
| `recover-review-timeouts.mjs` | Inspects stopped timeout-only review failures, records a checked restart, and writes aggregate execution and recovery reports. |
| `protocol.md`, `protocol-manifest.json`, `freeze.mjs` | Approved rule text and reproducible content hashes; fixed before effects. |
| `tests.mjs` | Synthetic checks for side mapping, ties, Holm, event weighting and the guard; never reads the player's data. |
| `call-sites.md` | Conversion callers and later port scope. |
| `paper/` | Protocol paper and checked number generator; no TeX build here. |

The phase-1 commands below record how preparation and the timing slices were
run, sequentially. `results/phase1.json` is the frozen preregistration report;
do not overwrite it during phase 2 or while resuming. The current paper
generator requires the completed phase-2 result.

```bash
bridge/run.sh projects/maia-player-offsets/prepare.mjs
nice -n 10 bridge/run.sh projects/maia-player-offsets/weights.mts
for k in 0 1; do
  nice -n 10 bridge/run.sh projects/maia-player-offsets/policies.mts --benchmark --kind move --shard $k/2 &
done
wait
bridge/run.sh projects/maia-player-offsets/evidence.mjs --benchmark
bridge/run.sh projects/maia-player-offsets/events.mjs --benchmark
nice -n 10 bridge/run.sh projects/maia-player-offsets/count.mjs
bridge/run.sh projects/maia-player-offsets/tests.mjs
.venv/bin/python scripts/check_private.py
```

Phase 2, after review of this commit (no new grid choices):

The controller runs the stages below and resumes them after interruption.
For a fresh private directory, first run `prepare.mjs` and `weights.mts` as
above. A resumed run keeps its existing prepared files and policy caches.
Start it detached, at normal coordinator priority:

```bash
.venv/bin/python projects/maia-player-offsets/launch.py
bridge/run.sh projects/maia-player-offsets/run-phase2.mjs --status
```

The launcher records the PID and log path in the private `phase2-launch.json`.
If a finished review attempt failed only through timeouts, inspect it first,
then resume through the checked helper:

```bash
node projects/maia-player-offsets/recover-review-timeouts.mjs
node projects/maia-player-offsets/recover-review-timeouts.mjs --resume
```

The content-manifest migration, before resuming the interrupted first pass,
is `bridge/run.sh projects/maia-player-offsets/run-phase2.mjs --migrate-pre-effects`.
It requires the manifest and source files to be committed and refuses any fit
attempt or result. The stages below document what the controller executes;
use the detached launcher for long runs:

```bash
for k in 0 1; do
  nice -n 10 bridge/run.sh projects/maia-player-offsets/policies.mts --kind move --shard $k/2 &
done
wait
bridge/run.sh projects/maia-player-offsets/evidence.mjs --full
nice -n 10 bridge/run.sh projects/maia-player-offsets/events.mjs
for k in 0 1; do
  nice -n 10 bridge/run.sh projects/maia-player-offsets/policies.mts --kind punish --shard $k/2 &
done
wait
nice -n 10 bridge/run.sh projects/maia-player-offsets/fit.mjs --phase2
.venv/bin/python scripts/check_private.py
```

After the run completes, write its execution report:

```bash
node projects/maia-player-offsets/recover-review-timeouts.mjs --report
```

Then update the paper's prose and generator to the result, with claim checks,
regenerate its TeX, and obtain the lab's review. Do not push. All per-game and
per-position files stay under `private/maia-player-offsets/`; `results/`
contains only aggregates written by scripts.
