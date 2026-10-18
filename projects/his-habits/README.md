# Where do his choices differ from players 200 points above him?

**The question.** A coach who knows a player can say what he does differently
from stronger players: he trades too readily, rarely retreats, pushes the pawns
in front of his own king. Which kinds of move does he play more often, or less
often, than players 200 points above him would in the same positions, and which
of those differences cost him?

**The answer.** Not yet run. The rule below was committed before any position
was scored.

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
