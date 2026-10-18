# Which rules of thumb hold at his level?

**The question.** A human coach explains middlegame and endgame moves by rules
of thumb: activate the king, put the rook behind the passed pawn, take the
open file, plant a knight on an outpost. The app already teaches these as
concepts (its knowledge service's catalogue), and its move detectors say when
a move shows one. In the middlegames and endgames players at his level reach,
how often is the move a rule points to sound, is it sounder than the move a
player at his level would naturally play, and where does the rule fail?

**The answer.** Not run yet. The rule below was committed before any position
was scored.

A rule that holds, with the cases where it fails, is what the app can teach
as theory and use to explain a better move in the review. A rule that does
no better than the natural move is not worth a lesson at this level, and one
that does worse misleads.

## The rules

Fifteen rules. Fourteen are the move detectors (`card.<concept>`) of the
catalogue's techniques and positional patterns. A move **shows** a rule when
`describeMove(fen, uci).findings` holds a finding of that concept whose
`actor` is the mover and whose `tone` is `gain`, with three exceptions whose
readers only ever write a `note` (amended before any position was scored, see
below): `outside-passer` counts its note; `lucena` counts its note when the
mover is the side with the pawn, and `philidor` when the mover is the side
without it, so each counts only for the side the position is for.

| Rule | The catalogue's name |
|---|---|
| `active-king` | the active king |
| `opposition` | the opposition |
| `square-rule` | the rule of the square |
| `rook-behind-passer` | the rook behind the passed pawn |
| `cut-off-king` | cutting the king off |
| `outside-passer` | the outside passed pawn |
| `trade-when-ahead` | trading when ahead |
| `lucena` | the Lucena position |
| `philidor` | the Philidor position |
| `open-file` | the open file |
| `rook-on-the-seventh` | the rook on the seventh |
| `outpost` | the outpost |
| `pawn-break` | the pawn break |
| `passed-pawn` | the passed pawn |

The fifteenth, `worst-piece` ("Feed your laziest piece", the app's lesson),
has no move detector, so it is defined here from the app's readings: a move by
the piece `describePosition(fen)` names as the mover's worst piece
(`ActivityFacts`), after which that piece has more legal moves than before.

Tactics and mates (forks, pins, winning captures, the named mates) are left
out: they are calculation, which the puzzles train, not rules of thumb.

**The amendment, before any position was scored.** The rule as first
committed (lab 1006568) had seventeen rules and counted only `gain` findings.
Timing the scan on 300 July games, with no measure computed, showed that at
the pinned commit five could never be available that way: the technique
readers for the outside passed pawn, the Lucena position, the Philidor
position and the bishop pair only ever write a `note`, and `king-shelter`
appears only as a fault credited to the other side after a pawn move thins
the shelter. So the outside passer, Lucena and Philidor count their note as
above. The bishop pair's note says a bishop that takes a knight gives the pair
up, a warning rather than a rule to follow, and the king shelter is never a
move to play, so both leave this round; a rule to avoid needs its own test.

## The data

- **Lichess games** (CC0), rated standard games at 10 minutes with no
  increment, his own time control. Train: July and August 2026. Held out:
  September 2026. Games that ended normally or on time, with at least 30
  plies.
- **The bands.** His chess.com rapid rating when this study was set up (about
  1120) comes to about 1370 on Lichess by the app's offset (`toLichess`). As in
  [band-above](../band-above/) and [book-advice](../book-advice/), his band is
  1250 to 1449 and the band above 1450 to 1649, by the mover's Lichess rating.
  A game enters when both players are in 1250 to 1649. On Maia-2's scale
  (100-point steps) the bands read 1300 and 1500.
- **The scan.** Up to 30,000 games per month, in file order.

## The positions

Every position before a move in the middlegame or endgame, by the divider's
phase of the position (`phaseOf`), with the mover in either band. A rule is
**available** in a position when at least one legal move shows it.

For each rule, a game gives at most one position: one drawn at random (seeded
by the game's Lichess id and the rule's id) among the game's positions where
the rule is available. Each rule keeps up to 4,000 positions per train month
and 4,000 held out, in file order. This keeps games from counting many times
and lets rare rules reach a sample before the scan ends.

## The moves compared

In each kept position, for its rule:

- **R, the rule's move**: among the legal moves that show the rule, the one
  Maia-2 rates most likely at the mover's band (the rule as a player at that
  band would play it).
- **N, the natural move**: Maia-2's most likely move at the mover's band.
- **A, the move played.**

Maia-2 is the app's (`humanPolicy` with the mover's band and the opponent's
band as `opponentBand`).

## The measures

All the app's, through the bridge, at the pinned commit (`bridge/chess.json`):

- **The referee.** Stockfish through the app's engine service at the `grade`
  budget (250,000 nodes): the best is `bestMoves` with one line, and each move
  is scored by `scoreMove` at the same budget. A move is **sound** when it
  gives up no more than `ACCEPT_WINDOW_WP` (3) win% against the best, win% by
  `core/score`, the window `acceptsAlternative` applies. With seven men or
  fewer, the app's tablebase probe decides instead: a move is sound when it
  keeps the mover's tablebase outcome (`moveOutcomeForMover`).
- **Soundness** of R, N and A: the share of positions where the move is sound.
- **Lift**: soundness of R minus soundness of N, paired by position.
- **Adoption**: the share of positions where A is R, by band.

Intervals come from 2,000 bootstrap draws over games with a fixed seed: the
95% percentile interval.

## The rule, fixed before any position was scored

For each rule, on the train months and on the held-out month separately:

1. **Teach it** when the lift's 95% interval lies above zero on both.
2. **It misleads** when the lift's 95% interval lies below zero on both.
3. **No better than the natural move** otherwise.
4. Under 300 held-out positions: **not enough data (n=…)**, whatever the
   numbers say.
5. **A step up** (reported beside the verdict): the band above plays R more
   often than his band when it is available, with the difference's 95%
   interval above zero on both.

**Where it fails.** Five splits of the positions, each read before the move
with the app's own readings:

- the opponent has a threat (`describePosition(fen).threats` of the side not
  to move);
- the mover's material: ahead by 2 points or more, level within 1, behind by
  2 or more (`materialCount`);
- the phase: middlegame or endgame;
- R is forcing (a capture or a check) or quiet;
- the mover's king shows a danger sign (`kingDanger`).

A split is a **failure condition** of a rule when, on both the train months
and the held-out month, R's soundness in one of its cells is at least 10
points below the rest, with that difference's 95% interval below zero.

**Readings settled before the run**, none changing the rule: the train set
pools July and August; a game's one draw per rule spans both players'
positions; each month's cap pools both bands; the engine is cleared before
each position, so a reading never depends on the worker; tablebase outcomes
compare exactly, with cursed wins and blessed losses kept apart; the bootstrap
draws 2,000 resamples of games with seed 20261018.

## Also reported, without a rule

- Each rule's availability: the share of middlegame and endgame positions in
  the scan where it is available.
- Maia-2's probability of R at his band: how findable the rule's move is.
- Every measure for his band and the band above apart.
- A tree of depth 2 over the five splits, fitted on train to predict when R is
  unsound, and its accuracy on the held-out month. It only describes.

## Caveats

- **The detectors decide what a rule is.** A rule the detector reads too
  widely or too narrowly is tested as the detector reads it. That is the point
  (the app teaches what its detectors see), but a "misleads" verdict may be
  the detector's fault, and the paper looks at examples before saying so.
- **Sound is not the same as instructive.** A rule's move can be sound and
  still be the second-best plan; the lift compares it only with the natural
  move.
- **Not his games.** His band is the app's conversion of his chess.com rating.
  His own games are too few for most rules; a later round can check the rules
  that pass on his archive.

## Who runs it

The scan and the engine work are large (tens of thousands of positions, each
scored by Stockfish several times), so they run on the owner's Mac through the
session that runs Codex there. Per-position rows go under
`private/rules-of-thumb/`, which git ignores, and only aggregates are
committed: `results/rules.json` and `results/rules.md`, written by the
scripts, then the paper. No language model judges anything here.

## Files

Added with the scripts.
