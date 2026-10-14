# Win probability in the lab and in the app

**The question.** The lab's models learn move labels from the loss of the
mover's win probability, and the app labels moves the same way. Do the two
compute the same win probability?

**The answer.** Within the lab's clamp, yes, at every point: the same curve
with the same slope. Past it they part by design. The lab holds every
evaluation, mates included, at its clamp, while the app goes on towards
100%, so a lab label can be one step milder than the app's, but only for a
move that starts far ahead or ends far behind. Which clamp a ported model
uses is a decision for its port. The numbers are in
[`results/parity_winprob.md`](results/parity_winprob.md), and the reasoning,
with every label the gap can change, in the paper,
[`paper/paper.pdf`](paper/paper.pdf).

## Files

| File | What it does |
|---|---|
| `parity.py` | Evaluates both curves on a grid of evaluations and mates, the app's through its own code, and writes `results/`: the report, and the curve every half pawn for the paper. Fails when the two disagree inside the lab's clamp. |
| `app.mts` | The app's win probability for the evaluations `parity.py` sends, through the bridge. |
| `paper/generate.py` | Writes the paper's numbers, and checks over every move between two grid evaluations that the labels differ only where and how the paper says. |
| `paper/` | The paper. |

## Running it

```bash
make chess
make parity
.venv/bin/python projects/winprob-parity/paper/generate.py
```

It reads none of the player's data.
