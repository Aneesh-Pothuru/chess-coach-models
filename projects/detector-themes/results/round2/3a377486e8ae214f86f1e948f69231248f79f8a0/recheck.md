# Shipped detector recheck

App commit `3a377486e8ae214f86f1e948f69231248f79f8a0`, with no candidate override, is compared with the previously measured `best-deflection-trapped` at app commit `f4bd63f19b343f686fb97ea4cf70b211c0bddc0a`. The original report, manifest and score inputs remain unchanged.

| Set | Puzzles | Reference agrees | Shipped agrees | Reference disagrees | Shipped disagrees |
|---|---:|---:|---:|---:|---:|
| app | 4630 | 2415 (52.160%) | 2415 (52.160%) | 1030 (22.246%) | 1030 (22.246%) |
| heldout | 20000 | 7671 (38.355%) | 7671 (38.355%) | 6722 (33.610%) | 6722 (33.610%) |

| Set | Best labels changed | Blunder label sets changed | Move concept sets changed | Any label changed |
|---|---:|---:|---:|---:|
| app | 0 | 0 | 0 | 0 |
| heldout | 0 | 0 | 0 | 0 |

Every saved label matches on both sets.

The scorer, app source files, dataset identities, private-label hashes and exact puzzle pairing were checked before reporting. Set-valued labels are compared without regard to order. Agreement totals are also checked against the saved concept TP/FP counts using the app’s own vocabulary.

This is a reproduction check. It adds no bootstrap, threshold or keep/drop decision. The JSON records source hashes and aggregate changes; no puzzle identifiers, positions or per-puzzle rows are written.
