# What does the band above do differently?

**The question.** The app's ONE focus is a leak from the metrics service's
ledger (`leakLedgerOf`, `src/services/metrics/leaks.ts`): the points a game he
gives away on one kind of move (a phase and whether the position was tense,
the low clock, a tense position answered in under five seconds, the move after
the opponent's error, moves from move 40), against what his opponents give
away on the same kind of move in the same games. Each leak is priced in Elo as
`7 · δ · gap` with a hand-set discount δ = 0.6 (`LEAK_DISCOUNT`) for the share
of a point given away that a fix would actually bank. Two things are not
measured: where players a band above his give away fewer points than players
at his level, and how much of a point given away shows up in the result.

1. On which of the ledger's kinds of move do players 200 points above his
   level give away fewer points a game than players at his level, and which
   kinds carry the difference?
2. How much does a point given away on each kind cost in the result, against
   the app's 0.6?
3. How often do players at each level hang a piece or allow a mate, and what
   does it cost them?

**The answer.** In tense positions, and on the move after the opponent's
serious error. Players a band above give away about five and a half points a
game fewer than players at his level. Six of the ten causes separate the
bands: tense middlegames and the move after the opponent's serious error
first, about three points a game each, then tense openings, tense positions
answered in under five seconds, tense endgames and quiet openings. Tense
positions carry more than the whole difference. The band above gives away
more a game in quiet middlegames and endgames, under a minute on the clock and
from move 40 only because its games are longer: per move it gives away less
or the same on every cause. Serious errors carry nearly all of the difference
and hanging a piece about two fifths of it; mates carry little.

By the rule, the app's 0.6 discount is too high on every cause. That verdict
does not stand: the rule's fit left out the opponent's points, which rise and
fall with the player's, and with them in, a point given away costs about a
point of result. The data give no reason to lower the 0.6. In his own games,
tense endgames take a larger share of his points than at either level, and he
allows a mate more often than either. The fits with the opponent's points,
points per move and his games' split were added after the results were read
and test nothing. The paper, [`paper/paper.pdf`](paper/paper.pdf), has the
numbers.

The rule below was committed before any result on the month's games was
computed (the scripts were first run on 100 of them, to test the code).

## The data

The 74,000 Lichess games [think-time-rapid](../think-time-rapid/) kept from
September 2026 (CC0): rated 10-minute games with no increment, Lichess's eval
on every move and the clock, by 200-point bins of the mean rating. Each game
is read by think-time-rapid's game reader (`games.mjs`): the routine's archive
row built with the app's own code through the bridge (the metrics service's
`primaryFacts` and `deriveGameFacts`, the review service's archive reader as
the classifier, the knowledge service's hanging pieces), so a serious error is
a mistake or a blunder as the reader classifies it from the evals (no miss: a
miss needs the routine's ledger). Each game gives two **player-games**, one
for each player as "me".

**The bands.** A player-game's band is the player's Lichess rating. His
chess.com rapid rating when this study was set up comes to about 1350 on
Lichess by the app's conversion (`toLichess`, its default offset of 250), so
**his band** is 1250 to 1449, as in think-time-rapid, and **the band above**
is 1450 to 1649. The trend reads six 200-point bands from 850 to 2049.

## The measures

All the app's, imported through the bridge:

- **Points given away** on a kind of move: the method service's `causeLoss`
  for one of the ten `LEAK_CAUSES` (the ledger's own causes), its `mine` for
  the player, `theirs` for the opponent. A point is a percent of a game: the
  drop in expected score across the move on the band curve
  (`bandExpected`), floored at zero.
- **The yardstick.** The band curve's slope is fitted by the metrics
  service's `fitWinCurve` on his band's player-games, and every band (and his
  own games) is priced with that one slope, so the same move costs the same
  points at every level. Each band's own slope is reported beside it.
- **All moves:** `causeLoss` with a cause that covers every move.
- **The result:** the game's score for the player (`score`), as a percent.
- **Error kinds.** The review reader's motif tags (`blunderMotifs`) on the
  moves it judges a mistake or a blunder, read from the evals alone: with no
  engine line, a move that leaves one of the mover's pieces newly hanging is
  **hanging a piece**, and the eval or the board gives **allowing mate in
  one** and **allowing a forced mate** (in two to five). Points per game on
  each kind are `causeLoss` with a cause that holds the serious errors of
  that kind.

## The estimates

Means over player-games. Intervals come from 2,000 bootstrap draws over games
(each game weighted by a Poisson(1) draw, its two player-games sharing the
weight), seed 20261014: the 95% percentile interval, and a p-value of twice
the smaller share of draws on either side of zero. Every comparison uses the
same draws.

## The rule, fixed before any result was computed

1. **What separates the bands.** For each of the ten causes, Δ_c is the band
   above's mean points a game on c minus his band's. A cause **separates the
   bands** when Δ_c is below zero with a Holm-adjusted p under 0.05 over the
   ten. The causes that separate them, ranked by Δ_c, are the priorities the
   data give his band. Seven of the causes (the six phase-by-position ones
   and the low clock) split every move between them, so their Δ_c add up to
   the difference on all moves, and each one's share of that difference is
   reported.
2. **The discount.** For each cause, and for all moves, a least-squares fit
   over his band's player-games of the result (0, 50 or 100) on the points
   given away on c and the rating difference (his minus the opponent's): δ_c
   is minus the slope on the points, the share of a point given away on c
   that shows in the result. The app's 0.6 is **too high** for c when δ_c's
   95% interval lies below 0.6, **too low** when above it, and **within**
   otherwise. Eleven intervals are read; none is adjusted for the others.

## Also reported, without a rule

- **Error kinds by band:** serious errors per game, hanging a piece and
  allowing mate per game, "once every N games", and the points they cost a
  game.
- **The trend:** each cause's points a game across the six bands.
- **His games.** His 10-minute games in the app's archive, read the same way
  (the row's evals alone, as think-time-rapid's `archive.mjs` reads them) and
  priced with the same yardstick: his points a game on each cause beside his
  band's and the band above's, and his error kinds. Only aggregates are
  committed.
- Each band's own fitted slope, game length and moves per game on each cause.

Added after the results were read; they test nothing:

- **Points per move** on each cause, each band's total points over its total
  moves of the kind, his band against the band above: is a band that gives
  away more a game worse at those moves, or meeting more of them?
- **What each error kind costs**, his band against the band above, and its
  share of the difference on every move.
- **The discount with the opponent's points.** The rule's fit leaves out the
  points the opponent gives away, which correlate with the player's; these
  fits put them in, for each cause alone and with every partition cause in
  one fit.
- **How the points split** between the partition's causes, his games beside
  the two bands, and how often his board shows each error kind. His games'
  points come from the app's reviews, with another engine and depth than
  Lichess's, so only their split and the kinds a board shows are set beside
  the bands.

## Caveats

- **A cross-section, not a path.** The band above is other players, in games
  against the band above. Their numbers say where stronger players give away
  less, not what he would gain by fixing one thing.
- **The discount is observational.** A game where a player gives away more
  on one kind of move may differ in other ways; the fit adjusts only for the
  rating difference.
- **Error kinds without engine lines.** With no refutation line the reader
  tags only a piece left hanging and a mate; a fork or a pin that wins
  material goes untagged. [detector-themes](../detector-themes/) scores the
  same tagger with lines on public puzzles.
- **Not his site.** Lichess evals come from its server analysis, games
  someone asked to analyse are not a random sample, and his Lichess level is
  the app's conversion of his chess.com rating. Players recur across games
  and no username is kept, so the intervals, drawn over games, are somewhat
  narrow.

## What could port

- The band above's points a game on each cause, as a second yardstick beside
  the ledger's mirror (his opponents).
- The priorities for his band, and a δ per cause in place of one 0.6.
- Rates the coach can cite ("players a band above hang a piece once every N
  games").

After the results: the second yardstick (read per move) and the rates stand;
a δ per cause in place of the 0.6 does not, since a point given away costs
about a point of result.

## Files

| File | What it does |
|---|---|
| `primary.mjs` | Builds each kept game once with the app's `primaryFacts` (White as the player) and keeps the review reader's motif tags for every move (`private/band-above/primary-<month>.jsonl.gz`, sharded). `--check N` holds Black's flipped build to a real one, facts and tags, on the first N games. |
| `ledger.mjs` | Fits the yardstick on his band, then writes one row per player-game: points given away on each cause, all moves and each error kind, for both players (`private/band-above/player-games-<month>.csv.gz`). `--archive` reads his games instead. |
| `analyze.py` | The rule over the player-games, and the descriptions; writes `results/analysis.json` and `results/analysis.md`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
# think-time-rapid's stream.py first: these are its games.
for i in 0 1 2 3; do
  bridge/run.sh projects/band-above/primary.mjs --month 2026-09 --shard $i/4 --check 200 &
done; wait
bridge/run.sh projects/band-above/ledger.mjs --month 2026-09
bridge/run.sh projects/band-above/ledger.mjs --month 2026-09 --archive
python3 projects/band-above/analyze.py --month 2026-09
bridge/run.sh projects/band-above/paper/generate.mjs
```

Per-game files stay in `private/band-above/`; `results/` holds aggregates
only.
