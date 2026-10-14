# Are Maia-2's probabilities too sure of themselves?

**The question.** The app reads Maia-2's probabilities as chances: "players at
your level find the punishment about 3 times in 10", how findable a move is,
and the moves its Maia bot samples. This repository's Maia-2 benchmark found
Maia-2 more confident than right in every rating band (issue 7): its top
choice's mean probability runs 3 to 4 points above how often that choice is
the move played. Does a temperature for each band, fitted on Lichess games,
make the probabilities truer on the player's own games?

**The answer.** Not yet measured. The rule below was committed before any
number was computed.

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
  [`maia-rating-offset`](../maia-rating-offset/), at the offset that project's
  rule keeps, and the punish events of [`maia-punish`](../maia-punish/), each
  priced as the app prices it (the replier's band, facing an equal opponent).

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
games.

## Files

| File | What it does |
|---|---|
| `sample.py` | Turns the benchmark sampler's parquet into the rows the scorer reads. |
| `lichess-policies.mts` | Scores the Lichess moves with the app's Maia-2; `--shard k/n` splits the work between processes. |
| `punish-policies.mts` | Prices the punish events with the app's Maia-2, at the offset `maia-rating-offset` keeps. |
| `fit.mjs` | Fits the temperatures, applies the rule and writes `results/`. |
| `paper/` | The paper. |

## Running it

```bash
make chess
PYTHON=.venv/bin/python scripts/stream_benchmark.sh
.venv/bin/python projects/maia-calibration/sample.py
for k in 0 1 2 3; do bridge/run.sh projects/maia-calibration/lichess-policies.mts --shard $k/4 & done; wait
bridge/run.sh projects/maia-calibration/punish-policies.mts
bridge/run.sh projects/maia-calibration/fit.mjs
bridge/run.sh projects/maia-calibration/paper/generate.mjs
```

It needs `maia-rating-offset` and `maia-punish` run first. Lichess's games
are public, but the player's are not, so everything per move stays in
`private/maia-calibration/`; `results/` holds aggregates only.
