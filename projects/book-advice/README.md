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
