# Graded opponent

**The question.** A mistake only costs what the opponent can take. For each
mistake in a game, how likely is a player at a given rating to find the
punishment?

| | |
|---|---|
| **Reads** | A game (a PGN). |
| **Predicts** | Each move that gives away more than 10 points of win probability, with the chance that a player at a rating band, or 200 points above it, finds the refutation. |
| **Model** | Stockfish finds the mistakes and their refutations; Maia-2 gives the chance a human plays the refutation. Nothing is trained. |

Built in the lab's first pipeline (`src/chess_coach_models/scorer.py`,
`scripts/score_pgn.py`). [The report](../../reports/graded_opponent.md) shows
an annotated sample.

The app took this idea: it prices a mistake by whether a player at the
player's level finds the punishment, with Maia-2 running in the browser.
