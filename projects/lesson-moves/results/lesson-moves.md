# lesson-moves: the lesson pick at his turning points

Written by `measure.mjs` on the app at `4ba253b9e654248622c0069c62fbe72f26f316ee`: 74 lessons, 493 chapters, the archive's turning points with him to move.

| | train | held out |
|---|---|---|
| turning points (games) | 1023 (399) | 488 (191) |
| taught by a lesson (`lesson` or `lesson-shared`) | 77.3% | 71.1% |
| taught for a purpose his move lacked (`lesson`) | 63.7% | 58.0% |
| the pick's loss against the engine's first line, win% | 0.318 (0.260 to 0.380) | 0.369 (0.289 to 0.456) |
| the pick's largest loss, and picks outside the holding verdicts | 10.2, 0 | 11.1, 0 |
| the pick's share minus the engine's first line's | 0.030 (0.022 to 0.039) | 0.036 (0.025 to 0.048) |
| the pick's share minus the natural move's | -0.028 (-0.035 to -0.022) | -0.023 (-0.030 to -0.016) |
| the pick is the engine's first line | 74.5% | 74.0% |
| the pick is the natural move | 86.8% | 87.3% |
| a lesson teaches the engine's first line | 68.3% | 59.0% |
| lessons named (chapters) | 20 (25) | 21 (25) |

By the README's rule: coverage passes, cost passes, findability passes: the pick is kept.

The reasons: train {"lesson-shared":139,"natural":232,"lesson":652}, held out {"lesson":283,"natural":141,"lesson-shared":64}.

The purposes a lesson pick is taught for: train {"develops":59,"meets-threat":285,"passed-pawn":15,"pawn-break":29,"wins-material":127,"castles":17,"open-file":111,"trades-queens":26,"improves-worst-piece":23,"mate":47,"takes-centre":12,"outpost":6,"trades-when-ahead":5,"ending-technique":7,"offers-queen-trade":17,"seventh-rank":5}, held out {"develops":16,"meets-threat":122,"mate":10,"open-file":70,"passed-pawn":7,"wins-material":46,"ending-technique":4,"improves-worst-piece":8,"trades-queens":18,"pawn-break":19,"offers-queen-trade":10,"takes-centre":4,"outpost":1,"castles":5,"seventh-rank":5,"trades-into-ending":1,"trades-when-ahead":1}.

The lessons a lesson pick names, by what the pick is for (both splits; described, not tested):

| purpose | lesson, chapter: picks |
|---|---|
| meets-threat | V31 "Choose a defense that changes the threat", ch. 14 "Move the queen while taking the loose pawn": 334; V07 "Choose the right kind of defense", ch. 11 "A counterattack that is fast enough": 49; V07 "Choose the right kind of defense", ch. 5 "A check takes priority over the bishop attack": 24 |
| open-file | V27 "Give your rook an entry square", ch. 12 "Move the rook that has no job": 181 |
| wins-material | V31 "Choose a defense that changes the threat", ch. 14 "Move the queen while taking the loose pawn": 112; V40 "Calculate the defense inside the combination", ch. 28 "A blockaded pawn and a forcing check": 13; V41 "Improve with a tactic in reserve", ch. 13 "The knight defends f7 and sets a trap": 13; V15 "Recognize tactics during an ordinary game", ch. 10 "A knight attacks king, queen, and rook": 11; 3 more |
| develops | V34 "Develop with a purpose as White", ch. 8 "Black’s e pawn stops the golden plan": 75 |
| mate | V33 "Prove that the king has no escape", ch. 14 "The checking queen is protected": 57 |
| pawn-break | V08 "Read the pawn structure before choosing a plan", ch. 6 "Attack the supporting pawn": 48 |
| trades-queens | V69 "Return material to stop an attack", ch. 4 "Give the pawn back to trade queens": 29; V14 "Trade for a reason and inspect what remains", ch. 18 "Clear the passer’s path and offer the queens": 15 |
| improves-worst-piece | V09 "Improve the piece with the weakest job", ch. 4 "A central knight needs something to do": 31 |
| offers-queen-trade | V69 "Return material to stop an attack", ch. 4 "Give the pawn back to trade queens": 27 |
| passed-pawn | V23 "An active king and real targets", ch. 13 "Count the moves of the race": 22 |
| castles | V03 "Find a useful plan when tactics run out", ch. 5 "Castle where the rook joins the plan": 13; V34 "Develop with a purpose as White", ch. 8 "Black’s e pawn stops the golden plan": 9 |
| takes-centre | V35 "Respond to White’s center as Black", ch. 6 "Central support shapes the recapture": 16 |
| ending-technique | V23 "An active king and real targets", ch. 11 "Send the king to the target first": 4; V68 "Active rook defense: checks need a purpose", ch. 3 "Keep the attacking king out": 4; V24 "Opposition and the pawn ending", ch. 13 "Black to move: the king steps inside": 2; V24 "Opposition and the pawn ending", ch. 24 "White to move: Black keeps the opposition": 1 |
| seventh-rank | V27 "Give your rook an entry square", ch. 6 "Two rooks on the seventh rank": 10 |
| outpost | V13 "Build a useful outpost for your knight", ch. 8 "Remove a minor-piece challenger": 7 |
| trades-when-ahead | V14 "Trade for a reason and inspect what remains", ch. 18 "Clear the passer’s path and offer the queens": 6 |
| trades-into-ending | V11 "Choose the ending before you trade", ch. 4 "Quick trades turn the king into a piece": 1 |

Verdict lines (the app's `verdictTalk`) in the 26 daily videos since 2026-10-01: 104.

Skipped: {"game: a day read while designing":7,"game: after the held-out days":16}.
