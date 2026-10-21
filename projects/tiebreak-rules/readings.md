# Readings before scoring

The README remains the rule. The supplied `readings.mjs`, its tests, the
June count and its outputs, and the app pin and helper are unchanged. The
review of the supplied readers found no mismatch with the rule. These are
the choices for the owner to confirm before scoring.

| Place where a choice was needed | Reading used |
|---|---|
| Phase-one timing and the stop before scoring | Time the board and Maia on the first 300 July games only. Do not call the referee, probe a tablebase, compute soundness or read a study score. Price referee work from the completed rules-after-check aggregate timings. The scorer's timing mode exists for later reviewed use and discards judgments and evidence; this phase does not run it. |
| The scan after a unit fills its cap | Finish every game's scan, including Maia wherever any unit is in its situation. The cap affects selection, not the scan or coverage. |
| A game with its own initial position | Skip and count any stream record containing `initialFen`, including a header that names the ordinary initial position. A failed replay of an otherwise eligible game stops the worker rather than shortening the game. |
| Reference-only situations | They receive Maia because the reference is a unit. They do not receive the planted control unless one of the six rule units is also in its situation, as the supplied reader requires. |
| Drawing and caps | Keep each unit's splitting positions in chronological order within a game, then use one draw from the predecessor's seeded generator with game id, NUL and unit id. Merge shards by the game's original stream index before keeping the first 3,000 draws per unit and month. The draw and cap pool both players and both bands. |
| A shared position | Share the referee within one occurrence identified by month, game and ply. Repeated FENs at different plies or in different games are separate occurrences. A position kept for several units retains all those units on one row. |
| Referee move order | Visit units in the supplied `UNITS` order and their F then B, discarding duplicate moves. Clear the engine once, search the best once, then search these distinct moves in that order. The move played has no additional search. |
| Tablebase failure | Use the predecessor's retry helper and its backoff. An unavailable probe or a missing outcome leaves the occurrence pending and stops for review. There is no Stockfish fallback at seven men or fewer. |
| Phase | Opening positions remain eligible from ply 8 when they pass the supplied entry test. Report opening, middlegame and endgame as the app reads them. |
| The tension file split | Read the origin file of the lever capture among the compared pair, which is B for tension. Do not use another lever on the board. |
| The trade-piece split | Read the captured piece of the compared even trade for trades-ahead, trades-behind, trades-level, bishop-for-knight and knight-for-bishop. The two bishop/knight units therefore have a constant piece kind. Other units have no trade-piece split. |
| Shared bootstrap population | In each period, resample the union of games represented by any retained unit, including the control and reference. Use month and game together for identity. All units and cells use those same multiplicities. Start the registered seed afresh for each period; July and August are pooled before resampling. |
| Rule means | Compute each unit's measure first, then take the unweighted mean across the rule's units on the point estimate and on every draw. Do not pool their positions or orders. A missing component makes that draw's rule measure undefined. |
| Undefined draws | If any of the registered resamples lacks a denominator, keep the point estimate when defined but leave the interval undefined and report the number of missing draws. Never drop those draws to form an interval. |
| The enough-data label | Record each unit's held-out total and both order counts, and name the failing unit and counts in the label. Do not hide an order failure behind a pooled n. The control gate withholds rule verdicts first; count failures are still reported separately. |
| Worth switching | Report the stated break-first interval criterion as a Boolean beside the verdict. It changes no verdict. If the control or count gate fails, the marker is explicitly descriptive, not a verdict. |
| The two halves and the reference | Describe each half also with the one-unit decision and the same control and count gates. The reference has measures but no rule verdict. |
| Examples and their supply | Draw six examples for each of all eight units, including the control and reference, independently of verdicts and the control result. Candidates are in retained stream order. Use the predecessor's sampler with unit id, NUL and `examples`. If a unit has fewer than six one-sound candidates, stop rather than shrink or substitute the sample. |
| Example evidence | F and B have soundness and mover win% from their own saved referee evidence. The played move is SAN only; it is not judged. Show the best from the first exact Stockfish line, or the app's tablebase best. Do not rejudge any move. |

The scanner imports the app's `humanPolicy` through `createNodeEngine`.
The inherited stream stores compact PGN move text. The predecessor's
`sansOf()` parses it, its stored ply count must agree, and the app then
replays every move before scanning the game.
The new checkout has its packages but no local Maia cache. It uses the
existing model file under the earlier measured checkout, through the app's
`nodeHumanModel` directory option. The content freeze binds that model and
the current app's model definition. Downloads are disabled. Nothing is
installed, and neither app tree is changed.

The measurement manifest freezes this source set, the unchanged rule before
`## Files`, the complete README, the supplied readers and June artifacts,
the app source, installed dependencies, engine and Maia assets, bridge
files, predecessor helper sources and the six game-stream files. Stream
summaries and compressed game bytes must agree before any game is parsed.
A stale, unused `stockfish.wasm` dependency alias points outside this clone.
The freeze binds its link text by hash without following it. The app uses
the separately hashed `stockfish-18-lite-single` assets inside this clone;
no dependency is repaired or installed.
A separate timing manifest binds the completed July timing journals and
their script-written report without changing the measurement freeze.
Neither manifest records a commit of this branch.

Each heavy worker runs at nice 10. Full scans and scoring use two shards.
The detached driver writes file logs and holds `caffeinate -s -i`; it checks
the power source and the open lid before starting and during the run. The
full run requires AC; the short timing slice may use battery, on which `-i`
prevents idle sleep and `-s` is ineffective. Loss of AC during a full run,
an unreadable power state or a closed lid stops for review. The driver stops heavy work at 12:59:50 UTC
and resumes after 15:30. Scheduled pauses resume automatically; other
failures do not. Completed journals are hash-checked before any tail repair;
only an incomplete output of this project may lose its interrupted last
line. A restart repeats at most an unfinished game or occurrence.

The registered analysis, examples, answer and paper have not been run or
written in this phase. The timing report contains counts and times only.
