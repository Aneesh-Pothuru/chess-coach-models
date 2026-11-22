# Opening repertoire

**The question.** Which opening lines score well for humans at a rating band,
whatever the engine thinks of them?

| | |
|---|---|
| **Reads** | The first 12 plies of 300,000 rated Lichess games of April 2019 (CC0), by rating band. |
| **Predicts** | For each line: its score with a Wilson interval, how often it is played, how often an early blunder follows, and how findable its moves are for Maia-2 at that band. |
| **Model** | A counted opening tree with those statistics. Nothing is trained. |

Built in the lab's first pipeline (`src/chess_coach_models/repertoire.py`,
`scripts/build_repertoire.py`). The reports list the lines it recommends
[below 1100](../../reports/repertoire_lt1100.md) and
[from 1100 to 1400](../../reports/repertoire_1100-1400.md): below 1400, lines
the engine rates level or worse can score well above their band's average
([`reports/SUMMARY.md`](../../reports/SUMMARY.md) names two).

It is not in the app, which builds the player's repertoire from his own games
and files.
