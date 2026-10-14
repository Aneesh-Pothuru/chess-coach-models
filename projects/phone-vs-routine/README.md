# Do the review on his phone and the routine's agree?

**The question.** The app reviews a game in two places. On a device, Game
Review sweeps each position at 100,000 nodes (a phone) or 250,000 (a desktop,
by the device's measured speed: `DESKTOP_KNPS` in the app's
`src/services/engine/tier.ts`), gives the deeper second look to at most a
quarter of the game's moves (`PASS2_SHARE`), and reads no tablebase. The
daily routine sweeps at a million nodes, gives every flagged move the second
look and reads the Lichess tablebase (`src/services/review/profiles.ts`,
`src/services/engine/budgets.ts`). The second look itself is the same 750,000
nodes everywhere. When he opens a game on his phone, does Game Review name the
same mistakes and blunders as the routine's review of it? Where it does not,
is the move one the device never looked at twice, and would a better choice of
second looks close the gap?

**The answer.** Not computed yet. The rule below was committed after one game
had been reviewed at the phone and routine profiles, to time them (its labels
were read: the one serious error agreed, four inaccuracies did not), and
before any other comparison; the results will be added under it.

## The data

The 60 games of the research records' frozen sample, drawn from his archive
by length and result (`accuracy-vs-chesscom/build-cases.mjs --frozen`). Each
is reviewed by the app's own entry point at the phone, desktop and routine
profiles (`accuracy-vs-chesscom/build-evidence.mjs`: a fresh engine and no
cache for every game, so a document depends only on the code and the game;
the engine is deterministic at fixed nodes on one thread). The documents are
his games, so they stay under `private/accuracy-vs-chesscom/evidence/`, which
the accuracy, explanation, judge and Maia projects share.

## The measures

All from the review documents, with the app's own definitions:

- **Serious:** the metrics service's `isSerious` on a ply's class (a mistake,
  a blunder or a miss).
- A routine serious error is **missed** by a device profile when the device's
  record of the same ply is not serious. A device's serious error is
  **extra** when the routine's record of that ply is not serious.
- The **miss share** is the missed plies over the routine's serious errors;
  the **extra share** is the extra plies over the device's serious errors.
- Beside them: the same shares for blunders alone, the plies whose class
  differs in any way, and each side's accuracy on the device minus on the
  routine.
- **Where a difference comes from.** For each missed or extra ply: whether the
  device gave it the second look (its record's evidence is `verified`) or
  left it at the sweep's reading (`provisional`), and whether the routine's
  reading of it came from the tablebase.

## The estimates

Shares are pooled over the 60 games. Intervals come from 2,000 bootstrap
draws over games (each game weighted by a Poisson(1) draw), seed 20261014:
the 95% percentile interval.

## The rule, fixed before any comparison was made

For each device profile, phone and desktop:

1. The device **agrees** with the routine when the upper ends of both the
   miss share's and the extra share's intervals lie below 5%.
2. It **differs** when the lower end of either interval lies above 5%.
3. Otherwise the 60 games cannot tell (**unclear**).

One in twenty is the line: a phone that missed more would, every few games,
leave out of his review an error the daily review names, which a player
reading both would notice within a week.

When a device differs and most of its missed or extra plies are ones it left
at the sweep's reading, the next round is the one the lab plan names: a
better choice of which moves get the second look
(`src/services/review/pipeline/flags.ts`) at the device's fixed budget, tuned
on these games' training half and held to the other.

## Also reported, without a rule

- Inaccuracies: the same shares.
- How many second looks each profile spent, and how many flagged plies the
  device's quota cut.
- The live coach's accept window. The Play screen's live coach types its own
  3 (`src/services/livecoach/verdict.ts`) instead of importing the review's
  `ACCEPT_WINDOW_WP`, so a change to the window would not reach it. A fact
  about the code, not a measurement.

## Caveats

- **Sixty games.** The frozen sample is his games of one stretch of the
  archive, sampled for an accuracy study.
- **The routine read in the lab is today's.** The daily reviews he has read
  were written from the routine's analysis on the app of their day; this
  compares the two profiles on one commit, so a difference is the profiles',
  not the app's history.
- **His phone's tier.** Which device profile his phone runs depends on its
  measured speed, so both are reported.

## Files

| File | What it does |
|---|---|
| `compare.mjs` | Reads the phone, desktop and routine documents of every case and writes the shares, intervals, the attribution and the rule's verdicts (`results/compare.json`, `results/compare.md`). |

## Running it

```bash
make chess
bridge/run.sh projects/accuracy-vs-chesscom/build-cases.mjs --frozen
for p in phone desktop routine; do
  bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile $p
done
bridge/run.sh projects/phone-vs-routine/compare.mjs
```

The documents and the per-ply comparisons stay under `private/`; `results/`
holds aggregates only.
