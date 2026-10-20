# Are Maia-2's probabilities too sure of themselves?

**The question.** The app reads Maia-2's probabilities as chances: "players at
your level find the punishment about 3 times in 10", how findable a move is,
and the moves its Maia bot samples. This repository's Maia-2 benchmark found
Maia-2 more confident than right in every rating band (issue 7): its top
choice's mean probability runs 3 to 4 points above how often that choice is
the move played. Does a temperature for each band, fitted on Lichess games,
make the probabilities truer on the player's own games?

**The answer.** Not adopted. Fitted on Lichess, every band's temperature
softens Maia-2, and that improves the held-out Lichess moves, but it makes the
player's own games less likely and the punish odds' Brier score worse: on his
games, at the app's offsets, Maia-2 is already about as sure as it is right.
(Before the app read his opponents at their own offset, the punish odds' rise
held zero; at the split, on evidence rebuilt for it, it does not.) Scored by the app's Maia-2, the Lichess sample also
gives exactly the benchmark's first-choice count. The numbers are in the
paper, [`paper/paper.pdf`](paper/paper.pdf), and the script's report,
[`results/calibration.md`](results/calibration.md).

## The data

- **Fitting.** The benchmark's sample: 25,000 moves from rated rapid games on
  Lichess in June 2025, after Maia-2's training window, drawn by the
  benchmark's own sampler, unchanged (`scripts/stream_benchmark.sh`: 5,000
  moves per band, at most 8 per player and game, the eleventh ply on, both
  clocks at 30 seconds or more). Each move is scored by the app's Maia-2, the
  model the app ships, through its Node engine service, with each side at its
  own Lichess rating's band. The games, ordered by their ids, alternate
  between a fitting half and a held-out half.
- **Testing.** The player's games, never used to fit: the moves of
  [`maia-rating-offset`](../maia-rating-offset/), and the punish events of
  [`maia-punish`](../maia-punish/), each priced as the app prices it (the
  replier's band, facing an equal opponent). Both read the bands the app gives
  the two players: the player's chess.com rating at the app's offset for him
  (`DEFAULT_LICHESS_OFFSET`, the one `maia-rating-offset` keeps) and his
  opponents' at its offset for them (`OPPONENT_LICHESS_OFFSET`, from
  [`maia-player-offsets`](../maia-player-offsets/)), each person's in
  whichever input of Maia is theirs.

## The candidate

A temperature T for each Maia band: a move's probability becomes p^(1/T),
divided by the same sum over the position's legal moves. Each band's T is
fitted to maximise the likelihood of the moves played by movers in that band
in the fitting half; a band with fewer than 300 fitting moves keeps T = 1. A
temperature keeps every policy's order, so the top move and every ranking the
app reads stay as they are.

## The rule, fixed before any number was computed

The temperatures are adopted only if all three hold, each judged by the 95%
interval of the difference over 1000 bootstrap draws of games (seed 7):

1. On the Lichess held-out half, the mean log-likelihood per move of the
   moves played rises (the interval entirely above zero).
2. On the player's games, the same (the interval entirely above zero).
3. On the punish events, the Brier score of the punish odds, against whether
   the punishing reply was played, does not rise (the interval not entirely
   above zero). The events are `maia-punish`'s primary set, the replies whose
   evidence the review's deeper pass verified; all its non-book replies are
   reported beside.

Reported beside the verdict, not deciding it: each band's temperature, and
how far the top choice's mean probability sits from how often it is the move
played, before and after, on the Lichess held-out half and on the player's
games. Added before the first run, also deciding nothing: how often the app's
Maia-2 has the move played as its first choice over the whole sample, beside
the benchmark's count for its own Maia-2 on the same moves.

## Files

| File | What it does |
|---|---|
| `sample.py` | Turns the benchmark sampler's parquet into the rows the scorer reads. |
| `lichess-policies.mts` | Scores the Lichess moves with the app's Maia-2; `--shard k/n` splits the work between processes. |
| `bands.mjs` | The bands the app gives each player, shared by the scripts below. |
| `app-policies.mts` | Scores the player's moves at those bands where `maia-rating-offset`'s policies, one offset for both players, do not reach them; `--shard k/n` splits the work. |
| `punish-policies.mts` | Prices the punish events with the app's Maia-2 at the replier's band, and checks each against `maia-punish`'s. |
| `fit.mjs` | Fits the temperatures, applies the rule and writes `results/`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
PYTHON=.venv/bin/python scripts/stream_benchmark.sh
.venv/bin/python projects/maia-calibration/sample.py
for k in 0 1 2 3; do bridge/run.sh projects/maia-calibration/lichess-policies.mts --shard $k/4 & done; wait
for k in 0 1 2 3; do bridge/run.sh projects/maia-calibration/app-policies.mts --shard $k/4 & done; wait
bridge/run.sh projects/maia-calibration/punish-policies.mts
bridge/run.sh projects/maia-calibration/fit.mjs
bridge/run.sh projects/maia-calibration/paper/generate.mjs
```

It needs `maia-rating-offset` and `maia-punish` run first. Lichess's games
are public, but the player's are not, so everything per move stays in
`private/maia-calibration/`; `results/` holds aggregates only.
