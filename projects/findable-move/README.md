# Does a move he would find hold up as well as the engine's best?

**The question.** Game Review's better move is always the engine's top line.
A human coach often shows another move instead: one the player would find,
nearly as good, with a follow-up he can play. At the player's turning points
and plan checkpoints, the engine's best is often a move players at his level
rarely play, while another move within the review's window is far more
natural. When players at his level play on from each, does the move he would
find score as well as the engine's best?

**The answer.** Not run yet. The rule below was committed before any rollout
was scored.

If it holds up, the review can show that move beside the engine's best: a
sound move he would find, instead of only a move he would not.

## The positions

His 10-minute games (600 seconds, no increment) in the app's archive at the
pinned commit (`bridge/chess.json`), read through the archive service. Two
kinds of position, both with him to move:

- **Turning points** (`deep`): the review's teaching moments, with up to five
  engine lines from the routine's `deep` budget.
- **Plan checkpoints** (`plans`): up to three lines from the `plan` budget.

In each position:

- **The candidates** are the first moves of the stored lines, each with its
  stored eval in his view. A position needs at least two.
- **B, the engine's best**: the candidate with the highest eval.
- **Sound** candidates give up no more than `ACCEPT_WINDOW_WP` (3) win%
  against B, win% by `core/score` (`lichessWinPercent`): the review's own
  window.
- **His band** is `defaultMaiaElo` of his rating at the game with the app's
  offset (250); **the opponent's band** the same of the opponent's rating.
- **F, the move he would find**: the sound candidate Maia-2 rates most likely
  at his band, conditioned on the opponent's band (the app's `humanPolicy`
  with `opponentBand`).
- **P, the move he played**, at turning points.

A position **enters** when F is not B.

## The rollouts

Each entering position plays out its moves: B and F, and P at turning points
when P is neither. Each move gets **16 rollouts**. A rollout plays the move,
then **12 more plies** (six by each side), each sampled from Maia-2's policy
for the side to move: his band for his moves, the opponent's band for the
opponent's, each conditioned on the other's band. Sampling uses the app's
`sampleFromPolicy` with a seeded generator, the seed fixed by the position and
the rollout. A rollout stops early when the game ends (`core/chess`).

Each rollout's end is scored as his win%: Stockfish through the app's engine
service at the `check` budget (120,000 nodes), win% by `core/score`; a
checkmate scores 100 or 0 and a draw 50.

**V(m)** is the mean of a move's 16 rollouts, and the measures are paired by
position:

- **D_F = V(F) − V(B)**: what the move he would find costs, or gains, in the
  hands of players at these bands.
- **D_P = V(P) − V(B)**: what his move cost, the same way.

## The split

The games in order of their end time: the earlier two thirds train, the later
third held out. Nothing is fitted, so the two sets are two replications.

Intervals come from 2,000 bootstrap draws over games with a fixed seed: the
95% percentile interval of the mean over positions.

## The rule, fixed before any rollout was scored

**The controls come first.** If either fails on either set, the study gives
no verdict.

1. **The null.** B's 16 rollouts split into the first 8 and the last 8: the
   mean difference's interval must cover zero.
2. **The decoy.** At the turning points where his move P lost at least 10
   win% (the review's `wpDrop`) and is neither B nor F, the mean D_P's
   interval must lie below zero. Rollouts that cannot see his known errors
   cannot judge F either.

**Then the verdict on F**, from the mean D_F on each set:

3. **Holds up** when the interval's lower end is above −1 win% on both sets.
   One win% is a third of the review's window.
4. **Better in his hands** when the lower end is above 0 on both sets (a
   stronger form of 3).
5. **The engine's best is worth the trouble** when the interval's upper end is
   below −1 win% on both sets.
6. **Unclear** otherwise.

## Also reported, without a rule

- D_F for quiet and forcing B (a capture or a check), for turning points and
  plan checkpoints, and by the divider's phase of the position (`phaseOf`).
- The root gap: B's stored eval against F's, in win%, beside −D_F. Does the
  gap the engine sees shrink or grow in human hands?
- At turning points, D_F − D_P: what the move he would find saves, in human
  hands, over the move he played.
- The share of positions where D_F is above zero.
- The null's interval width: how much noise 16 rollouts leave.

## Caveats

- **Maia-2 plays both sides.** The rollouts model players at these bands, not
  him or this opponent. A model of him is a later study.
- **Twelve plies.** The end is scored by Stockfish, so what comes after counts
  only as far as the engine sees it then.
- **Only the stored lines.** F is the most natural of the two to five moves
  the review kept, not of every legal move, so the review's own lines bound
  what this study can find.

## Who runs it

A Claude session on this repository's bridge, on CPU, four shards. Per-position
rows go under `private/findable-move/`, which git ignores; only aggregates are
committed (`results/`), written by the scripts, then the paper.

## Files

Added with the scripts.
