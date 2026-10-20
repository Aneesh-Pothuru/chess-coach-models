# Does a fresh second look bring the reviews together?

**The question.** Game Review on the phone, on the desktop and in the
routine starts its second look with the engine's earlier work in memory.
If each look clears that memory first, do the devices name the routine's
serious errors more often? Does the cleared look judge at least as well?

**The answer.** The comparison did not run. The approved replacement
acquisition built all 60 candidate routine documents. Of 50 first observed
replays, 49 reproduced their canonical documents and one failed the
unchanged equality check. Its first output is retained; ten first replays
remain unmade. References and analysis never started. The rule has no verdict.
The [acquisition report](results/acquisition-status.md) gives the counts;
the [execution report](results/execution.md) gives every recorded stage.

## The data

The same 60 frozen games as `phone-vs-routine`, in their frozen order, with
both players' moves. `prepare.mjs` copies the same records file that
`accuracy-vs-chesscom/build-cases.mjs --frozen` copies, into this project's
private directory. It reads the games with the app's archive service and
`rowToGame`, exactly as the review CLI does, and checks a full replay against
the frozen lengths. It does not draw a new sample or filter by time control.

The baseline is the pinned app, commit
`f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The research records are at
`aed714ada579782ce73630596e59c8b65e74cb30`. These are local checkouts; nothing
is fetched and the pin does not move. The predecessor's published app
commit is older. Its results are context, not the baseline for this test.

Phase two rebuilds every game at phone, desktop and routine in each arm
with the unchanged `accuracy-vs-chesscom/build-evidence.mjs`, through the
bridge. Each game has a fresh Node engine, one thread and no evaluation
cache. Baseline and candidate documents live separately under
`private/second-look-fresh/baseline/evidence/` and
`private/second-look-fresh/candidate/evidence/`. Manifests bind them to the
pin, frozen cases and candidate recipe. A missing, stale or incomplete
document stops the comparison; the denominator is never a convenient subset.

There is no training split and no tuning. The entire frozen sample is one
paired test of one fixed change, as the brief requires. It is not a new
held-out sample: the predecessor has already studied these games.

## The candidate

`candidate.mjs` makes two replacements from hash-checked pinned files and
passes them to `bridge/candidate.sh`. `ReviewEngine` exposes the engine's
existing `newGame` method. In `pipeline/run.ts`, the review awaits
`engine.newGame('analyst')` immediately before the initial second look and
before its optional adaptive retry. An engine without that method fails
explicitly. The engine service sends `ucinewgame`, then `isready`, and waits
for `readyok`. The Node adapter needs no change.

The initial look keeps its 750,000 nodes and three candidates. The adaptive
retry keeps its 1,500,000 nodes. Clear once before each complete look, not
between its candidate search and its restricted search of the played move.
The sweep, flags, quotas, adaptation, evidence retention, tablebase,
classification, teaching and cache policy stay as they are. Clearing the
adaptive retry too makes it another fresh look; otherwise that retry would
still depend on the preceding search. Teaching searches and manual rechecks
are outside this change.

Before comparison, a check on the first frozen game's positions runs the
same cleared look after each profile has warmed its engine differently.
The check uses the first two plies, in game order, all three baseline
profiles attempted to verify, and both verification budgets. It requires
byte-identical complete `DeepEvidence` objects at each position and budget
across all three profiles. It reads no class or error share. Fewer than two
eligible plies, incomplete evidence or a mismatch stops phase two. Equal
fixed-budget reads do not require equal final documents: profiles can choose
different retries, retain different evidence or add routine teaching.

## The measures

The gap measures are exactly the predecessor's. `isSerious(cls, judged)`
from the app's metrics service reads each final review record. A serious
routine ply absent from a device's serious set is missed; a serious device
ply absent from the routine's serious set is extra. The miss share is
missed over routine serious plies; the extra share is extra over device
serious plies. Each arm uses its own routine as its comparator. The paired
change is candidate share minus baseline share; a negative value is better.
All played plies of both sides count, including tablebase and terminal
records, as in the predecessor. Unknown records are not serious under the
app's instrument; their counts are reported.

The quality guard measures the second look itself, before routine teaching
can replace its evidence. A separate observed replay calls the app's own
`startReview`, times the engine port and saves the evidence emitted by each
`verified` event, including the accepted adaptive retry. It must reproduce
the canonical CLI document's positions, records, coverage and provenance.
This extra replay costs time but leaves the CLI builder and app pipeline
untouched. For each profile, the guard's set is the intersection of plies
attempted by both arms, not just plies whose evidence was complete. The
three profile sets can overlap; each profile keeps its own denominator.

The reference uses the app's `gatherDeepEvidence`, a cleared Node engine,
7,500,000 nodes, three candidates, the full game history and no evaluation
cache. This is ten times the nominal look, five times the adaptive retry.
It runs once per game/ply in the union of the three common sets. If the
candidate set or played score is incomplete or non-exact, repeat once from
a cleared engine at the same budget. Use the first valid attempt. An
unresolved reference makes the quality guard inconclusive and prevents a
port; do not drop that ply or raise the budget after seeing its result.

For each arm and the reference, the raw second-look verdict is
`isSerious(null, judgeMove(bestScore, playedScore, mover))`, importing both
functions from the app. This deliberately tests the search's binary
judgment, without the sweep, book labels, refinements or tablebase replacing
it. The gap measure still uses the complete review's classes. Incomplete or
non-exact arm evidence counts as incorrect against a valid reference. The
quality error rate is incorrect verdicts over common attempted plies. Its
paired change is candidate error rate minus baseline error rate. Check
phone, desktop and routine separately, so bringing two worse reviews into
agreement cannot pass the guard by itself.

## The estimate

All shares and error rates are ratios of sums over games, not means of
per-game percentages. Use 2,000 Poisson(1) bootstrap draws over the 60 games,
seed 20261014, the predecessor's mulberry32 generator and Knuth Poisson
sampler. Consume the generator in draw order, then frozen game order. The
same game weight is used for every arm, profile, numerator and denominator
within a draw. Subtract the paired ratios inside each draw. Quantiles use
linear interpolation at `(n - 1) q`, as in the predecessor.

Report ordinary 95% percentile intervals. The seven decision effects are
the four device gap changes and the three profile quality changes. Use
Bonferroni intervals for this family: tails `0.05 / (2 * 7)` and
`1 - 0.05 / (2 * 7)`, giving 99.285714% intervals individually. No effects
are added to or removed from the family after the run. Any zero point
denominator, invalid bootstrap ratio, unresolved reference or missing
paired evidence makes the affected decision inconclusive, not favorable.

This fixed family avoids choosing a favorable share or profile after the
run. Bonferroni needs no assumption about their dependence. Its tail
quantiles are coarse with the required 2,000 draws; no extra draws are
added because a result is close to a line.

The predecessor's absolute agreement bar uses its ordinary 95% intervals.
The global claim requires all four upper bounds below the line, an
intersection of requirements with no choice of a favorable endpoint.
Individual device labels are descriptive. They do not add another route
to keeping the candidate. The seven-effect correction covers the
selection between the two possible improvements for each device and the
separate quality claims.

## The rule, fixed before any comparison

1. A device's gap **narrows** if both paired point changes are strictly
   negative, at least one corrected interval lies wholly below zero
   (upper end less than zero), and the other's interval is not wholly
   above zero (lower end at most zero). The candidate narrows the gap
   only if this holds for both phone and desktop. A zero point change
   does not count as improvement. An interval crossing zero can meet the
   second requirement but cannot supply the required improvement.
2. The candidate **agrees by the predecessor's bar** if both devices'
   miss and extra ordinary 95% upper bounds are strictly below 5%.
   Per device, a lower bound strictly above 5% means differs; otherwise
   it is unclear. Equality with the line is unclear.
3. The quality guard **passes** only if all three corrected upper bounds
   for the quality error change are strictly below 0.01. This fixes a
   noninferiority margin of one percentage point: at most one additional
   wrong verdict per hundred common looks, with uncertainty counted.
   A corrected lower bound strictly above 0.01 is a quality failure.
   Otherwise that profile's quality is inconclusive. Equality does not
   pass. The margin is small enough to limit a trade for agreement,
   while allowing a finite sample to establish noninferiority.
4. **Keep for a port** only when both device gaps narrow and the entire
   quality guard passes. If the absolute bar also holds, say that the
   candidate agrees by that bar; otherwise say that it narrows the gap
   but agreement is not established. A quality failure rejects the
   candidate. Every other outcome leaves the current app in place;
   distinguish an unresolved quality guard from no established narrowing.
   Absolute agreement alone cannot rescue a failed improvement or guard.

There is no time or depth threshold for keeping the change in this round.
The measured cost accompanies any port decision. No setting is tuned to
these results, and no second candidate is tried under this rule.

## Also reported, without a rule

Counts of games, plies, flags, initial looks, adaptive retries, common looks,
reference positions, unknown records, incomplete evidence and tablebase
coverage. The same miss and extra shares for blunders and inaccuracies;
classes that differ; side accuracy differences; and whether serious
disagreements received a second look or a tablebase reading. These describe
the result and cannot change the decision.

For every profile and arm, report second-look search seconds per attempted
ply (reset plus candidate and restricted played-move searches, including
adaptive retries), and the retained depth at the verification event. Give
the count, mean, median and 90th percentile, and paired differences on
common attempted plies. Also report initial and adaptive calls separately,
reset time, total review time, and how often a restricted search was needed.
Per-ply traces remain private. Time comes from the engine port's monotonic
clock, not the engine's nominal node budget. Depth comes from app results.

Phase one's slice is the first frozen game, without looking at its labels.
Its three baseline reviews run before its three candidate reviews. Device
jobs may run in pairs; routine runs alone, leaving room for its own human
model. The reference timing slice is the first two plies in the union of
the common attempted sets. Extrapolation scales review time by total plies
and reference time by the slice's common-look density, with the whole-sample
ply count as a conservative reference-work ceiling. It includes the
observed replays needed for timing. This is a planning estimate, not a
runtime guarantee; a long run can slow as the laptop heats or its owner works.

## What the app would take

A kept candidate becomes a separate port. New phone and desktop reviews
clear the analyst before each selected second look and its adaptive retry;
the routine does the same for each of its selected looks. Their sweep
budgets, device quotas and routine tablebase stay as they are. The port
does not change which saved review Game Review opens. It keeps opening a
device's saved review first, and offers the routine's review for comparison
when it is available. Existing reviews therefore keep their old judgments
until an explicit rebuild. No migration or invalidation is part of this
candidate. The comparison option is present at this pin; the brief and the
phase-one description repeated the predecessor's older opening policy.
This source description was corrected before reading phase-two effects.

## Acquisition amendment, approved before the comparison

The original acquisition stopped at the exact-reproduction check. A saved
candidate routine review did not reproduce in two observed replays. A
separate private diagnostic found incomplete second-look evidence in the
saved review and complete evidence in the replay, with different records.
The execution logs also showed large gaps between calendar and monotonic
elapsed time and build timeouts. The reviewer judged suspension during
searches the likely acquisition failure. The rejected original replays
were not retained, so the cause is not proved by their documents. No miss
share, extra share or quality-guard result had been computed or read.

The reviewer approved rebuilding the entire candidate routine batch, not
selecting replacement moves or reviews by their completeness. This section
is committed before that acquisition starts. The original registered
protocol above and its content manifest remain intact. This amendment
changes only the acquisition of the candidate routine batch.

Preserve the old routine documents, accepted timing replays, logs and
diagnostic in this project's private directory. Freeze every baseline
document and observed replay, and both candidate device profiles, by file
content hash. Their bytes must match before and after the amended run.
The private original-acquisition manifest identifies all saved outputs;
`amendment-manifest.json` records its digest and this section's digest,
without game identifiers or this branch's commit ids.

Rebuild all 60 candidate routine documents and all 60 observed replays in
`private/second-look-fresh/acquisition-amended/`. Archive the old routine
directories under `acquisition-original/`. Only the legacy candidate
routine output paths point into the amended namespace, so the registered
reference and analysis scripts read the prescribed replacement batch.
The other profiles remain frozen in place. Keep the same games and order,
app and candidate, engine settings, CLI builder and review instrument.

Keep each first prescribed output as produced, whatever its completeness.
An incomplete look is not grounds for another search. Resume saved first
outputs without recomputing them. The observed replay gets a narrow
acquisition wrapper: it saves the first completed document and trace
privately, with an exclusive write, immediately before the existing equality
check. It changes no review call, search, timing or evidence calculation.
Its generated source is checked against the registered probe plus that
fixed persistence patch. A retained first replay without an accepted timing
file blocks another search; it can be recovered only from those same saved
bytes if all existing checks pass. A failed equality check still stops the
run. No rerun is chosen from a verdict, completeness count or comparison.
An acquisition interruption or failed call is inspected before resumption;
it never licenses replacing an output already produced.

The candidate routine batch is the sole replacement cell. The miss and
extra sets, quality guard, treatment of incomplete looks, reference budget
and retry, estimator, bootstrap, thresholds and correction are unchanged.
After the complete amended batch passes the existing checks, run the rest
of phase two as registered. Long jobs remain detached, with file logs and
at most two heavy processes at nice 10. An idle-sleep assertion accompanies
the wrapper; it does not change a search or build timeout.

Report incompleteness by arm and profile, including the old and rebuilt
candidate routine batches. Keep final retained deep evidence separate from
the pre-teaching evidence in observed replays. All old canonical documents
are available, but only three old candidate routine observed replays were
accepted before acquisition stopped. Give that denominator explicitly;
their missing pre-teaching traces cannot be reconstructed from final
documents, since routine teaching can replace evidence. Report the app's
saved partial-coverage counts too, under that name. Do not infer raw
incomplete looks by subtracting verified from flagged plies, and do not
substitute the diagnostic for a missing study replay. These are descriptive
acquisition counts and cannot change the decision rule.

## Caveats

The frozen games belong to one player and were sampled for an accuracy
study. They are not an independent holdout. The reference is higher-budget
Stockfish evidence, not ground truth, and a fresh reference can favor a
fresh candidate's search path. Its budget is fixed regardless of the
direction of a disagreement. The guard is only about common attempted
second looks, not every move or the coaching text.

Every profile here uses the app's Node Stockfish build, one thread and a
128 MB hash. Real devices use a 64 MB hash and an evaluation cache. The
candidate clears the hash but deliberately leaves that cache policy
unchanged: a cache hit can still return an earlier reading. Other work on
a shared analyst could interleave between reset and search. The serial,
uncached Node test does not settle either issue. A port needs a separate
device check before claiming identical real-device readings. Adding cache
bypass, changing hash size or serializing shared engine work would be a
new change, not silently part of this candidate.

The adaptive retry's selection and evidence retention still depend on the
sweep; equal raw searches need not yield equal retained looks. Routine
teaching can also replace evidence after verification. Tablebase service
availability and human-model loading can affect runtime. Record failed
calls and stop on document or replay inconsistencies. No public game id,
account name, game link or per-game output belongs in this project.

## Files

| File | What it does |
|---|---|
| `prepare.mjs` | Copies frozen cases privately, reads and replays games with the app, writes aggregate counts. |
| `candidate.mjs` | Generates the two replacements and builds their candidate through the bridge. |
| `runtime.mjs` | Puts the app CLI's runtime cache behind a symlink into this project's private directory, without changing its contents or app source. |
| `rules.mjs` | The fixed numerical settings. |
| `probe.mjs` | Times actual app reviews and reference looks without computing effects; saves private evidence and traces. |
| `build.mjs` | Runs the unchanged evidence builder in separate, manifest-checked arm directories. |
| `common.mjs` | Checks input, candidate, document and timing provenance for the phase-two scripts. |
| `reference.mjs` | Builds the common-set reference in phase two, resumably. |
| `analyze.mjs` | Applies the fixed rule in phase two only. |
| `phase1.mjs` | Writes the aggregate counts, timings, determinism check and cost estimate. |
| `phase2.sh` | Runs the complete phase-two sequence with bounded concurrency. |
| `design-manifest.json`, `provenance.mjs` | Freeze the approved measurement files, unchanged evidence builder and registered protocol by content hash; no lab-branch commit id is required. |
| `launch.py`, `run.py`, `status.py` | Launch phase two in a detached session with file logs, timestamp its output and read its status and checkpoint counts. |
| `recover.mjs` | Mark an interrupted wrapper's last observed output without inventing its stop time; refuse while project workers remain. |
| `execution.mjs` | Write aggregate stage timings on monotonic and calendar clocks, rejection and timeout counts, lower bounds and unallocated gaps after an interrupted run. |
| `amendment-manifest.json`, `amendment-code.json` | Freeze the approved acquisition amendment, original checkpoint manifest and narrow persistence wrapper by content hash. |
| `amendment.mjs`, `phase2-amended.sh` | Archive the original routine batch, check every frozen output, preserve first rebuilt outputs and run the registered sequence through the amended acquisition. |
| `acquisition-report.mjs` | Write descriptive incompleteness counts by arm, profile and original or rebuilt routine batch, with missing observed coverage explicit. |
| `acquisition-status.mjs` | Write the stopped acquisition audit, verify all frozen and first outputs, and refuse active workers or deciding outputs. |
| `replay-diagnostic.mjs` | Aggregate reproduction differences, evidence availability and failed calls in retained rejected first replays; compute no chess verdict. |
| `paper/` | The paper, generated quantities, table formatter and claim checks. |

## The stopped acquisition

The amended run took 5.110 monotonic hours: 3.105 for the routine CLI build
and 2.000 for the observed stage, plus preparation and frozen-output checks.
Its calendar-minus-monotonic difference was 0.016 seconds. No build timed
out. The first rejected replay has 35 complete raw second looks and no
failed engine call. Four final deep-evidence rows and four record rows
differ; coverage and provenance agree. Two human-policy calls failed after
verification. Their error reasons were not retained. The cause of the
reproduction mismatch is not established.

The old routine's final saved evidence has 8 incomplete readings out of
2,388. The rebuilt routine has none out of 2,384. Every frozen baseline and
candidate device cell has no incomplete saved or observed evidence.
Only three original routine observed replays are available; the other
57 remain unknown. The rebuilt routine has 49 accepted replays, with
no incomplete looks out of 1,907. Its 50 retained first journals, including
the rejected replay, have no incomplete looks out of 1,942. The missing
first and accepted traces are explicit in the report. Final saved evidence,
accepted verification traces and rejected first outputs remain separate.

The immutable private stopped manifest covers the 60 rebuilt documents,
49 accepted replays and 50 first journals. All 600 frozen files and 63
archived originals still match their hashes. The first rejected output
blocks another search and the full comparison. No output was replaced and
no existing check was weakened. A further acquisition resolution needs
review; the current launcher must not be used to choose another replay.
No deciding metric was computed or read. The later work adds descriptive
reporting and paper checks only.

## Running it

From the lab root, phase one:

```bash
nice -n 10 bridge/run.sh projects/second-look-fresh/prepare.mjs
node projects/second-look-fresh/candidate.mjs
node projects/second-look-fresh/runtime.mjs baseline
node projects/second-look-fresh/runtime.mjs candidate
# Run baseline profiles first, then candidate profiles, at most two devices
# together and routine alone. The run log is results/phase1.md.
nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --variant baseline --profile phone
nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --variant baseline --profile desktop
nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --variant baseline --profile routine
for p in phone desktop routine; do
  CHESS_DIR="$PWD/.cache/chess/candidates/second-look-fresh" nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --variant candidate --profile "$p"
done
nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --reference
bridge/run.sh projects/second-look-fresh/phase1.mjs
```

The original phase-two sequence is `bash projects/second-look-fresh/phase2.sh --phase2`.
After the acquisition amendment, launch its checked replacement through the
detached wrapper so a tool-session interruption cannot close its output pipe:

```bash
.venv/bin/python projects/second-look-fresh/launch.py --phase2 --amended
.venv/bin/python projects/second-look-fresh/status.py
```

The amended driver generates the registered sequence with the narrow
candidate routine persistence patch and a completion check before analysis.
It checks the frozen baseline and device outputs and archived routine files.
The sequence names every build, observed replay, reference shard and analysis
command. It refuses to proceed without the phase-one determinism check.
All long steps resume completed games or reference positions. A changed
manifest requires a new output directory, never silent mixing. The script
does not commit or push. The launcher records its PID and private log paths;
the wrapper and phase-two script each have their own session, and their output
goes to regular files. A live recorded wrapper prevents another launch.
The launcher also runs `caffeinate -i -w` for the wrapper's lifetime to
prevent idle system sleep from consuming the builders' elapsed-time limits.
The original phase-one commands above are historical; any long rerun must
also be detached with file output.

If a wrapper is killed, first check that its workers have stopped. Then mark
its unfinished logging metadata, using the basename reported by `status.py`,
and launch again:

```bash
node projects/second-look-fresh/recover.mjs --interrupted LOG-run.json
.venv/bin/python projects/second-look-fresh/launch.py --phase2 --amended
```

The recovery helper changes only logging metadata. It does not change a game
checkpoint or an app manifest. An unobserved end leaves the last stage's time
as a lower bound. The interval to resumption stays unallocated, since it can
contain both work and downtime.
An amended acquisition failure must be inspected before resumption. A saved
first replay cannot be replaced; a reproduction failure still blocks the run.

The execution report retains both clocks over the same observed intervals.
Calendar minus monotonic elapsed is an unattributed clock difference,
consistent with suspension but not proof of its cause. Neither clock is
CPU time. This difference stays separate from gaps between invocations.
Logged replay rejections and build timeouts remain in the report even when
an unchanged resumption completes the missing work.

The present acquisition is stopped at its retained reproduction failure.
Regenerate its reports without a search:

```bash
node projects/second-look-fresh/execution.mjs
bridge/run.sh projects/second-look-fresh/acquisition-status.mjs --stopped
bridge/run.sh projects/second-look-fresh/paper/generate.mjs
.venv/bin/python scripts/check_private.py
```

`acquisition-status.mjs` recomputes descriptive counts and rechecks the
stopped manifest. It cannot complete acquisition or compute a comparison.
`acquisition-report.mjs --phase2` is reserved for a complete comparison and
currently refuses to run. The paper generator recomputes the stopped
report, checks its prose claims and the frozen content manifests, and
refuses if the recorded failure or absent deciding outputs change.
The manifests survive a rebase of the lab branch. The app pin and records
commit still identify the inputs. No PDF is built.
