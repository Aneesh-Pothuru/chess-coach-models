# The walk through a game: what it keeps

Written by `measure.mjs` on the app at `bb6e200520e9734ea96cbc62d34d6ac0f0cae344`. The walk stops at up to 4 of his errors (his costliest mistakes, misses and blunders, then a mate within 3 moves he let slip; with none of those, his 2 costliest inaccuracies) and 1 best move of his.

### The design set: the archive's reviews

734 games, 707 with an error of his.

| | median | 75th | 90th | most |
|---|---|---|---|---|
| his marked moves a game (a walk through every one) | 6 | 9 | 11.7 | 30 |
| the walk's stops | 3 | 4 | 4 | 5 |

- Games with more than 5 marked moves: 54%. Walks longer than 5 stops: 0. Games with no stop: 19.
- What the walk's errors hold of what all his errors cost, inaccuracies included: 72% in the median game (95% interval 70% to 73%), 59% at the lower quartile (57% to 62%), 48% at the lowest tenth.
- Of what his mistakes, misses and blunders cost, the walk holds all of it in 71% of the 636 games that have one, 77% at the lowest tenth and 46% at the least.
- The costliest error is a stop in 707 of 707 games. It comes 63% of the way into the median game, and anywhere from 28% to 95% between the lowest and highest tenth.
- A stop lies inside the turn in 340 of the 346 games that turned on his own moves.
- Stops for a mate let slip: 27. Stops for a best move of his: 173. The first stop comes 39% of the way into the median game.
- Ranked by cost alone, whatever the grade, and always filled to four, the stops would hold 87% in the median game; a softened error would take a mistake's place in 3% of the games.

| errors the walk may stop at | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| held in the median game | 37% | 57% | 67% | 72% | 75% | 77% |
| held at the lower quartile | 27% | 43% | 55% | 59% | 62% | 64% |
| games it holds whole | 8% | 13% | 15% | 16% | 16% | 16% |

The held-out games are not reviewed yet (`games.mjs`), so there is no verdict.
