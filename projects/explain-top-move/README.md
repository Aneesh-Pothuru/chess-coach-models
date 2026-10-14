# Explaining the better move

**The question.** At each key moment, Game Review explains what the move
played allowed and what the engine's better move does instead. Are those
texts true, and do they say why the better move is better, in terms the
player can use?

**The answer.** Rounds of hill-climbing the code that writes them, one idea a
round, graded on the board and, where a grade cannot reach, by a judge model
comparing old and new texts blind and in both orders. The kept rounds are the
app's explanation code. The numbers are in the paper,
[`paper/paper.pdf`](paper/paper.pdf), and the lab's reproduction of them in
[`results/reproduction.md`](results/reproduction.md).

## Files

| File | What it does |
|---|---|
| `build-cases.mjs` | Every key moment of the accuracy project's games, re-read from the kept phone evidence under the code of the checkout `CHESS_DIR` names, with the app's own texts for it. No engine runs here. |
| `probes.mjs` | The searches behind the texts' answers to "what if they take it": each capture the better line declines, searched as the routine searches it. |
| `defenses.mjs` | The searches behind the answers to "what if they just move it": the human-move model's likeliest reply to the better move's threat, at the defender's band, and the engine's line from it, made by the app's own routine step. It needs the human-move model, and an app without the step has none to make. |
| `grade.mjs` | Three grades for each moment, checked with chess.js against the board and the stored engine evidence: `faithful` (no false checkable claim), `concrete` (the better move's consequence is named), `named_deep` (every move named as best rests on a deep search). Each amount that names pieces also carries whether they are the pieces that changed hands on its line. |
| `defects.mjs` | The text defects the correctness rounds fix (round 11's five, round 14's two on the pieces an amount names), counted in a variant's texts. Its `--out` file names the moments behind each count, so it stays under `private/` or in the records. |
| `results.mjs` | A variant's per-moment record: its grades and a hash of the texts the player reads. |
| `summarize.mjs` | The rates every keep or revert decision rests on, with bootstrap intervals over games and paired differences from the baseline. |
| `judge/pairwise.mjs` | A round's blind comparison by a judge model, and the rule that scores it. A new round's judgments name moments, so they go under `private/explain-top-move/`. |
| `judge/controls/` | The judge's controls. `score.mjs` recomputes them from their answers: the length check (the same text on both sides; the shorter text against itself with filler as long as the round's change; the longer text against that filler) and each later round's control, with the rule that says whether the judge drifted. A round that lengthens its texts carries a padding control (`pad-variant.mjs`, the filler from `filler.mjs`, in the better move's points or, with `--section allowed`, in a silent "What X allowed" section); a round that shortens them carries a trim control (`trim-variant.mjs`: the same moments with the last point of the better move's section cut, its list kept as `trim.json` beside the answers). `mix.mjs` deals the control into the round's own batches and splits the answers back. |
| `reproduce.mjs` | Recomputes every variant's aggregates, every judge round and the judge's controls from the records, sets a round graded on documents rebuilt for it beside its base on those documents (with the text defects it fixes, where the records count them), then rebuilds the pinned app's texts end to end on the lab's evidence and grades them, and says which kept rounds after the kept variant the pinned app carries. |
| `paper/` | The paper. |

## Running it

It reads the accuracy project's phone evidence, so that comes first:

```bash
make chess
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
bridge/run.sh projects/explain-top-move/reproduce.mjs
bridge/run.sh projects/explain-top-move/paper/generate.mjs
```

`reproduce.mjs` runs `build-cases.mjs`, `probes.mjs`, `build-cases.mjs` again
with the probes, then, when the pinned app makes defense searches,
`defenses.mjs` and `build-cases.mjs` once more, then `grade.mjs` and
`results.mjs` itself, into `private/explain-top-move/reproduce/app/`;
`--no-rerun` reads what is already there. `results/reproduction.{md,json}`
hold aggregates only.
