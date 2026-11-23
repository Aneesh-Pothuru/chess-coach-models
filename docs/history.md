# Where the lab came from

The lab is on its third shape. This page says what the first two were, what they found, and where
to read them: none of their code is in the tree any more, and all of it is in the history.

## The first pipeline

The lab began as five experiments, each with its own script, on rated Lichess games of April 2019
(the Maia-2 benchmark on games of June 2025, the concept tagger on the puzzle database). Their
code, config and reports are at commit
[`4c9e92a`](https://github.com/Aneesh-Pothuru/chess-coach-models/tree/4c9e92a): `scripts/`,
`configs/config.yaml`, the modules beside the harness in `src/chess_coach_models/`, and
[`reports/`](https://github.com/Aneesh-Pothuru/chess-coach-models/tree/4c9e92a/reports).

This is the table its report script last wrote, copied as it stood at that commit:

| Model | Result |
|---|---|
| Graded-opponent scorer | Maia2 smoke on 2,500 held-out positions; sample PGN annotation complete |
| Maia2 independent benchmark | Top-1 51.5% (95% CI 50.9–52.1%) on 25,000 2025-06 rated rapid moves |
| Blunder hazard v0 | PR-AUC 0.197 vs absolute-eval baseline 0.055; Brier 0.049 |
| Repertoire optimizer | 7 strict-N rows below 1100; 12 at 1100–1400 |
| Concept tagger | Macro-AP 0.469 vs prevalence baseline 0.047 across 35 puzzle themes |

What each one was, and what it left behind:

- **Blunder hazard, version 0.** A LightGBM over sixteen board features
  ([report](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/blunder_hazard.md)).
  It showed that the size of the evaluation alone ranks blunders no better than chance and that a
  few board features do. The question lives on as
  [`blunder-hazard`](../models/blunder-hazard/), on newer games with clocks and a split by game;
  the two scores are not comparable, since the data, the features and the split all differ. Its
  open questions carry over: the ratings are Lichess's
  ([#2](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/2)), and the hanging-piece
  feature is a proxy for a full exchange search
  ([#5](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/5)).
- **Human moves.** A benchmark of [Maia-2](https://pypi.org/project/maia2/) as its authors
  published it, on rated rapid games from after its training data ends
  ([report](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/maia_benchmark.md)).
  Its accuracy landed near the published figures, and its confidence ran a little above its
  accuracy. The app runs Maia-2 in the browser. Training a human-move model here, and benchmarking
  Maia-3 beside Maia-2, are in [`ideas.md`](ideas.md).
- **Concept tagger.** A small head on Maia-2's frozen activations, naming 35 Lichess puzzle
  themes
  ([report](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/concept_tagger.md)).
  Endgame types and named mates came easiest, relational motifs such as deflection and clearance
  hardest. The app detects motifs by rule, so a tagger earns a place there only for the motifs
  rules miss. On the harness it would be a head with one output a theme
  ([`ideas.md`](ideas.md)).
- **Graded opponent.** Stockfish finds a game's mistakes and their refutations, and Maia-2 gives
  the chance a player at a rating finds each refutation
  ([report](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/graded_opponent.md)).
  Nothing was trained. The app took the idea: it prices a mistake by whether a player at the
  player's level finds the punishment. [`tactic-found`](../models/tactic-found/) now asks the
  same question of real games.
- **Opening repertoire.** A counted opening tree over 300,000 games by rating band: each line's
  score with its interval, how often it is played, how often an early blunder follows
  (reports [below 1100](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/repertoire_lt1100.md)
  and [from 1100 to 1400](https://github.com/Aneesh-Pothuru/chess-coach-models/blob/4c9e92a/reports/repertoire_1100-1400.md)).
  Below 1400, lines the engine rates level or worse scored well above their band's average. It is
  not in the app, which builds the player's repertoire from his own games and files.

It left the tree because none of it shared anything with the harness: its own features, its own
split, its own reports, a second set of dependencies. A question worth asking again is asked on
the harness, where it gets a split by game, a baseline and a leaderboard for free.

## The studies of the app's code

For a while the lab also held studies that measured the app's own code through the bridge: which
rating offset predicts the player's moves, how confident the app's odds are, how a review reads.
They were about the app, not models, and they left when the lab was rebuilt around models (commit
[`1899d96`](https://github.com/Aneesh-Pothuru/chess-coach-models/commit/1899d96); the commit
before it has them). One remains until it reports: [`projects/learner-solve-chance`](../projects/).
The coach narrator grew out of two of them and stayed, as
[`models/coach-narrator`](../models/coach-narrator/).

## The harness

What the lab is now is in [`design.md`](design.md): one folder a model, one harness for all of
them, and every result written by a script.
