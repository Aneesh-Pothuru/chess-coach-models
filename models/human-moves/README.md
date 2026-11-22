# Human moves

**The question.** Which move does a player at a given rating play here?

| | |
|---|---|
| **Reads** | A position and the ratings of both players. |
| **Predicts** | A probability for every legal move. |
| **Model** | [Maia-2](https://pypi.org/project/maia2/) as its authors published it (MIT). The lab trains nothing here: it measures the model the app runs. |

The app runs Maia-2 in the browser and prices a mistake by whether a player at
the player's level finds the punishment. The lab's part is to know how far to
trust it.

## What the lab measured

- **An independent benchmark** ([report](../../reports/maia_benchmark.md)).
  Maia-2's top move against the move played, on rated rapid games from June
  2025, after its training data ends, with Maia's own evaluation filters
  (`make benchmark`). Its accuracy lands near the published figures, and on
  Lichess its confidence runs a little above its accuracy.
- **On the player's own games**, in studies that have since left this
  repository (its history keeps them): one rating offset from the player's
  site to Lichess predicts his moves best, his opponents are read at a higher
  offset, a temperature fitted on Lichess does not help on his games, and the
  odds that a mistake is punished at his level are about as confident as they
  are right. The app uses those settings.

## Next

Maia-3, a family of square-token transformers from the same group, reports
higher move-matching accuracy than Maia-2 across ratings. Benchmarking it here
on the same June 2025 sample, beside Maia-2, would say whether the app should
change its human model; its licence has to be read first.
