# Period video coaching: the weekly and monthly videos, coached the way a strong coach works

The app's weekly and monthly routines each write a narrated video script beside
the period's review, which the app renders as boards, charts, captions and a
synthetic voice. The daily routine's video prompt took five moves of a strong
human coach after a blind test ([video-coaching](../video-coaching/README.md),
chess PR 161). This project asks the same question of the period videos: it
replays past weeks and months through the routines' writer with the app's own
code, offline, writing only the video script, and compares a candidate prompt
with the live ones.

## Result

Not run yet. The rule below was fixed before the candidate's first run.

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
- the period's annotations and rule ledger (`coach-log/rules.json`,
  `public/coach/rules.json`) as they landed, put back in place: only the video
  script is missing, so a writer run writes the video for the review the
  period published, and nothing else;
- the published video script run through the code under test's checker with
  those files (the plumbing check, `meta/reference-check.json`): a case is
  usable only when it passes, so a writer run's failures are its own script's.

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
(`bin/preamble-weekly.md`, `bin/preamble-monthly.md`) fixes the period, says
which steps ran, and asks for the video script alone, done when
`coach <weekly|monthly> check` exits 0 and its warnings are read. The harness
runs the final check itself. One run per period and config; on four weeks (the
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
  (rounds, first-draft errors), files it changed besides the video script,
  commands it should not have run, the script's shape (scenes, beats,
  questions, pauses, spoken words, and its length heard once: words at 2.6 a
  second plus every pause), cost, minutes, and how far the subscription's
  usage windows moved.
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
  engine's best reply and its line. The evidence's engine writes nothing into
  the case.
- `bin/judge.py`, Sonnet 5.5, blind and pairwise in both orders (a side wins
  a criterion only when both orders agree): truth, coaching, listening,
  overall. The coaching criterion is the daily's, with the period's own duty
  first: name what repeated and show it on the board. Controls
  (`batch.py controls`, on each period's baseline run): the script against
  itself, and against a decoy (`bin/decoy.py`) that adds as many spoken words
  as the candidate added on that period (at least 40), in beats that restate
  their board scene with no square, move, piece, number or question it does
  not already have.

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

The pilot stops at $40 of model calls at list price (`EVAL_CAP`):
`ledger.jsonl` in the eval directory sums every call's `total_cost_usd`, and
`batch.py` starts no writer whose expected cost, with the runs in flight and
what grading still owes, would pass the cap. The calls run on the owner's
subscription, whose limits the live routines share, so `batch.py` also starts
no writer or grader while the five-hour window is at 45% or more or the
seven-day window at 60% or more, or from 11:30 to 14:45 UTC (16:30 on Mondays
and on the 1st), the hours the daily, weekly and monthly routines fire and
land.

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
```

The evidence's Maia-2 weights are read from `$EVAL_ROOT/maia`. The per-run
files (the scripts, the streams, the audits with their quotes) hold the
player's games and stay out of the repository, in the eval directory.
