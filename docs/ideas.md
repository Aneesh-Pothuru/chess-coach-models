# Model ideas

Every idea here reads a position (a FEN) or a game (a PGN with clocks) and predicts something
about people that an engine and board code cannot compute. An idea becomes a model when it has a
card with its rule, a task, and runs on the leaderboard ([`CLAUDE.md`](../CLAUDE.md), "Adding a
model"). The order below is the order they are worth building in.

## Built

| Model | Reads | Predicts | What the app gets |
|---|---|---|---|
| [coach-narrator](../models/coach-narrator/) | Checked facts about a line | Two plain sentences | The line behind a mistake, said out loud |
| [puzzle-difficulty](../models/puzzle-difficulty/) | A position and its solution | The puzzle's rating | A rating for any tactic in the player's games |
| [puzzle-difficulty-unsolved](../models/puzzle-difficulty-unsolved/) | The same position with its solution hidden | The puzzle's rating | How much of a tactic's difficulty shows before anyone knows the line |
| [where-to-look](../models/where-to-look/) | A puzzle's position with its solution hidden | For each square, the chance that the tactic's line leaves it or lands on it | A hint for a missed tactic that is a place on the board and not yet a move |
| [puzzle-themes](../models/puzzle-themes/) | A position and its solution | For each of 30 themes, the chance that the puzzle carries it | A name, in a coach's words, for what a tactic in the player's games was |
| [blunder-hazard](../models/blunder-hazard/) | A position, ratings, clocks, the evaluation | The chance the mover blunders | The positions where players at a level go wrong |
| [think-time](../models/think-time/) | A position, ratings, clocks | The seconds spent on the move | Where a player moved too fast or too slow |
| [tactic-found](../models/tactic-found/) | A position after the opponent's mistake, the tactic's line, ratings, clocks | The chance the player finds the tactic in the game | Which missed tactics were within reach at the player's level |
| [position-evaluation](../models/position-evaluation/) | A position | An engine's evaluation, as the mover's chance of winning | Nothing by itself: a body the other models start from |
| [practical-chances](../models/practical-chances/) | A position, ratings, clocks, the evaluation | The mover's expected score in the game | Which "equal" positions are hard to hold at the player's level, and which "lost" ones are still worth playing on |
| [game-rating](../models/game-rating/) | A player's moves through one game, with the clocks and what each move lost | The player's rating | What one game looked like beside the player's usual level |
| [human-move](../models/human-move/) | A position, ratings, clocks | For each legal move, the chance that it is the one the player makes | A check on the human-move model the app runs (Maia-2 is a run of the same leaderboard), and a human-move model that reads the clock |

## Next

### More from the models on the harness

What the first full runs ([the leaderboards](../README.md#leaderboards)) leave to try. Each is a
run or a recipe, not a new model. Nine of the sixteen network runs had their best valid epoch at
the last one, so four models were given two runs with twice the epochs (`transformer-medium-long`,
`transformer-medium-hand-long`). Those are in, and each card says what they found: both are kept
in puzzle difficulty and in think time, the one on the board alone in tactic found, neither in
blunder hazard. All but think time's stopped before the end of the longer schedule, and think
time's had flattened by it, so a still longer one is not on this list. Practical chances has
none: its networks stopped early on the first schedule. Two studies then ran on every model
([`design.md`](design.md), "A run that changes another"), and each card says what they found:

- **`games`: fewer training games.** The reference trees and the best twelve-epoch network on half
  and on a quarter of the games. The network is worse beyond the noise on half the games in all
  five models, and it loses more than the trees do in every one. Its lead over the trees comes
  with the data: in blunder hazard the two are level on a quarter of the games, in tactic found on
  half. Only in practical chances do fewer games cost the trees nothing the test rows can show.
- **`features`: one group of hand features left out at a time**, from the reference trees and, on
  `blunder-hazard`, from the best network too. Material costs the trees something in every model
  and passed pawns next to nothing in any. The two models that read a line lean on it most (the
  line's counts in puzzle difficulty, its first move in tactic found). In blunder hazard the
  material group is most of what the hand features give the network, and the attackers near the
  kings, which cost the trees, cost the network nothing.

What is left:

- **Larger builds of the datasets.** The games study says each doubling still pays, and pays a
  network most, and each dataset has more to take: `game-positions` keeps 30,000 games of a
  month's, `puzzles` a quarter of the puzzles that pass, `tactics` half of them. The measurement
  to make first is the games study turned round: the best network and the trees on twice and on
  four times the training games, scored on the test rows the model has now, so the gain is paired
  with the run on today's games.
- **Tactic found, with the whole line as the label**: the player found the tactic only if the game
  followed it to the end, which a game answers while the opponent follows the puzzle's replies.
- **Game rating, asked for the opponent's rating**: the same learners on the same rows with the
  other player's rating as the label. Lichess pairs players of like rating, so this says how much
  of a reading is the level of the game and how much is the player.
- **Game rating by phase**: a rating for the opening, the middlegame and the ending of one game,
  which needs a label for a part of a sequence ([`design.md`](design.md), "Growing it").
- **Game rating from more games, and from a body that already reads a board**: its dataset keeps
  50,000 games of a month's, and a network over a sequence does not start from another run yet.

### More from the body that learned an engine's evaluation

[`position-evaluation`](../models/position-evaluation/) trains the medium transformer on six
million positions of the open [Lichess evaluations](https://database.lichess.org/#evals) (CC0,
some two hundred million positions), and each model has two runs that start from that body
(`transformer-medium-pretrained`, `transformer-medium-hand-pretrained`). A start is kept on a
model only where it beats the same run started from nothing there. What is left to try once
those say whether it pays: more of the file, more epochs, a larger body, and a lower learning rate
for the run that starts from it.

### More published models on the human-move rows

[`human-move`](../models/human-move/) scores Maia-2's published rapid model on the lab's own test
rows beside the runs trained here. Its authors have since published
[Maia-3](https://github.com/CSSLab/maia3) and recommend it for new work. It is the next run of
that leaderboard: on the same rows it says whether the app should move to it. Two more things the
model waits for: a closer look that reads a move, so two named runs can be set against each other
by their paired difference and the test rows cut by the clock, and a larger build of the dataset,
if the `games` study says more games pay.

### A published body under the lab's head

The strongest entries in the FedCSIS 2025 puzzle-difficulty challenge started from a human-move
model. Maia-2's body under the puzzle-difficulty head, fine-tuned, is the run that tests that
here.

## Later

| Idea | Reads | Predicts | Needs in the harness |
|---|---|---|---|
| Lines that work at a level | Opening lines at a rating band | How each line scores for people there, whatever the engine thinks | Nothing trained: a counted opening tree with intervals |
| A player over time | One player's games in order | Whether a weakness is closing | Games grouped by player, from the Lichess API |

The lab's first experiments tried the first of these, and two of the models above in another form
(an opening tree, a Maia-2 benchmark, a theme tagger on Maia-2's activations):
[`history.md`](history.md) says what they found.

## Checks on the player's own scale

Every model above is trained on Lichess ratings. The player's rating is on another site's scale,
and the app already maps one to the other for its human-move model. A model that is ported gets
one more check first: its score on the player's own games, read through the bridge, with only the
aggregate written here. It is a check, never training data.

## Not here

- **Other sites' games as training data.** The lab trains on open data, and the Lichess database
  is CC0. Chess.com serves games with clocks through its public API, but its user agreement
  restricts using its content to train models or build datasets without written permission, so
  the lab does not collect them.
- **A language model that judges chess.** A language model here says facts that an engine, a
  human-move model, board code or data produced, and is checked against them.
- **Engine strength.** Stockfish is the judge of what is true on the board. Nothing here tries to
  play better chess.
