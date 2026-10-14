# Maia's rating scale for this player

**The question.** Maia-2 names its rating bands on Lichess's scale. The app's
ratings come from chess.com, and its engine service converts them by adding a
hand-set 250 points (`DEFAULT_LICHESS_OFFSET` in the app's
`src/services/engine/maia/levels.ts`, which calls it "a default, not a
measurement"). Every Maia number the app gives rests on that offset: the
punish odds, how findable a move is, and the Maia bot's model of the player.
Which offset makes Maia-2 most likely to play the moves actually played in the
player's games, by him and by his opponents, each at their own chess.com
rating?

**The answer.** Not yet measured. The rule below was committed before any
number was computed.

## The moves

Every game in the app's archive at the pinned commit (the archive service,
reading `coach-log/`), from the standard start, with both players' ratings and
a clock after every ply. A move counts when it is the eleventh ply or later
and both players had at least 30 seconds left at the position (each side's
clock after its previous move), the protocol of the Maia papers that this
repository's Maia-2 benchmark also follows. Both sides' moves count. The
archive keeps chess.com's rating after each game, a few points from the
rating before it.

## The instrument

At an offset o, a move by a player rated r against one rated r' scores the
log of Maia-2's probability of the move played, with the mover's band at
`defaultMaiaElo(r, o)` and the opponent's at `defaultMaiaElo(r', o)`, run
through the app's Node engine service (`humanPolicy` with that band and
`opponentBand`). The offsets run over the range the app allows
(`LICHESS_OFFSET_RANGE`, 0 to 500) in steps of 25.

## The rule, fixed before any number was computed

The games, ordered by when they ended, alternate between a fitting half and a
held-out half. The fitted offset is the one with the highest mean
log-likelihood per move on the fitting half (a tie goes to the offset nearest
250). It replaces 250 only if, on the held-out half, its mean log-likelihood
per move beats 250's with the 95% interval of the difference, over 1000
bootstrap draws of the held-out games (seed 7), entirely above zero. Otherwise
250 stays.

Reported beside the verdict, not deciding it: the mean log-likelihood at every
offset, the 95% interval of the best offset over 1000 bootstrap draws of all
the games, and the share of moves that are Maia-2's first choice at the
fitted offset and at 250.

## Files

| File | What it does |
|---|---|
| `positions.mts` | Reads the archive through the app's archive service and writes the moves that count: the position before each, the move in UCI, both ratings and the half its game falls in. |
| `policies.mts` | Runs Maia-2 on every move at each pair of bands the offsets reach, through the app's Node engine service; `--shard k/n` splits the work between processes. |
| `fit.mjs` | Applies the rule and writes `results/`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/maia-rating-offset/positions.mts
for k in 0 1 2 3; do bridge/run.sh projects/maia-rating-offset/policies.mts --shard $k/4 & done; wait
bridge/run.sh projects/maia-rating-offset/fit.mjs
bridge/run.sh projects/maia-rating-offset/paper/generate.mjs
```

The moves name games, so they stay in `private/maia-rating-offset/`;
`results/` holds aggregates only.
