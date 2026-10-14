# Where does a longer think pay in rapid?

**The question.** The app's method service tells the player when to stop and
think before moving: its long-think triggers (`triggerOf` in the app's
`src/services/method/day.ts`). The first move out of the opening book should
get 45 seconds; a winning position to convert (eval +3 or better), a forcing
moment (in check, just after a capture, a piece hanging on either side, or a
move that gives check) and a pawn capture outside the endgame should get 30.
For players at his level in 10-minute games, does a long think cut serious
errors at these moments, and more than at an ordinary move? Are there moments
the triggers miss where a long think pays more? Are 30 and 45 seconds the
right bars?

**The answer.** Nowhere this design can see. At every trigger, at eight other
moments and at every rating from 900 to 2099, a long think is followed by more
serious errors than a quick move in a position the danger score rates alike,
and at the book exit by no fewer, even within the very same position. Players
think long where a position is harder than the board and the clocks show, and
that outweighs whatever the think buys. By the rule, all four triggers get *no
sign it pays*, no candidate joins them, and no think length is a bar. Two
descriptions, added after the rule and testing nothing, matter more for the
app: as written, the triggers fire on most of the moves analysed and ask for
nine tenths of a 10-minute game's clock, and serious errors gather where they
do not point (a third of them on the move right after the opponent's own
serious error, almost none at the book exit). A design that compares players
rather than positions is the next step. The paper,
[`paper/paper.pdf`](paper/paper.pdf), has the numbers.

## The data

The Lichess database for September 2026 (CC0), rated rapid games at 10 minutes
with no increment, his own time control (nearly every game in his archive).
Only games Lichess analysed carry an engine eval on every move beside
the clock, so only those are read. `stream.py` keeps, in file order, the games
that ended normally or on time, have at least 20 plies and two ratings within
300 points, by 200-point bins of the mean rating: 20,000 games in each of the
two bins around his level (1200-1399, 1400-1599), 8,000 in the next two out
(1000-1199, 1600-1799) and 6,000 in the outer three (800-999, 1800-1999,
2000-2199).

`facts.mjs` reads each game as the routine's archive row (its moves, their
evals in the player's view, whole-second clocks) and builds it with the app's
own code through the bridge: the metrics service's `primaryFacts` and
`deriveGameFacts` with the routine's Node ports, and `triggerOf`. Each game is
built once with each player as "me", so every move gets its triggers from its
own side. Two choices are this study's:

- **The book exit.** The app takes it from the player's own repertoire, which
  a Lichess player doesn't have. Here it is the first move the app's review
  reader does not call book (its opening book covers the first 12 plies).
- **No miss.** The app's `serious` counts mistakes, blunders and misses; a
  miss needs the routine's miss ledger, which a Lichess game doesn't have, so
  here a serious error is a mistake or a blunder as the reader classifies it
  from the evals.

## The moves

Both players' moves, when the move has a think time (each side's first move
has none), is graded and not trivial (the app's `nonTrivial`: not book, not
forced, win% before between 5 and 95), and the mover had at least 60 seconds
on the clock before the move, so a 30-second think was affordable. The danger
score is trained on all of them; the rule is applied to the primary set.

**His level.** His chess.com rapid rating when this study was set up comes
to about 1350 on Lichess by the app's conversion (`toLichess`, with its
default offset of 250). The primary set is the moves of players rated 1250 to
1449.

## The measures

All the app's, imported through the bridge (`facts.mjs` writes the constants
it read to `private/think-time-rapid/app-constants.json`, and `analyze.py`
reads them there):

- **Serious error:** the move facts' `serious`.
- **Quick:** a think under `RUSHED_SECONDS` (10), the app's rushed line.
  **Long:** a think of `DEEP_THINK_SECONDS` (30) or more, the app's long
  think. Moves in between take no part in the main comparison.
- **The moment:** what `triggerOf` returns (book-end, conversion, forcing,
  structure), or none.
- **The danger score:** the chance that a quick move in the position is a
  serious error, predicted from what the player could see before moving: both
  ratings, both clocks, the opponent's last think, the ply and the moves since
  the book exit, the eval and win% before the move, the phase, the material,
  the legal moves, the checks and captures available, the hanging pieces on
  each side, being in check, coming just after a capture, coming just after
  either side's serious error, and the colour. Nothing about the think or the
  move played. A LightGBM model with fixed settings (in `analyze.py`), trained
  on the quick moves of every rating and cross-fitted in two halves split by
  game, so a move's score comes from a model that never saw its game.

## The estimate

Players think longer where the position is harder, and harder positions breed
errors, so long and quick moves are compared only in positions the danger
score rates alike. For a set of moves T (a trigger's, none's or a
candidate's), its moves are split into five strata at the quintiles of the
danger score over T's quick moves. In each stratum the
serious-error rate of the long moves minus that of the quick moves, averaged
with weights equal to T's quick moves in each stratum, is **Δ_T**: how much a
long think would change the error rate of the moves now played quickly. A
stratum with no long move adds nothing, and its weight is reported.

Intervals come from 2,000 bootstrap draws over games (each game weighted by a
Poisson(1) draw; the danger scores and strata held fixed): the 95% percentile
interval, and a p-value of twice the smaller share of draws on either side of
zero. The draws use a fixed seed (in `analyze.py`), and every comparison
between two sets uses the same draws.

## The rule, fixed before any effect was computed

On the primary set:

1. **A long think pays at T** when Δ_T's 95% interval lies below zero.
2. **T marks where a long think pays** when it pays and Δ_T − Δ_none is below
   zero with a Holm-adjusted p under 0.05 over the four triggers, where none is
   the moves `triggerOf` gives no trigger.
3. Each trigger's verdict is then: **keep** (both hold), **pays, but no more
   than an ordinary move** (only the first), or **no sign it pays**.
4. **Candidates.** Eight sets of moves, each defined by what the player sees
   before moving: in check; just after a capture; one of his pieces hanging;
   one of the opponent's hanging; just after the opponent's serious error;
   defending (an eval of −3 or worse for the mover, conversion's mirror); the
   book-end move and the player's next four; and high danger (the top fifth of the danger score over the
   primary set's quick moves). A candidate should become a trigger when a long
   think pays there (as in 1) and Δ_C − Δ_none is below zero with a
   Holm-adjusted p under 0.05 over the eight. The first four are also the parts
   of the forcing trigger, so they show which parts carry it.
5. **The bars.** For each trigger, Δ for think bins of 10-14, 15-19, 20-29,
   30-44, 45-59, 60-89 and 90 seconds or more against the quick moves, by the
   same strata. When a think of 60 seconds or more pays (its Δ's interval below
   zero), the bar is the lower edge of the shortest bin whose Δ is at least 80%
   as large as that Δ; else there is no bar. The verdict says whether the app's bar (30, or
   45 at the book end) is that bar, above it or below it.

Reported with the rule, not tested: how often each moment comes up (moves per
player per game, among the moves analysed), and the errors a long think saves per extra minute it spends there
(−Δ_T × 60 over the mean think of T's long moves minus that of its quick
ones).

## Also reported, without a rule

- The same estimates in 200-point bins of the mover's rating from 900 to 2099,
  for the trend with rating.
- **The same position.** Book-end moves are made in positions many games
  reach, so they can be compared within one position (its FEN without the move
  counters): the long-minus-quick difference in each position with both,
  weighted by its quick moves. This needs no danger score.
- Sensitivity: quick as 6 to 10 seconds (the app's own buckets treat the moves
  under 5 seconds as decided before the turn), and ten strata instead of five.
- **Where the errors are** (added after the rule was committed, before the
  month's results were computed): each moment's share of the primary set's
  moves and of its serious errors, at every length of think.
- **His games.** The same facts from his 10-minute games in the app's archive,
  read by the same reader from the evals alone with the same book rule, and
  only described: how often each moment comes up, how often he thinks long
  there against the primary set, and his error rate after quick and long
  thinks. They stay in `private/think-time-rapid/`; only aggregates are
  committed.

## Caveats

- **It is observational.** A player thinks longer when he sees a problem. The
  danger score adjusts for what the board and the clocks show, not for what
  the player saw. Difficulty the score misses makes long thinks look worse than
  they are; noticing the problem, which both lengthens a think and helps avoid
  the error, makes them look better. The comparison with ordinary moves
  (Δ_T − Δ_none) is less exposed when the bias is alike at both.
- **A move-defined trigger.** Two parts of the triggers depend on the move
  played (giving check, a pawn capture), which a long think may change. The
  candidates are all defined before the move.
- **The clock spent is not priced.** A long think takes time from later moves,
  and this study does not count the errors that costs.
- **Not his games, not his site.** Lichess evals come from its own server
  analysis, not the routine's Stockfish; games someone asked to analyse are not
  a random sample; and his Lichess level is the app's conversion of his
  chess.com rating, not a measurement. The conversion's offset is itself
  under study ([maia-rating-offset](../maia-rating-offset/)); the trend by
  rating shows how far the answer moves with the level.

## Files

| File | What it does |
|---|---|
| `stream.py` | Streams the month from the Lichess database and keeps the games above (`private/think-time-rapid/games-<month>.jsonl.gz`). |
| `games.mjs` | Reads a kept game the app's way: the archive row, the routine's ports, the book exit, and Black's build flipped from White's. |
| `moves.mjs` | The CSV row of one move: the app's derived facts and `triggerOf`. |
| `facts.mjs` | The app's move facts and triggers for every kept game (`private/think-time-rapid/moves-<month>.csv.gz`, sharded). `--check N` builds Black's row for real on the first N games and stops on any difference from the flipped build. |
| `archive.mjs` | The same rows for his 10-minute games in the app's archive, read from their evals alone (`private/think-time-rapid/archive-moves.csv.gz`). |
| `analyze.py` | The danger score, the rule and the descriptions; writes `results/analysis.json` and `results/analysis.md`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
python3 projects/think-time-rapid/stream.py --month 2026-09
for i in 0 1 2 3; do
  bridge/run.sh projects/think-time-rapid/facts.mjs --month 2026-09 --shard $i/4 --check 200 &
done; wait
bridge/run.sh projects/think-time-rapid/archive.mjs
python3 projects/think-time-rapid/analyze.py --month 2026-09
bridge/run.sh projects/think-time-rapid/paper/generate.mjs
```

Per-game files stay in `private/think-time-rapid/`; `results/` holds
aggregates only.
