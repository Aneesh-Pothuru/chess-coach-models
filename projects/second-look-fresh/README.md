# Does a fresh second look bring the reviews together?

**The question.** Game Review on the phone, on the desktop and in the
routine starts its second look with the engine's earlier work in memory.
If each look clears that memory first, do the devices name the routine's
serious errors more often? Does the cleared look judge at least as well?

**The answer.** Not measured in this phase. This is the design, the data
count and a small timing run. No miss share, extra share, paired change or
reference agreement is computed here. The rule below is fixed before any
of them is computed. The timing run may build private review documents,
but reads only coverage, search budgets, time, depth and a determinism check.

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
device's saved review first, and asks for the routine's only when it has
kept none. Existing reviews therefore keep their old judgments until an
explicit rebuild. No migration or invalidation is part of this candidate.

## Caveats

The frozen games belong to one player and were sampled for an accuracy
study. They are not an independent holdout. The reference is deeper
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
| `paper/` | The phase-one design and timing paper; no comparison claim. |

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
bridge/run.sh projects/second-look-fresh/paper/generate.mjs
```

After this design has been committed and reviewed, phase two is:

```bash
bash projects/second-look-fresh/phase2.sh --phase2
```

That script names every build, observed replay, reference shard and analysis
command. It refuses to proceed without the phase-one determinism check.
All long steps resume completed games or reference positions. A changed
manifest requires a new output directory, never silent mixing. The script
does not commit or push. The phase-one paper generator refuses comparison
results; the results paper is written only after phase two, with its own
claim checks. TeX is not installed and no PDF is built in phase one.
