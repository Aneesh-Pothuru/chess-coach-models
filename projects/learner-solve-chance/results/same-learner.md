# Is the learner still the one round 2 measured?

Written by same-learner.mjs. Round 2 read the profile at app commit d18d5d2e53d1903e13aa2622d7815232aff7d451 (synced 2026-11-13) with that commit's own learner: 180 scored attempts on 9 days. Below, that profile and that commit's bank are read with the learner of another commit of the app, and everything round 2's rules 1 and 2 reported is computed again: both rules, the looks beside them, the learner's own self-check and the aim of each bucket's next set. Every value is held against results/round2.json. No attempt recorded after round 2's last is read.

| App commit | Committed | Scored attempts | Values compared | That differ | Source files that differ | Only at this commit | Only at round 2's | Of the five that fold a record and aim a set | The bank |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| `4ba253b` | 2026-11-04 09:54 UTC | 180 on 9 days | 429 | 0 | 9 of 57 | 0 | 2 | 0 | the same file |
| `d18d5d2`, the commit round 2 read | 2026-11-14 13:39 UTC | 180 on 9 days | 429 | 0 | 0 of 57 | 0 | 0 | 0 | the same file |
| `ce11a2c` | 2026-11-17 10:13 UTC | 180 on 9 days | 429 | 0 | 10 of 57 | 1 | 0 | 0 | the same file |

The source files are those under `src/services/learner` and `src/services/exercises/families` in the app, tests left out; the five are `src/services/learner/ability.ts`, `src/services/learner/channels.ts`, `src/services/learner/evidence.ts`, `src/services/learner/glicko.ts`, `src/services/learner/serve.ts`.

## App commit 4ba253b9e654248622c0069c62fbe72f26f316ee

Round 2 reproduces under this learner: all 429 values are the ones round 2 recorded, so the chance each estimate gives an attempt and the aim of a set are computed as they were.

Source files that differ from round 2's commit: `src/services/exercises/families/lessonWorkbook.ts`, `src/services/exercises/families/study.ts`, `src/services/learner/curriculum.ts`, `src/services/learner/doneness.ts`, `src/services/learner/index.ts`, `src/services/learner/learner.ts`, `src/services/learner/plan.ts`, `src/services/learner/ports.ts`, `src/services/learner/study.ts`. Only at this commit: none. Only at round 2's: `src/services/exercises/families/guessMoments.ts`, `src/services/exercises/families/guessWhy.ts`.

## App commit d18d5d2e53d1903e13aa2622d7815232aff7d451

The commit round 2 read, as the script's control: here it must give round 2's own numbers.

Round 2 reproduces under this learner: all 429 values are the ones round 2 recorded, so the chance each estimate gives an attempt and the aim of a set are computed as they were.

Source files that differ from round 2's commit: none. Only at this commit: none. Only at round 2's: none.

## App commit ce11a2cdb097a29c6495223373d98667236da11b

Round 2 reproduces under this learner: all 429 values are the ones round 2 recorded, so the chance each estimate gives an attempt and the aim of a set are computed as they were.

Source files that differ from round 2's commit: `src/services/exercises/families/puzzles.ts`, `src/services/exercises/families/serveOrder.ts`, `src/services/learner/competencies.ts`, `src/services/learner/index.ts`, `src/services/learner/learner.ts`, `src/services/learner/need.ts`, `src/services/learner/plan.ts`, `src/services/learner/ports.ts`, `src/services/learner/score.ts`, `src/services/learner/skillMap.ts`. Only at this commit: `src/services/learner/games.ts`. Only at round 2's: none.
