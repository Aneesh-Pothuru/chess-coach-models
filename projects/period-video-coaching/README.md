# Period video coaching: the weekly and monthly videos, coached the way a strong coach works

The app's weekly and monthly routines each write a narrated video script beside
the period's review, which the app renders as boards, charts, captions and a
synthetic voice. The daily routine's video prompt took five moves of a strong
human coach after a blind test ([video-coaching](../video-coaching/README.md),
chess PR 161). This project asks the same question of the period videos: it
replays past weeks and months through the routines' writer with the app's own
code, offline, and compares the video scripts a candidate prompt and the live
ones write.

## Result

Not kept by the rule, on length alone ([paper](paper/paper.pdf)). Judged
blind in both orders, the candidate's coaching won on all ten periods, train
and held out alike, and it won overall on most of them; its listening verdicts
were even, where the daily study's candidate never won listening. The audit
finds it asking his move before any hint, playing the better move on to their
best reply and saying whether the miss is normal at his level in most moment
scenes, where today's prompts do each rarely, with no more false claims. The
controls were clean: the same script tied with itself on every period, and
the decoy that pads today's script with words that say nothing new never won
coaching. Every condition of the rule held but the eighth: heard once, the
candidate's videos are longer than the rule's bound of 1.3 times today's, so
the rule keeps today's prompts. Timed after the result in the app's own voice
(`bin/rendered.py`, deciding nothing), the candidate's weekly videos average
inside the five to eight minutes the video grammar asks for, where today's sit
at its floor, so whether to take the bullet anyway is the owner's call.
`results/report.json` holds the numbers as `batch.py report` computed them,
the app commit the cases ran on and what was spent; `results/runs.json` each
run's, with each first run's rendered length.

## Question

The daily study's five moves:

1. Ask before telling: the student says what he would play before any hint.
2. Name the habit behind the mistake, then the habit that replaces it.
3. "And then what?": follow the better move to the opponent's best reply.
4. Pitch each miss at the player's level: a miss most players at his rating
   make is a pattern to learn; one they find is his to find.
5. Praise a good move by what it saw.

A period video synthesizes: its grammar asks for two or three board scenes
that show the period's recurring pattern through its clearest example, with
how often it came back, among chart, tile and bullet scenes. The period prompts
say how the video binds its boards and numbers but ask for none of the five
moves. Does the period video coach better when the prompts ask for the five
moves at the boards that teach a move of his, without becoming less true or
much longer?

## Cases

The ten periods with a review and a video script on the app's main branch from
its CLI-era archive: the weeks 2026-W35 to 2026-W42 and the months 2026-08 and
2026-09. `bin/make-case.sh <id> <case-dir>` builds one:

- a checkout of the app at the commit `bridge/chess.json` pins (a git
  repository with no remote, borrowing the app clone's objects), with the coach
  data (`coach-log/`, `public/coach/`, `progress/`) as main held it just before
  the period's review landed;
- `coach <weekly|monthly> prepare` run with that code, so the brief on disk is
  the one the writer reads, with prepare's own mark. Every node process has
  chess.com cut off (`bin/offline.cjs`), so the level falls back to the synced
  profile of the time; during prepare only, the player's monthly game archives
  stay reachable, because the aggregate counts the games the engine did not
  analyse from them, as the period's own prepare did, and a past month's
  archive never changes;
- the published review and its video script run through the code under test's
  checker against that brief (the plumbing check, `meta/reference-check.json`),
  which decides nothing. A case is usable when prepare exits 0 and its mark
  vouches for the brief on disk.

A writer run writes the whole of step 4, the review and its video script
together, as the live routine does, and the graders read only the video script.
The first design wrote the video alone beside the published review, as the
daily study did, and needed the published review to pass the plumbing check.
Before any writer run, two of the first three cases built that way failed it:
2026-W35's review predates the summary and the section takeaways the strict
check now requires (178 errors), and 2026-09's quotes the brief it was written
from, whose counts moved when prepare ran again (169 games then, 172 now: 42
errors); only 2026-W42's passed. So each run writes both files, and two runs on
a period may show different boards.

## Configs

- `baseline`: the live prompts, `docs/routines/weekly.md` and `monthly.md` at
  the pinned commit (the same text as on the app's main branch when the rule was
  fixed).
- `coach-moves`: the same prompts with one bullet of five sub-points added
  after step 4, the step that writes the annotations and the video script
  (`variants/coach-moves.json`). It is the daily's bullet with three changes:
  it covers every board scene that teaches a move of his; the habit sub-point
  also says how often the habit came back in the period; and the engine's
  reply and the findability come from the day's archived analysis
  (`coach-log/review-analysis/<date>.json`) or the engine commands, since a
  period has no day's digest. The app's prompts are private, so this
  repository keeps only the insertion; `bin/variant.py` puts the prompts
  together at run time, outside the repository.

Both run as the routines do: Opus 5.5 (the triggers' model) with no effort
setting, headless Claude Code with nothing inherited from this session
(`bin/claude-clean.sh`), in a private `/tmp`. A short preamble
(`bin/preamble-weekly.md`, `bin/preamble-monthly.md`, the period-writer
study's) fixes the period's id, says prepare already ran, and stops the writer
after the strict check (weekly steps 2 to 6, monthly 2 to 5: no render,
publish, commit or push). The harness runs the final check itself. One run per period and config; on four weeks (the
first two of each split: 2026-W35, W37, W36 and W38) a second baseline run,
judged against the first, gives the judge's noise floor.

## Split

Interleaved by date within each kind, fixed before any run (the same split as
the [period-writer](../period-writer/README.md) study, with 2026-W42 added).
Train: 2026-W35, W37, W39, W41 and 2026-08. Held out: 2026-W36, W38, W40, W42
and 2026-09. A period whose case is not usable drops out of its split.

## Graders

The daily study's graders, reading a period's evidence:

- `bin/grade.py`, no model: the final check, every check the writer ran
  (rounds, first-draft errors), commands it should not have run, the files it
  changed besides the video script (the review, the ledger and a weekly study
  are the run's own), the script's shape (scenes, beats, questions, pauses,
  spoken words, and its length heard once: words at 2.6 a second plus every
  pause), cost, minutes, and how far the subscription's usage windows moved.
- `bin/audit.py`, Sonnet 5.5, pointwise: the claims in words that the
  evidence contradicts or does not carry (false, unsupported, misleading, or
  "holds", which counts for nothing), and for each board scene its kind (a
  moment, praise, a judgement call, a plan, other), its board claims that the
  evidence contradicts, and which coaching moves it makes: an open question
  before any answer; for a moment, the habit named, its replacement, the
  opponent's best reply to the better move, the level, and whether the level
  agrees with the evidence; for praise, what the move saw. The evidence
  (`bin/evidence.mts`) is the brief without its bulk, the period's turning
  points with his think times, a line per game, the aggregate's and the
  career's digests, the week's daily logs or the month's weekly reviews (which
  the period audits), and for every board scene the position as the archive
  replays it from the day the board names, what was played there and next,
  the engine's best move and reply, the findability and the engine lines the
  day archived at that turning point, how players at his band play there when
  the move is his (the Maia-2 reading `coach engine find` and `engine human`
  give), the plan lines and the human plan the day archived, the threats and
  readings, what each piece hits and guards before and after the scene's
  moves (chess.js's attack map, pins ignored), what the app's move describer
  says each move does, and after each move the game did not play, the
  engine's best reply and its line; and, added after the pilot, the time he
  took on each of his moves in the scene's game, with the clock he had left
  (the pilot's candidate cited the long thinks that led to a turning point,
  which the evidence could not check). Every period is graded with that
  evidence, the pilot's period again included. The evidence's engine writes
  nothing into the case.
- `bin/judge.py`, Sonnet 5.5, blind and pairwise in both orders (a side wins
  a criterion only when both orders agree): truth, coaching, listening,
  overall. The coaching criterion is the daily's, with the period's own duty
  first: name what repeated and show it on the board. Controls
  (`batch.py controls`, on each period's baseline run): the script against
  itself, and against a decoy (`bin/decoy.py`) that adds as many spoken words
  as the candidate added on that period (at least 40), in beats that restate
  their board scene with no square, move, piece, number or question it does
  not already have.
- `bin/rendered.py`, no model, added after the result and deciding nothing:
  each first run's video length as the app renders it, the app's own plan of
  the run's script voiced by its Kokoro voice and timed by its own timeline
  (`bin/rendered.mts`), with no frames or encoding. The video grammar's
  minutes are this length; the rule's is the length heard once.

## The rule, fixed before the candidate's first run

Per period, the judge's verdict scores +1 when the candidate wins, -1 when it
loses and 0 for a tie; a period's value is the mean over its pairs. The audit's
numbers are per script. Intervals are 95% percentile bootstrap intervals over
periods. `coach-moves` replaces the live prompts only when all of these hold:

1. Coaching on train: the coaching criterion's mean has its interval above 0
   over the train periods.
2. Coaching held out: the same over the held-out periods.
3. Overall not worse: over all periods, the overall criterion's interval does
   not lie below 0.
4. Truth not worse: over all periods, neither the audit's false claims per
   script nor its false board claims per script, candidate minus baseline,
   has an interval above 0.
5. The final check passes on as many periods as the baseline's.
6. Controls clean: the same script on both sides ties on every criterion on
   every period; the decoy wins the coaching criterion on at most a quarter of
   the periods; and the baseline's two runs judged against each other have a
   coaching interval that contains 0.
7. The writing changed: over all periods, the share of the coaching moves the
   audit finds in the moment scenes, candidate minus baseline, has its
   interval above 0.
8. Not much longer: the candidate's scripts are on average at most 1.3 times
   as long as the baseline's on the same period, heard once.

Reported beside the rule, deciding nothing: each coaching move's rate, the
level statements the evidence contradicts, open questions across all scenes,
the listening criterion, each script's length against its grammar's target
(weekly five to eight minutes, monthly six to nine), check rounds, cost and
minutes, and the audit of every published script against its case's brief.

The report applies the rule to unrounded values, and a period with a missing
audit (of either config's first run) or a missing control fails the items that
need it (4, 6 and 7) rather than dropping out of them: the guards the
[video-coaching](../video-coaching/README.md) report took from a later audit,
added here before the full eval and tested by `test_boot.py`,
`test_controls.py` and `test_audits.py`.

The five moves are one change: a kept result shows they help together, not
which of them does. With five periods a split, rules 1 and 2 hold only when
the candidate wins coaching on nearly every period of each.

## Pilot, spend and usage

The pilot is the first usable train week and month (2026-W35 and 2026-08), one
run of each config, audited and judged as above, with the controls: it sizes a
run's cost and checks the harness. Its runs are those periods' runs in the full
eval, and nothing it shows decides anything alone; if it shows the candidate's
text at fault (a check it cannot pass, an instruction the live routine cannot
follow), a fixed candidate gets a new name and starts over. The full eval runs
only on the owner's budget.

The pilot stops at $50 of model calls at list price (`EVAL_CAP`):
`ledger.jsonl` in the eval directory sums every call's `total_cost_usd`, and
`batch.py` starts no writer whose expected cost, with the runs in flight and
what grading still owes, would pass the cap. The cap was fixed at $40; the
container restarted nine minutes into the pilot's first two writer runs, which
were lost and started again, and the ledger carries what they spent (about
$6.50, from their streams, rounded up), so the cap rose by $10 to cover them.
The calls run on the owner's subscription, whose limits the live routines
share, so `batch.py` also starts no writer or grader while the five-hour window
is at 45% or more or the seven-day window at 60% or more, or from 11:30 to
14:45 UTC (16:30 on Mondays and on the 1st), the hours the daily, weekly and
monthly routines fire and land.

The pilot ran 2026-W35 alone: after the restart, the cap held back the August
pair, whose two writers together would have passed it, so 2026-08 runs first
in the full eval.

## Running it

```
EVAL_ROOT=/tmp/period-video              # cases, runs, logs and the ledger; never committed
bin/make-case.sh 2026-W35 $EVAL_ROOT/cases/2026-W35        # each of the ten periods
bin/batch.py published                                      # audit each published script
bin/batch.py runs --configs baseline,coach-moves --variant coach-moves=variants/coach-moves.json
bin/batch.py runs --configs baseline --reps 2 --null        # the noise floor's second runs
bin/batch.py audit --configs baseline,coach-moves
bin/batch.py judge --config coach-moves --vs baseline
bin/batch.py judge --config baseline --vs baseline          # the noise floor: run 1 against run 2
bin/batch.py controls --config coach-moves --vs baseline
bin/batch.py report --config coach-moves --vs baseline
bin/rendered.py --venv <kokoro venv> --cache <cache dir>    # each first run's rendered length, on the CPU
bin/export.py --config coach-moves --vs baseline            # results/
python3 -m unittest test_boot test_controls test_audits   # the report's guards
```

The paper: `bridge/run.sh projects/period-video-coaching/paper/generate.mjs`
writes `paper/generated.tex` from `results/` and refuses when a claim no longer
holds (`node --test paper/generate.test.mjs` checks that it refuses without
both controls on every period); `latexmk -pdf paper.tex` in `paper/` builds it.

The evidence's Maia-2 weights are read from `$EVAL_ROOT/maia`. The per-run
files (the scripts, the streams, the audits with their quotes) hold the
player's games and stay out of the repository, in the eval directory.
