# Does the books' advice hold at the player's level?

**The question.** Two chess books for club players, Levy Rozman's *How to
Win at Chess* (2023) and *How to Win at Chess: Next Level* (2026), answered
twenty questions the app's coaching raised. Most of their answers are
qualitative; where they suggest a rule the app could follow, or a number it
could aim at, this project tests it against Stockfish and Maia-2 before the
app acts on it. Seven tests, each with its own rule, written down and
committed before its run:

| Test | The question |
|---|---|
| 1a | After the opponent's serious error, how often do players at his level punish it, miss it, or take material that is a trap? |
| 1b | Which warning signs of danger to one's own king does the engine bear out? |
| 1c | How often does the coach's "good trade" praise land on a trade the books would not praise? |
| 1d | Are retreats, and backward knight moves above all, the best moves his level misses most, and the hardest for Maia to find? |
| 1e | When every move loses, does the move whose winning reply is hardest to find save more games than the engine's top move? |
| 1f | What share of decisive advantages do players at his level and 200 points above convert, against the app's goals? |
| 1g | Does the guess-the-plan drill's 45 cp rule agree with the books' verdicts on their twelve planning positions? |

No model judges anything here: every verdict comes from an engine, Maia-2 or
the app's own board code, imported through the bridge.

## The data

- **Lichess games.** The 74,000 rated 10-minute games of September 2026
  (CC0) that [think-time-rapid](../think-time-rapid/) keeps (`stream.py`):
  Lichess's eval on every move and the clock. Each game gives two
  player-games, one for each player, read the app's way by think-time-rapid's
  `games.mjs`, as [band-above](../band-above/) reads them.
- **The bands.** His chess.com rapid rating at the pinned app (1122) is 1372
  on Lichess by the app's offset of 250 (`toLichess`). His band is 1250 to
  1449 and the band above 1450 to 1649, by the player's own Lichess rating,
  as in band-above. On Maia-2's scale (100-point steps) these are 1300 and
  1500.
- **His games.** His 10-minute games in the app's archive at the pinned
  commit, read the same way (think-time-rapid's `archive.mjs`). Only
  aggregates are committed.
- **The books' positions.** The answers quote positions from the books. They
  are not in this repository: a test that reads them (1g) copies them into
  `private/book-advice/` at run time, writes its per-position rows there, and
  commits counts only.

## 1a. The move after their mistake

The books warn that a piece offered for free may be a trap (taking a rook
that abandons a pawn's guard, and getting mated), and that the usual process
applies after the opponent's mistake: check what changed, look at the
forcing moves, test the reply. The app's "Punish their mistakes" goal
(`punish.rate`, at least 55% at stage 2) drills hanging-piece puzzles.

**The rule, fixed before the run.**

- **The event.** A player's move right after the opponent's serious error:
  the move facts' `afterOppError` (the opponent's move was a mistake or a
  blunder by the review reader, from the evals), with both moves' `lossPct`
  known. Player-games in his band and the band above, and his games.
- **The outcome**, one per event, in this order:
  - *other*: the player had one legal move;
  - *punished*: the reply kept at least half of the gift, the app's own
    test (`punish.rate`: `lossPct` at most half the opponent's);
  - *trap*: not punished, and the reply was a capture the reader judged a
    mistake or a blunder;
  - *missed*: not punished and not a trap.
  The failures are the traps and the misses. Shares carry 95% Wilson
  intervals.
- **Traps are a real share** when at least one failure in ten is a trap in
  his band's games, or in his own games with the interval's lower end at
  10% or more. Then the app gets a "take it or not" drill that mixes real
  gifts with traps, and the review tags a poisoned capture.
- **Misses dominate** when at least two failures in three are misses in his
  band's games. Then the goal's practice adds the punishments it lacks, by
  the next step.
- **What the misses missed.** A seeded random sample of up to 2,000 misses
  in each band, and every miss in his games: the app's Node engine service
  (one thread, the `best` budget the app names moves with, 600,000 nodes)
  finds the best reply in the position the opponent's error left, and the
  knowledge service's `themeOfBest` names it. The goal adds a kind of
  punishment beyond the hanging piece when its theme names at least one
  sampled miss in ten in his band: mates (`mateIn1`, `backRankMate`), forks,
  and pins, skewers and discovered attacks. The labeller has no trapped
  piece; those land under the phase words with the rest it cannot name.
- **Also reported**, without a rule:
  - the same split on the app's `punish.rate` population (gifts of 20 win%
    or more);
  - *offered material*: the player's move right after an opponent move that
    left one of the opponent's knights, bishops, rooks or queens hanging by
    the knowledge service's `hangingPieces` when it was not before. In a
    seeded sample of up to 3,000 such moves in each band, and every one in
    his games, the engine (`best` budget) reads the position and the capture
    of that piece by its cheapest attacker, and the knowledge service's
    `judgeMove` judges the capture: a *trap* when a mistake or a blunder, a
    *gift* otherwise. How many offers are traps, how often the players took
    a trap, and how often they left a gift;
  - after a punished reply, how often the player's next move is a serious
    error, beside the rate on the player's other moves at 75 win% or more.

## 1b. Danger to his own king

The books list warning signs that come before a mate is on the board: a king
with no safe squares, an enemy queen covering its exits, a bishop aimed into
the shelter, an approaching knight, a rook lift, a hook pawn, a pawn storm when
the kings stand on opposite wings, and at least two more effective attackers
than defenders near the king. The app gives no such warning yet.

**The rule, fixed before the run.**

- **The positions.** The position before a player's move, past the book, with
  the player not in check and the app's phase divider putting the move in the
  opening or the middlegame. One position from each of 8,000 player-games in
  each band, and up to ten from each of his games, drawn at random (seeded).
- **Danger**, read by the engine:
  - *a mate threat*: in the same position with the opponent to move, the
    app's Node engine (one thread, the `check` budget, 120,000 nodes) finds a
    forced mate for the opponent;
  - *a swing*: the game's own evals put the player 30 win% or more lower at
    some point in the next six plies.

  A position is dangerous when it shows either.
- **The signs**, board code over the app's board kernel, for the player's
  king. The king's *zone* is its square, the eight around it, and the three
  squares two ranks in front of it.
  1. *No safe squares*: the king has no escape square (`kingFacts`: a square
     next to it that its own pieces do not hold and the opponent does not
     attack).
  2. *Queen on the exits*: the opponent's queen attacks a square next to the
     king that none of the player's pieces stands on.
  3. *Bishop aimed in*: an opponent bishop attacks a zone square, directly or
     through one pawn.
  4. *Approaching knight*: an opponent knight attacks a zone square, or can
     after one move.
  5. *Rook lift*: an opponent rook can attack a zone square within two rook
     moves over the board as it stands, the first of them along its file.
  6. *Hook pawn*: a pawn of the player's on the king's file or a file next to
     it has left its starting square, and an opponent pawn on a file next to
     that pawn can reach the square that attacks it by advancing on an open
     path.
  7. *Opposite-side storm*: the kings stand on opposite wings (files a to c
     against f to h), and an opponent pawn on the player's king's file or a
     file next to it has advanced two squares or more.
  8. *Plus two*: the opponent's effective attackers outnumber the player's
     defenders by two or more. An attacker is an opponent piece that attacks a
     zone square now or can after one move, or an opponent pawn that attacks
     one now or after one step; a defender is a piece of the player's, other
     than the king and the pawns, that guards a zone square now or can after
     one move.
- **The score.** For each sign: precision (the share of positions showing it
  that are dangerous), recall (the share of dangerous positions that show it)
  and lift (precision over the base rate of danger), with 95% Wilson
  intervals; against a mate threat and a swing separately as well.
- **The bar.** A sign becomes a warning when, in his band's positions, it
  shows in at least 2% of them, its lift is at least 1.5, and its precision's
  interval starts at 1.25 times the base rate or more. Its numbers in the band
  above and in his games are reported beside it.
- **What follows.** The signs that clear the bar become a warning in the
  review and in practice games, with the books' defending resources as its
  advice: bring pieces back with tempo, trade attackers including the queens,
  give back material, and when mate is near, counterattack only with moves
  forcing enough to interrupt it. A sign that misses the bar is not shown.

## 1c. The coach's "good trade" praise

When the player is ahead and the Won-Game Protocol is on, the live coach
praises an even trade: "Good trade: knight for knight keeps you up a piece,
and with fewer pieces left that lead counts for more." The books qualify the
advice: do not give a more active piece for a less active one, nor a piece
one's attack needs, nor the queens while attacking, and judge the ending the
trade leads to.

**The rule, fixed before the run.**

- **The trades.** A player's move where the coach's trade rule fires as in a
  practice game: the Won-Game Protocol is on after the player's previous move
  (`wonGameActive` on the game's own eval) and the move is an even trade by
  the coach's `evenTrade`. Every such move in his games, and a seeded sample
  of up to 1,500 in each band's player-games.
- **The praise**, read as [praise-gate](../praise-gate/) reads it: the live
  verdict at the coach's budgets (`liveTargets`, `readLiveMove`,
  `composeVerdict`; one thread, a cleared hash for each move) and
  `confirmsPraise`. The praised trades are the population.
- **The cases**, on the position before the trade:
  - *Active for passive*: the capturing piece has at least three more legal
    moves than the piece it takes, each counted with its own side to move.
  - *An attacker traded*: at least two of the player's pieces attack squares
    next to the opponent's king (`kingFacts` ring attackers), the capturing
    piece is one of them, and the piece it takes guards none of those squares.
  - *Queens off while attacking*: queen takes queen while at least two of the
    player's pieces attack squares next to the opponent's king.
  - *A worse ending*: the player's next move is in the endgame by the app's
    divider, and the game's own eval (Lichess's or the archive's, deeper than
    the coach's) puts the trade 2 win% or more below the best move
    (`PRAISE_LOSS_PCT`).
- **The bar.** A case tightens the gate when it holds for at least one
  praised trade in twenty in his band's games or in his own, and the game's
  own eval faults its praised trades (a loss of 2 win% or more) at least as
  often as the other praised trades. The coach then withholds the praise in
  that case; and when any case tightens it, the praise's single reason gives
  way to the one that applies: the trade takes their more active piece (three
  legal moves or more), takes an attacker of his king (a piece attacking a
  square next to it), or leaves only pawns. The shares of praised trades
  showing each reason are reported for those words.
- **The review's missed-trade line** ("trade pieces and the lead counts for
  more"), where it fires in his games (his move faulted, the archive's best
  move a trade by the same reader), gets the same cases on the best move's
  trade, reported beside the praise.

## 1d. Backward moves

The books call backward knight moves among the hardest moves to notice, and
ask the solver to check whether a retreat helps one or two moves later.

**The rule, fixed before the run.**

- **The positions.** The position before a player's move, past the book, with
  at least two legal moves and the move's loss known. Up to three positions
  from each of 3,000 player-games in each band, and 6,000 from his games,
  drawn at random (seeded).
- **Must-find.** The app's Node engine (one thread, the `check` budget, two
  lines) finds a best move at least 10 win% better than the second, from the
  mover's side: missing it is at least a mistake by the app's judge. Only
  these positions count. The player *found* it when he played the engine's
  best move.
- **Direction**, from the mover's side: *forward* when the best move ends on a
  rank nearer the opponent, *backward* when nearer the mover's own back rank,
  *sideways* otherwise; castling is left out. The tests compare *quiet* best
  moves (no capture, no promotion), since a capture is seen as a capture
  whichever way it goes; all moves are reported too.
- **Missed more often** holds when, in his band's must-find positions with a
  quiet best move, backward best moves are missed more often than forward
  ones, with the difference's 95% interval (Newcombe's, from the Wilson
  intervals) above zero.
- **Harder for Maia at the same value** holds when Maia-2's probability for
  the best move, at the player's band against the opponent's, averages lower
  for backward quiet best moves than for forward ones within each of three
  bins of the best move's margin over the second (10 to 20, 20 to 40, 40 win%
  or more), and the difference over the bins, weighted by the backward moves
  in each, has a 95% bootstrap interval (2,000 seeded resamples of the
  positions) below zero.
- **What follows.** When both hold, the scan adds "look at backward moves
  too" (sent to the thinking drills) and the review names a missed retreat
  (sent to the review's explanations). Backward knight moves are reported on
  their own beside the rest.

## 1e. Practical tries when every move loses

The books say that in a lost position the defender should make the
opponent's task hard: checks, threats, a passed pawn, keeping pieces on, a
stalemate trick. Where every move leaves the player behind and he picked a
worse one, the review says "You are behind either way" and names the
engine's top move.

**The rule, fixed before the run.**

- **The positions.** The position before a player's move, past the book, with
  the game's own eval putting him behind (down 250 cp or more: the app's
  "much worse" or "losing") and at least two legal moves. One such position
  from each player-game that has one, drawn at random (seeded): 800
  player-games in each band and every one of his games. The app's Node engine
  reads each at the `verify` budget (750,000 nodes, three lines); a position
  stays when the top move still leaves him behind, with no forced mate either
  way.
- **The candidates.** The engine's lines within 100 cp of the top move, and
  the move he played.
- **A reply that throws the win away.** For each candidate, Maia-2 at the
  opponent's band (against the player's) gives the opponent's replies. The
  likeliest, up to six and until they cover 85% of Maia's probability, are
  scored by one search restricted to them (the `grade` budget, 250,000
  nodes); a reply *throws the win away* when it leaves the player no longer
  behind. A candidate's *chance* is Maia's probability on the replies that
  do. The *practical try* is the candidate with the highest chance, the top
  move on a tie.
- **Saves.** A game is *saved* when the player drew or won. From the games
  themselves: s1, the save rate when the opponent's actual reply threw the
  win away (by the game's own eval), and s0, the rate when it did not. The
  practical try's *extra saves* in a position are (its chance minus the top
  move's) × (s1 − s0).
- **Maia is a fair instrument** when, over the moves the players actually
  played, the share of actual replies that threw the win away rises from the
  lowest third of the predicted chance to the highest, their intervals apart,
  and the mean predicted chance lies inside the observed share's interval in
  at least two of the three thirds.
- **The practical try saves more games** when Maia is a fair instrument and,
  in his band, the practical try differs from the top move in at least one
  position in four, and its extra saves average at least 3 games per 100 over
  those positions.
- **Also reported:** the save rates by the move played (the top move, the
  practical try where it differs, any other move), and which of the books'
  resources the practical tries show: a check, keeping pieces on (no capture
  where the top move captures), a passed pawn, a reply that stalemates.
- **What follows.** When it saves more, the review stops saying "behind
  either way" and names the move that sets the most problems, and why (sent
  to the review's explanations).

## 1f. The conversion target

The books' informal target is converting a decisive advantage at least 70%
of the time, with no centipawn definition. The app measures conversion as
`conversion.sustained`: of the games where the player stood at +3 or
better for three plies in a row, the share won. Its tripwire fires under 65%
over the trailing 30 games, and its stage goals are 78% (stage 1, chess.com
1000 to 1150), 82% (stage 3, 1300 to 1450) and 85% (stage 4, 1450 to 1600).

**The rule, fixed before the run.**

- **The measure.** `conversion.sustained` as the metrics registry defines
  it (its population and its game test), on every player-game, by the
  player's Lichess rating: the six 200-point bands of band-above (850 to
  2049), the three stages' bands and the bands 200 points above them, and
  his games. 95% Wilson intervals.
- **The stage goals.** A stage's band on Lichess is its chess.com range plus
  250 (stage 1: 1250 to 1399; stage 3: 1550 to 1699; stage 4: 1700 to 1849),
  and what players 200 points above reach is the rate of player-games 200
  points above that band. A goal stays when it lies inside that rate's
  interval; otherwise it moves to that rate, rounded to a whole percent.
- **The tripwire.** It should fire when he converts no better than players
  200 points below him (Lichess 1050 to 1249). It stays when 65% lies inside
  that band's interval; otherwise it moves to that rate, rounded to a whole
  percent.
- **Also reported**, without a rule: the books' 70% against each band; how
  many of his last 30 games reach a sustained +3, against the metric's
  minimum of 20 (a thinner estimate never trips the wire).

## 1g. The twelve planning positions against the 45 cp rule

The guess-the-plan drill shows a quiet position from his games with the
engine's three best moves (the routine's `plan` budget: 600,000 nodes, three
lines) and counts any option within 45 cp of the best option as right
(`planCorrect`, `PLAN_QUIZ_MARGIN` in the exercises service). Next Level's
last chapter gives twelve positions with the author's preferred moves, the
moves he calls sound, and the moves he rejects (five rejected moves and
fourteen preferred or sound ones, over eleven positions; the twelfth asks for
an evaluation instead). Three later positions from the same games carry one
named move each (two preferred, one rejected).

**The rule, fixed before the run.**

- Each position is searched by the app's Node engine service (the
  routine's Stockfish build, one thread, no tablebase, no eval cache) at two
  budgets: `plan` (what the drill reads) and a check at 32 million nodes.
- At each budget, the engine's best move is its top line with no
  restriction. The verdicts come from one MultiPV search restricted to the
  engine's best move and the position's named moves, so every move's eval
  comes from the same search, from the mover's side. The best option is the
  highest of them (`planBest`), and a named move counts as right when
  `planCorrect` says so.
- **A disagreement** is a move the books reject that the rule counts as
  right, or a preferred or sound move the rule counts as wrong. A
  disagreement *holds* when both budgets give it.
- **The evaluation position** (side to move not given) is searched with each
  side to move at the 32-million-node budget. The books call it equal: the
  engine agrees when its eval is under 100 cp for both sides to move (the
  app's "about even" and "slightly" words), half agrees from 100 to 249 cp
  (one side "better", neither side ahead in the app's lesson words), and
  disagrees from 250 cp ("much better" or more).
- **Also reported**, without a rule: whether each rejected move is among the
  `plan` budget's three lines, so the drill would offer it at all; and the
  three later positions, read the same way.
- **What follows.** No port: the margin stays (the books give no
  tie-breaker), and every disagreement goes to the app's plan drills as a
  case for their feedback, never as an answer to copy.
