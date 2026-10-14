# Does the live coach praise only the moves that earn it?

**The question.** The live coach writes some notes the moment a move lands,
from the board alone: castling by move 8, and an even trade while he is
ahead. Those notes used to praise the move at once. A change to the app makes
them hold their praise for the engine's verdict on the move, at the coach's
live budgets: the praise stands only when the verdict is a plain good one
(the engine's move, or a good one that gives up under the praise bar of
2 win%), and for a trade only when the trade still reads as a trade while
ahead. Does the gate keep the praise off the moves that gave something away,
and how much praise does it withhold from moves that did not?

**The answer.** Not yet, by the rule below, though narrowly. Without the
gate, about one in four of the moves the instant rules praise gave away 2 win%
or more by the archive's reading; with it, about one in sixteen of the moves it
praises did, and almost none of them gave away 5 or more, while it keeps the
praise on most of the moves that gave away less. What it still praises sits
at the bar, where the live search and the archive's deeper one disagree as
often each way. A live bar of 1 win% for held praise would meet both bars on
these games; that bar was read after the run, so the next round tests it. The
paper, [`paper/paper.pdf`](paper/paper.pdf), has the numbers.

## The data

The player's archived games at the app commit the change is measured on
(`CHESS_DIR` points at a checkout of the change). Every move of his in them
is read by the archive's own analysis: the routine's sweep searched the
position after every move at a million nodes, which gives the win% each move
gave away (`lossPct`, on the app's win% curve) and the classifier's class.
That deeper reading is the reference. The per-move rows carry game ids, so
they stay under `private/praise-gate/`; the results are counts.

## The rules, fixed before the first run

- **The moves.** Each of his moves is replayed from the start and read by
  the change's own instant rules (`moveFindings`, under the coached game's
  policy, `playPolicy`, from the standard start). A move is in the study when
  a rule holds praise on it: `castling` (he castled by move 8) or
  `tradeWhileAhead` (an even trade while ahead). The trade rule speaks only
  under the Won-Game Protocol, which the coach switches on from its verdict
  on his previous move (`wonGameActive`); the replay reads that position from
  the archive's eval of it. A first run passed the protocol as off, which
  left every trade out; the rule was corrected before any trade was read.
- **The verdict.** Each such move gets the change's own verdict
  (`readLiveMove`, then `composeVerdict`) through the app's Node engine
  service: the same Stockfish build the browser runs, one thread, the live
  budgets (the before-position at `best`, 600,000 nodes, three lines; the
  after-position at `check`, 120,000 nodes). The loose-piece, mate and
  given-away inputs come from the same instant rules. The tablebase is not
  asked; positions with seven pieces or fewer are counted.
- **The praise.** A held note is praised when `confirmsPraise` says the
  verdict confirms it, as the coach would show it.
- **Faulted.** By the archive's reading, a move is faulted when it gave away
  2 win% or more (the praise bar), and clearly faulted when it gave away 5 or
  more (an inaccuracy or worse on the judge's scale).
- **What is reported**, for each rule and for both together: the moves; how
  many the gate praises; the faulted and the clearly faulted among all of
  them (what the instant rules alone would have praised) and among the
  praised; and the share of the moves the archive reads as not faulted that
  the gate withholds praise from. Shares carry 95% Wilson intervals.
- **It works** when, among the moves it praises, at most one in twenty is
  faulted by the archive's reading, and it praises at least three in four of
  the moves the archive reads as not faulted.

- **The next round**, fixed before any of its games are played: the
  candidate praises a held note only when the gate praises it and the live
  loss is under 1 win%. It runs on the games the archive holds after the day
  `results/praise.json` names as `archiveThrough`, by the same two bars, with
  the gate as built measured beside it; it is adopted only if it meets both.

## Files

| File | What it does |
|---|---|
| `praise.mts` | The replay. Writes `results/praise.json` (counts, and the same moves read at stricter live bars, which describe these games and test nothing); the per-move rows go to `private/praise-gate/`. Each move is searched from a cleared hash, so a rerun repeats every count. |
| `paper/generate.mjs` | Writes `paper/generated.tex` from the results and one position from the private rows, and refuses to write when a claim the paper makes no longer holds. |

## Running it

```bash
make chess
# A checkout of the change, with the app's node_modules.
export CHESS_DIR=<checkout of the change>
bridge/run.sh projects/praise-gate/praise.mts --pool 4
unset CHESS_DIR
bridge/run.sh projects/praise-gate/paper/generate.mjs
```

The change measured is the one at the commit `results/praise.json` names as
`app`; until it lands on the app's `main`, its checkout is a worktree of that
commit with the app's `node_modules`.
