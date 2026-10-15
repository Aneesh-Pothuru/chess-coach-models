# Does the learner know how often he solves a puzzle?

**The question.** The app's learner keeps a Glicko-2 rating for each skill
and turns it into the chance that he solves an item of a given difficulty
(`solveChance` in the app's `src/services/learner/glicko.ts`). Serving reads
that chance backwards: a bucket's puzzle set aims at the difficulty he should
solve 75% of the time, 85% while the bucket is new (`TARGET_P` and
`serveTarget` in `src/services/learner/serve.ts`, read by `bucketTarget` in
`src/services/exercises/families/puzzles.ts`). Yet the profile's puzzle
totals count 441 solved of 467. When the learner gives a solve chance, how
often does he solve? And is the rating serving reads the right one?

The learner keeps two estimates of each skill. The headline rating folds
every channel and counts a result in an announced set (a bucket's own set is
`themed`) at the Lichess discount: a solve moves it a fifth as far as one in
an unannounced set and a miss 0.7 as far, 0.1 and 0.4 for an obvious theme
such as mate in N (`CHANNEL_WEIGHTS` in `channels.ts`), so that a record
earned in announced sets does not overstate how he plays when nothing is
announced. Beside it, a view per channel folds only that channel's first
exposures, each at full weight (`foldAbilities` in `ability.ts`). Serving
reads the headline. The learner's own notes expect the discount to read a
player served at 75% in themed sets about 60 points under his strength.

**The answer.** Not settled by round 1. Its verdicts do not stand: the
record it rebuilt from the memory cards keeps almost only his solves, because
a miss comes back as a redemption card and the cards reviewed more than once,
which hold all but one of the puzzles he ever missed, were left out. The
profile as the app holds it was logged as he played, so nothing in it selects
on the result, and round 1 named it beside the verdicts. There the headline
rating, which serving reads, gave him a mean solve chance of 58% on puzzles he
solved 96% of: it sits close to the difficulty he was served, so sets aim far
below him. The view of his themed sets gave 82%, still low, with about half the
headline's log loss. That look decides nothing, so round 2 below tests the
view on the attempts the app records next. On that look the app's owner
chose to adopt the view before round 2: since chess PR 78 (merged as
`ae69a3e`) the app aims a bucket's set from its themed view, and the skill
map's next difficulty reads the same estimate. Round 2 decides whether it
stays. Since chess PR 79 (merged as `5c846e2`), a bucket with no attempt logged
in its own set aims from its stored totals read alone instead of the
headline; round 2 scores no attempt in such a bucket. Round 2 also tests
whether the chance holds for one-move puzzles and longer ones alike, which a
target per depth would need (rule 3). The study reruns each time the lab's
pin moves, always on the profile at the commit round 1 measured (`d8b7712`),
so the attempts recorded after it never reach round 1 and its numbers move
only when the app's learner does; its verdicts and the profile's look have
not changed since `ae69a3e`. The numbers are in the paper,
[`paper/paper.pdf`](paper/paper.pdf), and the script's report,
[`results/solve.md`](results/solve.md), which names the app commit it
measured.

Round 1's rule was committed before any solve chance was computed. Known
before it: the profile's totals (441 of 467) and the shape of the data (how
many memory cards, how many reviews each, how the legacy log lines up with
the cards, how many attempts and days the app's own record holds), not any
attempt's result beside a prediction.

## The attempts

His puzzle record, rebuilt so that every first try has its time. The app
keeps a memory card for every puzzle he has been served (`srs` in the synced
profile, keyed `puzzle:<id>`) with the time of its last review and its passes
and fails; the bank (`src/data/puzzles.json`) gives each puzzle's bucket and
Lichess rating. A card reviewed exactly once holds one first try: its time
and its result (a pass is a clean solve; a miss or a hinted solve is a fail,
as the app grades them). A card reviewed more than once keeps only its last
review's time, so its first try cannot be placed, and it is left out, with
the legacy log's entries for it.

Each first try enters the record as the attempt event the app writes for a
puzzle today: the themed channel (a fresh puzzle is served only in a bucket's
own set), first exposure, the bucket as its skill, the Lichess rating as its
difficulty. The profile's other attempt events enter as recorded. The puzzle
totals and the legacy attempt log are left out, since the rebuilt record
holds the first tries they count, so no seed is folded. The run checks that
the legacy log agrees with the cards (time, bucket, rating and result)
wherever both hold the same attempt, and that every log entry belongs to a
card.

## The instrument

For every first try, in time order, the app's own learner is folded on the
record before it (`observations` and `foldAbilities` from the pinned app, at
the moment of the attempt) and gives two solve chances for the item: from the
headline rating, which serving reads, and from the view of the attempt's own
channel. An attempt is scored when its skill already has a rated attempt in
the same channel, so both estimates exist. Its result is 1 for a clean solve
and 0 otherwise; its log loss is -ln p for a solve and -ln(1 - p) otherwise,
with p kept within 10^-6 of 0 and 1, as the learner's own self-check keeps it.

## The candidate

Read a set's solve chance, and so its serving target, from the view of the
set's own channel instead of the headline, falling back to the headline
where the view has no attempt yet. It fits nothing: the learner already
computes the view.

## The rule, fixed before any number was computed

The days with scored attempts (Los Angeles days, in time order) alternate
between two halves, the first day in the first half.

1. **How well the headline predicts.** Over all scored attempts: the share
   solved minus the headline's mean solve chance, with its 95% interval over
   1000 bootstrap draws of the days (seed 7). If the interval lies entirely
   above zero the headline under-predicts him; entirely below, it
   over-predicts; otherwise it is calibrated within the noise.
2. **The candidate.** It replaces the headline for a set's solve chance only
   if, on each half, its mean log loss per attempt is below the headline's,
   with the 95% interval of the difference, over 1000 bootstrap draws of that
   half's days (seed 7), entirely below zero. Nothing is fitted, so neither
   half trains it: they are two tests, and both must pass.

Reported beside the verdicts, deciding nothing:

- the Brier score and log loss of both estimates and of a running rate (the
  share of the skill's earlier attempts in the channel he solved, kept
  between 0.01 and 0.99 as the self-check keeps its constant);
- a reliability table: the scored attempts binned by solve chance at 0.5,
  0.6, 0.7, 0.8 and 0.9, with each bin's count, mean chance and share solved;
- each bucket's scored attempts, share solved and mean chance by each
  estimate;
- the shift, in rating points, that maximizes the likelihood of each
  estimate's chances when taken off every item's rating (from -500 to 500 in
  steps of 5), with its 95% interval over the same draws of all the days;
- the same replay on the profile as the app holds it: the legacy log, the
  puzzle totals as the seed, the events;
- the learner's own self-check on that profile (`calibration()`);
- per bucket, the difficulty a set would aim at today from each estimate,
  beside the hardest puzzle the bank holds.

Not in this round: an item-level model of difficulty (the published rating
stands for each item's difficulty, as in the app), which needs more than one
attempt per item.

## Round 2, fixed before any of its attempts exists

Round 1's record selected on the result, so its verdicts do not stand, and
the record that does not select is one whose attempts round 1 has already
read. Round 2 therefore tests on attempts the app has not recorded yet.

- **The attempts.** The profile as the app holds it at a later commit of the
  app, read with that commit's learner: every puzzle attempt in a bucket's own
  set (the themed channel) that the app counts as a first exposure, recorded
  after the last attempt in the profile at the commit round 1 measured
  (`d8b7712`; that attempt was played at 09:27 on 7 October, Los Angeles
  time). Everything before an attempt is its evidence, as the app folds it.
- **When.** Once those attempts fall on at least ten Los Angeles days. Until
  then nothing is decided.
- **The rule.** Rules 1 and 2 above, unchanged, on those attempts: the halves
  alternate over their days, and the view replaces the headline for a set's
  solve chance only if both halves pass. If the view has already been ported
  when round 2 runs, the same verdict decides whether it stays. (It was
  ported before round 2. Sets then aim harder; each estimate is still scored
  on the puzzles he was served, so the rule applies unchanged.)
- **Seen early.** After rules 1 to 3 were fixed, one rerun of round 1 at a
  later pin, made before round 1 was held to its own profile, read the
  attempts recorded after it into the profile's look and reported their count
  and misses (23 more scored attempts, 5 more misses). Its results were not
  committed, and no rule has changed since.

## Round 2, rule 3: a target by depth, fixed before any of its results was read

*How to Win at Chess, Next Level* (Rozman, 2026; chapter 4, "Tactical Play")
sets a target by a puzzle's depth: solve 80–90% of one-move puzzles and 60–70%
of level-two puzzles, combinations of two or more moves, often two or three.
The app aims every puzzle of a bucket's set at one target, 85% while the
bucket is new and 75% after, whatever its depth. A target per depth lands
where it says only if the solve chance is as good at one depth as at the
other, and rule 3 tests that. Whether to aim by depth stays the owner's call
whatever it finds: which targets he improves faster under needs sets aimed at
each target, and the app aims all of a set's puzzles at one.

Rule 3 was fixed after round 2's first attempts were recorded and before any
of their results was read. Known before it: that the profile at chess
`78ee366` holds 24 puzzle attempts after round 1's last one, with nothing read
of their puzzles, channels or results; the bank's depths; and round 1's split
by depth, which cannot answer it, since he missed only one of round 1's scored
attempts on puzzles the bank still holds.

- **Depth.** His moves in the puzzle's move list in the bank, which opens with
  the opponent's move and alternates from there (`puzzleExercise` in
  `src/services/exercises/families/puzzles.ts` plays that move as the setup):
  half the list, since every list in the bank has an even length. The count
  matches Lichess's own length theme (oneMove, short, long, veryLong) on every
  puzzle that carries one. Level one is a one-move puzzle; level two, two
  moves or more, as the book counts them. An attempt whose puzzle is not in
  the bank at the commit round 2 reads is left out of rule 3 and counted.
- **The attempts and the chance.** Round 2's scored attempts, and the solve
  chance from the estimate rule 2 leaves serving: the view if it stays, the
  headline if not.
- **When.** With rules 1 and 2, once each level holds at least 30 of those
  attempts. Until then rule 3 reports not enough data, with the counts, and
  is checked again at each later check-in, unchanged, on every round 2
  attempt recorded by then. It runs once; a test on more attempts after it is
  a new round, fixed before it runs.
- **The test.** At each level, the share solved minus the mean chance. The
  statistic is level one's minus level two's, with its 95% interval over 1000
  bootstrap draws of the days (seed 7); a draw that holds no attempt at one of
  the levels is drawn again.
  - If the interval lies entirely above zero, he solves one-move puzzles more
    often than the chance says, against longer ones; entirely below, less
    often. Either way the chance misses by depth, and a target per depth would
    not land where it says. The candidate is then a depth term: for each
    level, the shift taken off its puzzles' ratings that maximizes the
    likelihood of the first half's attempts at that level (round 1's grid,
    -500 to 500 in steps of 5), against one shift fitted the same way on all
    of the first half's attempts. It is kept only if, on each half, its mean
    log loss per attempt is below the one shift's, with the 95% interval of
    the difference over 1000 bootstrap draws of that half's days (seed 7)
    entirely below zero. The halves alternate over the days, as in rule 2. A
    kept term goes to the app as the two levels' difference in a puzzle's
    difficulty; the one shift is rules 1 and 2's business.
  - Otherwise no difference shows: within the interval, the chance is as good
    at one level as at the other, and a set aimed by depth would land as near
    its targets as a set aimed at one target does now, with no change to the
    chance.

Reported beside, deciding nothing:

- for each level, and for two or three moves apart from four or more: the
  attempts, their days, the share solved and the mean chance by both
  estimates, with intervals over the same draws;
- the share solved at each level under the app's present aim, beside the
  book's bands;
- the statistic again over only the buckets whose attempts include both
  levels, so that a difference between buckets is not read as one between
  depths;
- per bucket, the difficulty a set would aim at today for 85% at one move and
  65% at two or more (`difficultyFor` in `glicko.ts` on the serving estimate,
  held under `bucketCeiling` of that level's puzzles), beside the lowest and
  highest rating among that level's puzzles in the bucket.

## Files

| File | What it does |
|---|---|
| `replay.mjs` | Rebuilds the record, replays the app's learner over it and over the profile as the app held it at the commit round 1 measured, and writes one row per scored attempt. |
| `fit.mjs` | Applies the rule and writes `results/`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/learner-solve-chance/replay.mjs
bridge/run.sh projects/learner-solve-chance/fit.mjs
bridge/run.sh projects/learner-solve-chance/paper/generate.mjs
```

Round 2 adds its own script, which runs rules 1 to 3, when it runs.

The attempts are his, so the rows stay in `private/learner-solve-chance/`;
`results/` holds aggregates only.
