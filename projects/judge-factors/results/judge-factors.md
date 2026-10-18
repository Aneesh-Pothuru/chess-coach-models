# Judge factors: results

Written by `projects/judge-factors/analyze.mjs` on app commit `f4bd63f`, from 23253 positions (21266 distinct) in Lichess 10-minute games, August 2026 (train) and September 2026 (held out); verdicts by Stockfish at the `grade` budget.

| Reading | Verdict | Train agreement | Held-out agreement |
|---|---|---|---|
| King safety | tells who is better, reliable on its own | 77.2% (74.1% to 80.1%), n=747 | 81.2% (78.1% to 83.8%), n=732 |
| Activity and space | tells who is better, reliable on its own | 81.7% (78.8% to 84.3%), n=776 | 82.3% (79.6% to 84.8%), n=826 |
| Pawn structure | tells who is better | 63.0% (58.1% to 67.7%), n=384 | 68.9% (64.2% to 73.2%), n=405 |
| Something loose | tells who is better, reliable on its own | 92.6% (91.1% to 93.9%), n=1409 | 92.9% (91.5% to 94.2%), n=1388 |
| The worst piece | tells who is better, reliable on its own | 71.5% (68.7% to 74.1%), n=1055 | 74.2% (71.4% to 76.8%), n=1023 |

Agreement: the share of positions with a clear verdict where the side the reading favours is the side the engine says is better, with the 95% Wilson interval. The rule is in the README.

## Described, not tested

- King safety: the engine calls 29.9% of its held-out positions level and 38.1% clear; at twice the lean, held-out agreement 96.9% (84.3% to 99.5%), n=32; in decisive held-out games its side won 64.0% (60.4% to 67.5%), n=700, the engine's side 68.9% (65.3% to 72.2%), n=700.
- Activity and space: the engine calls 36.9% of its held-out positions level and 27.5% clear; at twice the lean, held-out agreement 94.4% (74.2% to 99.0%), n=18; in decisive held-out games its side won 64.4% (61.0% to 67.7%), n=790, the engine's side 69.9% (66.6% to 73.0%), n=790.
- Pawn structure: the engine calls 25.2% of its held-out positions level and 53.4% clear; at twice the lean, held-out agreement 69.4% (55.5% to 80.5%), n=49; in decisive held-out games its side won 64.5% (59.6% to 69.2%), n=375, the engine's side 78.1% (73.7% to 82.0%), n=375.
- Something loose: the engine calls 20.1% of its held-out positions level and 46.3% clear; at twice the lean, held-out agreement not enough data (n=0); in decisive held-out games its side won 66.8% (64.2% to 69.3%), n=1318, the engine's side 70.0% (67.4% to 72.4%), n=1318.
- The worst piece: the engine calls 35.4% of its held-out positions level and 34.1% clear; at twice the lean, held-out agreement 73.7% (66.0% to 80.1%), n=148; in decisive held-out games its side won 62.9% (59.8% to 65.8%), n=975, the engine's side 72.2% (69.3% to 74.9%), n=975.
- The drill's sum of the four factors favours the engine's side in 82.5% (81.3% to 83.7%), n=3838 of train positions and 83.8% (82.6% to 84.9%), n=3813 held out.
- A logistic model of the clear verdict on all five readings, fitted on train: accuracy 84.5% on train and 85.6% held out; weights king safety 0.9601 per 100 centipawns, activity and space 1.4767 per 100 centipawns, pawn structure 0.5228 per 100 centipawns, something loose 2.406 per 100 centipawns, the worst piece 0.0552 per move.

## Added after the run

Added after the run, once the verdicts were read: not among the descriptions the README named before it. Held-out positions.

- The engine's side is White in 57.6% (56.0% to 59.2%), n=3820 of clear positions, and the side to move in 65.8% (63.7% to 67.8%), n=2074 of those where something loose does not lean.
- King safety favours the side to move in 42.4% of its positions; agreement when it does 95.8% (93.4% to 97.3%), n=424, when it favours the other side 61.0% (55.5% to 66.3%), n=308; when no other drill factor leans 78.0% (73.7% to 81.9%), n=387.
- Activity and space favours the side to move in 38.4% of its positions; agreement when it does 97.7% (95.9% to 98.8%), n=440, when it favours the other side 64.8% (59.9% to 69.4%), n=386; when no other drill factor leans 82.1% (78.5% to 85.1%), n=524.
- Pawn structure favours the side to move in 46.9% of its positions; agreement when it does 90.1% (85.4% to 93.5%), n=213, when it favours the other side 45.3% (38.4% to 52.4%), n=192; when no other drill factor leans 74.7% (68.8% to 79.8%), n=241.
- Something loose favours the side to move in 100.0% of its positions; agreement when it does 92.9% (91.5% to 94.2%), n=1388, when it favours the other side not enough data (n=0); when no other drill factor leans 95.4% (93.9% to 96.6%), n=957.
- The worst piece favours the side to move in 43.1% of its positions; agreement when it does 93.2% (90.8% to 95.0%), n=561, when it favours the other side 51.1% (46.5% to 55.6%), n=462; when no other drill factor leans 73.7% (69.1% to 77.9%), n=377.
- King safety against activity and space, both leaning opposite ways: the engine sides with king safety in 43.8% (28.2% to 60.7%), n=32.
- King safety against pawn structure, both leaning opposite ways: the engine sides with king safety in 55.6% (26.7% to 81.1%), n=9.
- King safety against something loose, both leaning opposite ways: the engine sides with king safety in 36.4% (27.1% to 46.8%), n=88.
- King safety against the worst piece, both leaning opposite ways: the engine sides with king safety in 63.6% (50.4% to 75.1%), n=55.
- Activity and space against pawn structure, both leaning opposite ways: the engine sides with activity and space in 75.0% (55.1% to 88.0%), n=24.
- Activity and space against something loose, both leaning opposite ways: the engine sides with activity and space in 34.4% (25.6% to 44.3%), n=96.
- Activity and space against the worst piece, both leaning opposite ways: the engine sides with activity and space in 75.0% (40.9% to 92.8%), n=8.
- Pawn structure against something loose, both leaning opposite ways: the engine sides with pawn structure in 18.8% (12.4% to 27.5%), n=101.
- Pawn structure against the worst piece, both leaning opposite ways: the engine sides with pawn structure in 50.0% (41.2% to 58.8%), n=120.
- Something loose against the worst piece, both leaning opposite ways: the engine sides with something loose in 81.3% (74.7% to 86.5%), n=166.
- With the side to move as a sixth input, the logistic model's accuracy is 86.1% on train and 87.7% held out; the move weighs 1.1952 for White to move.
