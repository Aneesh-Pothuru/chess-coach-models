# Concept tagger

**The question.** Which tactical themes does a position hold?

| | |
|---|---|
| **Reads** | A position (the one a puzzle's solver sees). |
| **Predicts** | A chance for each of 35 Lichess puzzle themes: forks, pins, mating patterns, endgame types. |
| **Model** | A small head on the frozen activations of Maia-2, trained on the themes of the Lichess puzzle database (CC0). |

Built in the lab's first pipeline (`src/chess_coach_models/concepts.py`,
`scripts/train_concepts.py`, `make concepts`).
[The report](../../reports/concept_tagger.md) has every theme's score: the head
names motifs far above their base rates, endgame types and named mates come
easiest, and relational motifs such as deflection and clearance come hardest.

It is not in the app, whose board code detects motifs by rule. A tagger earns
a place there only for the motifs rules miss.

## Next

On the shared harness this is a multi-label head over the puzzle dataset
([`datasets/puzzles.yaml`](../../datasets/puzzles.yaml)), with the solution
line marked on the board, since a theme is a property of the line as much as
of the position. That needs a multi-label head in `nets/` and its metrics in
`evals/` ([`docs/ideas.md`](../../docs/ideas.md)).
