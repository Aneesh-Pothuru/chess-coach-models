# Is a central break right while the other king is still in the centre?

**The question.** A titled player reviewing the rapid games of an adult player
rated about 1100 ([video](https://www.youtube.com/watch?v=PcGDehRSqTM)) teaches
a moment for a pawn break: strike in the centre while the other king has not
castled, because the lines the break opens lead to the king, and players at
that level miss it because the central pawn feels like part of the scenery.
The app's pawn-break lesson leaves the moment to the engine, since
[structure-breaks](../structure-breaks/) found that a break that can be played
is sound only about one time in five, no more often than a random move, and
[break-ready](../break-ready/) found that the pieces being ready says nothing
about it. In his quiet middlegame positions with a central break on, is the
break sound more often when the other king is still in the centre than when it
has left, beyond what the king's position does for any move, and is it then
as sound as his own move?

**The answer.** Not run yet. The rule below was committed before any score was
read by the king's position.

If the king marks the moment, the app can name a king still in the centre as
the time to look at the central break; if the break is then as sound as his own
move, as the time to play it. If not, the moment stays the engine's.

## The positions

The positions structure-breaks scored (its `score.mjs` rows under
`private/structure-breaks/`), his and the strong players', with their scores
as they stand: its referee (Stockfish at the app's `grade` budget, the hash
cleared before each position; a move is **sound** when `acceptsAlternative`
accepts it, within 3 win% of the best) and its moves. His are his quiet
positions with a break of his structure on, in the earlier and the later half
of his games (the halves are two replications; nothing is fitted). The strong
players' are the Lichess September 2026 positions between two players rated
2200 or more, one a game, the first 1,200 scored in source order (structure-breaks
after its fix c13bf07). A position enters when also:

- **the middlegame**, by the app's phase reading (the row's `phase`);
- **a central break is on**: at least one of the position's breaks lands on
  the d- or e-file (the break's last square, as the app's `playedLever` counts
  it);
- each central break, the move played (his, or the strong player's) and the
  two random moves R and R2 have exact scores.

**The king.** The other side's king is **in the centre** when it stands on the
d-, e- or f-file, where a king that has not castled stands; otherwise it is
**away** (castled, or walked to a wing).

## The measures

In each entering position:

- **C**, the central breaks' soundness: the share of its central breaks that
  are sound;
- **A**, his move (on the strong positions **S**, the strong player's move),
  and **R** and **R2**, structure-breaks' two random legal moves that are not
  breaks: each 1 when sound, else 0.

Over the positions:

- **The lift**: the mean of C − R where the king is in the centre, minus the
  mean of C − R where it is away. R stands for how forgiving the position is,
  so the lift asks whether the king in the centre helps the central break more
  than it helps any move.
- **The strike's gain**: the mean of C − A where the king is in the centre.
- **Intervals**: 2,000 bootstrap draws with a fixed seed (20261020),
  resampling his games within the half (each draw keeps a game's positions of
  both kinds together), or the strong positions: the 95% percentile interval.

## The rule, fixed before any score was read by the king

**The controls come first.** If either fails, the study gives no verdict.

1. **The referee tells moves apart here.** A − R must lie above 0 on each half
   of his entering positions, and S − R on the strong ones.
2. **The null.** The lift with R2 in place of C (the mean of R2 − R in the
   centre minus away) must not lie above 0 on both halves, nor below 0 on both.

**Then, on his positions:**

3. **The strike holds** when the lift lies above 0 on both halves and the
   strike's gain does not lie below 0 on either half.
4. **The king marks the moment, but the break trails his move** when the lift
   lies above 0 on both halves and the gain lies below 0 on a half.
5. **The king misleads** when the lift lies below 0 on both halves.
6. **No signal** otherwise.
7. **Not enough data (n=…)** when, on a half, the positions with the king in
   the centre or away come from fewer than 30 games, whatever the numbers say.

**Strong players**, read by the same measures with S in place of A: they
**agree** when the lift's interval lies on the same side of 0 as on both of his
halves, **disagree** when it lies on the other side, and are **silent** when it
holds 0. They do not change the verdict.

## Also reported, without a rule

- **Coverage**: the entering positions and games by half and by where the king
  stands, and the king on its starting square alone.
- C, A, N (Maia-2's most likely move at his band), U (the same at the band
  above), R and R2 in each half and condition.
- **The stricter reading**: the lift with the king in the centre only when it
  stands on its starting square, the rest of the centre left out.
- **The flank breaks**: the same lift for the breaks that do not land on the d-
  or e-file, in middlegame positions with one on, to see whether the king's
  position matters for central breaks only.
- **With the queens on**: the lift where both queens are on the board.
- **Finding it**: how often he played a central break in each condition, and
  the probability Maia-2 gives the central breaks at his band and at the band
  above, against the flank breaks' (the coach says the central pawn is hard to
  see).
- **The win% given up**: the mean the central breaks and his move give up in
  each condition (a move that scores above the best gives up none).

## Caveats

- **Already scored.** The rows were scored for structure-breaks. Before this
  rule was committed, his positions were counted by the king's file and the
  breaks' files, with no score read: of his 491 and 418 positions, 116 (in 47
  games) and 83 (in 39 games) enter with the king in the centre, 225 (in 67
  games) and 191 (in 59 games) with it away; 41 and 49 are endgames, and 109
  and 95 have no central break on. The strong rows were being rescored in
  source order when this rule was written, and were not counted.
- **Few games.** His positions with the king in the centre come from a few dozen
  games a half, so only a large lift can show on each half; the strong
  positions, one a game, carry more weight on the chess and none on him.
- **Not a cause.** A king in the centre comes with an earlier middlegame and
  more pieces. R's soundness in the same position stands for how forgiving the
  position is, which is why the lift is measured against it, but it does not
  stand for every difference.
- **A break stands for a plan**, tested as the next move, as in
  structure-breaks.
- **Mostly the London.** Most of his positions are the London pyramid, whose
  central breaks are e3-e4 for White and ...e5 for Black.

## Who runs it

A Claude session on this repository's bridge, on CPU, with no new engine run:
the rows are structure-breaks'. Per-position rows stay under `private/`; only
aggregates are committed (`results/`), written by the scripts, then the paper.
No language model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants and readings: the central breaks, where the other king stands, the queens. |
| `analyze.mjs` | Joins structure-breaks' rows to its candidates, applies the rule and the descriptions; writes `results/central-strike.json` and `.md`. |
| `paper/generate.mjs` | Writes `paper/generated.tex`, every number and table the paper prints, from `results/`, and refuses to write when a claim the paper makes no longer holds. |
| `paper/paper.tex` | The paper. |

## Running it

```bash
make chess
# structure-breaks first: its positions.mjs and score.mjs (his and strong)
bridge/run.sh projects/central-strike/analyze.mjs
bridge/run.sh projects/central-strike/paper/generate.mjs
(cd projects/central-strike/paper && latexmk -pdf paper.tex)
```
