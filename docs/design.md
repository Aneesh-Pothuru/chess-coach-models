# The design of the lab

The lab makes models for a chess coaching app. An engine already says which move is best, and
board code already says what a move does. What neither can compute is what people do: which move a
player at a level finds, where they go wrong, how hard a tactic is for them, how long they think.
Each model here answers one such question from a position or a game, is trained on open data, and
has to beat a plain baseline on games it never saw.

This page says how the lab is built and why. [`CLAUDE.md`](../CLAUDE.md) has the rules for working
in it, [`ideas.md`](ideas.md) the models that could come next, and [`history.md`](history.md) what
the lab was before.

## One shape for every model

A model that reads a position is always the same five steps: get labelled positions from open
data, turn a board into numbers, fit a learner, score it on held-out games, and compare it with a
baseline. Written once for each model, those steps drift apart, and two models stop being
comparable. So they are written once for all of them, and a model is what is left: one folder,
`models/<model>/`, of small files.

| What a model brings | Where in its folder |
|---|---|
| The question, the rule for what counts as better, what the results say | `README.md`, its card |
| Its dataset, its label, what a learner may read, its metric, its reference run | `task.yaml` |
| Its learners, and the runs that change one thing in one of them | `configs/<run>.yaml` |
| What its runs wrote | `results/` |
| How its results are cut for a closer look | `analysis.yaml` |
| Its paper: the prose, what the prose reads, the PDF | `paper/` |

A model has no code of its own. Adding one touches the harness only when no dataset has its rows
yet (a builder in `data/` and a recipe in `datasets/`) or when it needs a new kind of input or
output (a body or a head in `nets/`). `tasks.py` reads a task from its folder and checks it, and
`paths.py` is the one place that knows where a model's files, a dataset and a run's weights are
kept, so a test can stand a whole lab up in a temporary folder.

The input is a position as a FEN, with what the task knows about it: the moves that led to it or
follow from it, both ratings, both clocks, the time control. The output is one number, a quantity
or a chance, or a chance for each of a fixed list of candidates: the squares of the board, or the
tags a task names ("An answer that is a set", below), or a chance for each move the position
allows ("An answer that is a move", below). A row can also be a sequence of positions, a
player's moves through a game, under one label ("A row that is a sequence", below). What changes
from idea to idea is the label and what the model may read.

A task names the context numbers its learners read, and can keep part of a dataset from them:
`marks` lists the only marks on squares they may read, and `hand` the only groups of hand
features. So one dataset answers two questions. `puzzle-difficulty` reads a puzzle with its
solution marked, and `puzzle-difficulty-unsolved` reads the same rows with the solution hidden,
its squares, its length and what its moves do. What a task hides, no learner of that model can
reach: the limit is applied where the arrays are prepared (`train/learners/base.py`), before any
learner sees them.

## Datasets

A dataset is built from a recipe, `datasets/<name>.yaml`: an open source, filters, a fixed sample
and a split. `lab data <name>` writes it under `data/processed/<name>/` as four files:

- `rows.parquet`: one row a position, with its key, its game, its split, its labels and every
  number a learner may read;
- `tokens.npy` and `marks.npy`: each board as the networks read it;
- `manifest.json`: the source, its licence, the recipe, how many rows were read and kept, the
  commit of the code that built it, and the names of the marks and hand features.

A dataset whose rows are sequences keeps three more files, its steps ("A row that is a sequence",
below).

Three choices hold for every dataset.

**Streams, never copies.** A month of Lichess games is tens of gigabytes. The builders read it as
a stream (`data/lichess.py`) and keep only the rows the recipe asks for, so a dataset builds on a
laptop or a free notebook. The evaluations file, twenty gigabytes of positions with an engine's
verdict, is read the same way: most lines are turned away on a hash of their position before they
are parsed, and the build stops downloading at its count (`data/evaluations.py`). A source that comes as files that cannot be streamed (the puzzles
joined to their games, fourteen Parquet files) is fetched one file at a time, and each file is let
go once its rows are read (`data/tactics.py`). A download that stops early is an error, never the
end of the data, and so is anything that stops the rows on their way to the worker pool
(`fed` in `data/store.py`): a build fails rather than keep a part or wait for ever.

**A sample is a hash.** Whether a puzzle or a game is in the sample is decided by a hash of its
id (`data/splits.py`), so the same recipe builds the same rows on any machine, and a bigger sample
contains the smaller one.

**Whole games move together.** The split is a hash of the game, so no game has positions on both
sides of it. Puzzles are grouped by the game they were cut from. The same grouping is used when a
score's noise is measured.

Those two hashes are what let a dataset grow. A recipe can be a **larger build** of another:
`datasets/puzzles-all.yaml` is `of: puzzles`, and keeps every puzzle that passes where `puzzles`
keeps a quarter. The two may differ only in how much of the source they keep (a sample, a count
of games, a count of files), and `larger_of` in `data/__init__.py` refuses a recipe that changes
anything else. Since the sample and the split are hashes and a stream is read in order, every row
of the smaller build is in the larger one, in the same split. A larger build is there to train
on: no task names one as its dataset, and no run is scored on one ("A run on more games", below).

Datasets are not committed. A recipe builds the same rows on any machine, and the manifest
carries a fingerprint that proves it: a hash of the boards and of every exact column. A run record
names the fingerprint of the data it read, and the leaderboard refuses to rank runs that read
different data.

## A board as the networks read it

`encode/board.py` turns a FEN into 64 tokens seen from the side to move: the mover's pieces are
tokens 1 to 6, the opponent's 7 to 12, an empty square 0. When Black is to move the board is
turned, so the mover always plays up the board and a model learns one game instead of a white one
and a black one.

What a task knows about squares travels as marks, one bit a channel in a 16-bit number per
square: the en passant square always, then the last move's squares, or for a puzzle the squares of
the move that set it up and of its solution. Everything that is not about a square is a context
number: castling rights, ratings, clocks, the time control, the ply.

The tree baseline cannot read 64 tokens, so `encode/hand.py` computes what a person would count:
material, mobility, checks and captures on offer, hanging pieces, passed pawns, attackers near each
king, and for a puzzle the shape of its solution (how many moves, how many quiet ones, whether it
starts with a sacrifice, how far the first piece travels). These are the features a network has to
do better than. They come in named groups (`GROUPS`: material, mobility, hanging, pawns, kings,
setup, first-move, line, and for a player's moves through a game accuracy, tempo, choices), so a
task can hide a group and a run can leave one out.

## Bodies and a head

A network is a body and a head (`nets/model.py`). The body turns tokens, marks and context into
one vector for the board and one for each square. The head, two layers, turns the board's vector
into the task's output: one number, or one logit for each of a task's tags. For a task that asks
about every square it reads each square's own vector instead, and gives that square its logit. For
a task that asks which move is played, a head of its own gives every pair of squares a logit
("An answer that is a move", below). Three bodies ship so a leaderboard can say what the
architecture is worth on each task, and every body works under every head.

**The square transformer.** Each square is a token and every square attends to every other from
the first layer, so a bishop on a1 and a king on h8 meet at once. Attention is told about the
board's geometry by a learned bias for each offset between two squares, one per head: files, ranks,
diagonals and knight hops are all offsets, so a head can learn to look along them. The context
numbers enter as one more token. This is the design the strongest published human-move models have
moved to. Two settings change what its attention is told:

- `attacks: true` tells it what each piece attacks on this board. An offset says that two squares
  share a diagonal, and not that a pawn stands between them. So for each pair of squares attention
  is told four things, each with a learned weight per head: whether the piece on the square that
  asks attacks the square it looks at, whether it is attacked from there, and the same two for a
  piece that stands behind one man (a pin, a skewer, a battery). They are worked out inside the
  network from the tokens, with two tables and no search (`encode/relations.py`, which a test
  holds to a chess library on every piece, square and position). The weights start at nothing, so
  such a network starts as the one that is told nothing.
- `geometry: false` leaves the offsets out, to measure what they are worth.

**The convolutional tower.** Residual blocks of 3x3 convolutions over the 8x8 board, the kind of
network the first AlphaZero-style engines used. It is cheap, it trains on a CPU, and it sees
further only as it gets deeper. It is here as the honest alternative: where it matches the
transformer, the cheaper model wins. With `squeeze` every block also weighs its channels by a mean
over the whole board (squeeze-and-excitation), which is how the towers of Leela and the first Maia
see the far side of the board early.

**The hybrid.** A few blocks of the tower (`convs`), then layers of the transformer over the
squares they leave: what stands next to what first, then what looks at what. Maia-2 puts its two
parts in this order, with its attention over groups of channels where this one's is over squares.

Sizes are settings of a run (`dim`, `depth`, `heads`), not code, and a run that changes only the
body of another names that run as its `base`, so the two are set against each other on the same
test games.

Where a row is a sequence of positions, any of the three reads each of them and one more body
reads them in order ("A row that is a sequence", below).

## Learners and the run record

A run is one config file and names one of five learners, each a file under `train/learners/` with
one function, `fit`:

- `constant`: one number for every row, or for a set the same chances for every row. The floor: a
  model that does not beat it learned nothing.
- `column`: a column of the dataset, times a constant, read as the prediction. Nothing is fitted.
  It is the comparison for a task where a number already claims to answer the question, as an
  engine's win probability does for who wins.
- `rating-formula`: the rating formula's expected score of a player against something rated,
  from two columns the run names. Nothing is fitted. It is the comparison for a task where a
  rating already claims to answer the question, as a puzzle's rating does for a tactic.
- `gbm`: gradient-boosted trees on the context numbers (`gbm-context`), or on those and the hand
  features (`gbm-hand`). `gbm-hand` is the reference every other run is compared with.
- `net`: a body and the head, trained by one loop for every task: AdamW, a warm-up then a cosine
  schedule, mixed precision on a GPU, gradient clipping, and the epoch that scored best on the
  valid rows kept.

A chance is calibrated before it is scored: a slope and an intercept are fitted on the valid rows
and applied to the test rows, so a model is not marked down for being sure of itself in a way one
line can fix. For the rating formula the same two numbers are the shift and the stretch between
two rating scales.

`lab train <model> <run>` writes `models/<model>/results/<run>.json`: the config, what the learner
did (trees grown, epochs, the features the trees leaned on), the processor it ran on, the versions
of Python and the libraries it was made with, the commit of the code (marked when the harness, a
recipe or a run config had changes that were not committed),
the fingerprint of the data it read, and the scores on valid and test with their intervals, by
rating band, and for a chance its calibration table. Its predictions on the test rows and its
weights go under `artifacts/runs/`, which git ignores, and the record names the weights by their
hash, so a card can say which file a score belongs to.

**Starting from another run.** A network's config can name a run whose body it begins from:
`learner: {init: {model: position-evaluation, run: transformer-medium}}`. The two must be the same
body at the same size. The piece and square embeddings, every block and the last norm carry over;
a mark on squares both tasks know keeps its weights and one only the new task has starts new; the
layers that read the numbers beside the board carry over only when both tasks read the same
numbers; the head never does (`start_from` in `train/learners/net.py`). The weights are read from
this machine's `artifacts/runs/`, so the run they come from is trained first, and `lab all` skips
a run whose start is not there yet. The record names the file it started from by its hash and
says what was taken. [`position-evaluation`](../models/position-evaluation/) exists to be started
from: its label is an engine's evaluation, which says nothing about people, and its body is the
one every other model's `transformer-medium` has. Its task says so with `purpose: body`. Such a
model is built, trained, scored and ranked like any other, and the lab's paper lists it apart
from the models it sets side by side.

**A run that changes another.** A run that changes one thing in another names that run as its
`base` and writes only the change; its config is the base's with its own blocks laid over it
(`run_config` in `train/run.py`). Two changes need no code: `data: {train_share: 0.5}` trains on
half of the training games, chosen by a hash of the game so a quarter is inside a half and the
valid and test rows are never touched, and `learner: {without: [kings]}` leaves a group of hand
features out. A run that also names a `study` is there to say what one thing is worth, not to be
a candidate. `lab all <model>` trains a model's own runs, and `--runs study:games` asks for a
study by name.

**A run on more games.** A run can take its training rows from a larger build of its task's
dataset: `data: {train_on: puzzles-all}`. Its valid and test rows are still the task's own, read
from the larger build where it holds them, so the run is scored on the rows every other run of
the model is scored on, compared with the reference row by row, and ranked on the same
leaderboard. Before it trains, the larger build is held to the task's own, and the run stops on
the first thing that fails (`prepare` in `train/learners/base.py`): every valid and test row is
in it with the same board, marks, game and split; no game among its training rows is the game of
a valid or a test row; every training row of the task's own build is among its training rows;
and the label, the context numbers and the hand features agree on the rows a run is scored on.
The record's `dataset` is the build the run is scored on, and `train_dataset` names the larger
one by its fingerprint. `train_share` takes its share of the larger build's training games, so
half of a build four times the size is twice the games. A network on more games is given fewer
epochs, so that it takes as many steps as the run it changes and only the games differ. Such a
run names the run it changes as its `base` and is a candidate, kept by the rule below. `lab all`
builds the larger build its runs name before the first of them.

**A run that was tried and not kept.** A candidate is kept as a run of the model's own only when
it beats the run it changed on valid and on test beyond the noise. One that does not is still a
measurement of what its change is worth, so it is filed, not deleted: its config names the run it
changed as its `base` and what it measured as its `study` (`epochs` for a longer schedule, `start`
for a body begun from another run's, `games` for more training games), and
`lab file <model> <run>` writes the same two names into
its record and writes the leaderboard again (`train/filing.py`). A record is filed only as what
it was trained with: a config with another setting is refused. The closer look is then of runs as
they were filed before, so `lab analyse` is run again where the predictions are, and until it is
a paper of that model does not build.

A record is complete in itself. When a run finishes it is compared, row by row, with the
reference run trained on the same machine, and the gain is written into the record. A leaderboard
is then written from the records alone, so the trees can be trained on a desktop and the
transformers on a rented GPU and still share one table. Two things keep that honest: every record
names its data by a fingerprint of the boards and the exact columns, and each gain names the score
of the reference it was measured against, which the leaderboard holds to the reference it shows.

## Evaluation

`evals/metrics.py` holds the metrics: for a quantity the root mean squared error, the mean
absolute error, R squared and the rank correlation; for a chance the area under the
precision-recall curve, the area under the ROC curve, the Brier score, the log loss and the
calibration error; for a set the average precision, how often the first candidate is right, and
the log loss, each a mean over the rows. A task names one of them as primary, on its card, before
its first run.

**Noise is measured over games.** Positions of one game are not independent, so every interval
resamples whole games (`evals/bootstrap.py`).

**A gain is paired.** A run and the reference are scored on the same resampled games, and the
difference is reported with its interval. A gain counts when that interval leaves zero out. Two
models that are both good on easy games and bad on hard ones are compared fairly this way, where
two separate intervals would overlap and hide a real difference.

**Test rows are for the final score.** The epoch, the number of trees and the calibration are all
chosen on valid rows.

`lab eval` writes `results/leaderboard.md` and `results/leaderboard.json`; `lab report` writes
the README's table from every model's leaderboard. No result in this repository is typed.

**A study is listed apart.** A study run is not ranked with a model's own runs, and it is never a
model's best run. Its leaderboard lists it under its study, with the run it changes, what it
changes setting by setting (read off the two records' configs), how many rows it trained on, and
both scores. It keeps its predictions on the test rows, which the closer look reads, and no
weights: nobody will run it. A paper gives the games and the features study tables of their own;
a run filed under any other study was tried as a candidate, and its pair stands with the other
pairs, beside the run it changed.

## An answer that is a set

Two kinds of task give a row a set and not a number: which of a fixed list of candidates are
right. For `squares` the candidates are the 64 squares of the mover's board, and the label is a
list of marks: a square is right when it carries any of them. So a dataset's marks can be a
model's answer, and such a task must name the marks its learners may read, none of which is one
it predicts (`tasks.py` refuses a task that shows its answer). For `tags` the label is a column of
words separated by spaces and the candidates are the words the task names.
[`where-to-look`](../models/where-to-look/) is the first of one kind and
[`puzzle-themes`](../models/puzzle-themes/) of the other. Both read the rows
`puzzle-difficulty` reads, so neither needed a dataset.

A label is then one column a candidate, 1 where it is right (`labels` in
`train/learners/base.py`), and a prediction is a chance for every candidate. The rest of a run is
what it was:

- **The floor** gives every row the same chances: each candidate's share of the training rows.
- **The trees** still say one chance at a time. For tags it is a booster a tag on the row's
  numbers, each stopped on its own valid log loss, and a tag no training row carries has no
  trees. For squares it is one booster that reads a row a square: the position's numbers, where
  the square is, the piece on it, the marks the task shows, and with the hand features what a
  person would count on the square (`encode/squares.py`): who attacks it and with what, whether
  the piece on it can be taken or is pinned, how many of the mover's moves start and end there,
  how many of those take or give check, and how far each king is. A position is 64 rows to them,
  so such a run trains on a share of the training games (`data: {train_share: 0.1}`), and the
  learner refuses a run that would read more than sixteen million rows.
- **A network** is the same body under a head with a logit a candidate (above), each trained as
  a yes or no of its own.
- **Calibration** is one slope and one intercept through every candidate's chance, fitted on the
  valid rows. One line moves no candidate past another inside a row, so it changes the log loss
  and no ranking.

**Every score is a mean over the rows of a score a row gets by itself** (`row_scores` in
`evals/metrics.py`). Average precision ranks a row's candidates by their chance and takes the
mean, over the right ones, of the share of right ones among the candidates ranked at least as
high, with ties scored together: it is 1 when every right candidate comes before every other, and
with one right candidate it is one over its rank. First right is whether the candidate given the
highest chance is right. The log loss reads every chance as a yes or no of its own. A row with no
right candidate (a puzzle that carries none of the themes) has no ranking to score: it is left
out of the first two and counted in the third.

Because a score is a mean of the rows' scores, its noise is measured by drawing the games again
and averaging their rows' scores, without ranking anything twice
(`intervals_of_rows` and `paired_of_rows` in `evals/bootstrap.py`). A run's predictions keep
what was right, every candidate's chance and each row's scores, so a run is compared with the
reference from the two files of row scores. A record of a model that predicts tags also gives
each tag by itself, as one yes or no over the test rows: how many carry it, and how well its
chance tells those rows from the rest. The leaderboard prints that table for the best run, since
a mean over rows is led by the common tags.

What a set does not have yet: the tables of the closer look and the sections of a model's own
paper that are drawn from them read one number a row. So `lab analyse` writes such a model's
pairs alone (a run set against the run it changed, from what each test row scored in the two
runs' predictions), which is what the rule for a change needs, and the model has a leaderboard
and no paper of its own. The lab's paper sets its runs on the one scale with every other
model's, which needs only the records, and reads its pairs as it reads any model's.

## An answer that is a move

A third kind of task, `moves`, asks which move was played. Its candidates are no fixed list: a
row's are the moves its own position allows, so one row has twenty and the next has forty.
[`human-move`](../models/human-move/) is the first such model, and it reads the rows
`blunder-hazard` and `think-time` read.

**A move is a pair of squares on the mover's board** (`encode/moves.py`): the square it leaves
times 64 plus the square it reaches, with Black's board turned over as the networks see it. A
promotion is one move whatever piece the pawn becomes, so a row's candidates are its position's
legal moves as pairs, each once, in rising order. They are worked out from the rows' FENs and kept
beside the dataset under its fingerprint, so a dataset that other models' records name is not
built again. A row's label is the place of the played move among its candidates, and a row whose
move its position does not allow is refused. A prediction is a chance for each candidate, adding
up to one a row, with no number where a row has no candidate.

- **The floor** gives every legal move the same chance.
- **The trees** read a row a legal move (`move_rows` in `train/learners/gbm.py`): the position's
  numbers, where the move leaves and lands, the piece that moves, what it takes, the marks on
  both of its squares, and with the hand features what a person would count of the move
  (`move_features`): who attacks each of its two squares and with what, whether the piece there
  can be taken or is pinned, and whether the move gives check, castles, promotes or takes in
  passing. One booster says the chance that a row's move is the one played, and a position's
  chances are scaled to add up to one. A position is about thirty rows to them, so such a run
  trains on a share of the training games, and the learner refuses a run that would read more
  than eight million rows.
- **A network** is a body under a head of its own (`MoveNet`): each square's vector is read
  twice, once as a square to leave and once as a square to reach, and a move's logit is how well
  the two match. The loss and the chances are taken over the pairs the position allows.
- **A published model can be a run** (`train/learners/maia.py`). Maia-2 is read by its own
  package on each row's position and the two ratings, its chances are taken over the moves the
  position allows, and they are laid on the row's candidates, a promotion's four choices added.
  Nothing is trained, and the run is scored on the same rows by the same scores as the others. A
  test holds this reading to the package's own reading of one position at a time
  (`tests/test_maia.py`), and a run marked `needs: maia2` waits where the package is not
  installed.
- **Calibration** is one temperature for every row's chances, fitted on the valid rows. It moves
  no move past another, so it changes the log loss and the calibration and no ranking, and a
  record keeps the log loss from before it.

**The scores** are again means over the rows of what a row scores by itself. First right is
whether the move given the highest chance is the one played, the move-matching accuracy the
human-move papers report. In the first three is whether it is among the three given the highest.
The log loss is minus the log of the chance given to the move played. Moves given the same chance
share the credit.

What a move does not have yet: the closer look's tables and a model's own paper, as for a set.
Its closer look is its pairs alone. A run that names a base is set against that run there, and
two runs neither of which names the other, a network trained here and Maia-2, are a pair when
the model's `analysis.yaml` asks for it under `pairs`.

## A row that is a sequence

A row can be a sequence of positions and not one: a player's moves through a game.
[`game-rating`](../models/game-rating/) is the first such model. A row is one player in one game
and its label is one number, that player's rating, so everything after the learner is what it
was: the scores, the leaderboard, the closer look, the paper.

**The dataset keeps the positions beside the rows.** A dataset of sequences is the four files of
any dataset and three more, its steps: `step_tokens.npy`, `step_marks.npy` and `step_numbers.npy`
hold every row's positions one after another, each as a board, its marks and the numbers that go
with it (the clocks, the seconds the move took, the winning chances before it and what it lost).
A row says where its own begin and how many they are (`first_step`, `steps`), the manifest names
a step's numbers in order (`steps`), and a build is refused when the three do not fit
(`check_steps` in `data/store.py`). The steps' boards and marks are in the fingerprint. A row
keeps a board of its own as well, the position of the player's costliest move, which is what a
paper shows of it. A task can name the only numbers of a step its networks may read (`steps` in
its `task.yaml`), as it can the marks.

**The trees read counts.** They cannot read a sequence, so `encode/hand.py` counts over the
player's moves what a person would (`game_features`): how much the moves lost on average, at
worst and how often more than a bar, how the clock was used, and how many moves there were to
choose from. The counts come in three groups (accuracy, tempo, choices), so a run can leave one
out.

**A network reads every position, then the positions in order** (`GameBody` in `nets/model.py`).
The body the other models use reads each position, with that position's own numbers where a row
of one position has its context numbers. Its vector for the board is then one token of a short
transformer over the row, with a learned vector for each place in the sequence, and the row's own
context numbers (the time control, the game's length) are one more token. The head reads that
token beside the mean of the positions' tokens. A batch is as long as its longest row and a
shorter row is filled out: the board body reads the real positions alone and nothing attends to
the rest, so a row's score does not depend on the rows it is scored with, which a test holds it
to. A row is tens of boards, so a batch is tens of rows where another model's is hundreds.

What a sequence does not have yet: a network over one does not start from another run's body
(`learner.init` is refused for it), and a row has one label for the whole game, none for a part
of it.

## The closer look

A leaderboard says which run is best. It does not say where a model is right and wrong, and a
score alone is a poor guide to whether the app can use it. `lab analyse <model>`
(`evals/analysis.py`) reads the dataset and every run's test predictions, on the machine that has
them, and writes `results/analysis.json`: small tables, committed, that any machine can draw from.

- **Slices.** The test rows by one column at a time: the task's own bands first, then whatever the
  model's `analysis.yaml` names (the clock, the number of moves in a line, a puzzle's themes). For
  each group: how many rows, what happened there, what each run said on average and how it scored,
  and the paired gain over the reference of the best run that is not the reference, with its
  interval over resampled games. A slice is where a claim such as "the network helps most on long
  lines" is checked.
- **Grids.** What happened and what each run said by two columns at once, such as the mover's
  rating against the clock.
- **Reliability.** Test rows in equal groups by what a run said, against what happened: for a
  chance the calibration curve, for a quantity the average truth with its spread.
- **Ranking and closeness.** For a chance, what its top and bottom shares are worth as a flag: how
  many of the rows it ranks highest were hits. For a quantity, how close a prediction lands: the
  middle and the tail of the error, and the share inside a named distance.
- **Beside the reference.** How alike each run's predictions are to the reference's, row by row,
  and how often the run is the closer of the two.
- **Examples.** Positions chosen by rule, never by eye: ordinary rows picked by a hash of their
  key, the rows the best run is surest of, and its largest misses each way.
- **Pairs.** Two runs the plan names, the first set against the second on the same resampled test
  games: a run beside the run it changed (twice the epochs, the hand features added), or beside
  the number it has to beat. A leaderboard gives every run's gain over the reference; a pair is how
  one thing changed in a run is judged. Every run that names a `base` is paired with it whether
  the plan asks or not, and that pair is all a study run is read for: the tables above are of a
  model's own runs. The pairs are also all the closer look holds of a model whose answer is a set
  or a move: its other tables read one number a row, and a pair needs only what each test row
  scored, which a run's predictions keep.
- **Shown.** One model can ask another's question with something hidden: the same rows, the same
  label and the same test rows, with less for a learner to read (puzzle difficulty without its
  solution). Its plan names the other model as `shown`, and each run here is then set against the
  run of the same name there, on the same resampled test games: how much better the run that is
  shown more scores is what the thing shown is worth to that learner. The best run of each model
  is one more pair, and that pair is cut by every slice of the plan, which is where the thing shown
  is worth most and least. Two models that do not share their dataset, kind, label and metric are
  refused.

A run's predictions are read only when its record names the build of the data on the machine,
they are of that build's test rows in order, and they score what the record says. Every number is
rounded to six significant digits, so two machines write the same file.

## The paper

A card says briefly what a model is for and what its results mean. A paper says it at length: the
data, what a model reads, every run, the closer look cut by cut, example positions, what the app
can use today and what the model does not say yet. `lab paper <model>` (`papers/`) draws one from
the model's committed files, on any machine, and compiles `models/<model>/paper/paper.pdf`.

- **The prose types no number.** `paper/paper.tex` is typed and says what the numbers mean. Every
  number is a value it reads with `\V{key}`, and every table, figure and board is a block it
  places with `\block{name}`. Both are written into `paper/generated/` from the run records and
  the closer look, and only what the prose reads is written. `lab paper <model> --list` prints
  every value and block there is.
- **A build is strict.** A value or a block the prose reads and the files cannot give stops the
  build before LaTeX runs, so a paper cannot print a hole, or a claim about a run that is gone.
- **A block fits the page.** How wide a table comes out is known only once its numbers are, so a
  block that is one table or one picture is wrapped in `\fit` (`tex.fit`, `papers/preamble.tex`):
  wider than the text it is drawn smaller, at the text's width, and one that fits is left as it is.
- **Switches.** What depends on files a model may not have yet stands inside a switch: `\iflook`
  for the closer look, `\ifpairs`, `\ifvariants`, `\ifshapes`, `\ifgames` and `\iffeatures` for
  pairs, runs that change how a network is trained, runs of another shape, and the two studies,
  `\ifchanges` for any of those five, and `\ifchance`
  for a model that predicts a chance. `\ifshown` is on where the model is read against one that
  is shown more and that one has runs (the table of the two leaderboards side by side,
  `papers/shown.py`), and `\ifshownpaired` where a closer look has measured the pairs. `\ifmore`
  is on where a run on more games than the run it changes, from a larger build of the dataset, has
  been set against that run: the games study's table then has those runs above the run on all the
  games, its curve runs on to their right, and their values are under `more.<the run changed>`. A
  switch that is off takes its side of the prose out, so one text serves before and after a batch
  of runs lands.
- **Shared sections.** What is the same for every model is typed once under `papers/`: how a board
  is read, the learners, how a result is scored, what a closer look is, how one change at a time
  is read (`changes.tex`), how the two studies are read (`studies.tex`), the preamble and the
  references. A paper says what its own runs found between those two: which changes it kept by
  the lab's rule, read off each pair (`pair.<run>.<the run it changed>.kept`, beside its gain on
  the valid rows and its verdict on the test rows).
- **Every run by name.** The closer look resamples one pair of runs group by group: the best run
  that is not the reference, against the reference. A paper can set any other run beside the
  reference by its name. What that run said in each group and cell is a value, and its figures
  and tables are blocks (`slice-<key>-said-<run>`, `slice-<key>-<run>`, `grid-<key>-off-<run>`,
  `reliability-<run>`). The practical-chances paper reads the engine's number that way. The
  reference's lead over such a run inside a group is a difference of two scores with no interval,
  and a paper says so where it shows one.
- **One look for every figure** (`papers/charts.py`). A run keeps its colour and its mark in every
  figure of every paper, a run that changes another is drawn as that run with a broken line, and
  every figure has its numbers in a table.

`lab paper <model> --smoke` draws the same prose from the small check's records, under
`artifacts/smoke-papers/`. It proves the paper compiles and is never a result. A machine without
LaTeX writes the generated files and leaves the PDF.

The build catches a value that is gone. It cannot catch a sentence that is no longer true, so a
paper's prose is read again whenever its model's runs change. A claim that could turn with a new
run is written on generated words (which groups are ahead, which verdict a pair got), so that it
turns with the run.

### The lab's own paper

`lab paper` with no model draws `papers/lab/paper.pdf`, which sets the models side by side
(`papers/overview.py`): the models in one table, every run of every model on one scale, what a
network adds to the trees model by model, one change measured in model after model, what the
runs cost, and the part of each model's findings a coach would want first. It is built as a
model's paper is, from `papers/lab/paper.tex`, and `lab paper --list` prints what its prose can
read.

- **Every model under its name.** The prose reads anything a model's paper can: a model's value
  as `puzzle-difficulty.best.score`, its block as `puzzle-difficulty-leaderboard`. What only the
  lab as a whole can say is under `lab`.
- **One scale.** Models are scored in different units, so the lab's paper measures a run by the
  reference's step: how much better the trees with the hand features are than the floor on the
  model's own metric. A run's share of the step is 0 for the floor and 100 for the reference. A
  gain is a number of hundredths of the step, and its interval is the paired gain's interval
  divided by the step. The step is a measured number too and its noise is left out, so the scale
  is for setting models side by side, and a claim about one model rests on the paired gain in
  that model's own units.
- **One change, the run it was made in, model by model.** A pair of runs that differ in exactly
  one setting is a change of one kind: the hand features, the epochs, the start. The table of
  changes has a kind a block, the run the change was made in a pair of columns and a model a
  row, and the prose reads a count of the models where the change is better beyond the noise,
  inside it, or worse (`lab.change.<kind>.over.<run>.said`). A study's run counts when the one
  thing it changes is one of these.
- **The two studies, model by model.** The games study is a table with a model a row and a
  column for each share of the games under each run it was made on (`lab.games.<run>.half.said`),
  and the features study one with a group of hand features a row and a model a column, under the
  reference (`lab.features.<group>.said`, and for a model the group whose loss costs it most,
  `lab.features.in.<model>.most.group`). A features study made on another run is read in that
  model's own paper.
- **A model the lab has for its body.** A model whose task says `purpose: body` is in the table
  of models, in the table of costs and in the appendix with its leaderboard, and its values and
  blocks are under its name like any model's. No count of how the models compare holds it (in
  how many a network beats the trees, the ends of a scale, the ladder's networks), and it has no
  strip or row in the figures and tables that set the models side by side. `lab.models.count`
  counts every model with a full run, `lab.side.count` the ones set side by side, and
  `lab.bodies.names` names the rest. What the prose says of such a model stands inside
  `\ifbodies`.
- **Its switches.** What waits on runs stands inside a switch that turns on by itself when a
  model has them: `\ifwaiting` for a model with a task and no full run (it is listed with the
  question its card opens with), `\ifchangehand`, `\ifchangeepochs` and `\ifchangestart` for a
  kind of change some model has measured, `\ifgames` and `\iffeatures` for the two studies,
  `\ifmore` for a run on more games than the run it changes, and `\ifstudies` for any study run
  at all. What the prose says while a kind is unmeasured stands on the switch's other side.
- **Another shape of network.** A network set against the transformer whose body it changes is a
  kind of change too, named by what it is: a convolutional tower (`conv`), a hybrid (`hybrid`),
  the same body with more parameters (`larger`), attention told what each piece attacks
  (`attacks`), attention without its offsets (`geometry`). Each has its switch
  (`\ifchangeconv` and so on) and its values like any kind (`lab.change.conv.over.<run>.said`).
  They stand in a table and a figure of their own, `lab-shapes` and `lab-shapes-figure`, and
  `\ifshapes` is on while any of them is measured. What kind a pair is of is one function for the
  lab's paper and a model's (`changes.kind`): a network of another body or size is of its shape's
  kind when it differs from the run it changes in its shape and, at most, in its learning rate,
  and a pairs table says both. In a model's own paper the runs of these kinds are drawn apart
  from the runs that change how a network is trained: the block `variants` follows a ladder
  network and those runs in one panel, epoch by epoch on the valid rows, and the block `shapes`
  gives each run of another shape a panel of its own beside the network it changes, since five
  broken lines of one colour cannot be told apart in one panel.
- **Kept or not, by both halves of the rule.** For each kind of change the prose reads how many
  pairs are better on the test rows beyond the noise (`lab.change.<kind>.net.better.of`) and how
  many also pass on the valid rows, which is the lab's rule for keeping a change
  (`lab.change.<kind>.net.kept.of`, and `.kept.whole.models` for the models where every pair of
  the kind is kept).
- **Said of every model, or said apart.** A value the lab states for its models at once, such as
  the share of games kept for the test, is the one most datasets have. A model whose dataset
  keeps other shares is named apart with its own (`\ifsplitapart`, `lab.split.apart.names`), and
  where the models apart differ among themselves no value is set, so the build stops at the
  sentence that says it of all of them.

## Smoke runs

`--smoke` on any command builds a small sample and trains for a moment. It proves the code runs
end to end, on any machine, in minutes. Its records go under `artifacts/smoke/`, which git ignores,
so a smoke score can never be mistaken for a result.

## What stays outside the harness

- **The coach narrator** is a language model, with its own scripts under
  [`models/coach-narrator/`](../models/coach-narrator/): facts from the app's code, a teacher, a
  truth check, a blind judge. It shares the lab's rules, not this harness.
- **The study under `projects/`** measures the app's own code and is waiting on data. It leaves
  when it reports, and no new study starts there.
- **The bridge** (`bridge/`) runs a script on the app's own code. A model never re-implements an
  instrument the app has; it imports it, or is held to it by a parity check.

## Growing it

The harness has four heads (one number, a logit a tag, a logit a square, a logit a move) and a
body over a sequence of positions. These are the next kinds of input and output, each a new body
or head in `nets/` with a test and a paragraph here:

| Kind | What it opens |
|---|---|
| A label for each position of a sequence, or for a part of it | A rating by phase, tilt, time trouble |
| A published body under a new head | Maia's board understanding, fine-tuned for a coaching question |

The order they are built in follows [`ideas.md`](ideas.md).
