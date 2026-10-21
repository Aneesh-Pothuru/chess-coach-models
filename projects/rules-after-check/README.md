# Does a rule of thumb choose better once the tactics are checked?

**The question.** [rules-of-thumb](../rules-of-thumb/) found that no rule of
thumb chooses a better move than the one a player at his level would naturally
play: wherever the move a rule points to differs from the natural move, it is
sound less often, for every rule with enough data. Its held-out examples say
why. Most of the rule moves that failed lose material by the app's own blunder
check, and most of the rest pass over a check, a capture or a promotion that
the natural move took. That run asked each rule to choose the move with no
tactics checked first. A coach, and several of the app's lessons ("No
tactics? Improve the piece doing the least."), put the checks, captures and
threats first and the rule second. So the fair test of such a lesson is the
rule after the check: in positions with no tactics on the board, and among the
moves the app's blunder check passes, is the move a rule points to, as players
at his level would play it, sound as often as the move they would naturally
play among those same moves?

**The answer.** No verdict. The rule below puts a control first, and it
failed: in the quiet positions where the rule's own move fails the app's
blunder check, the next rule move that passes the check is sound no more often
than the move it replaces, on either period. This design could not show the
check rescuing a rule's move, so by the rule no rule of thumb gets a verdict,
and what follows describes.

In a quiet position the check rarely changes the rule's move: where some rule
move passes it, the rule's own move passes it 95 to 100 percent of the time,
so the rule after the check is nearly the rule before it. That move is sound
less often than the move his level naturally plays among the moves that pass,
for all 12 rules with data, on the train months and on the held-out month: by
about 1 point for the rule of the square, 6 to 11 for the opposition, trading
when ahead and the active king, 14 to 25 for the passed pawn, the rook on the
seventh, the open file, the worst piece, the outpost and the rook behind the
passed pawn, and about 30 for cutting the king off and the pawn break. The
outside passed pawn came up in a quiet position with a safe rule move only 12
times in the held-out month. Over every position with a safe rule move, quiet
or not, the gap is larger for each of the 12, from about a quarter larger to
more than double: a tactic on the board, a check to answer or a mate in one or
winning capture for either side, is where a rule's move falls furthest behind.
The gap is smallest where the rule's move is itself a capture or a check, and
in endgames. The rules still point to sounder moves than the same number of
safe moves drawn at random: 10 of the 12 on both periods, though not the rook
behind the passed pawn or cutting the king off on the held-out month.

For the app nothing is ported, since there is no verdict. The description
agrees with [rules-of-thumb](../rules-of-thumb/): a rule of thumb tells him
where to look and explains a move, but it does not choose one, even once the
checks, captures and threats are seen. The app's open-file and outpost lessons
now put the tactics first, and the open-file lesson says the file tells him
where to look, not what to play (chess PR 165). The paper is
[`paper/paper.pdf`](paper/paper.pdf).

If a rule holds after the check, a lesson can teach it as the move to look for
once nothing is hanging. If it does no better than the natural move, the rule
explains a move and says where to look, but does not choose one. If it does
worse, a lesson that teaches it should tell him to compare its move with the
others before playing it.

## The positions

The positions rules-of-thumb scored, read and never changed: its phase two
(run `full`, app `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`, records
`aed714ada579782ce73630596e59c8b65e74cb30`), for each of the 13 rules with a
verdict. Lucena and Philidor came up too rarely there and are left out here
too. Train is July and August 2026 pooled (8,000 positions per rule), held out
is September 2026 (4,000 per rule): middlegames and endgames from Lichess
rated games at 10 minutes with no increment, the mover rated 1250 to 1649 on
Lichess. Each row keeps its FEN, the legal moves that show the rule
(`ruleMoves`), R, N and the move played, the mover's and the opponent's Maia
bands, the referee's evidence and the soundness of each move. Its journals
and the null addition's journals are inputs, checked by content hash before
the first row is read.

## The check

Two readings, both by the app's knowledge service at app commit
`3437a711843006926c0804394b9087c5a55d4bcf` (the app's main when this rule was
written). At `f4bd63f` the blunder check counted the capturing piece of an
even trade as newly loose, so it flagged every even trade; the app fixed that
before `3437a71`. Both readings are board code, so they run as their own pass
and write one record per row.

- **A quiet position**, the "no tactics" of a lesson: the mover is not in
  check, and `describePosition(fen).threats` gives neither side a mate in one
  (`mateInOne`) or a winning capture (`winningCaptures`). The positions that
  are not quiet are counted, and left out of the verdict.
- **A move passes the check** when `safetyCheck(fen, uci).verdict` is `safe`:
  the reply cannot mate at once, no piece of the mover's is newly left to be
  taken for a gain (the capturing piece of an even or winning capture is not
  counted), and the move deserts no defence.

## The moves compared

In each quiet position, with **S** the legal moves that pass the check and
**SR** the rule's moves (`ruleMoves`) that pass it:

- **Rs**: the move Maia-2 rates most likely at the mover's band among SR. A
  quiet position where SR is empty has no rule move after the check: it is
  counted, and left out of the comparisons below.
- **Ns**: the move Maia-2 rates most likely at the mover's band among S.
- **R0s**: with k the size of SR, k moves drawn at random without replacement
  from S sorted by UCI, by rules-of-thumb's sampler
  (`sampleWithoutReplacement` with `detect.mjs`'s `seeded()`, keyed by the
  row's `month:game:rule`, a NUL and `after-check`), and the one of them
  Maia-2 rates most likely. A rule with no information after the check.
- N, R and the move played come from the original row.

Ties break as R's did (`score.mjs`'s `pick()`: the higher probability, then
the UCI that sorts first). Maia-2's policy
comes from the app's `humanPolicy` at `f4bd63f`, with the bands the original
scorer asked for; it must reproduce the row's R and N, or the worker stops.

## The referee

As rules-of-thumb's null addition refereed (its `null-readings.md`): with seven
men or fewer, the row's stored tablebase probe, outcomes compared exactly,
with no new tablebase request. Otherwise a move that is R, N, the move played
or the null's R0 keeps its stored soundness, and matching labels must agree.
Every other move is scored by Stockfish at `grade` through the app at
`f4bd63f`, once per position: the hash cleared (`newGame()`), evaluation
caching off, the best searched first with one line, then each new move among
Rs, Ns and R0s scored and judged against that best by the app's window (3
win%, `acceptsAlternative`). The share of these positions whose fresh best
move differs from the stored one is reported.

## The measures

For each rule, on the train months and on the held-out month separately, over
the quiet positions where SR is not empty:

- **The lift after the check**: S(Rs) minus S(Ns), paired by position, where
  S is the share sound. This decides.
- **Against the natural move**: S(Rs) minus S(N), paired by position.
- **The content after the check**: S(Rs) minus S(R0s), paired by position.
- **The lift where Rs is not Ns**.
- **Coverage**: the share of the rule's positions that are quiet, the share of
  those where SR is not empty, and the shares where Rs is R and Ns is N.

Intervals are 95%, from the bootstrap over games rules-of-thumb used (2,000
resamples, seed 20261018), every measure of a rule and period sharing the same
resamples. A ratio with no positions under it stays undefined and is counted,
never read as 0.

## The rule, fixed before any position is read

**The control comes first.** The check must be able to rescue a rule's move.
Pooled over the 13 rules, in the quiet positions where R does not pass the
check and SR is not empty, S(Rs) minus S(R) must have its 95% interval above
0 on both periods. If it does not, no rule gets a verdict, since a lift this
design could not see would read as none.

**Then, for each rule**, on both periods:

- the rule **holds after the check** when the lift after the check has its
  95% interval above 0;
- it **misleads after the check** when that interval lies below 0;
- it **does no better than the natural move** otherwise, including when the
  two periods disagree.

A rule with fewer than 300 held-out quiet positions where SR is not empty gets
no verdict: "not enough data (n=…)". The content after the check and the
comparison with N describe, and change no verdict.

**Also reported, without a rule:** each measure over all the rule's positions
where SR is not empty, quiet or not; the lift after the check in the splits
of rules-of-thumb that a quiet position leaves open (the mover's material, the
divider's phase, whether Rs is a capture or a check, and the mover's king
danger, read as `splitsOf` reads them, at `3437a71`); S(Ns) minus S(N) in
quiet positions; and for each rule with a verdict, eight held-out quiet positions
where Rs is not Ns, drawn as rules-of-thumb's examples were (the same sampler,
keyed by the rule's id and `after-check`), with FEN, Rs, Ns, R, N, the move
played and the referee's best in SAN, and whether each is sound with its win%.
The examples are Lichess positions (CC0), committed without a game id or link.

## Caveats

- **Two app commits.** The check is the app's reading now, and Maia-2 and
  Stockfish are the run's, so every R and N is the one rules-of-thumb scored.
- **A quiet position by board code.** No mate in one and no winning capture
  for either side is the app's reading of "no tactics". A deeper tactic, a
  fork two moves away, still counts as quiet.
- **One move for a plan.** As in rules-of-thumb, a rule is tested as the next
  move his level would play for it.

## Who runs it

The scoring needs Maia-2 once per quiet position and Stockfish wherever Rs,
Ns or R0s is a new move, so it runs on the owner's Mac through the session
that runs Codex there, like rules-of-thumb. rules-of-thumb's null addition
took about 25 worker hours, 14 of them in Stockfish, for one new move per
position. This one scores up to three new moves against one best search, but
only in quiet positions, so it should take about as long, and at most about
twice as long. Rows go under `private/rules-after-check/`, which git
ignores, and only aggregates are committed, by the scripts, then the paper.
The scripts, their synthetic tests and a content freeze of this rule and of
the inputs come first, reviewed before the first position is read. No
language model judges anything.

## Files

| File | What it does |
|---|---|
| `app-pins.json`, `checkout.py` | Select the two app checkouts through the bridge, using the existing dependencies. |
| `freeze.py`, `manifest.json`, `input-manifest.json` | Freeze the rule, source, apps and predecessor inputs by content hash, without reading position rows. |
| `readings.md` | The implementation's readings for the owner's review before the run. |
| `common.mjs` | Read-only input joins, frozen provenance and resumable two-shard journals. |
| `board.mjs` | Read quietness and every legal move's safety with the check app. |
| `score.mjs` | Reproduce R and N, choose Rs, Ns and R0s, and reuse or obtain referee readings. |
| `analyze.py` | The control, shared game bootstrap, verdicts and descriptions; writes `results/rules.json` and `results/rules.md`. |
| `examples.mjs` | The held-out examples; writes `results/examples.json` and `results/examples.md`. |
| `run.py`, `run.sh` | Detached, logged stages, two heavy workers, checkpoint resumption and the UTC pause. |
| `tests-*.mjs`, `test_*.py` | Synthetic checks; no study rows, engine searches or Maia inference. |
| `cost.py` | A cost estimate from the null addition's published timings; writes `results/cost.json` and `results/cost.md`. |
| `operations.py`, `test_operations.py`, `operations-manifest.json` | The run's execution report from its logs, without parsing a study row; writes `results/operations.json` and `results/operations.md`. |
| `frozen-readme.md`, `answer_check.py` | The README as it stood when frozen, and the check that the answer is its only change before `## Files` and that every other frozen source is unchanged. |
| `paper/` | The paper and its generator, which checks every claim the paper makes against `results/`. |

## Running it

Prepare the second app only if it is absent. No package install is needed.

```bash
.venv/bin/python projects/rules-after-check/checkout.py
```

The checks below are synthetic. The app's imports still go through the
bridge, with the check app for the board tests and the measured app for the
scorer, examples and shared mechanics.

```bash
CHESS_DIR="$PWD/.cache/chess/3437a711843006926c0804394b9087c5a55d4bcf" nice -n 10 bridge/run.sh projects/rules-after-check/tests-board.mjs
CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" nice -n 10 bridge/run.sh projects/rules-after-check/tests-score.mjs
CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" nice -n 10 bridge/run.sh projects/rules-after-check/tests-common.mjs
CHESS_DIR="$PWD/.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a" nice -n 10 bridge/run.sh projects/rules-after-check/tests-examples.mjs
nice -n 10 .venv/bin/python projects/rules-after-check/test_analysis.py
nice -n 10 .venv/bin/python projects/rules-after-check/test_runner.py
.venv/bin/python projects/rules-after-check/cost.py
.venv/bin/python projects/rules-after-check/freeze.py --write
.venv/bin/python scripts/check_private.py
```

Commit the freeze and stop for review. Only after the owner authorizes the
run, this command starts or resumes the whole pipeline. It returns the
detached driver's pid and log path. Do not launch another while it runs.

```bash
.venv/bin/python projects/rules-after-check/freeze.py
sh projects/rules-after-check/run.sh --reviewed
```

Logs, driver status, shard metadata and per-row files stay under
`private/rules-after-check/full/`. Only script-written aggregates and the
registered CC0 examples reach `results/`. The answer and paper follow review.

The answer was written after the run, so the README no longer matches the
freeze, and rules-of-thumb's README answer was brought up to date with the app
after the run (chess PRs 165 and 166). `frozen-readme.md` keeps this README as
it stood, and `answer_check.py` checks that it matches the freeze, that the
README differs from it only in the answer up to `## Files`, and that every
other frozen file is unchanged but the predecessor's README, which its own
answer check confirms changed only in its answer. A repeat of the run checks
the freeze first, so it runs with `frozen-readme.md` in the README's place and
rules-of-thumb's README as it stood at lab commit `f09cc32`. The paper needs
only the committed results:

```bash
.venv/bin/python projects/rules-after-check/answer_check.py
bridge/run.sh projects/rules-after-check/paper/generate.mjs
(cd projects/rules-after-check/paper && latexmk -pdf paper.tex)
```
