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

## Second acquisition amendment, approved before the comparison

The first amended batch stopped at a retained observed replay that did not
reproduce its canonical document. The preserved bytes show that its raw
verification evidence agrees with the canonical verification history.
Every differing position and record lies in the later routine teaching
branch. A failed human-policy call precedes that branch's changed target
selection and search history. Another failed call comes after document
construction and cannot explain those core differences. The source and
byte [diagnosis](results/human-failure-diagnostic.md) is reported separately;
it runs no engine and computes no
class, share or verdict.

The reviewer reported heavy outside load on this Mac from 02:00 through
03:40 Pacific on 20 October 2026, while these replays were running. The old
trace retained failed-call flags and durations, but not error reasons.
Load is a plausible acquisition cause, not a proved cause. This amendment
is approved and committed before another observed replay or any deciding
metric. Its manifest freezes this section, the preceding amendment, the
stopped-output manifest and the diagnostic by content hash.

Keep every canonical document, first replay, accepted observation and log
already produced. Their hashes stay fixed. The frozen baseline and device
outputs stay fixed too. No output is replaced. Apply the following
classification to every retained or new amended routine replay, using the
unchanged equality check on positions, records, coverage and provenance.
A matching replay is accepted. A mismatch is an infrastructure failure
only if it recorded failed calls and every differing row is downstream of
those calls. Otherwise it stops the run.

The downstream test is conservative. It requires equal verification
readings for every raw look, unchanged coverage and provenance, unchanged
non-deep position fields, and changed records only at the changed
positions. The first relevant failure must be an after-verification
human-policy call before teaching searches. The retained teaching targets,
their order, evidence histories and calls must account for every changed
row: a target selected on only one side, or a common target reached after
the teaching histories have diverged. A shared teaching prefix must agree.
Each final reading must belong to its side's retained verification or
teaching history. Any unaccounted row, earlier engine failure, or missing
dependency evidence stops the run. Source hashes bind this explanation to
the measured app. This is a source and data dependency test; it does not
claim a unique counterfactual cause.

For this source path, require exactly one target substitution, equal
target counts and an equal shared teaching prefix. The canonical
punishment entries must establish policy availability, while the replay
records its absence. Require complete raw verification readings, equal
retained verification histories apart from stability labels discarded by
teaching, and exactly equal evidence at the last verification event.
These are conservative refusal conditions for the dependency diagnosis.
They do not authorize a retry because a reading is incomplete.

An infrastructure failure receives exactly one further observed replay of
the same game, after the quiet gate below. Keep the rejected first replay
in place and save the additional output separately before testing it.
Retain every failed call's error name, message, stack and cause when
provided, privately, along with call order, stage and timestamps. If the
additional replay reproduces the canonical document exactly, its bytes
become the accepted observation and both attempts are reported. Any
additional mismatch or acquisition failure stops the run; there is no
third attempt. A process interruption with no completed output is
inspected before resumption, never silently retried. Completeness, a
class, a share and the direction of a comparison cannot authorize a retry.

First run the one eligible retry, then the ten unmade first replays in
frozen game order, one game at a time. The same classification applies to
each new first replay. Before each replay, require no active
`npm run verify:pr` or `vitest` process anywhere on the machine and a
one-minute load average strictly below 6 for five continuous minutes.
Sample every five seconds. A blocking process, load at or above the limit,
failed scan, sampling gap over fifteen seconds, or clock drift over two
seconds restarts the window. Keep the readings and a hashed receipt
privately. A passed gate does not reserve the machine against later work.
Run detached with file logs, nice 10 and at most two heavy processes.

Report every first replay and additional replay separately, with its
acceptance, failure classification and elapsed time. Mark any replay whose
measured interval overlaps 02:00--03:40 Pacific on that date as measured
under heavy outside load. Keep first-pass and retry timing summaries
separate, and distinguish loaded first-pass times from later quiet-gated
times. The registered analysis uses the accepted observation for each
game; explicitly label any timing aggregate that includes an accepted
retry. Do not silently pool first and additional attempts or substitute
quiet times for the loaded first-pass measurements.

The lab pin advanced after this study's acquisition. The study continues
to use its frozen app and records, not the newer lab pin. An isolated
execution directory inside this project's private namespace contains
byte-identical copies of the registered measurement and bridge files and
a study pin with the app and records identities in the design manifest.
Its cache and data links resolve only inside this clone. It records the
copied files and binding by content hash, verifies the original design,
candidate and determinism checks, and leaves the lab pin untouched.
No candidate, canonical document or phase-one search is rebuilt for this
path binding.

All prior checks remain, including exact reproduction and the immutable
stopped manifests. Only the approved additional observation can satisfy
the observation requirement after a classified infrastructure failure.
When all sixty observations are accepted, run the registered reference
and analysis scripts without changing them. The sets, evidence treatment,
budgets, estimator, bootstrap and decision rule do not change. Report the
result, then stop before changing the README's answer or the paper's
conclusions. The app port remains separate.

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
| `human-failure-diagnostic.mjs`, `generate-human-failure-diagnostic.mjs` | Check the preserved mismatch against the measured app's teaching dependencies; retain exact row locations privately and publish only aggregates. |
| `second-amendment-manifest.json`, `second-amendment-code.json` | Freeze the second acquisition protocol, diagnostic, stopped outputs, execution binding and new acquisition source by content hash. |
| `frozen-runtime.mjs` | Bind unchanged measurement files to the original study pin inside this clone, without rebuilding or moving the lab pin. |
| `second-amendment.mjs`, `second-probe-source.mjs` | Preserve each new observation, retain call errors, apply the approved failure classification and enforce exact reproduction before acceptance. |
| `quiet.py`, `second-launch.py`, `second-run.py` | Gate each replay on the prescribed quiet window, launch detached with file logs, and run the registered reference and analysis after complete acceptance. |
| `second-report.mjs` | Report the retained attempts and timing groups, including loaded first passes and quiet-gated retries, without changing the analysis. |
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

## Running the second acquisition amendment

The earlier stopped report and its commands describe the preserved first
amended run. The second amendment above is the sole authorization for a
further observation. Its diagnostic can be regenerated from the same bytes:

```bash
CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" \
  bridge/run.sh projects/second-look-fresh/generate-human-failure-diagnostic.mjs --preserved
```

After its protocol and source manifests are committed, launch:

```bash
.venv/bin/python projects/second-look-fresh/second-launch.py --phase2
```

The launcher prints its PID and private log paths. The driver first checks
the private execution binding and all frozen output hashes. It runs one
prescribed observation after each fresh quiet receipt, saves and classifies
it, then checks all sixty accepted observations. Only then does it run
the original `reference.mjs --phase2 --shard 0/2` and `--shard 1/2`
at nice 10, followed by the original `analyze.mjs --phase2`.
It writes no README answer, paper conclusion, commit, push or app port.

Logs, quiet receipts, exclusive attempt-start records, every produced
observation and classifications live under
`private/second-look-fresh/second-acquisition/`. A process interruption
after an attempt-start record blocks another search until inspected.
An already produced observation is recovered from its retained bytes.
Reference checkpoints resume as registered. The old launcher is not used
to bypass this amendment's gate.

## Third acquisition amendment, approved before the comparison

The preserved second acquisition stopped during a routine replay. Its
adaptive verification call spans a sleep and wake recorded by the macOS
power log. The log names low battery as the reason for sleep. The retained
reading, position and record differences all follow that call. The
[diagnosis](results/suspension-diagnostic.md) checks the saved bytes,
process clocks, power log and app source without a new search or a deciding
metric.

The app uses a timer for its search deadline. The observed wrapper did
not retain the search slot's start time, deadline result or returned
completion status. A deadline computed from wrapper entry would fall
inside the logged sleep interval. That does not establish when the slot
timer was armed or which terminal path the app took. The source can end a
search through either its deadline handler or a normal bestmove response.
The old observation cannot distinguish them.

This amendment is approved before the comparison. Preserve every existing
canonical document, observation, rejected output, classification, log and
manifest. Replace nothing. Keep the second amendment's human-policy
failure rule and every original equality and completeness check. Apply
the following additional rule to the stopped replay and every remaining
replay. No chess class, share, comparison direction or candidate verdict
enters this acquisition rule.

A suspension failure must fail the unchanged equality check on positions,
records, provenance and coverage. It must also have calendar elapsed time
minus the sleep-excluding Python monotonic elapsed time strictly greater
than sixty seconds, or a power log documenting sleep during the replay.
Every differing reading, position and record must be accounted for
downstream of a search that the app ended through its deadline path, with
that deadline falling inside the suspension interval. Check the retained
trace and the measured app's source. A recorded deadline result or
equivalent unambiguous control-flow evidence can establish that path.
A long call, a weaker retained reading, zero thrown errors or a nominal
expiry computed from wrapper entry alone cannot establish it. Missing
terminal evidence leaves eligibility unestablished.

An eligible failure receives exactly one additional observed replay of
the same game. Save it separately before checking equality. Accept it
only if it reproduces the canonical document exactly. Keep and report
both outputs. Any mismatch or acquisition failure in that additional
replay stops the run. There is no third attempt, including when a failure
meets more than one infrastructure explanation. Every other mismatch
still stops the run. Do not repeat an already produced output.

Before each authorized replay, require AC power from `pmset -g batt` and
an open lid from `ioreg -r -k AppleClamshellState`. Retain the command
outputs privately. Unknown state, command failure, battery power or a
closed lid holds the gate. Sample every five seconds while waiting.
Require these conditions before starting the unchanged second-amendment
quiet window and check them again immediately before launch. A failed
final check restarts the gate. The quiet window still requires five
continuous minutes below a one-minute load average of six, with no
`npm run verify:pr` or `vitest` process. Its existing sampling and clock
gap checks stay fixed.

Run every authorized replay with both `caffeinate -i` and `-s` assertions
for its lifetime. Keep the acquisition awake through its remaining work.
Run detached with file logs, one replay at a time, at nice ten and at most
two heavy processes. Record start and end calendar and Python monotonic
clocks for every replay. Report their difference separately from Node's
review clock. A quiet window and power assertion are precautions, not
evidence that a produced mismatch can be discarded.

If eligibility is established, run the stopped replay's one retry first,
then the six remaining first replays in the frozen order. Apply both
infrastructure rules to every output. Only sixty accepted observations
permit the unchanged registered reference and analysis steps. Preserve
the separation of loaded first-pass, later first-pass and retry timings.
Stop before the README's answer and paper conclusions.

The present diagnosis accounts for the differing rows and confirms
sleep, but cannot establish deadline termination or actual expiry.
The stopped replay therefore does not qualify under this amendment.
No new replay or later phase-two step is authorized by this finding.
The missing terminal evidence cannot be recovered by searching again.

This section is appended to the exact previous README bytes. The old
execution binding and its README copy remain unchanged. Its whole-file
README check will now refuse the added section; do not edit that binding
or use an old launcher to bypass the stop. The new diagnostic checks the
preserved binding and all its source hashes, permitting only this
manifest-bound append to the public README. The third manifest freezes
the section, diagnostic, source files and preceding stopped checkpoint
by content hash. It contains no lab-branch commit identity.

Regenerate this diagnosis and verify its registration without a search:

```bash
CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" \
  bridge/run.sh projects/second-look-fresh/suspension-diagnostic.mjs --preserved
node projects/second-look-fresh/third-amendment.mjs --freeze
.venv/bin/python scripts/check_private.py
```

## Fourth acquisition amendment, approved before the comparison

The third amendment refused the stopped replay because its trace could
not establish deadline termination. That condition required evidence the
trace never recorded: the watchdog's arming and the search's terminal
status. This amendment replaces that deadline-evidence condition. It is
written after that refusal, before any further replay, and before any
deciding metric has been computed or read.

The preserved power log records a low-battery system sleep and a wake on
AC during the rejected replay. Every differing reading, position and
record is downstream of the one adaptive search spanning that suspension.
Sleep is an outside event, independent of the arm and its result. This
does not establish which terminal path the search took.

A replay is an infrastructure failure when it fails the unchanged
equality check, the power log records system sleep inside it, and every
differing row is downstream of a search in progress when that sleep began.
It receives exactly one further observed replay of the same game. Accept
that further replay only if it reproduces the canonical document exactly.
There is no third attempt. Any other mismatch, or any mismatch on the
further replay, stops the run. The second amendment's human-policy failure
rule remains in force, with the same total limit of two attempts. A clock
divergence without a recorded system sleep does not qualify under this
replacement condition.

Check dependency from the preserved rows, call order and pinned app source,
without computing a chess class, share or verdict. The classifier accounts
for the raw adaptive reading, its retained verification reading, its
position, its record and any derived document summary. It refuses an
unaccounted difference. The source files used in this proof are checked
against the preserved diagnostic's content hashes in both app copies.

The power log's sleep entry announces a transition; client acknowledgements
can follow while the machine is still executing. Its timestamps have
one-second precision. Use the last sleep acknowledgement's second, or the
sleep entry's second if there is none, to bound that transition. A search
must have started before that second ends and must span the recorded wake.
Require a single matching sleep interval inside the replay, with no
intervening sleep or dark wake. In the preserved replay the wrapper entered
the adaptive call during the last acknowledgement's second. These log
boundaries establish overlap with suspension; they do not reconstruct a
watchdog deadline.

Keep every produced canonical document, observation, rejection,
classification, log and manifest. Replace nothing. The previous refusal
remains reported under the third rule; this rule gives the same preserved
bytes a separate classification. Keep every original equality,
completeness, reference and comparison check. Save each newly prescribed
output once, before checking it, whatever its result.

The machine is now on AC. Before each replay, require AC power and an open
lid, retain both command outputs, and wait while either cannot be
established. Keep the third amendment's checks before the quiet window
and immediately before launch. A failed final check restarts the gate.
Keep the second amendment's five continuous quiet minutes, one-minute
load strictly below six, no `npm run verify:pr` or `vitest` process, and
all its sampling and clock-gap checks. Do not shorten that window when
outside work holds the gate.

Keep both `caffeinate -i` and `-s` assertions throughout each replay and
keep the acquisition awake through the remaining work. Verify that the
assertion processes stay alive. Run detached in separate sessions with
file logs, one replay at a time at nice ten. At most two heavy processes
may run. Retain each replay's power log and calendar and Python monotonic
clocks, and report their divergence. Retain every failed call's error
reason. Unknown or failed power-log capture stops acceptance.

Apply this rule first to the preserved stopped replay. If it qualifies,
run its one retry, then the remaining six first replays in frozen order.
Apply the rule to each new observation. Only sixty accepted observations
permit the original registered reference and analysis scripts. The two
reference shards remain at nice ten. Stop before the README's answer and
the paper's conclusions.

Report the rejected and accepted attempts separately. Do not silently
mix retries into first-pass timing estimates. Keep the second amendment's
separate timings for every replay in the specified heavy-outside-load
window, and retain the sleep-interrupted replay's calendar, monotonic
and Node review times. Give each new attempt's timing and clock divergence
separately in the private report and report aggregate groups publicly.
Neither a quiet gate nor a power assertion licenses replacing an output.

The new namespace is `private/second-look-fresh/fourth-acquisition/`.
Its execution binding copies the already frozen measurement scripts and
study pin from the preserved execution root. It does not fetch, rebuild
canonicals or change either app copy. It keeps the earlier bindings intact
and checks the public README as exact manifest-bound appends. The fourth
manifest freezes this section and the preceding diagnosis and stopped
checkpoint. A separate code manifest freezes the new driver, dependency
classifier, generated observation wrapper and binding by content hash.
Neither manifest records a lab-branch commit.

Register and check this amendment before any new replay:

```bash
node projects/second-look-fresh/fourth-register.mjs --protocol
node projects/second-look-fresh/fourth-register.mjs --code
.venv/bin/python scripts/check_private.py
```

Commit the registration and code, then launch:

```bash
.venv/bin/python projects/second-look-fresh/fourth-launch.py --phase2
```

The launcher prints the detached driver PID and private log path. It runs
the unchanged reference and analysis steps only after the accepted
observation check succeeds. Generate the descriptive report from the
preserved bytes with `node projects/second-look-fresh/fourth-report.mjs
--snapshot`. After a successful registered analysis, use `--after-analysis`
instead. These commands write no README answer or paper conclusion.
