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
follow from it, both ratings, both clocks, the time control. The output today is one number, a
quantity or a chance. What changes from idea to idea is the label and what the model may read.

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
setup, first-move, line), so a task can hide a group and a run can leave one out.

## Bodies and a head

A network is a body and a head (`nets/model.py`). The body turns tokens, marks and context into
one vector. The head, two layers, turns the vector into the task's output. Two bodies ship so a
leaderboard can say what the architecture is worth on each task.

**The square transformer.** Each square is a token and every square attends to every other from
the first layer, so a bishop on a1 and a king on h8 meet at once. Attention is told about the
board's geometry by a learned bias for each offset between two squares, one per head: files, ranks,
diagonals and knight hops are all offsets, so a head can learn to look along them. The context
numbers enter as one more token. This is the design the strongest published human-move models have
moved to.

**The convolutional tower.** Residual blocks of 3x3 convolutions over the 8x8 board, the kind of
network the first AlphaZero-style engines used. It is cheap, it trains on a CPU, and it sees
further only as it gets deeper. It is here as the honest alternative: where it matches the
transformer, the cheaper model wins.

Sizes are settings of a run (`dim`, `depth`, `heads`), not code.

## Learners and the run record

A run is one config file and names one of five learners, each a file under `train/learners/` with
one function, `fit`:

- `constant`: one number for every row. The floor: a model that does not beat it learned nothing.
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
one every other model's `transformer-medium` has.

**A run that changes another.** A run that changes one thing in another names that run as its
`base` and writes only the change; its config is the base's with its own blocks laid over it
(`run_config` in `train/run.py`). Two changes need no code: `data: {train_share: 0.5}` trains on
half of the training games, chosen by a hash of the game so a quarter is inside a half and the
valid and test rows are never touched, and `learner: {without: [kings]}` leaves a group of hand
features out. A run that also names a `study` is there to say what one thing is worth, not to be
a candidate. `lab all <model>` trains a model's own runs, and `--runs study:games` asks for a
study by name.

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
calibration error. A task names one of them as primary, on its card, before its first run.

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
weights: nobody will run it.

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
  model's own runs.

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
- **Switches.** What depends on files a model may not have yet stands inside a switch: `\iflook`
  for the closer look, `\ifpairs`, `\ifvariants`, `\ifgames` and `\iffeatures` for pairs, runs
  that change a network, and the two studies, `\ifchanges` for any of those four, and `\ifchance`
  for a model that predicts a chance. A switch that is off takes its side of the prose out, so one
  text serves before and after a batch of runs lands.
- **Shared sections.** What is the same for every model is typed once under `papers/`: how a board
  is read, the learners, how a result is scored, what a closer look is, how one change at a time
  is read, the preamble and the references.
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

The harness has one head with one output. These are the next kinds of input and output, each a
new body or head in `nets/` with a test and a paragraph here:

| Kind | What it opens |
|---|---|
| A move as output: a score for each legal move | Human-move prediction, the chance a given move is found |
| A label per square | Where a player should look, which piece is in danger |
| A whole game as a sequence of positions | A rating from one game, tilt, time trouble |
| A published body under a new head | Maia's board understanding, fine-tuned for a coaching question |

The order they are built in follows [`ideas.md`](ideas.md).
