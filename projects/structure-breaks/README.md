# Do the breaks the app teaches for each pawn structure hold at his level?

**The question.** A coach explains a middlegame by its pawn structure: in the
Carlsbad the plan is the minority attack and the break is b4-b5; against the
London pyramid, strike with ...c5. The app names the structure on the board
(`structureOf`), teaches each structure's plans and breaks (its catalogue's
`breaks`, read for a side by `leversFor`), and its structure index counts the
games in which he played the break (`playedLever`). When a break his
structure teaches can be played in one of his quiet middlegame or endgame
positions, is it a sound move there, more often than the move he played?

**The answer.** Not run yet. The rule below was committed before any move was
scored.

If the break holds, the review and the drills can teach the structure's break
as the plan when it is on, and the structure index's count of breaks played
measures something worth raising. If it misleads, playing the break whenever
it can be played is worse than his own choice, and the app should teach when
not to play it (each structure's trap) before it teaches the break.

This study follows [positions-like-this](../positions-like-this/): there, the
moves of strong players from positions like his carried over only weakly, and
best where the app names the structure, which suggested testing the plan a
structure calls for instead of the next move from a similar game.

## The positions

**His.** The positions positions-like-this drew from his 10-minute games (its
`positions.mjs`, written to `private/positions-like-this/his-candidates.jsonl`):
past the opening by the app's phase reading (`phaseOf`), not in check, at least
two legal moves, eight men or more, his win% before the move by the archive's
evaluation (`lichessWinPercent`) between 10 and 90, and his clock before the
move at least 30 seconds. A position enters this study when also:

- the app names a structure on the board (`structureOf`);
- **the break is on**: at least one of his legal moves is a break of that
  structure for his side. His side's breaks are `leversFor` the structure, his
  colour and the structure's holder (for the three structures the catalogue
  writes from the holder's side, the side whose pawns make it, read as
  `settledStructure` reads it). A move is a break when the app's `playedLever`
  counts it, played after the game's moves so far and counted from that ply:
  a pawn move to the last square a break names;
- **quiet**, by the referee (below): its best move is not a capture, a check or
  a promotion, and the win% it gives him is between 10 and 90.

**The halves.** His games in order of their end time, the earlier half and the
later half by count, as in positions-like-this. Nothing is fitted, so the
halves are two replications.

**Strong players.** The Lichess September 2026 games (CC0) between two players
rated 2200 or more that positions-like-this kept
(`private/positions-like-this/strong-2026-09.jsonl.gz`, mostly blitz), read in
file order. In each game, the positions before a move by either side past the
opening, not in check, with eight men or more, at least two legal moves, the
mover's clock at least 30 seconds and a named structure are shuffled by a
seeded hash of the game, and the first of up to three of them with the break on
for the mover is the game's position. 3,000 such positions are drawn, and they
are scored in order, with the referee's quiet filter, until 1,200 are scored.

## The moves compared

In each of his positions:

- **B, the break**: every legal move of his that is a break. B's soundness is
  the share of them that are sound.
- **A, his move.**
- **N, the natural move**: Maia-2's most likely move at his band; **U**: the
  same at the band above. His band is `defaultMaiaElo` of his rating at the
  game with the app's offset (250), the band above the same of his rating plus
  200, each conditioned on the opponent's band (`humanPolicy` with
  `opponentBand`), as in positions-like-this.
- **R and R2**: two legal moves that are not breaks, each drawn uniformly at
  random (seeded), independently of each other.

In each strong position: B, **S** (the strong player's move), R and R2.

## The referee

Stockfish through the app's engine service at the `grade` budget (250,000
nodes), with the hash cleared before each position and no tablebase: the best
is `bestMoves` with one line, and each move is scored by `scoreMove` at the
same budget. A move is **sound** when `acceptsAlternative` accepts it against
the best: it gives up no more than `ACCEPT_WINDOW_WP` (3) win%, win% by
`core/score`. A score that is not exact counts as missing, and a position with
a missing score leaves the analysis (counted).

## The measures

- **The gain** is B's soundness minus A's, averaged over his positions, paired
  by position. Where his move was a break, B and A share it.
- Intervals come from 2,000 bootstrap draws with a fixed seed (20261019),
  resampling his games within the half, or the strong players' positions: the
  95% percentile interval.

## The rule, fixed before any move was scored

**The controls come first.** If either fails, the study gives no verdict.

1. **The referee tells moves apart here.** His own move's soundness minus R's
   must have its 95% interval above 0 on each half of his positions, and the
   strong player's move's soundness minus R's above 0 on the strong positions.
2. **The null.** R2 against R, in place of B against A, must not pass step 3
   or step 4.

**Then, on his positions:**

3. **The break holds** when the gain's 95% interval lies above 0 on both
   halves.
4. **The break misleads** when it lies below 0 on both halves.
5. **No better than his own move** otherwise.
6. **Not enough data (n=…)** when a half has fewer than 150 scored positions,
   whatever the numbers say.

## Also reported, without a rule

- **Coverage**: how many of his candidate positions have a named structure,
  the break on, and are scored, by structure.
- The soundness of B, A, N, U, R and R2 in each half, and B's minus N's.
- **Finding it**: how often he played a break when one was on; the probability
  Maia-2 gives the breaks at his band and at the band above; how often strong
  players played one.
- **By structure**: B, A and the gain for each structure with at least 30
  scored positions, the halves pooled.
- **Phase**: the middlegame and the endgame apart, the halves pooled.
- **When he did not play it**: the gain over his positions where his move was
  not a break, in each half.
- **The first chance**: the first of his positions in a game with the break on,
  against the later ones, the halves pooled.
- **Strong players**: B, S, R and R2 on their positions, and B's soundness
  minus S's.
- **The win% given up**: the mean win% the breaks and his move give up against
  the referee's best (a move that scores above the best gives up none), and
  the share of breaks that are the referee's best.

## Caveats

- **A break stands for a plan.** The break is tested as the next move; the
  preparation a plan asks for first (rooks behind the advance, the trap each
  structure names) is not, except as the first chance against later ones.
- **Breaks by square.** The app counts any pawn move to a break's last square
  as the break, a capture landing there included; this study keeps the app's
  reading.
- **Sound is a window.** In a quiet position several moves are often within 3
  win% of the best, so B and A can both be sound; they are paired by position
  for that reason.
- **Many positions a game for him.** Every one of his positions that qualifies
  enters, so a game where the break stays on for many moves counts many
  times; intervals resample whole games for that reason. Strong players give
  one position a game.
- **Mostly the London.** Before this rule was fixed, the positions with the
  break on were drawn, his and the strong players', and counted
  (`results/positions.json`), with no move scored: his are 1,359 in 245 games,
  about half of them the London pyramid, and the strong players' are most often
  the isolated queen's pawn. The by-structure table shows how far the answer is
  the London's.
- **Mostly blitz.** Most strong games are blitz; his are rapid.

## Who runs it

A Claude session on this repository's bridge, on CPU, four shards. Per-position
rows go under `private/structure-breaks/`, which git ignores; only aggregates
are committed (`results/`), written by the scripts, then the paper. No language
model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants, the breaks on in a position (`breaksOf`, through the app's `structureOf`, `leversFor` and `playedLever`), the random moves, and the helpers it shares with positions-like-this. |
| `positions.mjs` | Reads positions-like-this's candidates of his and its strong games, and writes the positions with the break on (`private/structure-breaks/his-candidates.jsonl`, `strong-candidates.jsonl`) and their counts (`results/positions.json`). No move is scored. |
| `score.mjs` | For each position (`--who his` or `--who strong`): the referee's best, Maia-2's policy at his band and the band above (his positions), the arms' moves and every move's soundness, one shard at a time, resuming where a shard stopped (`private/structure-breaks/<who>-<i>-of-<n>.jsonl`). |
| `analyze.mjs` | Applies the rule and the descriptions; writes `results/structure-breaks.json` and `.md`. |

## Running it

```bash
make chess
# positions-like-this's positions.mjs and stream.py first, for his candidates and the strong games
bridge/run.sh projects/structure-breaks/positions.mjs
for i in 0 1 2 3; do bridge/run.sh projects/structure-breaks/score.mjs --who his --shard $i/4 & done; wait
for i in 0 1 2 3; do bridge/run.sh projects/structure-breaks/score.mjs --who strong --shard $i/4 & done; wait
bridge/run.sh projects/structure-breaks/analyze.mjs
```
