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
| [blunder-hazard](../models/blunder-hazard/) | A position, ratings, clocks, the evaluation | The chance the mover blunders | The positions where players at a level go wrong |
| [think-time](../models/think-time/) | A position, ratings, clocks | The seconds spent on the move | Where a player moved too fast or too slow |
| [tactic-found](../models/tactic-found/) | A position after the opponent's mistake, the tactic's line, ratings, clocks | The chance the player finds the tactic in the game | Which missed tactics were within reach at the player's level |
| [practical-chances](../models/practical-chances/) | A position, ratings, clocks, the evaluation | The mover's expected score in the game | Which "equal" positions are hard to hold at the player's level, and which "lost" ones are still worth playing on |

## Next

### More from the models on the harness

What the first full runs ([the leaderboards](../README.md#leaderboards)) leave to try. Each is a
run or a recipe, not a new model. Nine of the sixteen network runs had their best valid epoch at
the last one, so each model has two runs with twice the epochs (`transformer-medium-long`,
`transformer-medium-hand-long`); what is left:

- **More games.** `game-positions` keeps 30,000 games of a month's, and without the hand features
  no network matched the trees on `blunder-hazard`.
- **One group of hand features left out at a time**, to say which of them a network still needs
  beside the board. The network that reads them is the best run of every model.
- **Blunder hazard on the positions that can still be blundered**, its own task, as its card says.
- **Puzzle difficulty from the position alone**, with no solution marked: how hard a tactic is to
  notice.
- **Tactic found, with the whole line as the label**: the player found the tactic only if the game
  followed it to the end, which a game answers while the opponent follows the puzzle's replies.

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
| Human moves, trained here | A position and a rating | A chance for every legal move | A move head. Maia-2 is what the app runs, and Maia-3 is the model to benchmark against first |
| Concept tagger | A position and its line | A chance for each puzzle theme | A head with one output a theme, and its metrics |
| Lines that work at a level | Opening lines at a rating band | How each line scores for people there, whatever the engine thinks | Nothing trained: a counted opening tree with intervals |
| A player over time | One player's games in order | Whether a weakness is closing | Games grouped by player, from the Lichess API |

The lab's first experiments tried three of these in another form (a Maia-2 benchmark, a theme
tagger on Maia-2's activations, an opening tree): [`history.md`](history.md) says what they found.

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
