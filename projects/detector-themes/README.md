# Do the app's motif labels name the tactic a position holds?

**The question.** Three of the app's board readers put a motif word on a
position, and the words travel far. `themeOfBest` names the best move the
player missed: the misses deck files each position under it, the puzzle
buckets and the rule ledger share it, and the learner credits a solve to the
skill it names. `blunderMotifs` tags what a bad move allowed: the weakness
profile, the metrics and the pattern census count it. `describeMove` says
what a move does, and the explanations are written from it. Judged on public
puzzles that an independent tagger has labelled, how often is each word right
when it is said, and how often is it said when it is right?

**The earlier answer.** Fork is named well by all three. Beyond it, the misses deck's
labeller has no word for pins, skewers, discovered attacks, deflections or
trapped pieces, and files most of those puzzles as a defensive move, a word
the puzzles' tagger rarely agrees with. The review scan tags a hanging piece
on far more puzzles than have one. `describeMove` is the most precise of the
three and the one to build the others on. The paper,
[`paper/paper.pdf`](paper/paper.pdf), has the numbers.

**Round two.** The rule keeps both `best-deflection` and `best-trapped`.
Both raise agreement on the app pool and the held-out set. Deflection lowers
disagreement on both sets. Trapped piece has a higher held-out disagreement
point estimate within the fixed allowance. These are independent candidates
for the app, not a measured combined change or a shipped port. The script-written
[result](results/round2/result.md) gives the counts, differences and intervals.

## The data

The Lichess puzzle database (CC0). A puzzle is a mistake (its first move) and
the line that punishes it, tagged with themes by Lichess's own tagger. Two
sets:

- **the app's pool**: the puzzles the app ships (`src/data/puzzles.json` at
  the pinned commit), the training set for any change tuned here;
- **held out**: a seeded uniform sample of 20,000 other puzzles rated 400 to
  1899, the app pool's range (`sample.py`), the test set.

Lichess's tags are another heuristic tagger, not the truth. Agreement with it
is a measure, and the paper reads disagreements on the board before calling
either side wrong.

## The rules, fixed in score.mts before it first ran

Each labeller reads a puzzle the way the app reads a game:

- `best`: `themeOfBest(position, solution)`, on the position the solver faces
  and the first solution move;
- `blunder`: `blunderMotifs(before, mistake, after, score, refutation)`, on
  the puzzle's first move and the solution line, with the score the solution
  reaches (a mate when the puzzle is tagged mate in N, else five pawns for the
  solver);
- `move`: `describeMove(position, solution, { replyPv })`, the findings that
  are a gain for the solver.

Both sides' words map to the knowledge catalogue's concept ids through the
app's own `VOCABULARY`, so a Lichess word and an app word name one concept the
way the app resolves them. Per labeller and concept: true and false positives
and misses over puzzles, precision and recall with 95% Wilson intervals. A
concept only one side has a word for is reported, not scored. For `blunder`,
checkmate is given by the score passed in, so its row is not a test.

## Files

| File | What it does |
|---|---|
| `sample.py` | Draws the held-out set from the database, using the clone's Python; `run-score.sh` validates the round-two sample before scoring it. |
| `score.mts` | Scores the three labellers on a set; writes `results/score-<set>.json` (counts) and the per-puzzle labels to `data/processed/`. |
| `compare.mjs` | Compares a candidate's labels with the pinned app's by the rule under Candidates; writes `results/compare-<candidate>.json`. |
| `candidates/` | Each candidate's replacement files. |
| `report-round2.mjs` | Checks the frozen measurement files and writes `results/round2/result.json` and `result.md` from both comparisons. |
| `paper/` | The earlier paper and the round-two section; `generate.mjs --round2` checks the claims and writes `generated.tex`. |

## The earlier round

The unversioned results and historical paper belong to the earlier app pin
and its original sample. The current bridge pin and rebuilt sample cannot
reproduce that run. Its aggregates and generated paper inputs are preserved
by `paper/round1-manifest.json`; do not overwrite them with current-pin
scores. The commands below reproduce round two in its own result directory.

## Candidates

A candidate changes one labeller and is scored by pointing `CHESS_DIR` at it
(`bridge/candidate.sh`) with `CANDIDATE=<name>` set, then compared with the
pinned app by `compare.mjs`. The rule, fixed before the first candidate ran:
per puzzle, a labeller *agrees* when one of its words names a concept the
puzzle is tagged with, and *disagrees* when one names a concept the puzzle is
not tagged with. A candidate is kept when, on the app's pool and on the
held-out set alike, its agreement rises with the 95% interval of the paired
difference (2,000 bootstrap draws of puzzles) above zero, and its
disagreement does not rise (the interval's upper end at or below one point).

| Candidate | Labeller | Verdict | The change |
|---|---|---|---|
| `describe-first` | `best` | Kept in the earlier round; shipped | Before the defensive fallback, name a skewer, a discovered attack or a pin when the move describer finds one for the mover. |
| `best-deflection` | `best` | Kept; candidate for the app | Before defence or phase, name the existing line reader's deflection when the supplied solution begins with this move. |
| `best-trapped` | `best` | Kept; candidate for the app | Before defence or phase, name the describer's trapped piece when the supplied line wins that same piece after costs. |

## Round two: development, then the held-out test

This round measures the pin in `bridge/chess.json`, independently of the
older results above. Its outputs live in `results/round2/`; its per-puzzle
labels and resumable work live in `private/detector-themes/round2/`. The
older paper sections and results remain a record of the older app. The
candidates were finalized in phase one before any held-out labeller ran.
Phase two scored the pinned app and both frozen candidates and applied the
same rule. The comparisons and their result report are in `results/round2/`.

The sets, concepts and keep rule above do not change. The app pool is the
unique puzzle ids in the pinned `src/data/puzzles.json`. The held-out set is
the seeded reservoir in `sample.py`: all database rows rated 400 through
1899, excluding every app-pool id, sampled uniformly without replacement
with Python's Random seed 20261014, to 20,000 puzzles. The database and
sample hashes identify this rebuild. No tags or board examples from the
new held-out sample are inspected while developing candidates.

For each puzzle the agreement and disagreement indicators are separate:
any said concept in the tagged set, and any said concept outside it. An
unmapped word says nothing for these measures. The estimate is the mean
candidate-minus-pinned difference over all paired puzzles, including those
where neither says anything. Bootstrap puzzles with replacement, drawing
the original set size each time, 2,000 times, with the existing Mulberry32
seed 20261014 restarted for each set. Both indicators use the same draws.
The percentile endpoints are sorted draw indices floor(0.025 B) and
floor(0.975 B). Keep only if agreement's lower endpoint is strictly positive
and disagreement's upper endpoint is at most 0.01 on both sets. Missing,
duplicate or mismatched puzzle rows invalidate the comparison. There is no
multiple-comparison correction in the fixed rule; none is added this round.
The app-pool counts are development evidence, not a held-out verdict.

Each candidate starts independently from the pinned app, rather than
stacking changes. Consider deflection, trapped piece, named defence, then
capture-war hanging piece, in that order. Stop adding candidates at the
first change that cannot improve agreement under the fixed rule, or whose
app-pool agreement does not increase. This is a development stop, not a
new keep rule. A held-out failure means do not port; a pass permits proposing
the replacement files and tests to the app for its own review.

The first change uses the existing `detectDeflection` reader, which is also
the move describer's line reader. The best-move reader needs an optional
full UCI solution line, beginning with the named best move. With no matching
line it keeps the pinned behaviour. A deflection is considered only after
the existing named tactics and before defence or phase. The helper reads
three plies: a forcing move, the guard's departure and a profitable capture
of what it guarded. Both deflection and overloaded defender name the same
catalogue concept. This reuses that local capture-war proof; it does not
claim to prove optimal play or the total value of a longer sacrifice.

A stricter defensive fallback which only removes words cannot increase
agreement. This is an incompatibility between that proposed change and the
fixed keep rule, regardless of sample size. The review scan at this pin
already uses `captureExchange` for most captures; its remaining shortcut
accepts a capture on the mistake's destination without that test. The old
paper's broader description is not a description of this pin.

### The deflection candidate

`best-deflection` is kept on both sets. Its phase-one app-pool counts remain
in [`results/round2/development.md`](results/round2/development.md), written
by `development.mjs`; the completed test is in
[`results/round2/result.md`](results/round2/result.md). The candidate's tests
cover the forced guard departure, overload, another guard still holding the
square, an unforced departure, and absent, short or mismatched evidence.

Its replacements are `theme.ts`, `theme.test.ts`, `knowledge-README.md`,
`mistakes.ts` and `mistakes.test.ts`. `candidate.sh` maps them to their app paths through the bridge.
The misses-deck publisher converts its existing SAN best line with the app's
`replaySans`; old two-argument callers retain their old result. The routine's
separate facts caller also needs this argument when ported. Its source file
contains private account information, so it is not copied here. The legacy
wrapper has no continuation to pass. That limits which callers benefit from
these replacement files; this study measures the reader with the supplied
puzzle line, not the routine's complete deck build.

Downstream, `deflection` files a miss under that theme and resolves to the
catalogue's deflection concept. At this pin it has no `THEME_COMPETENCY`
entry: solving that miss credits the learner's existing `calc.scan` fallback,
not a new deflection skill. The older theme-to-area map resolves it to K1.
The candidate does not change review `blunderMotifs`, so review weakness
counts and motif-based recency signals are unchanged. Refiling misses can
change their displayed theme and theme interleaving. Future attempts update
`calc.scan` ability and can change recommendations; a new word does not
create a new competency or directly increment a weakness weight. A separate
competency mapping would be a separate app change, not an unmeasured part of
this candidate.

### Reproducing the development scores

The supplied `.cache/chess` and `.venv` are links to the provisioned shared
resources. Their pinned files are read through those links. Candidate
copies are made under `private/detector-themes/app-cache/`, in this clone,
and every replaced file is unlinked before writing, as the bridge requires.
No package was installed. No engine or Maia process is needed for these
board readers.

```bash
# Download once; -C resumes an interrupted download.
nice -n 10 curl --fail --location --continue-at - --retry 3 \
  --output data/raw/lichess_db_puzzle.csv.zst \
  https://database.lichess.org/lichess_db_puzzle.csv.zst
CHESS_DIR=$(bridge/checkout.sh) nice -n 10 .venv/bin/python projects/detector-themes/sample.py --round2
projects/detector-themes/run-score.sh app
projects/detector-themes/run-score.sh app best-deflection
projects/detector-themes/run-score.sh app best-trapped
nice -n 10 bridge/run.sh projects/detector-themes/development.mjs best-deflection best-trapped

candidate=$(projects/detector-themes/candidate.sh best-deflection)
(cd "$candidate" && nice -n 10 node_modules/.bin/vitest run --project fast --maxWorkers 1 src/services/knowledge/detectors/theme.test.ts src/services/knowledge/detectors/tactics/tactics.test.ts src/services/publishing/decks/themeLine.test.ts tests/architecture)
(cd "$candidate" && nice -n 10 node_modules/.bin/tsc -p tsconfig.app.json --noEmit --incremental false)
```

`run-score.sh` starts exactly two `nice -n 10` workers, waits for both and
merges only a complete set. Work resumes puzzle by puzzle; metadata refuses
work from another input or scorer. Changed code requires removing only that
run's private `work-*.jsonl` and `.meta.json` files before rerunning. The
labels are hashed into the aggregate. The sample build reuses a complete,
hash-matched sample; an interrupted reservoir pass restarts deterministically.
Use `--limit 50 --shard 0/2 --round2` with `score.mts app` for a timing slice;
it caches those rows without writing a partial score aggregate.

### Reproducing the held-out test and result

```bash
projects/detector-themes/run-score.sh heldout
projects/detector-themes/run-score.sh heldout best-deflection
projects/detector-themes/run-score.sh heldout best-trapped
nice -n 10 bridge/run.sh projects/detector-themes/compare.mjs best-deflection best --round2
nice -n 10 bridge/run.sh projects/detector-themes/compare.mjs best-trapped best --round2
nice -n 10 bridge/run.sh projects/detector-themes/report-round2.mjs
nice -n 10 bridge/run.sh projects/detector-themes/paper/generate.mjs --round2
```

The comparison checks exact puzzle pairing, labels, truth, vocabulary,
source hashes and the pinned app before it applies the unchanged bootstrap.
The detector code, tests, sample, scoring and comparison scripts, and rule
were not changed after the held-out results. `report-round2.mjs` verifies the
measurement files and phase-one aggregates against commit `da8a4cb` before
writing the result. Reporting code and prose are the phase-two changes.

The original paper sections remain the report of the earlier pin. The
round-two section reports the completed test. Its `--round2` generator
checks the frozen historical macros and aggregates, the new comparison
results, the rule's verdicts and the downstream claims before writing every
new number into `paper/generated.tex`. No TeX was installed or run.
`paper.pdf` is still the historical PDF.

The scoring commands each use two low-priority workers. During this run the
first comparison briefly overlapped the finishing trapped-piece workers,
exceeding the requested two-heavy-process cap. All ran at `nice -n 10`.
The remaining comparison ran on its own. No measurement setting or input
was changed in response to a held-out result.

### The trapped-piece design, before its app-pool score

`best-trapped` starts from the pin, without the deflection change. It uses
the move describer's gain finding for `trapped-piece`, with the existing
named tactics still taking priority. The finding's square names an enemy
piece attacked by the best move: the app's reader says both staying there
and every legal escape lose it. Pawns and kings are not candidates.

The same optional full UCI solution must start with the best move. Track
that identified piece through the supplied legal line until the solver
captures it; a capture of another piece is not evidence. Require the app's
`captureExchangeByMove` for that actual capture to be positive, and the
app's `materialFor` change through the prefix plus that capture-war result
to be positive. This keeps an earlier investment from swallowing the gain.
There is no chosen ply cutoff beyond the supplied line. Missing evidence,
an illegal prefix or a line stopping before collection says no new word.
This is a proof along the supplied prefix and local capture war, not a
search of every opponent reply or a verdict on unrelated later play.


### The trapped-piece candidate and where development stopped

`best-trapped` is kept on both sets. Its tests cover a piece staying
put, the same piece moving before capture, another piece being won instead,
an investment that costs more than the target, a safe escape and missing or
invalid evidence. Both candidates also test that the misses publisher passes
a numbered SAN line to the reader and handles a broken continuation.
The new publisher test is copied into the candidate beside `mistakes.ts`;
the bridge replaces the existing source and theme test files.

A `trappedPiece` miss files under that word and resolves to `trapped-piece`
in the catalogue. It too lacks a `THEME_COMPETENCY` entry and credits the
existing `calc.scan` fallback. The puzzle bucket already exists in K1, but
the older `WORD_CONCEPTS` map has no trapped-piece entry. Review motifs and
weakness counts are unchanged by this best-move candidate. The ordinary
puzzle bucket maps trapped pieces to hanging-piece weakness; the misses
family does not use that bucket mapping, so this word does not directly
raise a hanging-piece weakness weight. These mapping
limits are reported rather than silently bundled into a labeller change.

The next proposed change is interpreted literally as restricting the old
`defensiveMove` fallback to moves answering a named threat. An old defensive
word can stay or disappear; no new agreeing word can appear. Its agreement
difference is therefore never positive. It cannot pass this round's fixed
rule and is not worth adding code for here. A broader replacement that also
finds new defensive moves would be another design. Following the brief's
ordered stop, no defensive candidate or hanging-piece candidate is built or
scored in this round. The latter is deferred, not rejected on data.

The deflection reader covers a material target collected on its next turn;
it does not cover every deflected guard of a mating square or a longer
combination. Neither candidate makes Lichess's tagger a chess authority.
The tags measure agreement; the app's board readers supply the chess facts.
The timing estimate scales app-pool work to the held-out count. Position
mix, process startup, copying and bootstrapping can change the actual time.

To repeat the trapped-piece checks:

```bash
candidate=$(projects/detector-themes/candidate.sh best-trapped)
(cd "$candidate" && nice -n 10 node_modules/.bin/vitest run --project fast --maxWorkers 1 src/services/knowledge/detectors/theme.test.ts src/services/knowledge/detectors/insights/insights.test.ts src/services/publishing/decks/themeLine.test.ts tests/architecture)
(cd "$candidate" && nice -n 10 node_modules/.bin/tsc -p tsconfig.app.json --noEmit --incremental false)
```
