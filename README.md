# Chess Coach Models

The research lab for a personal chess coaching app. The app, in a private repository
([Aneesh-Pothuru/chess](https://github.com/Aneesh-Pothuru/chess)), reviews one player's rapid
games, coaches at that player's level, and runs daily, weekly and monthly Claude Code routines over
the games. This repository measures the app: how it judges a move, explains it, prices a mistake
and chooses what to train. A change that wins here goes to the app as its own pull request.

Two kinds of work live here:

- **Research projects** ([`projects/`](projects/)). Each is one question put to the app's own code,
  with the scripts that answer it, the aggregates they wrote and a short LaTeX paper.
- **Models trained on public Lichess games** ([`src/`](src/), [`scripts/`](scripts/),
  [`reports/`](reports/)). The lab's first work: what a coach can learn about human play beyond the
  engine's best move.

## Research projects

### Game Review's judgments

| Project | The question | What the app took |
|---|---|---|
| [accuracy-vs-chesscom](projects/accuracy-vs-chesscom/) ([paper](projects/accuracy-vs-chesscom/paper/paper.pdf)) | How far is Game Review's accuracy from chess.com's for the same game, and what closes the gap? | Shipped: Game Review's accuracy instrument |
| [explain-top-move](projects/explain-top-move/) ([paper](projects/explain-top-move/paper/paper.pdf)) | Does Game Review explain the engine's better move truthfully, and say why it is better? | Shipped: every kept round's explanation is in the app |
| [maia-punish](projects/maia-punish/) ([paper](projects/maia-punish/paper/paper.pdf)) | Can Maia-2's odds that the opponent finds the punishing reply be trusted on the player's games? | Shipped: Game Review prices each error by these odds |
| [judge-in-context](projects/judge-in-context/) ([paper](projects/judge-in-context/paper/paper.pdf)) | Should a move's verdict read win% on a curve fitted to the mover's rating? | Not adopted: the judge did not prefer the fitted verdicts |
| [phone-vs-routine](projects/phone-vs-routine/) ([paper](projects/phone-vs-routine/paper/paper.pdf)) | Does Game Review on the player's phone name the same mistakes and blunders as the routine's review of the same game? | Not yet: each device differs from the routine on about one serious error in eleven, near the line between a mistake and an inaccuracy. Game Review shows the coach's review beside the device's, and a second look that starts with the engine's memory cleared is the next round |
| [winprob-parity](projects/winprob-parity/) ([paper](projects/winprob-parity/paper/paper.pdf)) | Does the lab compute the same win% as the app? | A check: the same curve within ±1000 cp; past that, the lab's clamp parts from the app's |
| [findable-move](projects/findable-move/) ([paper](projects/findable-move/paper/paper.pdf)) | When the sound move players at the player's level would find is not the engine's best, does it hold up as well when they play on from it? | Not yet: unclear by its rule. It costs about what the engine says, a little, and more when the engine's best is a capture or a check, so the review could show it beside the best as a sound move he would find, not a better one |

### Maia-2, the human model

| Project | The question | What the app took |
|---|---|---|
| [maia-rating-offset](projects/maia-rating-offset/) ([paper](projects/maia-rating-offset/paper/paper.pdf)) | Which chess.com-to-Lichess rating offset makes Maia-2 most likely to play the moves in the player's games? | Confirmed: the app's +250 stays |
| [maia-calibration](projects/maia-calibration/) ([paper](projects/maia-calibration/paper/paper.pdf)) | Does a temperature for each Maia band, fitted on Lichess, make its probabilities truer on the player's games? | Not adopted: it helps on Lichess and hurts on the player's games, where Maia-2 is already about as confident as it is right |

### The coach and the training

| Project | The question | What the app took |
|---|---|---|
| [think-time-rapid](projects/think-time-rapid/) ([paper](projects/think-time-rapid/paper/paper.pdf)) | In 10-minute games at the player's level, where does a long think cut serious errors, and do the app's long-think triggers mark those moments? | Not yet: no trigger shows that a long think pays, and as written the triggers ask for most of the clock |
| [band-above](projects/band-above/) ([paper](projects/band-above/paper/paper.pdf)) | Where do players 200 points above the player's level give away fewer points a game, and how much of a point given away shows in the result? | Not yet: tense positions and the move after the opponent's error separate the bands, and the leak ledger's 0.6 discount stays |
| [focus-backtest](projects/focus-backtest/) ([paper](projects/focus-backtest/paper/paper.pdf)) | Does the weekly focus's grade tell a real improvement from none? | Shipped (chess PR 74): the focus is graded by a permutation test over a longer window |
| [detector-themes](projects/detector-themes/) ([paper](projects/detector-themes/paper/paper.pdf)) | Do the app's motif labels name the tactic a position holds, judged on public puzzles? | Shipped (chess PR 81): a miss is filed under its pin, skewer or discovered attack. A labeller that also names deflections and trapped pieces passed the held-out test and is a candidate for the app |
| [drill-decks](projects/drill-decks/) ([paper](projects/drill-decks/paper/paper.pdf)) | Do the misses deck's theme words and the plan quiz ask what they say they ask? | In part: the misses' motif words came with chess PR 81, and the threat search and plan questions with one right answer are still candidates |
| [praise-gate](projects/praise-gate/) ([paper](projects/praise-gate/paper/paper.pdf)) | Does the live coach, holding its instant praise for the engine's verdict, praise only the moves that earn it? | Shipped with chess PR 73. About one praised move in sixteen still gave away 2 win% or more, narrowly short of the study's one in twenty, so a stricter 1 win% bar is the next round |
| [learner-solve-chance](projects/learner-solve-chance/) ([paper](projects/learner-solve-chance/paper/paper.pdf)) | When the learner gives a solve chance for a puzzle, how often does the player solve it, and should a set aim from the player's record in its theme rather than the headline rating? | Adopted on the owner's call (chess PRs 78 and 79): sets aim from the theme's record, and round 2 decides whether that stays and whether the chance holds for one-move and longer puzzles alike |
| [book-advice](projects/book-advice/) ([paper](projects/book-advice/paper/paper.pdf)) | Does the advice of two chess books for club players hold at the player's level, by Stockfish and Maia-2 on 10-minute games? | In part: the conversion goals and tripwire moved to what players a band up reach (chess PR 108), practice games warn on the two signs of danger to the king that hold past the opening (chess PR 111), and a take-it-or-not drill answers the trap share (chess PR 109). Errors are rarer right after winning material, so the scan stops singling out that moment (chess PR 122), and an even trade of pieces when lost costs saved games that the engine's eval does not show, so practice games say so (chess PR 124). The trade praise, the review's top move in lost positions, the scan on backward moves, the punish practice and the plan drill's margin stay |
| [period-writer](projects/period-writer/) ([paper](projects/period-writer/paper/paper.pdf)) | Do the weekly and monthly reviews explain a position better when the prompt asks for the threat, why the move played fails and what the better move keeps, and which false claims do those reviews make? | Not kept: the sentence changed the writing, but the judge could not tell it from run-to-run variation and the held-out reviews made more false claims, so the live prompts stay. The strict check now refuses a line tagged Played that the game did not play (chess PR 125), and the rule ledger files the king-walk rule under converting (chess PR 126) |
| [judge-factors](projects/judge-factors/) ([paper](projects/judge-factors/paper/paper.pdf)) | With material level, do the Judge the position drill's factors point to the side the engine says is better, in 10-minute games at the player's level? | Confirmed: all five do, so the drill keeps them. Pawn structure is the weakest sign and whose move it is matters too, so naming the move in the drill is a candidate for its own round |
| [his-habits](projects/his-habits/) ([paper](projects/his-habits/paper/paper.pdf)) | Which kinds of move does the player make more or less often than players 200 points above him would in his own positions, and which of those differences cost him? | Not yet: no verdict, because the known-fault control failed (he leaves pieces hanging no more often than the band above, and less often than his own band). Pawn breaks, fewer retreats, more checks and pawn weaknesses of his own show on both halves and cost no more than his other differences; a next round needs a positive control |
| [positions-like-this](projects/positions-like-this/) ([paper](projects/positions-like-this/paper/paper.pdf)) | Can the app find strong players' positions like the player's, whose move works in his too? | Nothing: likeness works by the rule fixed first, but the nearest strong players' moves are sound about half as often as his own and near matches are rare, so the app keeps no search for similar positions; a next round matches on the pawn structure and tests a plan |
| [structure-breaks](projects/structure-breaks/) ([paper](projects/structure-breaks/paper/paper.pdf)) | When a break the app teaches for the player's pawn structure can be played, is it a sound move there, more often than his own? | Not yet: the break misleads. A break merely on is sound about one time in five, no more often than a random move, while his move is sound more than half the time, and strong players show the same, so the app should not offer a structure's break as the plan whenever it is on, and the count of breaks played is no target |
| [break-ready](projects/break-ready/) ([paper](projects/break-ready/paper/paper.pdf)) | Does the coaching method's checklist before a break, read as board code, tell a sound break from an unsound one? | Not yet: no signal from the piece questions (pieces aimed, rooks ready, force on that side) among the breaks the blunder check calls safe, while the blunder check itself does tell; even a ready break trails his own move, so the verdict on a break stays the engine's |

Each project's README states its question, the rule that decides it (written before the first
number) and how to run it. [`projects/README.md`](projects/README.md) says where the data comes from,
gives the order that reproduces every project, and says how to start a new one.

## How a question is measured

- **On the app's own code.** A study imports the app's instruments through the bridge and never
  re-implements one. A lab instrument that should agree with the app's gets a parity eval, like
  [winprob-parity](projects/winprob-parity/).
- **The rule comes first.** The metric, the train and held-out split and what counts as better are
  written down before a run. A round changes one thing and is kept only when train and held-out
  both improve beyond the noise, by a paired bootstrap.
- **Model judges get controls.** A model judge compares two texts blind and in both orders, and a
  streak of wins is checked against the same text on both sides and a decoy of the same length
  that says nothing new.
- **Scripts write the numbers.** A report is written by its script and names the app commit and the data
  it measured. A paper's `paper/generate.*` writes every number, table and position into
  `paper/generated.tex` and refuses to write when a claim the paper makes no longer holds.
- **A winner is ported, then measured again.** The port is its own pull request on the app, with
  this repository's report as its evidence; the app's code and docs never cite the lab. Once the
  port merges, `bridge/chess.json` moves to the merge commit and the study reruns there.

## The bridge to the app

[`bridge/chess.json`](bridge/chess.json) pins the app commit every study measures, and the commit of
the research records the app's repository keeps.

| Command | What it does |
|---|---|
| `bridge/checkout.sh` | Fetches the pinned app once into `.cache/chess/<sha>`, runs `npm ci` there and prints the directory. `bridge/checkout.sh records` does the same for the records. `CHESS_DIR` or `CHESS_RECORDS_DIR` overrides either. |
| `bridge/candidate.sh <name> <app path>=<file> ...` | Prints a candidate: a copy of the pinned app with those files replaced. A study measures it by running with `CHESS_DIR` pointed at it. |
| `bridge/run.sh projects/<project>/<script>.mjs` | Runs a script under the app's own tsx, where `chess(path)` from `bridge/lib/chess.mjs` imports any app module by its path, such as `src/core/score/index.ts`. |

From Python, `chess_coach_models.bridge.run_eval(script, payload)` sends JSON on stdin and reads JSON
from stdout. The app's repository is private, so the bridge needs read access to it: bridge studies
run locally or in a Claude session, and this repository's CI runs none of them.

## The player's data stays private

This repository is public, and the app serves one player. That player's games, notes, calibration
answers and profile stay in the app's repository, or under `private/` here, which git ignores. A
study reads them at run time, writes anything per game under `private/<project>/` and commits only
aggregates. A paper may show a few positions from the player's games, as boards with their moves,
FEN and UCI, but never a link to a game, a game id or the account name.
[`scripts/check_private.py`](scripts/check_private.py) fails CI on the shapes that data takes, with
extra patterns from a repository secret.

## Models trained on Lichess games

These models learn from the [Lichess Open Database](https://database.lichess.org/) (CC0). The
scorer, the hazard model and the repertoire optimizer read rated games from April 2019, in one
seeded stream that stops at configured caps, so the archive is never stored; the benchmark reads
June 2025, and the concept tagger the puzzle database. A move's quality is the win% it gives away on Lichess's published conversion, a blunder
gives away more than 20 points, splits keep each game whole within its rating band, and ratings are
Lichess's.

<!-- RESULTS_START -->
| Model | Result |
|---|---|
| Graded-opponent scorer | Maia2 smoke on 2,500 held-out positions; sample PGN annotation complete |
| Maia2 independent benchmark | Top-1 51.5% (95% CI 50.9–52.1%) on 25,000 2025-06 rated rapid moves |
| Blunder hazard v0 | PR-AUC 0.197 vs absolute-eval baseline 0.055; Brier 0.049 |
| Repertoire optimizer | 7 strict-N rows below 1100; 12 at 1100–1400 |
| Concept tagger | Macro-AP 0.469 vs prevalence baseline 0.047 across 35 puzzle themes |
<!-- RESULTS_END -->

`make reports` writes this table and every page under [`reports/`](reports/) from the committed
metrics.

- **Maia-2 benchmark** ([report](reports/maia_benchmark.md)). Maia-2's rating-conditioned move
  prediction, scored on rated rapid games from June 2025, well after its training data ends, with
  Maia's own evaluation filters. Its accuracy lands near the published figures. On Lichess its
  confidence runs a little above its accuracy; on the player's games, at the app's rating offset, it
  does not ([maia-calibration](projects/maia-calibration/)).
- **Graded-opponent scorer** ([report](reports/graded_opponent.md)). Stockfish finds the moves that
  give away more than 10 points of win%, and Maia-2 gives the chance that a player at a band, or 200
  points above it, finds the refutation.
- **Blunder hazard** ([report](reports/blunder_hazard.md)). A LightGBM model over board features
  (material, phase, checks, mobility, a hanging-piece proxy, passed pawns, king pressure, castling
  rights, rating and the current eval) that predicts, before a move, whether it will be a blunder,
  calibrated on validation games. Ranking positions by the size of the eval alone does no better than
  chance. Features from Maia-2 added too little to justify a Torch dependency.
- **Repertoire optimizer** ([below 1100](reports/repertoire_lt1100.md),
  [1100 to 1400](reports/repertoire_1100-1400.md)). An opening tree of the first 12 plies of 300,000
  rated games, with each line's score, Wilson interval, popularity, early trap density and Maia-2
  findability, recommending only lines played at least 2,000 times. Below 1400, lines the engine
  rates level or worse can score well above their band's average
  ([`reports/SUMMARY.md`](reports/SUMMARY.md) names two).
- **Concept tagger** ([report](reports/concept_tagger.md)). A small head on frozen Maia-2
  activations, trained on Lichess puzzle themes, names tactical motifs far above their base rates.
  Endgame types and named mates come easiest; relational motifs such as deflection and clearance
  come hardest.

The app runs Maia-2 itself, in the browser, and prices an error by whether a player at the
player's level finds the punishment: the scorer's idea, which [maia-punish](projects/maia-punish/)
measured on the player's games. The hazard model, the repertoire optimizer and the concept tagger
are not in the app.

## Running it

Python 3.11 to 3.13, `zstd` and Stockfish (`brew install zstd stockfish`, or
`apt-get install zstd stockfish`). The bridge needs Node and read access to the app's repository,
and the papers need TeX Live with `latexmk` (`projects/README.md` names the collections).

```bash
make setup     # the full environment in .venv: Torch, LightGBM, Maia2
make test      # every test; CI runs the ones that need no models or data
make chess     # the pinned app with its npm dependencies, and the research records
make parity    # the lab's win% against the app's
make papers    # every project's generated.tex, then its PDF
```

[`projects/README.md`](projects/README.md) has every project's reproduction, in order. The Lichess
models:

```bash
make data        # stream Lichess 2019-04 and stop at the configured caps
make eval        # train and evaluate the scorer, the hazard model and the repertoire optimizer
make reports     # regenerate reports/ and the results table above
make benchmark   # the Maia2 benchmark on the configured 2025-06 month
make concepts    # stream the puzzle database, then train and evaluate the concept tagger

.venv/bin/python scripts/score_pgn.py games.pgn --output scored.json
.venv/bin/python scripts/mine_hazard.py --fen "$FEN" --elo 1250
.venv/bin/python scripts/build_repertoire.py --query-pgn games.pgn --band 1100-1400 --perspective white
.venv/bin/python scripts/tag_concepts.py --fen "$FEN"
```

Every setting lives in [`configs/config.yaml`](configs/config.yaml): source months, rating bands,
sample caps, thresholds, the Stockfish budget and devices. The committed evaluations run Maia2 on the
CPU, because Apple's MPS crashed on a 5,000-position batch, and run each stage in its own process,
because LightGBM's OpenMP pool and Torch can stall together on macOS. Downloaded games, datasets,
model weights and trained binaries are gitignored; code, configs, reports, aggregates and papers are
committed.

## Open issues

- [#2](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/2): calibrate the hazard model
  for chess.com ratings (the rating offset for Maia-2 is settled by maia-rating-offset).
- [#3](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/3): scale the Lichess run to
  production sample caps.
- [#4](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/4): the neural hazard head, kept
  out until it beats LightGBM on an independent sample.
- [#5](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/5): replace the hanging-piece
  proxy with a full exchange search.
- [#6](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/6): Maia2 batch stability on
  Apple's MPS.
- [#7](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/7): Maia2's calibration by rating
  band (maia-calibration answers it for the player's games).
- [#8](https://github.com/Aneesh-Pothuru/chess-coach-models/issues/8): sample the Maia2 benchmark
  from more than one stream offset or month.

## Licenses

- The [Lichess Open Database](https://database.lichess.org/) exports are CC0.
- [`maia2`](https://pypi.org/project/maia2/) is MIT-licensed; its weights download on first use. The
  original Maia-1 weights are GPL and are not used here.
- This repository's code is MIT-licensed ([`LICENSE`](LICENSE)).
