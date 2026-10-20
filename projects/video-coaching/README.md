# Video coaching: the daily review's video, coached the way a strong coach works

The app's daily routine writes a narrated video script for each day's review,
which the app renders as boards, captions and a synthetic voice. This project
replays past days through the routine's writer with the app's own code,
offline, writing only the video script, and compares a candidate prompt with
the live one.

## Result

Not run yet: the pilot below comes first, and the full run waits on the
owner's budget.

## Question

A titled player reviewing the rapid games of an adult player rated about 1100
([video](https://www.youtube.com/watch?v=PcGDehRSqTM); the lab read a summary
of its captions, not the video itself) coaches with five moves:

1. Ask before telling: the student says what he would play before any hint.
2. Name the habit behind the mistake, then the habit that replaces it.
3. "And then what?": follow the better move to the opponent's best reply.
4. Pitch each miss at the player's level: a miss most players at his rating
   make is a pattern to learn; one they find is his to find.
5. Praise a good move by what it saw.

The app's video grammar already asks for a predict pause in every moment
segment, findability or mirror framing, and a rule card at each segment's end,
but the routine's prompt says only how a video binds its boards and numbers,
and the published scripts make some of the five moves rarely (the audit of
every published script, in `results/`, counts them). Does the video coach
better when the prompt asks for the five moves, without becoming less true or
much longer?

## Cases

The 23 days from 2026-09-25 to 2026-10-19 whose review landed on the app's
main branch with a video script (2026-10-03 and 2026-10-16 have none).
`bin/make-case.sh <D> <case-dir>` builds one:

- a checkout of the app at the commit `bridge/chess.json` pins (a git
  repository with no remote, borrowing the app clone's objects), with the
  coach data (`coach-log/`, `public/coach/`, `progress/`) as main held it just
  before the day's review landed, and the day's archived analysis;
- `coach daily prepare --from-archive` run with that code, so the brief on
  disk is the one the writer reads, with prepare's own mark; chess.com is cut
  off in every node process (`bin/offline.cjs`);
- analyze.cjs's digest printed from the archived rows with today's accuracy
  instrument (`bin/digest-today.cjs`), without the findability the optional
  Maia step adds after the digest is printed, as the live digest has none;
  `.cache/analysis.json` keeps it, as the live one holds it after that step;
- the day's annotations, coach log, briefing and note replies as they landed,
  put back in place: only the video script is missing, so a writer run writes
  the video for the review the day published, and nothing else;
- the published video script run through today's checker with those files
  (the plumbing check, `meta/reference-check.json`): a case is usable only
  when it passes, so a writer run's failures are its own script's.

A few of the brief's facts differ between the day's own brief and the one
prepare writes again (the annotations were written from the first); both
configs face the same difference.

## Configs

- `baseline`: the live prompt, `docs/routines/daily.md` at the pinned commit.
- `coach-moves`: the same prompt with one bullet of five sub-points added to
  step 4, right after the bullet on how the video binds its boards
  (`variants/coach-moves.json`). The app's prompts are private, so this
  repository keeps only the insertion; `bin/variant.py` puts the prompt
  together at run time, outside the repository.

Both run as the routine does: Opus 5.5 (the trigger's model) with no effort
setting, headless Claude Code with nothing inherited from this session
(`bin/claude-clean.sh`), in a private `/tmp`. A short preamble
(`bin/preamble-video.md`) fixes the day, says which steps ran, and asks for the
video script alone, done when `coach daily check` exits 0 and its warnings are
read. The harness runs the final check itself. One run per day and config; on
six days (the first three usable days of each split: 2026-09-25, 09-27, 09-29,
09-28, 09-30 and 10-02) a second baseline run, judged against the first, gives
the judge's noise floor.

## Split

Interleaved by date, fixed before any run: the 23 days in date order, the
first and every second one after it train, the others held out. Train:
2026-09-25, 09-27, 09-29, 10-01, 10-04, 10-06, 10-08, 10-10, 10-12, 10-14,
10-17, 10-19. Held out: 2026-09-26, 09-28, 09-30, 10-02, 10-05, 10-07, 10-09,
10-11, 10-13, 10-15, 10-18. A day whose case is not usable drops out of its
split; 2026-09-26 fails the plumbing check.

## Graders

- `bin/grade.py`, no model: the final check, every check the writer ran
  (rounds, first-draft errors), files it changed besides the video script,
  commands it should not have run, the script's shape (scenes, beats,
  questions, pauses, spoken words, and its length heard once: words at 2.6 a
  second plus every pause), cost, minutes, and how far the subscription's
  usage windows moved.
- `bin/audit.py`, Sonnet 5.5, pointwise: the claims in words that the
  evidence contradicts or does not carry (false, unsupported, misleading), and
  for each board scene its kind (a moment, praise, a judgement call, a plan,
  other), its board claims that the evidence contradicts, and which coaching
  moves it makes: an open question before any answer; for a moment, the habit
  named, its replacement, the opponent's best reply to the better move, the
  level, and whether the level agrees with the evidence; for praise, what the
  move saw. The evidence (`bin/evidence.mts`) is the brief without its bulk,
  the clock's turning points, a line per game, the digest, each turning
  point's findability at his band, and for every board scene the position as
  the archive replays it, what was played there and next, the engine's best
  move and reply, the threats and readings, what each piece hits and guards
  before and after the scene's moves (chess.js's attack map, pins ignored),
  and what the app's move describer says each move does.
- `bin/judge.py`, Sonnet 5.5, blind and pairwise in both orders (a side wins
  a criterion only when both orders agree): truth, coaching, listening,
  overall. Controls (`batch.py controls`, on each day's baseline run): the
  script against itself, and against a decoy (`bin/decoy.py`) that adds as
  many spoken words as the candidate added on that day (at least 40), in
  beats that restate their scene with no square, move, piece, number or
  question it does not already have.

## The rule, fixed before the candidate's first run

Per day, the judge's verdict scores +1 when the candidate wins, -1 when it
loses and 0 for a tie; the audit's numbers are per script. Intervals are 95%
percentile bootstrap intervals over days. `coach-moves` replaces the live
prompt only when all of these hold:

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
   every day; the decoy wins the coaching criterion on at most a quarter of
   the days; and the baseline's two runs judged against each other have a
   coaching interval that contains 0.
7. The writing changed: over all days, the share of the coaching moves the
   audit finds in the moment scenes, candidate minus baseline, has its
   interval above 0.
8. Not much longer: the candidate's scripts are on average at most 1.3 times
   as long as the baseline's on the same day, heard once.

Reported beside the rule, deciding nothing: each coaching move's rate, the
level statements the evidence contradicts, open questions across all scenes,
check rounds, cost and minutes, and the audit of every published script
against its case's brief.

The five moves are one change: a kept result shows they help together, not
which of them does. The graders' prompts were settled on published scripts
alone, before any run of either config was graded: the first evidence labelled
the archive's evals as White's view, where the archive stores the player's,
and printed findability the live digest does not have; both were fixed, and
the candidate's level sub-point was pointed at the findability the live
routine does have, before this rule was committed.

## Pilot, spend and usage

The pilot is the first three usable train days (2026-09-25, 09-27, 09-29), one
run of each config, audited and judged as above, with the controls: it sizes a
run's cost and checks the harness. Its runs are those days' runs in the full
eval, and nothing it shows decides anything alone; if it shows the candidate's
text at fault (a check it cannot pass, an instruction the live routine cannot
follow), a fixed candidate gets a new name and starts over. The full eval runs
only on the owner's budget.

The pilot stops at $60 of model calls at list price (`EVAL_CAP`):
`ledger.jsonl` in the eval directory sums every call's `total_cost_usd`, and
`batch.py` starts no writer whose expected cost, with the runs in flight and
what grading still owes, would pass the cap. The calls run on the owner's
subscription, whose limits the live routines share, so `batch.py` also starts
no writer or grader while the five-hour window is at 45% or more or the
seven-day window at 60% or more, or from 11:30 to 14:45 UTC (16:30 on
Mondays), the hours the daily and weekly routines fire and land.

## Running it

```
EVAL_ROOT=/tmp/video-coaching            # cases, runs, logs and the ledger; never committed
bin/make-case.sh 2026-09-25 $EVAL_ROOT/cases/2026-09-25     # each of the 23 days
bin/batch.py published                                      # audit each published script
bin/batch.py runs --configs baseline,coach-moves --variant coach-moves=variants/coach-moves.json
bin/batch.py runs --configs baseline --reps 2 --null        # the noise floor's second runs
bin/batch.py audit --configs baseline,coach-moves
bin/batch.py judge --config coach-moves --vs baseline
bin/batch.py judge --config baseline --vs baseline          # the noise floor: run 1 against run 2
bin/batch.py controls --config coach-moves --vs baseline
bin/batch.py report --config coach-moves --vs baseline
bin/export.py --config coach-moves --vs baseline            # results/
```

The per-run files (the scripts, the streams, the audits with their quotes)
hold the player's games and stay out of the repository, in the eval
directory. `results/` holds the aggregates: the rule as `batch.py report`
computed it, the spend and the usage windows, and each run's numbers.
