# Lesson videos: the daily review teaching the move a lesson teaches

The app's daily routine writes each day's review of the player's games (the
annotations the app shows and a narrated video script it renders). This
project replays past days through the routine with the app's own code,
offline, writing the whole review, and compares the app as it runs with a
change that makes the review teach from his study lessons.

## Result

Round 2 is kept by the rule; round 1 is not. With round 2's one sentence (the
scene of his move ends on the better move and what it does), every moment
scene said what the better move does, the share of the three asked moves rose
by an interval clear of zero, the judge preferred it on all days but one with
both controls clean, and all nine conditions held. Its scripts carried a few
more false claims than today's, inside the noise, and followed the better move
to their reply less often ([Round 2](#round-2-the-scene-of-his-move-names-the-better-move)).
The owner then watched a day replayed with it and judged it short of what he
asked for: it names a lesson instead of teaching it and plays a line without
saying why each move works. So the app does not take round 2 as it stands; it
takes a next version that reads every move of both lines on the board, which
this project has not measured. The owner judged that version's replay of one day a lot better, and it
shipped as chess PR 230 (merge commit 4ba253b). Round 2's numbers are in
[`results/report-lesson-moves-2.json`](results/report-lesson-moves-2.json).

Round 1: not kept by the rule below, which was committed before the first run: one
condition failed, the second half of the seventh. Every review of both configs
passed the final check. The change's videos spoke no verdict line on any of the
twelve days, against three to six a day for today's code. Judging blind in both
orders, the judge preferred the change's coaching and its whole script on every
day, train and held out alike, and never preferred today's code on truth or
listening; the same script on both sides tied every criterion on every day, and
the decoy never won coaching. The audit found fewer false claims in the
change's scripts and more misleading ones (a lesson's rule in words the lesson
does not use, a findability line that reads as if he had played the move), and
every better move either config taught sound. The change's moment scenes said
what the position is about before the move more often and gave an idea to
reuse more often, but said what the better move does no more often, so the
share of the three moves he asked for rose by an interval that does not clear
zero: the condition that failed. Heard once, the scripts are about as long.
The owner chose a second round that fixes the gap before anything ships
([Round 2](#round-2-the-scene-of-his-move-names-the-better-move)). The numbers are in
[`results/report.json`](results/report.json) (the rule as `batch.py report`
computed it, exported by `bin/export.py`) and the paper,
[`paper/paper.pdf`](paper/paper.pdf).

## Question

The player asked for the daily review to stop telling him what the engine
thinks (which side is better, that the game is "level") and to teach the way
humans learn: at each key moment, a sound move a player at his level can find,
what that move does on the board, and the idea behind it, from the study
lessons he follows when one fits, even when it is not the engine's first
choice, as long as the engine says it keeps his position.
[lesson-moves](../lesson-moves/) measured the move such a review would teach
on every turning point of his archive. This project asks whether the review
the routine writes with that change teaches better, as a strong coach would
judge it for him, without becoming less true or much longer.

## Configs

- `baseline`: the app as it runs, main at c98822d: its daily prompt
  (`docs/routines/daily.md`), its `coach review teach` (the line to teach from
  the move his band likely plays that the engine says holds) and its checker.
- `lesson-moves`: the change, a branch of the app at f7a8b12: `teach` picks
  the move a lesson teaches among the candidates that hold for him and names
  the lesson chapters that teach it (the lesson-moves pick); the daily prompt
  and its video guide ask for that move with what it does and the lesson's
  rule, and for no engine verdict; and the checker refuses a video line that
  says who is better, from 2026-11-04. The replayed days are older, so the
  candidate's cases run an eval-only commit on top of it (4d0e9d3) that moves
  that date to 2026-10-01, in the checker and in the prompt's sentence about
  it, and changes nothing else: on a replayed day the checker refuses what it
  would refuse on a live one.

Both run as the routine does: Opus 5.5 (the trigger's model) with no effort
setting, headless Claude Code with nothing inherited from this session
(`bin/claude-clean.sh`), in a private `/tmp`, with the study lessons' MCP
server attached (the live routine reads the lessons through it; it serves the
lessons of the app's main, the same for both configs; its address is the
app's, given at run time in `CHESS_MCP_URL`). A short preamble
(`bin/preamble-review.md`) fixes the day, says which steps ran, and asks for
the day's review, its annotations and its video script, done when
`coach daily check` exits 0 and its warnings are read; no render, publish or
commit. The harness runs the final check itself. One run per config and day.

## Cases

The 12 days from 2026-10-13 to 2026-10-28 whose review landed on the app's
main with a video script (2026-10-16, 10-21, 10-23 and 10-26 have none). The
two later days with one, 2026-10-31 and 2026-11-02, were read while the change
was designed and are left out. `bin/make-case.sh <D> <case-dir> <code>` builds
one case per config and day:

- a checkout of the app at the config's code (a git repository with no
  remote, borrowing the app clone's objects), with the coach data
  (`coach-log/`, `public/coach/`, `progress/`) as main held it just before the
  day's review landed, and the day's archived analysis;
- `coach daily prepare --from-archive` run with that code, so the brief on
  disk is the one the writer reads, with prepare's own mark; chess.com is cut
  off in every node process (`bin/offline.cjs`);
- analyze.cjs's digest printed from the archived rows (`bin/digest-today.cjs`);
- the day's coach log, briefing and note replies as they landed, put back in
  place: the review, its annotations and its video script, is what a writer
  run writes.

A case is usable when prepare exited 0 and the brief on disk is the one
prepare vouches for. The day's published review is run through the config's
checker and recorded, deciding nothing: the candidate's checker refuses the
verdict lines the published scripts carry.

## Split

Interleaved by date, fixed before any run: the 12 days in date order, the
first and every second one after it train, the others held out. Train:
2026-10-13, 10-15, 10-18, 10-20, 10-24, 10-27. Held out: 2026-10-14, 10-17,
10-19, 10-22, 10-25, 10-28. The rule reads every day on which both configs'
runs were written; a day whose case is not usable, or that the spend cap
stops before both runs, drops out, and the report names the days it read.

## Graders

The graders read the video scripts. Both scripts of a day are graded against
the same evidence, the baseline case's.

- `bin/grade.py`, no model: the final check, every check the writer ran
  (rounds, first-draft errors), files it changed besides the review and the
  archive row `teach --write` records, commands it should not have run, how
  often it ran `teach`, the video's lines that say who is better by the app's
  own rule (the candidate's checker's `verdictTalk`, run on both configs'
  scripts), how many of the annotations' moments link a study lesson, the
  script's shape and its length heard once (spoken words at 2.6 a second plus
  every pause), cost, minutes and the usage windows.
- `bin/audit.py`, Sonnet 5.5, pointwise: the claims in words that the
  evidence contradicts or does not carry (false, unsupported, misleading, or
  a checked line that holds, which counts for nothing), and for each board
  scene its kind (a moment, praise, a judgement call, a plan, other), its
  board claims that the evidence contradicts, whether it says who is better,
  whether it asks his move openly before any answer, and for a moment: whether
  it says what the position is about before the move, what the better move
  does on the board, an idea to reuse; whether it names a lesson and the
  lesson teaches what the scene teaches; whether the better move is sound by
  the evidence; whether it recites an engine line without saying what its
  moves do; whether it follows the better move to their best reply; the habit
  named and the habit that replaces it; and for praise, what the move saw.
  The evidence is the October video study's (`bin/evidence.mts`: the brief
  without its bulk, the day's games and turning points, the digest,
  findability at his band, and every board scene as the archive, the engine,
  Maia-2 and the knowledge service read it, with the engine's best reply after
  each move the game did not play) and the study lessons
  (`bin/lessons.mts`: every lesson's title and what it teaches, and the
  sections of each lesson a script names).
- `bin/judge.py`, Sonnet 5.5, blind and pairwise in both orders (a side wins
  a criterion only when both orders agree): truth, coaching, listening,
  overall, with the player's ask in its instructions and a coaching criterion
  written from it. Controls (`batch.py controls`, on each day's baseline run):
  the script against itself, and against a decoy (`bin/decoy.py`) that adds as
  many spoken words as the candidate added on that day (at least 40), in beats
  that restate their scene with nothing new.

## The rule, fixed before the candidate's first run

Per day, the judge's verdict scores +1 when the candidate wins, -1 when it
loses and 0 for a tie; the audit's numbers are per script. Intervals are 95%
percentile bootstrap intervals over days. The change ships to the routine only
when all of these hold over the days the rule reads:

1. Coaching on train: the coaching criterion's mean has its interval above 0
   over the train days.
2. Coaching held out: the same over the held-out days.
3. Overall not worse: over all days, the overall criterion's interval does
   not lie below 0.
4. Truth not worse: over all days, neither the audit's false claims per
   script nor its false board claims per script, candidate minus baseline,
   has an interval above 0.
5. The final check passes on as many days as the baseline's.
6. Controls clean: the same script on both sides ties on every criterion on
   every day, and the decoy wins the coaching criterion on at most a quarter
   of the days.
7. The writing changed as he asked: the video lines that say who is better,
   candidate minus baseline, have an interval below 0; and the share of the
   asked moves the audit finds in the moment scenes (what the position is
   about, what the better move does, an idea to reuse), candidate minus
   baseline, has an interval above 0.
8. Not much longer: the candidate's scripts are on average at most 1.3 times
   as long as the baseline's on the same day, heard once.
9. Better moves as sound: the share of moment scenes whose better move the
   audit finds unsound, candidate minus baseline, has no interval above 0.

Every condition needs its graders complete on every day read: a missing audit,
judge or control fails the condition that reads it. Reported beside the rule,
deciding nothing: each audit item's rate, the scenes the audit finds saying
who is better, the lessons named and whether they fit, the annotations'
moments that link a lesson, `teach` calls, check rounds, cost and minutes.

The change is one change: the pick, the prompt and the checker together. A
kept result shows they help together, not which part does. There is no second
baseline run for a noise floor this time (the budget buys whole reviews
instead); the same-script and decoy controls stand in for it.

## Pilot, spend and usage

The pilot is the first train day both cases are ready for, one run of each
config, audited and judged as above with the controls: it sizes a run's cost
and checks the harness. Its runs are that day's runs in the full eval, and
nothing it shows decides anything alone; if it shows the candidate's text at
fault (a check it cannot pass, an instruction the routine cannot follow), a
fixed candidate gets a new name and starts over.

The owner set about $180 for this eval, so the cap is $216 for the pilot and
the full run together (`EVAL_CAP`): `ledger.jsonl` in the eval directory sums
every call's `total_cost_usd` at list price, and `batch.py` starts no writer
whose expected cost, with the runs in flight and what grading still owes,
would pass the cap. The calls run on the owner's subscription, whose limits
the live routines share, so `batch.py` also starts no writer or grader while
the seven-day window is at 60% or more or the five-hour window at 45% or more
(when the subscription reports one: at the start it reported only the seven-day
window), or from 11:30 to 14:45 UTC (16:30 on Mondays), the hours the daily and
weekly routines fire and land.

## Round 2: the scene of his move names the better move

Fixed before its first run. Round 1 failed on the asked share alone. The audit
counts every moment scene as owing all three asked moves, and a segment
usually takes two scenes, because a board scene cannot take a move back: the
first plays his move and its refutation, the second plays the better move from
the same position. In both configs, the scenes that play the better move
nearly always said what it does, and no scene that showed only his move did.

- `lesson-moves-2`: round 1's candidate plus one sentence in the daily
  prompt's video coaching, after the one that asks what the better move is
  for: "A segment that plays his move in one scene and the better move in the
  next says what the better move is for in both: his move's scene ends by
  naming the better move and what it is for, in teach's words, before the next
  scene plays it." The change's branch carries it at 284a31b; the cases run
  24f056f, round 1's eval commit (4d0e9d3) with that sentence and nothing else.
- The same twelve days, split and cases built the same way. Only
  `lesson-moves-2` writes; round 1's baseline runs, their audits and their
  same-script controls are read again unchanged, since the days, the code and
  the graders are the same.
- The same audit and judge. The decoy control is made again on the baseline's
  runs to match `lesson-moves-2`'s added words (`decoy-lesson-moves-2/` and
  `judge-control-decoy-lesson-moves-2.json` beside round 1's files).
- The same nine conditions, `lesson-moves-2` against `baseline`. Kept only
  when all hold, and then the change ships with the sentence; otherwise it
  does not ship. The sentence may make his move's scene say what the next
  scene says again: the judge's listening and overall verdicts and the length
  condition read that.
- About $75 more, approved by the owner, so the cap becomes $205
  (`EVAL_CAP=205`) for both rounds together.

Outcome: every condition held, so round 2 is kept by the rule
(`results/report-lesson-moves-2.json`, `results/runs-lesson-moves-2.json`;
`bin/scenes.py` writes the scene split in `results/scenes.json`). The rule's
"then the change ships" was overtaken by the owner's judgement of a replayed
day, above.

## Running it

```
EVAL_ROOT=/tmp/lesson-videos             # cases, runs, logs and the ledger; never committed
bin/make-case.sh 2026-10-13 $EVAL_ROOT/cases/baseline/2026-10-13 c98822d        # each day, each config
bin/make-case.sh 2026-10-13 $EVAL_ROOT/cases/lesson-moves/2026-10-13 4d0e9d3
bin/batch.py runs --jobs 2
bin/batch.py audit
bin/batch.py judge
bin/batch.py controls
bin/batch.py report
bin/make-case.sh 2026-10-13 $EVAL_ROOT/cases/lesson-moves-2/2026-10-13 24f056f  # round 2, each day
bin/batch.py runs --configs lesson-moves-2 --jobs 2
bin/batch.py audit --configs lesson-moves-2
bin/batch.py judge --config lesson-moves-2
bin/batch.py controls --config lesson-moves-2
bin/batch.py report --config lesson-moves-2
bin/export.py                            # results/
bin/export.py --config lesson-moves-2    # results/*-lesson-moves-2.json
bin/scenes.py                            # results/scenes.json
bridge/run.sh projects/lesson-videos/paper/generate.mjs   # from the repository's root
```

The per-run files (the reviews, the streams, the audits with their quotes)
hold the player's games and stay out of the repository, in the eval
directory. `results/` holds the aggregates: the rule as `batch.py report`
computed it, the spend and the usage windows, and each run's numbers.
