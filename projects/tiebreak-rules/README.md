# Does a coach's rule pick the better of his level's two natural moves?

**The question.** A titled player reviewing the rapid games of an adult player
rated about 1100 ([video](https://www.youtube.com/watch?v=PcGDehRSqTM)) gives
rules for the quiet moments of a game: keep the tension unless taking gains
something; avoid even trades when ahead in development and look for them when
behind; keep the pawns off the bishop's colour; and prefer the bishop to the
knight, the better trade, he says, about four games in five.
[central-strike](../central-strike/) tested his fifth rule, the central break
while the other king is still in the centre, and found no signal.
[rules-of-thumb](../rules-of-thumb/) and [rules-after-check](../rules-after-check/)
asked a rule to choose the move, and its move, one his level plays less often,
was sound less often than the move his level would naturally play. The coach
does not use his rules that way: the student names a few normal moves, and the
rule says which of them to play. So this study asks a rule only to break a
tie. In quiet positions where the two moves Maia-2 rates most likely at his
level are one that follows the rule and one that breaks it, is the one that
follows it sound more often, beyond what Maia-2's own order says?

**The answer.** Two of the four rules break the tie: bishop over knight, and
pawns off the bishop's colour. In quiet positions where the two moves Maia-2
rates most likely at the mover's band are one that follows the rule and one
that breaks it, the move that follows is sound more often than Maia-2's own
order accounts for, by about 4 points held out for each rule, with the
interval above 0 on the train months and on the held-out month. Keeping the
tension does no better than Maia-2's order on either period, and trading by
development breaks the tie on the train months but not held out, so by the
rule it does no better either. The planted control passed first: a move that
leaves a piece to be taken for a gain loses the tie by 28 to 29 points on both
periods, so the design sees a rule that works.

The two rules break a tie; they do not overrule a first choice. Neither is
worth switching to: where Maia-2 rates the move that breaks the rule first,
that move is still sound more often than the second move, which follows it, by
about 17 points for bishop over knight and 10 for the bishop's colour held
out. Where only one of the two moves is sound, it is the rule's move about 54
times in 100 for each, not the coach's four games in five.

A rule of two units is read as the mean of its halves, because a lean towards
quiet moves, or towards trades, would lift one half and sink the other. Bishop
over knight's halves differ: keeping the bishop rather than giving it for a
knight breaks the tie by about 8 points held out, while taking a bishop with a
knight does no better than Maia-2's order. That fits a rule that holds only
for keeping the bishop, and as well one that holds both ways beside a lean
towards the quiet move, which the mean cancels. The trade units side with the
rule both ways: there, a trade that takes a bishop fares better against the
quiet move than one that takes a knight. Of trading by development's halves,
trading when behind breaks the tie on both periods and keeping pieces on when
ahead does not.

The splits decide nothing, but they say where the two rules count. In close
calls, where Maia-2 rates its second move at least half as likely as its
first, keeping the bishop where the first choice gives it for a knight is
sound as often as that first choice or more, and keeping a pawn off the
bishop's colour where the first choice puts one on it about as often. The lift
for keeping the bishop is larger in the opening and in his band, and the
bishop's colour counts in the middlegame and the endgame, not the opening.

For the app, the two rules can be taught as the way to choose between two
moves that look equally good, never as a reason to overrule one that looks
better. Since chess PR 181 a strategy lesson teaches them that way, with
keeping the bishop counting most in the opening and the bishop's colour in the
middlegame and the endgame. The paper is [`paper/paper.pdf`](paper/paper.pdf).

If a rule breaks the tie, a lesson can teach it as the way to choose between
two natural moves, and Game Review can name it where he played the move that
breaks it and his other natural move followed it. If it does no better than
Maia-2's order, it explains a move but does not choose between his candidates.
If it misleads, a lesson that teaches it should say where it fails.

## The rules

Four rules, read as six units. A unit has a situation and reads each legal
move: the move **follows** the unit's rule, **breaks** it, or neither. A rule
of two units reads two mirrored halves, so that a preference for quiet moves
over trades in general, or for trades over quiet moves, cancels between them.

| Rule | Unit | Situation | Follows | Breaks |
|---|---|---|---|---|
| Keep the tension | `tension` | the mover has a lever whose capture is an even trade | a quiet move that moves no lever's pawn | a lever's capture that is an even trade |
| Trades and development | `trades-ahead` | not an endgame, material level, an even trade of a piece on, the mover ahead in development by 2 or more | a quiet move | an even trade of a piece |
| | `trades-behind` | the same, the mover behind in development by 2 or more | an even trade of a piece | a quiet move |
| Bishop over knight | `bishop-for-knight` | the mover can give a bishop for a knight in an even trade, and cannot take a bishop with a knight so | a quiet move | the bishop taking the knight |
| | `knight-for-bishop` | the mover can take a bishop with a knight in an even trade, and cannot give a bishop for a knight so | the knight taking the bishop | a quiet move |
| Pawns off the bishop's colour | `bishop-colour` | the mover has one bishop, and quiet pawn moves to squares of both colours | a quiet pawn move to a square of the other colour | a quiet pawn move to a square of the bishop's colour |

Every reading is the app's knowledge service at the app commit in
`app-pin.json` (`ffee8dbb166f77dcc75721b6cca28d37703f4515`, the app's main
when this study began), through `readings.mjs`:

- **A quiet move** is not a capture and gives no check.
- **An even trade** is a capture that gives no check and that the capture war
  (`captureExchangeByMove`) scores 0: what it takes, less the opponent's best
  continuation on its square.
- **A lever** is a pawn of the mover's that attacks a pawn of the opponent's
  (`describePosition(fen).side[mover].pawns.levers`). Its capture is that pawn
  taking that pawn, not en passant.
- **A trade of a piece** takes a knight, bishop, rook or queen.
- **Development** has no reading in the app, so it is defined here: a side's
  undeveloped count is its knights and bishops on their starting squares (b1,
  g1, c1 and f1 for White, b8, g8, c8 and f8 for Black), plus one when its
  king stands on its starting square. The mover's lead is the opponent's count
  minus the mover's.
- **Material level** is the mover's points within 1 of the opponent's
  (`materialFor`), so the rules about trading when ahead or behind in material
  stay out. **Not an endgame** is the divider's phase of the position
  (`phaseOf`).
- **The bishop's colour** is `sideMaterial(fen)[mover].bishopColours`, and a
  square's colour is the board's (`squareColor`). A quiet pawn move here is
  not a promotion.

"Unless taking gains something" is the tension rule's exception, and it cannot
come up: in a quiet position (below) no capture gains material by the capture
war, so every release tested is an even trade.

**The reference unit.** `trades-level` reads as `trades-ahead` does, with
development level (a lead of −1, 0 or 1). It is no rule: it shows how a quiet
move fares against an even trade of a piece when development says nothing,
beside the two units that read development.

**The planted control.** `hang`, in every position where at least one of
the six rule units is in its situation (the reference's alone does not
count), so that it is read where the rules are. Among quiet moves, one after
which the opponent has no winning capture at all follows, and a knight,
bishop, rook or queen move after which the opponent can take that piece for a
gain breaks (`describePosition` of the position after the move gives the
opponent a winning capture landing on the piece's square). Every other move
is neither. A move that leaves its piece to be taken for a gain is known to be
the worse of the two far more often than not, so this unit must break the
tie, or the design cannot be trusted to see a rule that does.

## The data

As in rules-of-thumb: Lichess rated standard games (CC0) at 10 minutes with no
increment, his own time control, that ended normally or on time, with at
least 30 plies, both players rated 1250 to 1649 on Lichess. Train: July and
August 2026, pooled. Held out: September 2026. The games are rules-of-thumb's
stream, the first 30,000 such games of each month in file order
(`private/rules-of-thumb/full/games-<month>.jsonl.gz`), checked against the
content hash its summary records (`games-<month>.json`) before the first game
is read. A game with an initial position of its own is skipped and counted.

**The bands.** His band is 1250 to 1449 and the band above 1450 to 1649, by
the mover's Lichess rating, as in rules-of-thumb: 1300 and 1500 on Maia-2's
scale. Both bands are kept and pooled; each measure is also reported by band.

## The positions

- **A quiet moment.** A position enters the scan from ply 8 on (from White's
  fifth move), when the move just played captured nothing, the mover is not
  in check and has at least two legal moves, and `describePosition(fen).threats`
  gives neither side a mate in one (`mateInOne`) or a winning capture
  (`winningCaptures`). A capture or a mate on the board comes before any rule,
  and a position just after a capture is the middle of a trade, where the
  recapture is the move even when the capture war calls it even.
- **The two natural moves.** M1 and M2 are the two legal moves Maia-2 rates
  most likely at the mover's band (the app's `humanPolicy`, with the
  opponent's band as `opponentBand`), ties broken by the UCI that sorts first.
- **A split.** A position splits for a unit when it is in the unit's
  situation and one of M1 and M2 follows the unit's rule and the other breaks
  it. **F** is the move that follows and **B** the move that breaks. The
  position is **follow-first** when M1 is F, and **break-first** when M1 is B.
- **The draw.** For each unit, a game gives at most one position: one drawn at
  random among the game's positions that split for that unit, seeded by the
  game's Lichess id, a NUL and the unit's id (rules-of-thumb's `seeded()`).
- **The scan.** Every game of a month's stream, in file order. Maia-2 reads
  each entering position in at least one unit's situation, and no other. Each
  unit keeps the first 3,000 of its drawn positions a month in file order, so
  at most 3,000 held out and 6,000 on the train months.

## The referee

As in rules-of-thumb, through the app's engine service at the app commit
above: with seven men or fewer, the app's tablebase probe decides, and a move
is **sound** when it keeps the mover's outcome (`moveOutcomeForMover`,
outcomes compared exactly). Otherwise Stockfish at the `grade` budget (250,000
nodes) with the hash cleared before each position (`newGame()`) and the cache
bypassed: the best is searched first with one line (`bestMoves`), then F and B
are each scored at the same budget (`scoreMove`), and a move is sound when it
gives up no more than `ACCEPT_WINDOW_WP` (3) win% against that best, as
`acceptsAlternative` judges. When a position is kept for several units, its
best is searched once and each distinct move scored once. The move played is
recorded and not scored.

## The measures

For each unit, on the train months and on the held-out month separately, over
its kept positions, with F and B each 1 when sound and 0 when not:

- **The plain lift**: S(F) minus S(B), paired by position, where S is the
  share sound.
- **The lift in each order**: the plain lift over the follow-first positions,
  and over the break-first positions.
- **The balanced lift**: the mean of the two orders' lifts. The move Maia-2
  puts first is likely to be sound more often than its second, which adds to
  the follow-first lift and takes away from the break-first lift. The mean
  cancels that advantage when it is the same in both orders, so a rule that
  carries no information reads about 0 whatever share of its splits come in
  each order.
- **When only one is sound**: among the positions where exactly one of F and
  B is sound, the share where it is F, as the mean of the two orders' shares.
  A rule with no information reads 50%; the coach's "four games in five" would
  read 80%.
- **Against the first choice**: S(F) minus S(M1), paired by position: what
  playing the move that follows the rule gains over playing the move Maia-2
  puts first. It is 0 in the follow-first positions.

**A rule's lift** is its unit's balanced lift for a rule of one unit, and the
mean of its two units' balanced lifts for a rule of two. The same holds for
each measure of a rule.

**Intervals** are 95%, from 2,000 bootstrap resamples over games (seed
20261021), within each period. A resample draws games, and every unit's
measures on it use the positions of the games drawn, so a rule's lift, its
units' and the control's are read on the same resamples. A measure with no
positions under it on a resample is undefined there; an interval needs every
resample defined, or the measure is reported as undefined with the count of
resamples that lacked it, never read as 0.

## The rule, fixed before any position is scored

**The control comes first.** The control's balanced lift must have its 95%
interval above 0 on both periods, with enough data by the count below. If it
does not, no rule gets a verdict, and what follows describes.

**Then, for each rule**, on the train months and on the held-out month:

- the rule **breaks the tie** when its lift has its 95% interval above 0 on
  both periods;
- it **misleads** when that interval lies below 0 on both;
- it **does no better than Maia-2's order** otherwise, including when the two
  periods disagree.

**Enough data.** A rule (or the control) gets "not enough data (n=…)" when any
of its units has fewer than 300 held-out positions, or fewer than 100
held-out positions in either order, whatever the numbers say.

**Beside the verdict**, changing none: a rule is **worth switching to** when
its lift in the break-first order has its 95% interval above 0 on both
periods. There, his level's first move breaks the rule and its second follows
it, so the rule is then a reason to play the second.

## Also reported, without a rule

- Every measure for each unit apart, the two halves of a rule of two units
  read each as a rule of one, and for the reference unit.
- **Coverage**, per unit and month: the entering positions in the unit's
  situation, those that split, the games with a split, and the positions kept
  in each order.
- **The splits** of each unit's positions, each measure within each cell: a
  close call (M2's probability at least half of M1's) or not; the mover's
  band; the divider's phase; for `tension`, whether the lever's pawn stands on
  the c-, d-, e- or f-file; and for the trade units, the kind of piece the
  trade takes.
- **The move played**: how often it is F, B or another move, in each order.
- **How likely each is**: Maia-2's probability of F and of B at the mover's
  band.
- **Examples**: for each unit, six held-out positions drawn at random among
  those where exactly one of F and B is sound (seeded by the unit's id, a NUL
  and `examples`), each with its FEN, F, B, the move played and the referee's
  best in SAN, and whether each of F and B is sound, with its win%. They are
  Lichess positions (CC0), committed without a game id or link.

## Before the rule

Before this rule was written, a count on the first 600 June 2026 games of the
same filter, a month outside the study's, read the board and Maia-2's two
moves and scored nothing: [`results/availability.md`](results/availability.md),
written by `availability.mjs`. It set the scan and the cap. In June a game
gave `tension` a split about four times in ten, `bishop-for-knight` about three
in ten, `knight-for-bishop` and `bishop-colour` about one in six, and the
reference about one in two, so over a month's 30,000 games the cap of 3,000
binds for them. `trades-ahead` split in about one game in thirty, so a month
gives it about 1,000 positions, about a quarter of them follow-first;
`trades-behind` gets about 2,000 and the control about 1,100. These three keep
every game's draw, and the gate of 300 held-out positions and 100 in each order
is one they can pass. The count ran twice, both times before any move was
scored: first with the control in every entering position, where it split in
40 of the 600 games, then, as fixed here, where a rule unit is in its
situation. Maia-2 then reads only the positions in some unit's situation,
about two in five of those entering the scan.

## Caveats

- **Maia-2's order is the yardstick.** The balanced lift assumes the
  advantage of Maia-2's first move over its second is about the same in the
  two orders. A rule whose follow-first positions differ in kind from its
  break-first ones could lean either way, so the lift in each order is
  reported, and the control shows the design sees a rule known to hold.
- **Development by the starting squares.** A rook not yet connected or a
  queen out early does not count, and a minor piece that has come back to its
  square counts as undeveloped.
- **Even by the capture war.** A trade the war calls even can still lose to a
  tactic it does not see. That is the referee's to find, and part of what a
  rule's move is judged on.
- **Two moves for a choice.** A rule is tested between the two moves his
  level would most likely play, which is where the coach's student uses it,
  not over every legal move.
- **One move for a plan.** As in rules-of-thumb, a rule is tested on the next
  move.
- **Not his games.** His band is the app's conversion of his chess.com
  rating, as in rules-of-thumb.

## Who runs it

On the owner's Mac, through the session that runs Codex there, as
rules-of-thumb and rules-after-check ran. Codex writes the scan, the scorer,
the analysis, the examples, their synthetic tests, a content freeze of this
rule, its sources and inputs, and a runner; a timing pass on a slice of July
then prices the run, and it stops for review before the first position is
scored. The run uses two heavy workers at nice 10 and pauses from 13:00 to
15:30 UTC, when the app's routines run. Per-game and per-position files stay
under `private/tiebreak-rules/`, which git ignores, and only aggregates the
scripts write reach `results/`, then the paper. By the June count, the scan
reads Maia-2 about 830,000 times over the three months (about 35 ms a call on
the Mac in rules-after-check), and Stockfish searches up to three times in
each of about 57,000 kept positions (about 0.35 s a search there): about 25
worker hours, about 13 hours on two workers. No language model judges
anything.

## Files

| File | What it does |
|---|---|
| `app-pin.json`, `app.sh` | The app commit this study measures, and its checkout in the bridge's cache, fetched and installed the first time. |
| `readings.mjs` | The units, the planted control, the scan's entry, Maia-2's two moves and the split, read through the app's knowledge service. |
| `tests-readings.mjs` | The readings on positions built by hand. |
| `june.py` | Streams the June 2026 games for the count before the rule. |
| `availability.mjs` | The count before the rule, with no move scored; writes `results/availability.json` and `results/availability.md`. |
| `readings.md` | Implementation choices for the owner's review before scoring. |
| `common.mjs` | Frozen input checks, two-shard journals, checkpoint recovery and process limits. |
| `scan.mjs`, `select.mjs` | Scan every game, draw one split per game and unit, then merge in file order and cap each unit. |
| `score.mjs` | Referee each retained occurrence once, sharing its best and distinct F/B readings across units. |
| `analyze.py`, `examples.mjs` | Registered shared-game bootstrap, control, verdicts and descriptions; the held-out examples. |
| `freeze.py`, `manifest.json`, `input-manifest.json` | Content freeze of the rule, sources, app, dependencies and stream inputs. |
| `run.py`, `run.sh` | Detached driver, two heavy workers, power checks and automatic UTC pauses. |
| `timing.py`, `timing-manifest.json` | Counts and timings from the July slice, and the full-run cost estimate. |
| `tests-*.mjs`, `test_*.py` | Synthetic tests for scanning, selection, scoring, resampling, examples and orchestration. |
| `frozen-readme.md`, `answer_check.py` | The README as it stood when frozen, and the check that the answer is its only change before `## Files` and that every other frozen source is unchanged. |
| `paper/` | The paper and its generator, which checks every claim the paper makes against `results/` and the rule. |

## Running it

From the lab's root. The checks are on hand-built positions:

```bash
CHESS_DIR="$(projects/tiebreak-rules/app.sh)" bridge/run.sh projects/tiebreak-rules/tests-readings.mjs
```

The count before the rule streams June and reads Maia-2 where the scan
would, scoring nothing:

```bash
.venv/bin/python projects/tiebreak-rules/june.py
CHESS_DIR="$(projects/tiebreak-rules/app.sh)" bridge/run.sh projects/tiebreak-rules/availability.mjs
```

The scripts below use the already prepared checkout. No install or new June
count is needed. Synthetic checks read no study position or soundness:

```bash
export CHESS_DIR="$PWD/.cache/chess/ffee8dbb166f77dcc75721b6cca28d37703f4515"
nice -n 10 bridge/run.sh projects/tiebreak-rules/tests-readings.mjs
nice -n 10 bridge/run.sh projects/tiebreak-rules/tests-scan.mjs
nice -n 10 bridge/run.sh projects/tiebreak-rules/tests-common.mjs
nice -n 10 bridge/run.sh projects/tiebreak-rules/tests-score.mjs
nice -n 10 bridge/run.sh projects/tiebreak-rules/tests-examples.mjs
nice -n 10 .venv/bin/python projects/tiebreak-rules/test_analysis.py
nice -n 10 .venv/bin/python projects/tiebreak-rules/test_runner.py
```

Freeze before the July timing pass. Its route scans and selects only; it
never starts the referee or the outcome analysis. The detached driver
returns a pid and a log path. Keep the lid open. The full run requires AC;
the short timing slice records the power source and may use battery.

```bash
nice -n 10 .venv/bin/python projects/tiebreak-rules/freeze.py --write
sh projects/tiebreak-rules/run.sh --timing --limit 300
```

After the timing report, run the privacy check, commit locally, and stop for
the owner's review before any scoring. Only after that review, the full run
starts or resumes with:

```bash
.venv/bin/python projects/tiebreak-rules/freeze.py
sh projects/tiebreak-rules/run.sh --reviewed
```

The run writes logs and checkpoints under `private/tiebreak-rules/`. The
full route scans and selects each month, scores the retained positions, then
writes `results/rules.json`, `results/rules.md`, `results/examples.json` and
`results/examples.md`. The timing route writes `results/timing.json` and
`results/timing.md`. The answer and paper follow the owner's review.

The run stopped once, between September's scan and its selection, when the
freeze check found cache files that another checkout's test runner, sharing
the run's installed packages on the same machine, had written among them. Only
that test runner reads them. Once they were moved aside the freeze held again,
and the run resumed from its checkpoints and ran to the end.

The answer was written after the run, so the README no longer matches the
freeze. `frozen-readme.md` keeps this README as it stood, and
`answer_check.py` checks that it matches the freeze, that the README differs
from it only in the answer up to `## Files`, and that every other frozen
source is unchanged. A repeat of the run checks the freeze first, so it runs
with `frozen-readme.md` in the README's place. The paper needs only the
committed results:

```bash
.venv/bin/python projects/tiebreak-rules/answer_check.py
bridge/run.sh projects/tiebreak-rules/paper/generate.mjs
(cd projects/tiebreak-rules/paper && latexmk -pdf paper.tex)
```
