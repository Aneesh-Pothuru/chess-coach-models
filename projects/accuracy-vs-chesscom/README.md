# Accuracy against chess.com

**The question.** After a game the player reads Game Review's accuracy for
each side beside chess.com's for the same game. How far apart are they, and
what change to the app's instrument closes the gap?

**The answer.** One round of hill-climbing: a plain mean of per-move scores on
a steeper per-move curve, in place of Lichess's volatility-weighted and
harmonic means. Merged with the app's grading of moves an endgame tablebase
decides, it is the instrument the review service ships (`ACCURACY_MODEL` in the
app's `src/services/review/accuracy.ts`). The numbers are in the paper,
[`paper/paper.pdf`](paper/paper.pdf), and the lab's reproduction of them in
[`results/reproduction.md`](results/reproduction.md).

## Files

| File | What it does |
|---|---|
| `build-cases.mjs` | Draws the games: those in the app's archive that carry chess.com's accuracy for both sides, sampled by length and result, the rest kept as a dev pool. `--frozen` takes the records' sample instead, so the recorded numbers can be reproduced. |
| `build-evidence.mjs` | Reviews each game through the app's own entry point at one profile's engine budget (`phone` or `routine`) and keeps the finished documents. Resumable. |
| `run-eval.mjs` | One variant of a round: re-reads every kept document under the code of the checkout `CHESS_DIR` names (the pinned app, or a candidate from `bridge/candidate.sh`) and grades both accuracies against chess.com's. |
| `summarize.mjs` | The aggregates every keep or revert decision rests on, with bootstrap intervals over games. |
| `explore.mjs` | The bench for a thesis: scores an accuracy function on the train games and the dev pool, never on test. |
| `models/` | `current.mjs`, the app's model with one hook for each part a thesis may change, and `lichess-v2.mjs`, the instrument the app first shipped, frozen. |
| `reread-check.mjs` | Checks that the archive's stored accuracies come back from their stored per-ply evaluations, which the archive reader relies on to read them again under a newer instrument. |
| `reproduce.mjs` | Reruns the three instruments the hill-climb compared, as candidates of the pinned app on rebuilt evidence, and the re-read check, beside the recorded numbers. |
| `hillclimb/` | The hill-climb's record: what each round changed (`v1/`, with the instruments before and after; `v2/`, the merge), what the metrics mean, where it stands, and the brief its researchers worked from. |
| `paper/` | The paper. |

## Running it

```bash
make chess
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile routine
bridge/run.sh projects/accuracy-vs-chesscom/reproduce.mjs
bridge/run.sh projects/accuracy-vs-chesscom/paper/generate.mjs
```

The cases, chess.com's numbers, the evidence and every variant's rows name
the player's games, so they stay under `private/accuracy-vs-chesscom/`.
`results/reproduction.{md,json}` hold aggregates only. The evidence is shared:
the explain, judge and Maia projects read it too.

To try a thesis, copy `models/current.mjs`, override one hook, and score it
with `explore.mjs --model ./my-model.mjs`. One that helps there becomes a
round: a candidate of the app with the change, run by `run-eval.mjs` in a flow
directory that holds the split (`_state.json`, as `reproduce.mjs` makes one),
and kept only when `summarize.mjs` shows train and test both better beyond
the noise.
