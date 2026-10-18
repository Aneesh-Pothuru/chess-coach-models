# Period writer: the weekly and monthly reviews' explanations

The app's weekly and monthly routines write a review from a brief the services
compute. This project replays past weeks and months through the writer with the
app's own code, offline, and compares a candidate prompt with the live one.

## Result

Not kept: the live prompts stay ([paper](paper/paper.pdf)). The sentence
changed the writing (most of the candidate's exhibits give the three parts in
order, against about a third under today's prompt), but the judge's
explanation interval reached zero on the train cases and on the held-out ones,
so rules 1 and 2 fail; rules 3 to 6 hold. On the held-out cases the candidate's
reviews made more false claims, most of them lines of moves. Two errors do not
depend on the prompt: lines tagged Played that the game did not play, which the
strict check let through (`bin/played-lines.mts` counts them, with no model),
and the per-concept rule count calling a king-walk rule "the pawn break",
because the ledger filed it under that concept. The app took both: its strict
check now refuses those lines (chess PR 125), and its ledger files the rule
under converting (chess PR 126). `results/report.json` names the app commit
the cases ran on and what was spent.

## Question

Does the review explain its board exhibits better when the prompt asks for the
order the worked examples in two chess books use: first the threat on the board,
then why the move played (or the tempting one) fails, with the reply that
refutes it, then what the better move keeps? Measured beside it, for both
prompts: which false claims the weekly and monthly reviews make.

The books do not prescribe one sentence order or a length (their three worked
examples start in different places); the candidate tests the one order they
share most, as an instruction.

## Cases

The nine periods with a review on the app's main branch from its CLI-era
archive: the weeks 2026-W35 to 2026-W41 and the months 2026-08 and 2026-09.
`bin/make-case.sh <id> <case-dir> <app commit>` builds one:

- a checkout of the app at the commit `bridge/chess.json` pinned when the
  cases were built (`results/report.json` names it; a git repository with no
  remote, borrowing the app clone's objects), with the coach data
  (`coach-log/`, `public/coach/`, `progress/`) as main held it just before the
  period's review landed;
- `coach <weekly|monthly> prepare` run with that code, so the brief on disk is
  the one the writer reads, with prepare's own mark. Every node process has
  chess.com cut off (`bin/offline.cjs`), so the level falls back to the synced
  profile of the time; during prepare only, the player's monthly game archives
  stay reachable, because the aggregate counts the games the engine did not
  analyse from them, as the period's own prepare did, and a past month's
  archive never changes;
- the landed review run through today's checker against the regenerated brief
  (the plumbing check, `meta/reference-check.json`).

## Configs

- `baseline`: the live prompts, `docs/routines/weekly.md` and `monthly.md` at
  the pinned commit.
- `threat-order`: the same prompts with one sentence added to step 4, right
  after the sentence that says to write the annotations by filling the brief's
  slots (`variants/threat-order.json`). The app's prompts are private, so this
  repository keeps only the sentence; `bin/variant.py` puts the prompts
  together at run time, outside the repository.

Both run as the routines do: Opus 5.5 (the triggers' model) with no effort
setting, headless Claude Code with nothing inherited from this session
(`bin/claude-clean.sh`), in a private `/tmp`. A short preamble fixes the
period's id, says prepare already ran, and stops the writer after the strict
check (weekly steps 2 to 6, monthly 2 to 5: no render, publish, commit or
push). The harness runs the final check itself. Two runs per case and config:
rep k of the candidate is judged against rep k of the baseline, and the
baseline's two runs against each other give the judge's noise floor.

## Split

Interleaved by date, fixed before any run. Train: 2026-W35, 2026-W37,
2026-W39, 2026-W41, 2026-08. Held out: 2026-W36, 2026-W38, 2026-W40, 2026-09.

## Graders

- `bin/grade.py`, no model: the final strict check, every check the writer ran
  (rounds, first-draft errors), commands it should not have run, cost, minutes,
  and how far the subscription's usage windows moved.
- `bin/audit.py`, Sonnet 5.5, pointwise: the claims in words that the evidence
  contradicts or does not carry (false, unsupported, misleading), and for each
  board exhibit whether its prose names the threat, the refuting reply and what
  the better move keeps, in that order, and its claims about the board that the
  evidence contradicts. The evidence (`bin/evidence.mts`) is the brief without
  its bulk, the clock's turning points, a line per game, the aggregate's
  digest, the earlier reviews the period's review audits (a week's daily logs,
  a month's weekly reviews), and for every exhibit the position as the archive
  replays it, what was played there and next, the engine's best move and best
  reply, the board's threats and readings, what each piece hits and guards
  before the move and after each move the exhibit names (chess.js's attack
  map, pins ignored) with each file's pawn status, and what the app's move
  describer says each move does.
- `bin/judge.py`, Sonnet 5.5, blind and pairwise in both orders (a side wins a
  criterion only when both orders agree): truth, explanation, duties, plain,
  overall. Controls (`batch.py controls`): a baseline review against itself,
  and against a decoy (`bin/decoy.py`) whose exhibits restate what they already
  say at the candidate's length, with no square, move, piece or number the
  original does not name.

## The rule, fixed before the candidate's first run

Per pair, the judge's verdict scores +1 when the candidate wins, -1 when it
loses and 0 for a tie, and a case's score is the mean over its two pairs; the
audit's counts are averaged over a case's runs the same way. Intervals are 95%
percentile bootstrap intervals over cases. `threat-order` replaces the live
prompts only when all of these hold:

1. Explanation on train: the mean of the explanation criterion has its
   interval above 0 over the train cases.
2. Explanation held out: the same over the held-out cases.
3. Overall not worse: over all nine cases, the overall criterion's interval
   does not lie below 0.
4. Truth not worse: over all nine cases, neither the audit's false claims per
   review nor its false board claims per review, candidate minus baseline, has
   an interval above 0.
5. The final strict check passes on as many cases as the baseline's.
6. Controls clean: the same review on both sides ties on every criterion, the
   decoy wins the explanation criterion on at most a quarter of the cases, and
   the baseline's two runs judged against each other have an explanation
   interval that contains 0.

Reported beside the rule, deciding nothing: the share of exhibits that give all
three parts in order (did the sentence change what the writer does), check
rounds, cost and minutes, and the claims the baseline's reviews get wrong, by
kind.

With four or five cases a split, rules 1 and 2 need the candidate to win
nearly every case; that is the bar. The graders' prompts are settled on the
baseline's runs alone and committed before any candidate run is graded. They
were settled on the baseline's 2026-W41 run: the audit's first versions listed
claims that hold and misread pieces' lines from the FEN, which the attack map
fixed. Opus 5.5 as the auditor, tried on the same run, found as many false
claims and the same false board claim at about twice the cost, but not the
same false claims in words, so a review's count is a floor on what it gets
wrong, compared like for like across the two prompts. The auditor stays Sonnet
5.5.

## Spend and usage

The eval stops at $250 of model calls at list price: `ledger.jsonl` in the eval
directory sums every call's `total_cost_usd`, and `batch.py` starts no writer
whose expected cost, with the runs in flight and what grading still owes,
would pass the cap, and no second run of a case while the first runs every
case still needs would not fit after it. The
calls run on the owner's subscription, whose limits the live routines share,
so `batch.py` also starts no writer while the five-hour window is at 45% or
more or the seven-day window at 60% or more, or from 11:30 to 14:45 UTC (16:30
on Mondays), the hours the daily and weekly routines fire and land. The
baseline's 2026-W41 run was started before this rule was written, to size a
run's cost; a baseline run does not depend on the rule.

## Running it

```
EVAL_ROOT=/tmp/period-writer            # cases, runs, logs and the ledger; never committed
bin/make-case.sh 2026-W41 $EVAL_ROOT/cases/2026-W41 <commit>    # each of the nine ids
bin/batch.py runs --configs baseline,threat-order --variant threat-order=variants/threat-order.json --reps 2
bin/batch.py audit --configs baseline,threat-order
bin/batch.py judge --config threat-order --vs baseline
bin/batch.py judge --config baseline --vs baseline       # the noise floor: rep 1 against rep 2
bin/batch.py controls --config threat-order --vs baseline
bin/batch.py report --config threat-order --vs baseline
bin/kinds.py --configs baseline,threat-order                # what each audited claim is about
bin/export.py --config threat-order --vs baseline           # results/, with the Played-line check
bridge/run.sh projects/period-writer/paper/generate.mjs     # from the lab's root
```

The per-run files (the reviews, the streams, the audits with their quotes)
hold the player's games and stay out of the repository, in the eval
directory. `results/` holds the aggregates: `report.json` (the rule as
`batch.py report` computed it, the spend and the usage windows) and
`runs.json` (each run's numbers, each pair's verdicts, the audits' counts by
grade and kind, and the Played-line check per review and for each review that
landed).
