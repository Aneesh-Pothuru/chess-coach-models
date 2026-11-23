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

**Other shapes of network.** On blunder hazard and tactic found every network that reads the board
alone is below the trees, small or medium, tower or transformer, and only the transformer that is
also handed the hand features is ahead. The two bodies had only been set side by side at their
small size, where the tower is level with the transformer or a little ahead. So each of the four
models whose best run is a network, and human-move, gets runs that change the body of its medium
transformer and nothing else (the plans `bodies-first` and `bodies-rest`): a tower of the same
size that weighs its channels by the whole board, a hybrid of two blocks of the tower under five
layers of the transformer, and the transformer with its attention told what each piece attacks and
what it stands behind ([`design.md`](design.md), "Bodies and a head"). One study leaves the
offsets out of the transformer's attention, to say what they are worth, and puzzle difficulty and
human-move get a transformer three times larger. Each is kept by the rule every run is kept by:
better than the run it changes on valid, and on test beyond the noise. What is expected, written
before any of them ran: the most from attention told the attacks on blunder hazard and tactic
found, where the hand features that count attackers and loose pieces are what the board-only
networks lack; little from any shape on think time, which leans on the clock; and more from size
on puzzle difficulty than on the models that read 30,000 games.

The first two models have their runs (puzzle difficulty and blunder hazard, the plan
`bodies-first`), and neither expectation about them held. On blunder hazard no shape leaves the
noise of the transformer it changes, the attention told the attacks among them. On puzzle
difficulty that attention is the largest gain any one change has made to a network that starts
from nothing, the tower is a small gain from a cheaper network, the hybrid is worse, and the
transformer three times larger is worse than the medium one on the same rows. The best run of both
models is still the transformer that started from the body trained on an engine's evaluations.
Each model's card says what it found, and the lab's paper sets the models side by side.

The other three have theirs now (think time, tactic found and human-move, the plan `bodies-rest`),
and the expectations held no better. On think time, where little was expected of any shape, the
attention told the attacks is the largest gain made from nothing to the transformer that reads the
board alone, which it takes from behind the trees to well ahead of them, and the tower is kept and
is the best run that starts from nothing. On tactic found, where the most was expected of that
attention, it changes nothing, on the board alone or with the hand features. The tower is kept
there too, and the hybrid is worse. On human-move, whose pairs are not made yet, the attention told
the attacks is the best network trained here, a transformer three times larger cannot be told from
the medium one, the tower and the hybrid are far behind every transformer that has its offsets,
and without the offsets the transformer falls to the level of the trees.

Across the five models: the attention told the attacks pays in three and does nothing in the two
whose label is a yes or a no about one move in a game. The tower is kept in three of the four
models that answer with one number, and is well behind where the answer is a move. The hybrid is
kept nowhere, and size alone never paid. In the four models that have both a start from the body
and runs of another shape, the best run is still the transformer that starts from the body.

What is left:

- **Larger builds of the datasets.** The games study says each doubling still pays, and pays a
  network most, and each dataset has more to take: `game-positions` keeps 30,000 games of a
  month's, `puzzles` a quarter of the puzzles that pass, `tactics` half of them. The measurement
  to make first is written and waits for its runs (the plan `more`): the games study turned
  round. Each of the five models with a games study gets its reference trees and its medium
  transformer with hand features on twice and on four times the training games, from a larger
  build of its dataset (`puzzles-all`, `game-positions-120k`, `tactics-all`, which holds twice
  the games and no more). Each is scored on the test rows the model has now, so its gain is paired
  with the run on today's games, and a network is given fewer epochs so that it takes as many
  steps ([`design.md`](design.md), "A run on more games"). What is expected, written before any
  of them ran: the networks gain more than the trees in every model, as the study read forward
  says; the most from tactic found, where half of the games cost the most, and the least from
  practical chances, where fewer games cost the trees nothing the test rows could show. A run is
  kept only when it is better on valid and on test beyond the noise, like any change. If
  the runs on four times the games are kept, the next builds are larger still, and the
  architecture test above is made on the larger build.
- **Tactic found, with the whole line as the label**: the player found the tactic only if the game
  followed it to the end, which a game answers while the opponent follows the puzzle's replies.
- **Game rating, asked for the opponent's rating**: the same learners on the same rows with the
  other player's rating as the label. Lichess pairs players of like rating, so this says how much
  of a reading is the level of the game and how much is the player. The first full runs make it
  the run to add: with the player's band held fixed a reading falls as the opponent gets weaker,
  for the trees nearly as far as for the networks (its card and its paper). A fit of the readings
  on both ratings says the same in rating points for each point of the opponent's.
- **Game rating on a longer schedule**: three of its four networks were at their best in the last
  epoch they were given, and the larger transformer, behind the two small ones after every epoch,
  was still improving at the last.
- **Game rating on settled ratings only**: a game's record says by how many points it moved each
  rating, which is large for a new account. The builder does not read it yet, and the largest
  misses of the first runs are games whose two ratings are far apart.
- **Game rating by phase**: a rating for the opening, the middlegame and the ending of one game,
  which needs a label for a part of a sequence ([`design.md`](design.md), "Growing it").
- **Game rating from more games, and from a body that already reads a board**: its dataset keeps
  50,000 games of a month's, and a network over a sequence does not start from another run yet.
  On half and on a quarter of the games its trees lose little, and no network is in that study.
- **Where to look and puzzle themes from the body that learned an engine's evaluations**: their
  first runs start from nothing. That start added most where a puzzle's line is hidden from the
  learners, which where to look does too, so it is the first of the two.

### More from the body that learned an engine's evaluation

[`position-evaluation`](../models/position-evaluation/) trains the medium transformer on six
million positions of the open [Lichess evaluations](https://database.lichess.org/#evals) (CC0,
some two hundred million positions), and each model has two runs that start from that body
(`transformer-medium-pretrained`, `transformer-medium-hand-pretrained`). A start is kept on a
model only where it beats the same run started from nothing there. What is left to try once
those say whether it pays: more of the file, more epochs, a larger body, and a lower learning rate
for the run that starts from it.

The architecture test adds two runs to that list, ahead of the rest. The first is the attention
that is told what each piece attacks, started from that body. On puzzle difficulty and on think
time the two are the changes the transformer that reads the board alone gained most from, each made
alone, and they can be made together without a new body: what the attention is told enters with
weights that start at nothing ([`design.md`](design.md), "Bodies and a head"), so such a network
takes the body as it is and begins as that body does. On think time it is made on the board alone
as well as with the hand features, since there the network that was told the attacks did better
without them. On human-move the same network is the first to put under the move head from the body.
The second is a tower that learns the same evaluations and is then a body to start from: the tower
is kept in three models and is the best run from nothing in two of them, and it cannot start from a
transformer's body.

Every run was trained once. A second training matters most for the small gains (the tower's in
puzzle difficulty) and for the one odd result: on think time the transformer that is told the
attacks is better without the hand features than with them.

These runs are written and wait for their GPU (the plans `told-start` and `shapes-start` in
[`colab/plans/`](../colab/plans/)):

- **The attention that is told the attacks, from the body.** Puzzle difficulty and think time get
  it on the board alone and with the hand features (`transformer-medium-attacks-pretrained`,
  `transformer-medium-hand-attacks-pretrained`), each set against that model's run from the same
  body. Human-move gets the body under its move head first (`transformer-medium-pretrained`) and
  then the same change. The body is the one the earlier runs started from, fetched from where it
  is published and held to its hash ([`design.md`](design.md), "Starting from another run").
- **A tower with a body of its own.** position-evaluation trains the tower on the same evaluations
  (`conv-medium`), and puzzle difficulty, think time and tactic found, the three models that kept
  the tower, start theirs from it (`conv-medium-hand-pretrained`).
- **A second training** (the study `seed`): on puzzle difficulty the transformer with the hand
  features and the tower, and on think time that transformer and the two runs that are told the
  attacks. Each pair of trainings says how far two trainings of one config lie apart.

What is expected, written before any of them ran. The telling adds to the start on the board
alone in both models, by less than it added from nothing, since a body that has learned an
engine's evaluations has some of it already. With the hand features it adds a little in puzzle
difficulty and nothing in think time, as from nothing. On human-move the start is kept and the
telling is kept on top of it, since that network is short of games and had not finished learning.
The tower gains from a body of its own in all three models. Whether it then passes the
transformer that starts from its body is open: it is likeliest in think time and tactic found,
where the tower leads from nothing. Two trainings of one config lie one or two hundredths of the
reference's step apart, which is about the tower's lead in puzzle difficulty, and think time's
odd result is there the second time.

### More published models on the human-move rows

[`human-move`](../models/human-move/) scores Maia-2's published rapid model on the lab's own test
rows beside the runs trained here. Its authors have since published
[Maia-3](https://github.com/CSSLab/maia3) and recommend it for new work. It is the next run of
that leaderboard: on the same rows it says whether the app should move to it. Two more things the
model waits for: a closer look that reads a move, so two named runs can be set against each other
by their paired difference and the test rows cut by the clock, and a larger build of the dataset.
The `games` study of its first full runs says more games pay: the small and the medium transformer
are level, and on half of the training games the medium one names fewer moves, on a quarter fewer
still (its card). So the larger build comes before any larger network there.

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
