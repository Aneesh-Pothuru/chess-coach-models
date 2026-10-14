# Verdicts in context

**The question.** The app labels each move by how much of the mover's winning
chances it gives away, read on the win-probability curve Lichess fits on its
games, whoever is playing. Would a curve fitted to the mover's rating, flatter
for lower-rated players, give this player fairer verdicts?

**The answer.** Not adopted. The proposal moves a sizeable share of verdicts,
and a judge model shown the player's own flipped moves, with the two labels
unnamed and in both orders, did not prefer the proposed label in either run.
Its reasons point at what a move gives away rather than the size of the swing.
The numbers are in the paper, [`paper/paper.pdf`](paper/paper.pdf), and the
lab's reproduction of them in [`results/reproduction.md`](results/reproduction.md).

## Files

| File | What it does |
|---|---|
| `flips.mjs` | Judges every graded move of the accuracy project's games on both curves, with a copy of the app's judge that takes the slope as a parameter (asserted against the real judge on the shipped slope), and records the verdicts that change. |
| `tally.mjs` | What the judge preferred in each run, from the judge rounds the records keep. |
| `reproduce.mjs` | Recomputes the judge's table from the records, and reruns `flips.mjs` on the lab's evidence beside the recorded counts. |
| `paper/` | The paper. |

## Running it

It reads the accuracy project's phone evidence, so that comes first:

```bash
make chess
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone
bridge/run.sh projects/judge-in-context/reproduce.mjs
bridge/run.sh projects/judge-in-context/paper/generate.mjs
```

The rerun's flips name games, so they stay in
`private/judge-in-context/reproduce/`; `results/reproduction.{md,json}` hold
aggregates only.
