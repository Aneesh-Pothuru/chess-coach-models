# Model ideas

Every idea here reads a position (a FEN) or a game (a PGN with clocks) and predicts something
about people that an engine and board code cannot compute. An idea becomes a model when it has a
card with its rule, a task, and runs on the leaderboard ([`CLAUDE.md`](../CLAUDE.md), "Adding a
model"). The order below is the order they are worth building in.

## Built or measured

| Model | Reads | Predicts | What the app gets |
|---|---|---|---|
| [coach-narrator](../models/coach-narrator/) | Checked facts about a line | Two plain sentences | The line behind a mistake, said out loud |
| [puzzle-difficulty](../models/puzzle-difficulty/) | A position and its solution | The puzzle's rating | A rating for any tactic in the player's games |
| [blunder-hazard](../models/blunder-hazard/) | A position, ratings, clocks, the evaluation | The chance the mover blunders | The positions where players at a level go wrong |
| [think-time](../models/think-time/) | A position, ratings, clocks | The seconds spent on the move | Where a player moved too fast or too slow |
| [human-moves](../models/human-moves/) | A position and a rating | The move that level plays | Maia-2, as the app runs it |
| [concept-tagger](../models/concept-tagger/) | A position | Its tactical themes | A name for what a position is about |
| [graded-opponent](../models/graded-opponent/) | A game | Each mistake and the chance it is punished | A mistake priced by the player's level |
| [opening-repertoire](../models/opening-repertoire/) | Opening lines at a rating band | How each line scores for people | Lines that work at the player's level |

## Next

### Tactic found in a real game

After the opponent's mistake, does a player at this rating and with this much time find the move
that punishes it?

- **Reads.** The position after the mistake, the mistake itself as marks, the mover's and the
  opponent's ratings, the mover's clock and the time control.
- **Predicts.** The chance that the move played in the game is the first move of the tactic.
- **Data.** [`Lichess/chess-puzzles-with-games`](https://huggingface.co/datasets/Lichess/chess-puzzles-with-games)
  (CC0): each Lichess puzzle joined to the game it was cut from, with both ratings, the time
  control, and every move with its clock and its engine evaluation. A puzzle begins with the
  opponent's mistake, so the game's next move says whether the player found the answer.
- **Scored by.** Log loss, since the app would show the number as a chance. Compared with the
  tree baseline, and with what the puzzle's own rating predicts through the rating formula: the
  second comparison says whether solving a tactic as a puzzle and finding it in a game are the
  same skill.
- **Needs.** A dataset builder. The head and the bodies are the ones already here.
- **Why first.** It is the question the app asks most (was this within reach at his level), and it
  has a direct label on open data instead of a proxy.

### Practical chances

Between two people at these ratings, with these clocks, who wins from here?

- **Reads.** A position, both ratings, both clocks, the engine's evaluation.
- **Predicts.** The mover's expected score in the game.
- **Data.** The `game-positions` dataset already carries the label (`mover_score`).
- **Scored by.** Mean squared error of the expected score, against the engine's evaluation passed
  through the win-probability curve with the rating gap added.
- **Needs.** A task and a card. No new code.
- **What the app gets.** Which "equal" positions are hard to hold at the player's level, and which
  "lost" ones are still worth playing on.

### Pre-training on engine evaluations

Not a model but a run: train a body to predict Stockfish's evaluation on the open
[Lichess evaluations](https://database.lichess.org/#evals) (CC0, hundreds of millions of
positions), then start every task from it. It is worth keeping only where it beats the same body
trained from scratch on a task's own leaderboard.

### A published body under the lab's head

The strongest entries in the FedCSIS 2025 puzzle-difficulty challenge started from a human-move
model. Maia-2's body under the puzzle-difficulty head, fine-tuned, is the run that tests that
here.

## Later

| Idea | Reads | Predicts | Needs in the harness |
|---|---|---|---|
| Where to look | A position | The squares that matter (a tactic's squares, from the puzzle solutions) | A label per square |
| Game rating | A whole game with clocks | The rating the play looks like, by phase | A body over a sequence of positions |
| Human moves, trained here | A position and a rating | A chance for every legal move | A move head. Maia-3 is the model to benchmark against first |
| Concept tagger on the harness | A position | Its themes | A head with one output per theme |
| A player over time | One player's games in order | Whether a weakness is closing | Games grouped by player, from the Lichess API |

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
