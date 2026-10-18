# Maia player offsets: phase 1

Written by count.mjs. App commit f4bd63f19b343f686fb97ea4cf70b211c0bddc0a; records commit aed714ada579782ce73630596e59c8b65e74cb30. Data: the pinned archive and the accuracy project's frozen cases. No candidate likelihood, fit, first-choice share, Brier score, interval or verdict was computed.

648 usable games, 33522 moves: fitting 324 games / 17055 moves; held-out 324 / 16467. 8 games have no counted moves and remain bootstrap units. Player moves 16766; opponent moves 16756.

The frozen 60 cases join without missing games or rating/side mismatches: 32 fitting and 28 held out. Old recorded events in the held subset: 328 all, 244 verified. These are planning counts, not current-pin guard evidence.

The 2 newly rebuilt timing reviews yield 19 events, 12 verified. Event extraction was exercised without scoring their outcomes.

| Direction | Recorded held events | Verified |
|---|---:|---:|
| player-err | 162 | 116 |
| opp-err | 166 | 128 |

A has 441 parameter pairs; B has 147. Their union and baseline need 900016 move policies (449999 and 450017 per shard); the old held punish events imply 1927 diagonal policies. No effect is needed to count them.

| Step | Slice | Elapsed | Full run with two workers |
|---|---|---:|---:|
| Position rebuild | All games | 5.44 s | 5.44 s |
| Node Maia | 32 moves, 890 pairs | 10.27 s (longer worker) | 2.63 h |
| Routine reviews | 2 games, 140 plies | 108.40 s | 21.57 min for 28 games |
| Punish policies | Projected from Node policy timing | not separately timed | 20.64 s, old-event count |

Node startup/first call takes up to 0.374 s; subsequent work averages 21.03 ms per pair with both workers active. Review durations range from 80.23 to 108.40 worker seconds, or 1.347 s per ply together.

This review timing used nice -n 10 for the coordinator as well as nice -n 10 for its workers; priority was lowered twice. Reproduction commands now lower only worker priority.

Estimated inference and review time: 2.99 hours; allow 4.49 hours (1.5x) for sustained load on the fanless laptop. Policy storage projects to 841 MB. This excludes small preparation and fit/bootstrap passes. No Python backend is needed.

The app's Maia weights were downloaded into this clone: 84945775 bytes, SHA-256 f2ded336c9574510468382345ae66e9c4b6de80d6b5c72efbf9610fa612475e8, 3.01 seconds to fetch/check. No packages were installed.

The guard preserves equal-band opponent conditioning. Routine review uses the app service with one engine per worker, no tablebase requests, eval cache or review-store writes; all game files stay in this project’s private directory. The app pin and all shared project files stay unchanged.

Limits: the predecessor explored these games already; this is a held-out fit comparison, not fresh confirmation. The punish guard covers only the matched frozen subset. The phase-2 event counts can differ when the pinned review is rebuilt. Timings are small-slice projections, not a sustained benchmark.
