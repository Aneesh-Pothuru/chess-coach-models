# Do the Judge the position factors tell who is better at his level?

**The question.** A coach judges a position before choosing a move: count the
material, then look at the kings, the loose pieces, how active the pieces are
and the pawns. The app's Judge the position drill teaches that call with five
factors (material, king safety, activity and space, pawn structure, something
loose), each scored by board code in centipawns. When material is level, does
each of the other readings point to the side Stockfish says is better, in the
positions players at his level reach?

**The answer.** Yes, all five. With material level, each reading points to the
side Stockfish says is better on both months, so by the rule below each tells
who is better, and no factor's sign is backwards. Something loose, activity and
space, king safety and the worst piece are also reliable on their own; pawn
structure, right about two times in three, falls short of that bar. Weighed
together they name the better side in most positions with a clear verdict.

Added after the run: whose move it is matters too. Where nothing is loose, the
side to move is the better side in about two clear positions in three. A
reading that favours the side to move is nearly always right, while pawn
structure and the worst piece are no better than a coin when they favour the
side that just moved. When two readings disagree, a loose pawn usually wins and
pawn structure usually loses. So the drill keeps its factors, can teach pawn
structure as a tie-breaker, and could name the move as a reason, which needs
its own round on his cards. The numbers are in
[`results/judge-factors.md`](results/judge-factors.md) and the
[paper](paper/paper.pdf).

A reading that points to the better side is worth teaching as a reason, in the
drill and in the review. One that does not would teach him to trust a sign
that tells him nothing, and one that points the wrong way is a bug in the
board code.

## The readings

All the app's, at the pinned commit (`bridge/chess.json`):

- **The drill's four factors beyond material**, from `factorsFor(fen, mine,
  theirs)` in the publishing service's eval deck
  (`src/services/publishing/decks/evalDeck.ts`): `kingSafety`, `activity`,
  `structure` and `threats` (the drill's "something loose"), each in
  centipawns from White's side. `mine` and `theirs` are the best capture
  balances for the side to move and for the other side (`bestExchange` on the
  position and on its `flipTurn`), as the deck computes them.
- **The worst piece**: the legal moves of White's worst piece minus those of
  Black's (`describePosition(fen).side[c].activity.worstPiece.moves`), so
  positive when White's worst piece is the freer. "Feed your laziest piece" is
  the app's lesson; the drill folds it into activity.

A reading **leans** in a position when its size is at least the drill's
`LEAN_CP` (80 centipawns), or for the worst piece at least 3 moves. Its sign
names the side it favours.

## The data

- **Lichess games** (CC0), rated standard games at 10 minutes with no
  increment, his own time control. Train: August 2026. Held out: September
  2026. Games that ended normally or on time, with at least 30 plies.
- **The bands.** As in [rules-of-thumb](../rules-of-thumb/): his band is 1250
  to 1449 on Lichess and the band above 1450 to 1649. A game enters when both
  players are in 1250 to 1649.
- **The scan.** Up to 8,000 games a month, in file order.

## The positions

The drill's own population: a position after at least `EVAL_PLY_FLOOR` (12)
plies, not over, not in check, with at least four legal moves (the deck's
floor), material exactly level (`evalMaterialCp` is 0), and no tactic: no mate
in one for either side, and neither side's best capture balance above
`EVAL_TACTIC_BAR` (one pawn). Either side may be to move. The deck also skips
positions whose evaluation swings or that sit near a turning point of his
game; this study asks whether a reading points the right way, not whether a
position makes a good card, so it keeps them.

For each reading, a game gives at most one position: one drawn at random
(seeded by the game's Lichess id and the reading) among its positions where
the reading leans. Each reading keeps up to 3,000 positions a month, in file
order.

## The verdict

Stockfish through the app's engine service at the `grade` budget (250,000
nodes), with the hash cleared before each position and no tablebase; the
evaluation from White's side. The drill's own scale (`verdictFor`): **level**
within `EVAL_LEVEL_CP` (50 centipawns), **clear** at `EVAL_CLEAR_CP` (150) or
more, neither in between; a mate is clear.

A reading's **agreement** is the share of its positions with a clear verdict
where the side it favours is the side the engine says is better. Each
position comes from a different game, so the interval is the 95% Wilson
interval.

## The rule, fixed before any position was scored

For each reading, on the train month and the held-out month separately:

1. **It tells who is better** when its agreement's interval lies above 50% on
   both.
2. **It is reliable on its own** (reported beside 1) when the interval lies
   above two in three on both.
3. **It points the wrong way** when the interval lies below 50% on both.
4. **No signal** otherwise.
5. Under 200 held-out positions with a clear verdict: **not enough data
   (n=…)**, whatever the numbers say.

Material is level in every position, so a reading that tells who is better
adds to material by construction.

## Also reported, without a rule

- For each reading, the share of its positions the engine calls level, clear,
  or neither.
- Agreement by band (the mean of the two players' ratings), by the divider's
  phase of the position (`phaseOf`), and when the reading is twice its lean.
- The game's result: among the decisive games, the share where the side a
  reading favours won, beside the share where the side the engine favours won.
- The drill's sum: the share of clear positions where the sum of the five
  factors favours the side the engine favours.
- A logistic model of the clear verdict's side on the five readings, fitted on
  the train month, with its held-out accuracy and each reading's weight. It
  only describes.

## Added after the run

Once the verdicts were read, `analyze.mjs` gained descriptions the list above
did not name. They describe these positions and test nothing:

- the share of clear positions where the engine's side is White, and where it
  is the side to move when something loose does not lean;
- for each reading, how often it favours the side to move, and its agreement
  when it does, when it favours the side that just moved, and when no other
  drill factor leans;
- for each pair of readings that lean opposite ways, the share where the engine
  sides with each;
- the logistic model again, with the side to move as a sixth input.

The rule's verdicts and the descriptions named before the run are unchanged by
them.

## Caveats

- **Not his games.** The positions are Lichess players at his band and the
  band above; the drill's cards come from his own games.
- **The engine's verdict, not his.** Whether a reading helps him choose moves
  is study 6's question.
- **One reading at a time.** The readings move together (the more active side
  often has the safer king), so agreement says a reading points the right way,
  not that it adds to the others. The logistic model describes that.
- **Pawn breaks** are a plan rather than a standing edge, so they are tested
  as a rule of thumb in [rules-of-thumb](../rules-of-thumb/), not here.

## Who runs it

A Claude session on this repository's bridge, on CPU. Games and per-position
rows go under `private/judge-factors/`, which git ignores; only aggregates are
committed (`results/`), written by the scripts, then the paper. No language
model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants (months, readings, leans, cap, budget, the rule's bars), the seeded generator, the Wilson interval and the capped selection of the study's positions. |
| `stream.py` | Streams a month of the Lichess database and keeps the games that enter (`private/judge-factors/games-<month>.jsonl.gz`), with a summary beside them. |
| `scan.mjs` | Replays each game through the app's code, reads every position of the drill's population and draws each reading's position for the game (`private/judge-factors/positions-<month>-<i>-of-<n>.jsonl`). |
| `verdict.mjs` | Scores each distinct position with Stockfish through the app's engine service, one shard at a time, resuming where a shard stopped (`private/judge-factors/verdicts-<i>-of-<n>.jsonl`). |
| `analyze.mjs` | Applies the rule and the descriptions, and those added after the run; writes `results/judge-factors.json` and `results/judge-factors.md`. |
| `paper/generate.mjs` | Writes every number, table and position the paper prints into `paper/generated.tex`, from the results, the private rows and the app's constants, and refuses when a claim no longer holds. It asks the engine again for the two positions' lines. |
| `paper/paper.tex` | The paper; `paper/paper.pdf` is compiled from it. |

## Running it

```bash
make chess
python3 projects/judge-factors/stream.py --month 2026-08
python3 projects/judge-factors/stream.py --month 2026-09
for m in 2026-08 2026-09; do
  for i in 0 1 2 3; do bridge/run.sh projects/judge-factors/scan.mjs --month $m --shard $i/4 & done; wait
done
for i in 0 1 2 3; do bridge/run.sh projects/judge-factors/verdict.mjs --shard $i/4 & done; wait
bridge/run.sh projects/judge-factors/analyze.mjs
bridge/run.sh projects/judge-factors/paper/generate.mjs
(cd projects/judge-factors/paper && latexmk -pdf paper.tex)
```
