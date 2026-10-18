# Can the app find strong players' positions like his, whose move works in his?

**The question.** A coach explains a middlegame or endgame decision with an
example: this is like a game where a strong player had the same pawns and
pieces and played this move. The example teaches a plan only when the
positions are alike in the way that matters, so that the strong player's move
works in the student's position too. The app keys pawn skeletons exactly and
has no search for similar positions. For a quiet middlegame or endgame
position from his games, can it find positions from games between strong
players so alike that the strong player's move is also sound in his, more
often than the move of a strong player from a position that only has the same
pieces?

**The answer.** Not run yet. The rule below was committed before any move was
scored.

If likeness works, a "this is like..." example in the review or a drill can
show a strong player's position like his with the move played there, and the
likeness is part of why the move works. If a random position with the same
pieces does as well, the likeness an example claims is not why its move works,
and the app has no reason to search for one.

## The positions

**His.** His 10-minute games in the app's archive at the pinned commit
(`bridge/chess.json`), read through the archive service: those stored with a
time control of 600 seconds and no increment, and the earlier games stored
without a time control whose clocks never show more than 600 seconds, as in
[his-habits](../his-habits/). Each of his moves enters when:

- the position is past the opening by the app's phase reading (`phaseOf`);
- he is not in check and has at least two legal moves;
- the board holds eight men or more (seven or fewer is the tablebase's ground,
  which the rules of thumb study covers);
- his win% before the move, from the archive's evaluation
  (`lichessWinPercent`), is between 10 and 90;
- his clock before the move shows at least 30 seconds;
- the position is **quiet**: the referee's best move (below) is not a capture,
  a check or a promotion, and the win% it gives him is between 10 and 90.

**The halves.** His games in order of their end time: the earlier half and the
later half by count. Nothing is fitted, so the halves are two replications.

**Strong players.** Lichess's September 2026 database (CC0): rated blitz, rapid
and classical games between two players rated 2200 or more, that ended
normally or on time and have at least 30 plies, the first 400,000 in file
order (`stream.py`). One game in ten, by a seeded hash of its id, is held out;
the others are the index.

**The index.** Every position before a move in the index games that is past
the opening (`phaseOf`), not in check, with eight men or more, and where the
mover's clock shows at least 30 seconds, with the move played there.

## Alike

Every position is read from the side to move: when Black is to move, the board
is mirrored top to bottom and the colours swapped, so the mover always plays up
the board, and moves are mirrored the same way.

- **The same pieces.** Two positions can match only when each side has the
  same number of queens, rooks, knights and pawns, and of bishops on each
  colour of square.
- **The distance** between two positions with the same pieces adds:
  - **pawns**: the squares where one position has a pawn of a side and the
    other does not (a pawn one square further on counts 2);
  - **pieces**: for each side and each kind of piece (knight, bishop on each
    colour, rook, queen), the two positions' pieces paired to make the total
    least, each pair counting the king-step distance between its squares, at
    most 2;
  - **kings**: each king's king-step distance between the two positions, at
    most 3.

  The weights were set without looking at any position: the pawns, which fix
  the plans, count the most, and a piece counts at most a moved pawn.
- **A match transfers** when its move, read in his position, is legal there
  and moves the same kind of piece from the same square.

## The moves compared

In each position:

- **T, the matches**: the three nearest index positions with the same pieces,
  from three different games, whose moves transfer. Ties in distance are
  broken by a seeded hash.
- **R, random matches**: three index positions with the same pieces drawn at
  random (seeded), from three more games, none of them T's, whose moves
  transfer. At most 20,000 draws.
- **R2, a second random draw**, the same way, from games none of T's or R's.

His positions also have:

- **N, the natural move**: Maia-2's most likely move at his band;
- **U**: Maia-2's most likely move at the band above;
- **A, his move.**

His band is `defaultMaiaElo` of his rating at the game with the app's offset
(250), the band above the same of his rating plus 200, each conditioned on the
opponent's band (`humanPolicy` with `opponentBand`), as in his-habits.

A position is **covered** when T, R and R2 each find three moves; only covered
positions are scored.

## The referee

Stockfish through the app's engine service at the `grade` budget (250,000
nodes), with the hash cleared before each position and no tablebase: the best
is `bestMoves` with one line, and each move is scored by `scoreMove` at the
same budget. A move is **sound** when `acceptsAlternative` accepts it against
the best: it gives up no more than `ACCEPT_WINDOW_WP` (3) win%, win% by
`core/score`. A score that is not exact counts as missing, and a position
with a missing score leaves the analysis (counted).

## The measures

- In each position, an arm's **soundness** is the share of its three moves
  that are sound.
- **The lift** is T's soundness minus R's, averaged over positions, paired by
  position.

Intervals come from 2,000 bootstrap draws with a fixed seed (20261019),
resampling his games within the half, or the strong players' positions: the
95% percentile interval.

## The rule, fixed before any move was scored

**The controls come first.** If either fails, the study gives no verdict.

1. **The planted twin.** 1,200 held-out strong players' positions, one a game
   (seeded), each with T and R complete and quiet by the same filters (a game
   tries another of its positions, at most three, when one is not). Each is planted in the
   index with its own move: it is then its own nearest match, at distance 0,
   and its move transfers (both checked on every position; a failure stops the
   run as a fault). The twin's move must be sound more often than R's moves:
   the 95% interval of the twin's soundness minus R's lies above 0.
2. **The null.** R2 against R, in place of T against R, must not pass step 3
   or step 4.

**Then, on his positions:**

3. **Likeness works** when the lift's 95% interval lies above 0 on both
   halves.
4. **Likeness misleads** when it lies below 0 on both halves.
5. **No better than a random match** otherwise.
6. **Not enough data (n=…)** when a half has fewer than 300 scored positions,
   whatever the numbers say.

## Also reported, without a rule

- **Coverage**: the share of his positions that are covered, the size of their
  bucket of positions with the same pieces, and the distance of their nearest
  match.
- The soundness of T, R, R2, N, U and A in each half.
- **Distance**: the soundness of every T and R match by its own distance, 0 to
  2, 3 to 5, 6 to 9, and 10 or more.
- **Strong players' own positions**: T's lift over R on the held-out strong
  positions, without the plant: whether likeness works where the index comes
  from.
- **Phase**, middlegame and endgame apart, and **structure**, positions with a
  structure the app names (`structureOf`) and without.
- **New to him**: the share of positions where a T move is sound, is not his
  move and has under 10% at his band by Maia-2, against the same for R: how
  often an example would show a working move he rarely finds.
- **When he went wrong**: among positions where his move is not sound, the
  share where at least one T move is sound, against R.

## Caveats

- **A move stands for a plan.** The strong player's next move is tested, not
  the moves that follow it.
- **The board alone.** The plan for this study also named Maia-2's reading of
  the position as part of alike. The app's Maia-2 gives move probabilities
  and no reading of who is better, so this round matches on the board alone;
  a reading can be added as one change in a later round.
- **Sound is a window.** In a quiet position several moves are often within 3
  win% of the best, so both arms can be sound often; the arms are paired by
  position for that reason.
- **Fitting by chance.** A random match's move fits his board only by chance,
  so R leans to moves that fit many boards: a king step, a rook to a file, a
  flank pawn. That is the baseline the question means, a strong player's move
  that happens to fit, and T has to beat it.
- **Mostly blitz.** Most index games are blitz (the mix is in
  `results/index.json`); his games are rapid.
- **The same month.** The held-out strong positions come from the same month
  as the index, so the same players can be on both sides; their result
  describes and decides nothing.
- **A coverage count ran first.** Before this rule was fixed, an index of the
  first 100,000 games was built and the share of his positions it covers
  counted, with no move scored. Their nearest matches were far, so the index
  was grown to 400,000 games. The final index's coverage
  (`results/coverage.json`) is counted after this rule is committed and before
  any move is scored.

## Who runs it

A Claude session on this repository's bridge, on CPU, four shards. Per-position
rows go under `private/positions-like-this/`, which git ignores; only
aggregates are committed (`results/`), written by the scripts, then the paper.
No language model judges anything here.

## Files

| File | What it does |
|---|---|
| `lib.mjs` | The study's constants, the board read from the side to move, the same-pieces key, the distance, the index's buckets, the matches and the random draws. |
| `stream.py` | Streams Lichess's September 2026 database and keeps the games between two players rated 2200 or more (`private/positions-like-this/strong-2026-09.jsonl.gz`), with a summary beside them. |
| `index.mjs` | Replays the strong games in the app's code and writes the index's positions and the held-out ones, one shard at a time (`private/positions-like-this/index-<i>-of-<n>.jsonl`, `heldout-<i>-of-<n>.jsonl`); `--summary` writes `results/index.json`. |
| `positions.mjs` | Reads his archive at the pinned commit and writes his positions that pass the filters before the referee's (`private/positions-like-this/his-candidates.jsonl`, `results/positions.json`). |
| `coverage.mjs` | Counts how many of his positions, and of a sample of held-out strong positions, the index covers, and how far their nearest matches are (`results/coverage.json`). No move is scored. |
| `score.mjs` | For each of his covered positions: the referee's best, Maia-2's policy at his band and the band above, the arms' moves, and every move's soundness, one shard at a time, resuming where a shard stopped (`private/positions-like-this/his-<i>-of-<n>.jsonl`). |
| `strong.mjs` | The same for the held-out strong positions, with the twin's move (`private/positions-like-this/strong-<i>-of-<n>.jsonl`). |
| `analyze.mjs` | Applies the rule and the descriptions; writes `results/positions-like-this.json` and `.md`. |

## Running it

```bash
make chess
python3 projects/positions-like-this/stream.py
for i in 0 1 2 3; do bridge/run.sh projects/positions-like-this/index.mjs --shard $i/4 & done; wait
bridge/run.sh projects/positions-like-this/index.mjs --summary
bridge/run.sh projects/positions-like-this/positions.mjs
bridge/run.sh projects/positions-like-this/coverage.mjs
for i in 0 1 2 3; do bridge/run.sh projects/positions-like-this/score.mjs --shard $i/4 & done; wait
for i in 0 1 2 3; do bridge/run.sh projects/positions-like-this/strong.mjs --shard $i/4 & done; wait
bridge/run.sh projects/positions-like-this/analyze.mjs
```
