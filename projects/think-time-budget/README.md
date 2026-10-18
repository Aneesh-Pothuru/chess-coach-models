# Does a larger clock budget make a think pay?

**The question.** The app tells the player when to stop and think through
`triggerOf` in `src/services/method/day.ts`: the book exit, a position to
convert, a forcing moment and a pawn capture outside the endgame. The
[think-time-rapid](../think-time-rapid/) study could not see a long think
cutting errors at any of them. Players chose long thinks in positions that
were harder than its danger score could show. Here the comparison is within
players who chose different clock budgets before the game: their rated rapid
games at 600+0 against their rated rapid games with more time. Does the extra
minute spent at a trigger go with fewer serious errors than the extra minute
at an ordinary move? Does another moment do better?

**This run.** This is the design and its count. No budget effect, error rate,
per-moment think mean, ratio, interval, p-value or verdict has been computed.
The aggregate count and the timings are in `results/phase1.md`. A fitted
danger score is used only to count the high-danger candidate and common
strata, and to time that step. Its fit is fixed below; its accuracy and error
rates are not inspected in this phase. The paper describes the design and
counts, and makes no claim that more time helps.

## The data

The Lichess monthly database (CC0), starting with September and August 2026.
The stream keeps compact JSONL gzip files under `private/think-time-budget/`;
it never saves the monthly archive. Start with the first million source
games in each month, rounded up to the end of a complete zstd frame. Count
the combined sample only when both prefixes have reached that target. If
fewer than 2,000 primary players have two games in each budget, extend each
unfinished source by another million source games and count again. Stop at
the first such joint checkpoint meeting the target. If both months are
exhausted and the target is still missed, add July, then June, in that order,
in the same million-game increments. Four months is the limit. Stop when
the target is met or all four sources are exhausted, even if some moments
will have too little support for a verdict. The final source prefixes, stop
reason, games read and kept per month are recorded by the stream and printed
in the count report. No outcome can extend the sample.

**The budgets.** Fast is exactly 600+0. Slow has a base of at least 600
seconds and base + 40 times increment of at least 900 seconds. In both cases
the PGN `Event` must begin `Rated Rapid`; this is Lichess's category, not a
category reconstructed from a clock formula. The slow bar makes the nominal
budget at least half as large again while keeping an initial clock no
shorter than his. It admits 900+0, 600+10 and 900+10 when Lichess files them
as rapid, and any other control meeting those same conditions. The report
lists every admitted control and its game share, separately for the kept
pool and the selected players. The base and increment are read as integer
seconds; unlimited and malformed controls are excluded.

Only games carrying an eval and clock for every move are kept, including
the final move. This follows the brief's literal completeness requirement;
the predecessor reader's exception for an unannotated final mate is not
used.
They must end normally or on time, have at least 20 plies, have two numeric
ratings within 300 points, and replay and classify through the app. Missing
player names are excluded. Names are case-normalized solely to join a
player's games and stay private, as do identifiers, games and per-player
rows. There are no rating quotas. A game that fails the bridge build is
removed before the final player count and selection.
The count command refuses to proceed after such a failure; the cohort must
be repaired and exported again before the build resumes.

**The players.** A player needs at least K kept games in each budget over
the sampled months. K is chosen from the counts, before effects: the largest
of 5, 3 and 2 that leaves at least 2,000 primary players and retains at least
80% of the primary players qualifying at K = 2. If none meets both bars, K
is 2 and the count report says that the size target was missed. The choice
keeps most of the players who use both budgets while asking for more repeat
games when the counts permit it. Every kept game of a selected player is
used, not just the first K. The size target is for feasibility, not an error
rate or an effect-size calculation.
The frozen run uses K = 2. Its September and August prefixes reached the
target without another month; the alternatives and exact source counts are
in `results/cohort-counts.md`. Phase two uses that frozen export.

**His level.** A player's rating is the arithmetic mean of his own rapid
rating over all his kept games in both budgets, with one weight per game.
The primary players have means at least 1100 and strictly below 1600, so
fractional means between 1599 and 1600 remain in the band. The rating is fixed
for all of that player's moves, even if his rating crosses a band during the
sample. This broad band includes the app's conversion of his chess.com
level. Other ratings give the trend, without a decision rule.

## The moves

The game reader uses [think-time-rapid's reader](../think-time-rapid/games.mjs)
and row builder, through the bridge. The app's `primaryFacts`, routine
classifier and hanging-piece ports, `deriveGameFacts` and `triggerOf` supply
the facts. The study does not rebuild an app instrument. Each game is read
from both sides. Black's flipped build is checked against a real Black
build on a fixed slice of fast and increment games.

The moves have a think time, are graded and satisfy the app's `nonTrivial`,
and have at least 60 seconds on the mover's clock before the move in either
budget. Each side's first move has no measured think. For increment games
the elapsed time is the previous clock for that side minus its clock after
the move plus the increment. Whole-second clocks keep the predecessor's
reading. Clock increases larger than the increment are invalid elapsed
times, not negative thinks to include. The bridge check verifies that the
app's time-control reader and derived times use the increment.

The book exit remains the first move the app's archive review reader does
not call book, with each player's first move at or after that exit as his
book-end move. A serious error remains the app's mistake or blunder. A miss
needs the routine's miss ledger and is absent here. These are the
predecessor's book-exit and no-miss choices.

## The measures

For a moment T, Δthink_T is the slow-minus-fast difference in mean think,
in seconds, for the same players at comparable danger. Δerr_T is the
corresponding difference in serious errors per move. Their ratio
v_T = −60 × Δerr_T / Δthink_T is serious errors saved per extra minute.
It is a ratio of the two average differences, not an average of players'
ratios. One player's near-zero time difference cannot dominate it.

The four triggers are exactly the app's `book-end`, `conversion`, `forcing`
and `structure`; `none` is no trigger returned by `triggerOf`. The eight
candidates are exactly the predecessor's: in check; just after a capture;
one of the mover's pieces hanging; one of the opponent's pieces hanging;
just after the opponent's serious error; defending at an eval of −300 cp
or worse for the mover; the player's book-end move and his next four moves;
and high danger. Candidates overlap each other and the triggers. The early
window is found from all timed moves before filtering the analysed moves,
so filtering out the book-end move cannot move the window. High danger is
at or above the 80th percentile of the danger score on the primary players'
quick moves, pooled across both budgets, as in the predecessor. Quick is
under the app's imported `RUSHED_SECONDS`.

**The danger score.** A LightGBM classifier predicts the chance of a serious
error on a fast-budget quick move. It is trained on eligible quick moves of
the selected players at every rating, using the same fixed settings as
think-time-rapid except one worker: binary objective, 400 trees, learning
rate 0.05, 31 leaves, minimum 200 rows per leaf, row sample 0.8 each tree,
column sample 0.8, L2 penalty 1, random seed 0, deterministic row-wise fitting.
Nothing is tuned on the budget contrast.

Its inputs are rating, opponent rating, ply, plies since the book exit,
eval and win% before the move, phase, material, legal moves, forcing moves
available, hanging pieces on either side, being in check, coming after a
capture, coming after either side's serious error, and colour. They are the
predecessor's pre-move inputs with both raw clocks and the opponent's last
think dropped. The opponent's think also conveys the budget. Clock shares
would still adjust away part of how the budget acts, so they are not used.
The budget, time control, base, increment, current think and played move are
not inputs. Features measured before the current move can still have been
changed by earlier play under that budget; the caveat below matters.

The score is cross-fitted in five folds by player. Each private player ID
is the first 24 hexadecimal digits of SHA-256 of the case-normalized
username. The fold is the integer represented by that ID's first eight
hexadecimal digits, modulo five; the ID is not hashed again.
For a fold's model, every game involving any player in that fold is removed
from training, including games where that player is the opponent. The model
scores only moves whose mover belongs to its held-out fold. Thus neither
the player's other games nor the other side of a held-out game enters that
model's training. Five folds leave more training games than two under this
two-endpoint exclusion. Scores, folds and all fitted files stay private.

## The estimate

For each T, cut its primary fast moves at their danger quintiles, using all
think lengths and linear interpolation between order statistics. A score
equal to a cut goes in the higher stratum. A tied cut can give fewer than
five nonempty strata. These
same cuts classify both budgets. A player's stratum contributes only when
he has at least one T move in each budget there. Within a contributing
stratum, subtract the fast mean from the slow mean for both serious errors
and think time. Average the stratum differences with weights proportional
to that player's fast T moves in the contributing strata. Average these
player differences with equal weight per player. This targets the fast
positions the same player also meets at the slow budget. It gives a frequent
player no more weight than an occasional one and gives both measures the
same positions and weights.
Quintiles keep the matching coarse enough for players with few games. The
ten-stratum description checks the cost of finer matching without changing
the rule.

T's comparison with none is on the same players. First form E_T from the
primary players with at least one T move and one none move in each budget,
before danger matching. Form P_T from those players with at least one
common stratum at T and at least one at none. Recompute Δthink, Δerr and v
for both T and none on P_T, with the within-player weights just defined.
The comparison is v_T(P_T) − v_none(P_T). There is a separate paired none
estimate for every comparison; the overall none row is only a description.

Support is reported before drawing an interval. For each player i in E_T,
let c_i,T be his fast T moves in contributing strata divided by all his fast
T moves if he belongs to P_T, and zero otherwise. Coverage at T is the mean
of c_i,T over E_T. Define coverage at none the same way. A comparison needs
at least 200 players in P_T and at least 80% coverage at both T and none.
There is no extra per-player coverage threshold. Counting lost players as
zero keeps matching losses in view. Unsupported moves are not imputed or
silently treated as a zero budget effect.

The player floor avoids making a recommendation from a small cluster
sample. The coverage bar keeps the comparison about most of the original
fast moves, rather than a small easy-to-match remnant. Neither bar promises
that an interval will be narrow enough to decide.

The overall and placebo checks use this same estimator on their respective
sets, without pairing to none. Their precursor cohort has moves of that set
in both budgets; their matched cohort has a common stratum. Each check also
needs 200 matched players and 80% mean fast-move coverage, with lost players
counted as zero.

Intervals come from 4,000 Poisson(1) bootstrap draws over players, seed
20261018. A player has the same draw weight at every moment, in both
budgets and every check. Player differences, danger scores, strata and
support are held fixed; each draw reweights the player means and then forms
the ratios and paired differences. The interval is the 2.5th and 97.5th
percentiles. For an estimate with B valid draws, the two-sided p-value is
the smaller of 1 and twice the smaller of (1 + draws at or above zero) /
(B + 1) and (1 + draws at or below zero) / (B + 1). Zero-weight draws are
invalid; an estimate with any invalid draw is not decided. The same draw
matrix is reused, in chunks if needed to keep memory low. The interval is
conditional on the fitted danger model; it does not include refitting it.
Poisson weights let one draw cover the different retained player sets while
keeping every comparison's resampling weights aligned.
The draw matrix covers selected players with at least one eligible move,
at every rating. Players are ordered by their private hash ID before
drawing weights.
The draw count doubles the brief's minimum to reduce Monte Carlo noise
in the corrected comparisons at little cost once player means are saved.

## The rule, fixed before any effect is computed

On the primary players, in this order:

1. **More time at all.** Apply the adjusted within-player estimator to all
   eligible moves. More time must cut serious errors overall: Δerr_all's
   95% upper endpoint must be below zero. If it is not, the design has not
   established a benefit from the larger budget. No trigger is kept,
   dropped or added on this evidence; the app's triggers stay as they are.
   The direction and interval are reported, including evidence of harm if
   the interval is wholly above zero.
2. **The placebo.** Restrict both budgets to eligible moves made in under
   five seconds and apply the same matching and weighting, with new
   quintiles from those fast-budget moves. The design passes only if the
   entire 95% interval for Δerr_placebo lies strictly inside −0.01 to
   +0.01 serious errors per move. An interval wholly outside that range
   makes the design untrustworthy. An interval touching or crossing a
   boundary is inconclusive. Either result blocks trigger changes. A
   percentage point is the fixed tolerance for a difference that should be
   small, not a value chosen from the observed placebo.
3. **Enough extra think.** A ratio is decided only if the lower endpoint
   of Δthink's 95% interval is at least two seconds and every bootstrap
   denominator is positive. This must hold at both T and its paired none.
   Otherwise v and its comparison are reported as *cannot tell*, while
   Δthink and Δerr are still reported. Two seconds avoids pricing an extra
   minute from a negligible difference on whole-second clocks. The strict
   bootstrap condition is conservative near a weak denominator.
4. **The triggers.** Given both checks and adequate support and extra
   think, a trigger is **keep** when Δerr_T's 95% upper endpoint is below
   zero and v_T − v_none is positive with Holm-adjusted p below 0.05 over
   all four triggers. It is **drop its special priority** when that paired
   difference is negative with Holm-adjusted p below 0.05. Otherwise the
   verdict is **cannot tell** and the trigger stays. A smaller value than
   none says that this is a poorer place to direct scarce extra time; it
   does not say that thinking there has no use.
5. **The candidates.** A candidate is **add** only when it cuts errors
   (Δerr_C's 95% upper endpoint below zero) and its v_C − v_none is
   positive with Holm-adjusted p below 0.05 over all eight candidates,
   after the same checks, support and denominator conditions. The move
   after the opponent's serious error is included in this family, with no
   exemption for being the leading question. No minimum advantage beyond
   zero is imposed: its size and interval are printed beside the verdict.
   An ineligible trigger or candidate enters its full Holm family with
   p = 1; tests are not removed to reduce the correction.

The checks are gates, not extra opportunities to declare a trigger useful.
Their two intervals are not multiplied into the trigger families. A failed
gate or inadequate precision leaves the app alone. Keep, drop and add are
recommendations for a later app change, never an automatic port from this
project. A retained trigger keeps its existing bar. This design does not
identify whether 30 seconds or 45 seconds is the right bar: it compares
budgets, not assigned think lengths, and does not recalibrate either bar.

## Also reported, without a rule

The per-month and per-control counts, players at each K,
eligible moves at each moment and budget, support and dropped weight,
overall mean think in each budget, and wall time. Phase one stops there.
Phase two also prints the danger model's diagnostics, raw error rates,
Δthink, Δerr, v and their intervals even where no app verdict is available,
except ratios suppressed by the denominator rule. The ratio of each paired
comparison is distinguished from a moment's wider descriptive cohort.

The trend uses players' mean-rating bands 900–1099, 1100–1299, 1300–1499,
1500–1699, 1700–1899 and 1900–2099, with danger quintiles calculated within
each band's fast moves. It carries no Holm verdict or app change. Also
described are the same estimates with ten danger strata and with slow
restricted to zero increment, using the same draws and reporting support.
These checks never override the registered rule. No player's archive is
read by this project.
High-danger membership in these descriptions retains the primary quick
cut; only the matching strata are recalculated for each band or subset.
These are the predecessor's rating bands, so the trend covers the same
range rather than choosing new boundaries from this sample.

## Caveats

The budget is chosen before the position, but it is not assigned at random.
The same player may choose it when more rested, more serious or facing a
different kind of opponent. Repeated players remove fixed differences
between people, not those changing circumstances. The analysed games are
also a selected part of their play. Prefix sampling from a month can miss
later days, and the report names the prefixes actually read.

Both players receive more time. The boards, opponent errors, clock survival
and moves remaining above a minute can all change with the budget. Holding
the observed board difficulty alike conditions on part of that change.
The ratio is a budget-associated saving divided by extra time spent, not a
causal return to forcing one particular move to take another minute. The
under-five-second placebo can reveal a problem but cannot prove that
unmeasured differences are absent.

The app's check-giving and pawn-capture triggers depend partly on the move
played, which more time can change. The candidates are defined before the
move, but even their positions follow earlier moves under the budget. The
book is the reader's book, not a player's repertoire, and misses are absent.
Lichess's evals are its server analysis, not a new search at a common depth.
Whole-second clocks limit the timing precision. Slow pools several controls
and increments, so the answer concerns the reported mixture.

A game can contain two selected players. Splitting models by both endpoints
prevents training leakage, but a player bootstrap still does not model all
dependence between opponents. Its intervals may be narrow when repeated
opponents matter. Equal-player weighting targets these players, not every
move played on Lichess. Common-stratum support can differ by moment; each
paired comparison names its own cohort and coverage.

## Files

| File | What it does |
|---|---|
| `stream.py` | Streams a month through zstandard, validates headers and annotation completeness, and saves filtered games and restart checkpoints privately. |
| `cohort.py` | Joins players, counts K choices, chooses K and exports the selected players' games; writes `results/cohort-counts.json` and `.md`. |
| `sample.py` | Advances source prefixes at the registered count checkpoints, using at most two stream processes, and freezes the cohort when the count target is reached. |
| `facts.mjs` | Imports the predecessor reader and app instruments, checks increment clocks and Black's build, and writes resumable private move chunks. `--per-budget N` builds a balanced timing slice in a separate private directory. |
| `run_build.py` | Runs two nice-10 bridge shards per month, in month order, with private logs. Waits for both shards, stops on failure and resumes completed chunks on another call. |
| `detached.py` | Starts each long job in its own session with file-backed private logs, a PID and completion record, and one launcher lock; supplies status, wait and stop commands. |
| `study.py` | The fixed rule, danger model, moment masks, common-stratum counts and within-player estimator. |
| `analyze.py` | Defaults to counts and timings only, including high-danger membership and support. Writes `results/phase1.json` and `.md`. Only `--effects`, after the rule is committed, applies the rule and writes `results/analysis.json` and `.md`. |
| `cost.py` | Prices the full build and later analysis from measured timings and count-only bootstrap arithmetic; writes `results/cost.json` and `.md`. |
| `freeze.py` | Writes and checks `freeze-manifest.json`, the SHA-256 content freeze of the rule, scripts, phase-one reports, paper and imported lab helpers. It stores no commit ID from this branch. |
| `test_pipeline.py` | Checks the parser, restart handling and count pipeline without estimating an effect. |
| `paper/paper.tex` | The phase-one paper: design, counts and limits. |
| `paper/generate.mjs` | Writes every printed number and table to `paper/generated.tex` from the aggregate reports, and refuses unsupported claims. |

All streamed games, player joins, move rows, models, logs and restart state
stay under `private/think-time-budget/`. Reports name the pinned app commit
and exact inputs. No packages are installed. No engine or Maia search is
needed: the app reads the supplied Lichess evals and board facts. TeX is not
installed or needed for this phase.

## Running it

From the lab root, in order. Every long job uses the detached launcher: it
starts a new session through `nohup`, disconnects standard input, and writes
output to a private file. It survives the controlling terminal or reviewer
session ending. The stream and bridge runners start at most two nice-10
children. Other long steps run at nice 10 with one LightGBM or numeric-library
worker. The launcher permits one managed job at a time, so these jobs do
not overlap. Also wait for any job started outside the launcher before
using it. The checkout and dependencies already exist; no fetch or pin
change is needed.

```bash
set -e
mkdir -p private/think-time-budget
.venv/bin/python projects/think-time-budget/detached.py start sample sample.py --months 2026-09 2026-08
.venv/bin/python projects/think-time-budget/detached.py wait sample
.venv/bin/python projects/think-time-budget/detached.py start cohort cohort.py --months 2026-09 2026-08 --select-k auto --export
.venv/bin/python projects/think-time-budget/detached.py wait cohort
.venv/bin/python projects/think-time-budget/detached.py start benchmark run_build.py --months 2026-09 --per-budget 25
.venv/bin/python projects/think-time-budget/detached.py wait benchmark
.venv/bin/python projects/think-time-budget/detached.py start build run_build.py --months 2026-09 2026-08
.venv/bin/python projects/think-time-budget/detached.py wait build
.venv/bin/python projects/think-time-budget/detached.py start count analyze.py --months 2026-09 2026-08
.venv/bin/python projects/think-time-budget/detached.py wait count
.venv/bin/python projects/think-time-budget/detached.py start cost cost.py
.venv/bin/python projects/think-time-budget/detached.py wait cost
bridge/run.sh projects/think-time-budget/paper/generate.mjs
.venv/bin/python projects/think-time-budget/test_pipeline.py
.venv/bin/python projects/think-time-budget/freeze.py write
.venv/bin/python projects/think-time-budget/freeze.py check
.venv/bin/python scripts/check_private.py
```

Each `wait` returns success only after its job finishes successfully. If the
terminal closes, use `status` and `wait` again; they do not restart the job.
For example:

```bash
.venv/bin/python projects/think-time-budget/detached.py status build
tail -n 30 private/think-time-budget/build.log
.venv/bin/python projects/think-time-budget/detached.py wait build
```

The PID and completion record are in `private/think-time-budget/jobs/`.
`detached.py stop build` requests a graceful stop after verifying the recorded
PID still belongs to that job. Start the same command again to resume saved
chunks. Logs append on restart. A reboot needs a new start; saved data remain.

The separate final cohort pass writes the current report schema after the
sampler exits. The cost report adds that pass to the timings in the sampling
log; keep it outside that log.

The timing slice requests 25 fast and 25 slow games per shard, at most 100
games in September; its builds are separate from the full run and keyed by
the input fingerprint. The observed slice used the early three-million-game
prefixes, before the final cohort was selected. Each full shard
checks a real Black build on its first 20 games of each budget and checks
every written clock reading. The launcher can also run `facts.mjs` with
`--month`, `--shard 0/2` or `1/2`, and `--check 20`; use the runner for the
two-process full build. Use the same options on a restart. Completed chunks must not
be mixed with a changed input, code version or shard count.

Write the content manifest only after all phase-one files and generated
reports are final, as the last writing step before the privacy check and
local commit. Its sorted file list covers this README, all project scripts,
the aggregate input counts and phase-one reports, the paper sources and
generated text, the app pin, the predecessor reader and the bridge and paper
helpers they import. It excludes itself, private data and phase-two outputs.
The aggregate reports carry the private export fingerprints. The manifest
stores content hashes, not this branch's commit IDs, so a rebase does not
invalidate an unchanged design. A changed dependency fails verification
even when the branch has been rebased.

The privacy check runs again immediately before every commit. Phase one
stops after its local commit. It never runs the following phase-two commands.
Phase two uses the frozen cohort and saved nuisance scores; it does not
rerun the stream or choose K again. Verify the committed manifest, resume
the bridge build if necessary and wait for its successful completion before
starting effects:

```bash
set -e
.venv/bin/python projects/think-time-budget/freeze.py check --require-committed
.venv/bin/python projects/think-time-budget/detached.py start build run_build.py --months 2026-09 2026-08
.venv/bin/python projects/think-time-budget/detached.py wait build
.venv/bin/python projects/think-time-budget/detached.py start effects analyze.py --months 2026-09 2026-08 --effects
.venv/bin/python projects/think-time-budget/detached.py wait effects
.venv/bin/python scripts/check_private.py
```

Before loading any move data, the effect command requires the manifest to
be tracked and clean in Git and verifies every frozen content hash. A staged
or newly added manifest is not a committed rule. It also checks the move
export fingerprint and registered rule against the phase-one report.
The phase-one paper generator continues to describe phase one; a phase-two
paper and its claim checks must be written from that later report.
