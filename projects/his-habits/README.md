# Where do his choices differ from players 200 points above him?

**The question.** A coach who knows a player can say what he does differently
from stronger players: he trades too readily, rarely retreats, pushes the pawns
in front of his own king. Which kinds of move does he play more often, or less
often, than players 200 points above him would in the same positions, and which
of those differences cost him?

**The answer.** No verdict, by the rule below, which was committed before any
position was scored. The known-fault control failed on both halves: he does not
leave a piece hanging more often than Maia-2 says players 200 points above would
in his positions, and against his own band he leaves one hanging less often.
When he does leave one and the band above would not, it costs him far more than
his other differences, so the cost half of the control held; only the frequency
did not. The null control passed. Without a verdict, four differences show on
both halves, and none costs him more than his other differences: he plays pawn
breaks about half again as often as the band above, retreats less often (a
middlegame difference), gives check more often, and doubles or isolates his own
pawns more often.

Added after the rule was applied: among Lichess players, retreats rise and
checks fall with rating while pawn breaks show no trend, so his pawn breaks look
like his own way of playing and his fewer retreats and extra checks like his
level. Maia-2 at his own band reads his moves a little better than at the band
above. The control asked for more than this sample can show: the band above is
expected to leave a piece hanging only a little less often than his band, by
less than the width of his interval. A next round needs a positive control that
shows the method finds a difference of the size it reports, a fault he is known
to have or a planted one, with its rule fixed first. The numbers are in
[`results/his-habits.md`](results/his-habits.md), written by `analyze.mjs`,
[`results/descriptions.md`](results/descriptions.md), written by
`describe.mjs`, and the paper, [`paper/paper.pdf`](paper/paper.pdf).

A difference that shows in both halves of his games and costs him more than his
other differences is a habit worth coaching. One that shows but costs no more is
his style, worth knowing but not worth changing. One that shows in only one half
is not a habit.

## The positions

His 10-minute games in the app's archive at the pinned commit
(`bridge/chess.json`), read through the archive service: those stored with a
time control of 600 seconds and no increment, and the earlier games stored
without a time control whose clocks never show more than 600 seconds. Each of
his moves enters when:

- the position is past the opening by the divider (`phaseOf`);
- he is not in check and has at least two legal moves;
- his win% before the move, from the archive's evaluation (`lichessWinPercent`),
  is between 10 and 90: the game is still open;
- his clock before the move shows at least 30 seconds.

**The halves.** The games in order of their end time: the earlier half and the
later half by count. Nothing is fitted, so the halves are two replications,
one after the other and at different ratings.

## The bands

- **His band**: `defaultMaiaElo` of his rating at the game, with the app's
  offset (250).
- **The band above**: `defaultMaiaElo` of his rating plus 200, the same way.
- **The opponent's band**: `defaultMaiaElo` of the opponent's rating.

Maia-2's policy at a band, conditioned on the opponent's band (the app's
`humanPolicy` with `opponentBand`), gives every legal move a probability.

## The kinds of move

Every legal move in every position is read by the app's code at the pinned
commit. A move can be of several kinds.

From the move itself:

| Kind | The move |
|---|---|
| `capture` | captures (en passant included) |
| `check` | gives check |
| `pawn-push` | moves a pawn and captures nothing (promotions included) |
| `retreat` | moves a knight, bishop, rook or queen to a rank nearer its own first rank, capturing nothing |
| `king-move` | moves the king, castling aside |
| `queen-move` | moves the queen |
| `even-trade` | captures a knight, bishop, rook or queen, and the app's exchange read of the capture (`captureExchangeByMove`) comes out level |
| `worst-piece` | moves the piece the app names his worst (`describePosition(fen).side[his].activity.worstPiece`) |
| `shelter` | thins his own king's pawn shelter (`describeMove(fen, move).delta.shelterThinned`) |
| `threat` | leaves him a capture that wins material on a square where he had none before, or a mate in one he did not have, by the app's `threats` reads for his side before and after the move |

From the app's ideas: the insights the app reads for the move with
`moveInsights(fen, move)`, without engine evidence, so as the board shows it:

| Kind | Insights |
|---|---|
| `open-file` | `open-file`: a rook or queen takes an open or half-open file |
| `battery` | `battery` |
| `king-pressure` | `king-pressure`: more squares around the enemy king attacked, at least three |
| `pawn-break` | `pawn-break` |
| `passed-pawn` | `passed-pawn` or `promotion` |
| `outpost` | `outpost` |
| `seventh-rank` | `seventh-rank` |
| `active-king` | `active-king` |
| `gives-bishop-pair` | `bishop-pair`: a bishop takes a knight and the pair goes with it |
| `pawn-weakness` | `self-doubled` or `self-isolated` |
| `tactic` | `fork`, `pin`, `skewer`, `trapped` or `wins-capture` |

And one kind that is a known fault at his level, the control below:

| Kind | The move |
|---|---|
| `hangs` | captures nothing, and the app reads a piece of his as standing to be taken after it (`hangs-itself` or `leaves-hanging`) |

`hangs` leaves captures out because the app's read calls the capturing piece
hanging in an even trade (after 4.Bxc6 in the Ruy Lopez it says the bishop "is
not safe on c6").

## The rates

For a kind of move C in a half:

- **N** is the number of his moves of kind C.
- **Maia's expected count** sums, over his positions, the probability Maia-2 at
  the band above gives to the moves of kind C.
- **Maia-2's bias** at band b, κ(C, b): on Lichess (below), players at band b
  play kind C κ times as often as Maia-2 at b predicts in their own positions.
  Where Maia's expected count at a band is under 30, κ(C) pooled over all the
  bands stands in for it.
- **E**, his expected count, multiplies each position's predicted share by κ at
  that position's band above.
- **R = N / E**: how often he plays kind C relative to players 200 points above
  him, in his positions.

Intervals come from 2,000 bootstrap draws with a fixed seed, resampling his
games within the half and the Lichess player-games within each band: the 95%
percentile interval.

## The cost

- **T** is the move Maia-2 at the band above rates most likely; **P** is his
  move.
- **D = wp(T) − wp(P)**: his win% after T minus after P, by Stockfish through
  the app's engine service at the `grade` budget (250,000 nodes), the hash
  cleared before each position and no tablebase, win% by `core/score`
  (`winPercentFor`). D is 0 where P is T.
- For an over-used kind, the **instances** are the positions where P is of kind
  C and T is not; for an under-used kind, where T is of kind C and P is not.
- **The reference** is his other differences: positions where P is not T and
  neither is of kind C.
- **The relative cost** is the mean D over the instances minus the mean D over
  the reference, bootstrapped over games within the half.

## The Lichess calibration

- **Games.** Lichess's September 2026 database (CC0): rated games at 600+0 that
  ended normally or on time, in file order. A player's side of a game enters
  for a band when the player's rating maps to it (`normalizeMaiaElo`), for each
  band his games use: 1000 (Maia-2's band below 1100, counted from 900, his
  range) up to 1600. The first 2,000 player-games enter each band.
- **Positions.** Each player-game gives up to two positions with that player to
  move, taken in a seeded random order among those that pass the filters his
  positions pass: past the opening, not in check, two legal moves, 30 seconds
  on the clock, and win% between 10 and 90, here by Stockfish at the `check`
  budget (120,000 nodes). At most six are tried.
- **The policy.** Maia-2 at the player's band, conditioned on the opponent's.

κ(C, b) is the number of moves of kind C those players played over the number
Maia-2 at b expected.

## The rule, fixed before any position was scored

**The controls come first.** If either fails on either half, the study gives no
verdict.

1. **The known fault.** `hangs` must be over-used (R's interval above 1 on both
   halves) and cost him more than his other differences (the relative cost's
   interval above 0 on both halves).
2. **The null.** A player who plays a move drawn from Maia-2's own policy at the
   band above in each of his positions (seeded), compared with Maia-2's
   expected count without κ, must show no kind of move over-used or under-used
   by step 3.

**Then, for each kind of move:**

3. **Over-used** when R's interval lies above 1 on both halves; **under-used**
   when it lies below 1 on both.
4. In that direction, it **costs** when the relative cost's interval lies above
   0 on both halves, and it is **cheap** when it lies below 0 on both.
5. The verdict: **a costly habit** (3, and costs), **a habit that costs no
   more** (3, neither), **a cheap habit** (3, and cheap), or **no habit** (not
   3).
6. **Not enough data (n=…)** when E is under 30 in either half, or, for the
   cost, when there are fewer than 30 instances in either half. **Not
   measurable** when Maia-2's correction for the kind averaged over a half's
   positions (E over Maia's expected count) lies outside 2/3 to 3/2.

## Also reported, without a rule

- R against his own band, with κ at his band: whether a difference is his
  level's or his own.
- R without κ, and κ at each band.
- The share of his moves that are Maia-2's most likely move at his band and at
  the band above.
- For each kind, in both directions: the instances per game, their mean D, and
  the win% a game they give up.
- R by the divider's phase of the position (middlegame and endgame), both
  halves together.

## Caveats

- **Maia-2 stands in for the players above him.** κ corrects its average bias
  for each kind of move, measured in Lichess players' positions, not in his.
- **The most likely move stands for what the band above plays** when the cost
  is measured.
- **The halves are at different ratings.** He climbed through the archive, so a
  habit that shows in both halves held as he improved; one that shows in only
  one may have come or gone.
- **A kind of move is a description, not a mistake.** Playing it more often than
  the band above is a difference; the cost says whether it matters.
- **A model of him**, a network trained on his own games, is the plan's next
  step and needs a GPU; this study is the part a CPU can run.

## Who runs it

A Claude session on this repository's bridge, on CPU, four shards. Per-position
rows go under `private/his-habits/`, which git ignores; only aggregates are
committed (`results/`), written by the scripts, then the paper. No language
model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants (filters, bands, budgets, the Lichess sample, the rule's bars), the kinds of move and their reader over the app's code, the seeded generator and the Maia-2 sums. |
| `stream.py` | Streams Lichess's September 2026 database and keeps the 10-minute games with a player at one of the bands (`private/his-habits/lichess-2026-09.jsonl.gz`), with a summary beside them. |
| `his.mjs` | Reads his archive at the pinned commit, and for each of his positions writes every legal move's kinds, Maia-2's policy at his band and the band above, his move, the band above's most likely move, the null player's move, and Stockfish's win% after his move and that move, one shard at a time, resuming where a shard stopped (`private/his-habits/his-<i>-of-<n>.jsonl`). |
| `lichess.mjs` | Takes the first 2,000 player-games at each band, draws their positions, and writes each one's kinds and Maia-2's policy at the player's band (`private/his-habits/lichess-<i>-of-<n>.jsonl`). |
| `analyze.mjs` | Applies the rule and the descriptions; writes `results/his-habits.json` and `results/his-habits.md`. |
| `describe.mjs` | Added after the rule was applied: which of Maia-2's bands reads his moves better, his rate of each kind of move beside Maia-2's at his band and the band above, and each kind's rate among Lichess players at each band (`results/descriptions.json` and `.md`). |
| `paper/generate.mjs` | Writes every number, table and position the paper prints into `paper/generated.tex`, and refuses to write when a claim the paper makes no longer holds. |

## Running it

```bash
make chess
python3 projects/his-habits/stream.py
for i in 0 1 2 3; do bridge/run.sh projects/his-habits/his.mjs --shard $i/4 & done; wait
for i in 0 1 2 3; do bridge/run.sh projects/his-habits/lichess.mjs --shard $i/4 & done; wait
bridge/run.sh projects/his-habits/analyze.mjs
bridge/run.sh projects/his-habits/describe.mjs
bridge/run.sh projects/his-habits/paper/generate.mjs
```
