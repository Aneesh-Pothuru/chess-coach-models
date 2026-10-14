#!/usr/bin/env node
// Writes paper/generated.tex for the focus backtest: the weekly replay
// (results/replay.json) and the simulation (results/simulate.json). It refuses
// to write when a claim the paper makes no longer holds.
//
//   bridge/run.sh projects/focus-backtest/paper/generate.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resultsDir } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed, percent, word } from '../../paper.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const json = (name) => JSON.parse(readFileSync(join(resultsDir('focus-backtest'), name), 'utf8'))
const replay = json('replay.json')
const sim = json('simulate.json')
const g = new Generated('projects/focus-backtest/paper/generate.mjs')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
if (replay.app !== sim.app) throw new Error('the replay and the simulation measured different app commits')
g.def('AppCommit', replay.app.slice(0, 10))

// ---- the app's constants ----
const C = replay.constants
g.def('Window', String(C.FOCUS_WINDOW)).def('Baseline', String(C.BASELINE_GAMES)).def('SwitchRatio', String(C.SWITCH_RATIO)).def('SuccessP', String(C.SUCCESS_P))

// ---- the replay ----
const weeks = replay.weeks
const finished = replay.focuses.filter((f) => f.outcome === 'met' || f.outcome === 'not-met')
const met = finished.filter((f) => f.outcome === 'met').length
const switches = weeks.filter((w) => w.switched).length
// A week whose running focus had already been decided (its window filled, or its alarm fired) by the next Sunday.
const graded = weeks.filter((w) => w.runningGrade)
const filled = graded.filter((w) => w.runningGrade.state !== 'running').length
const perWeek = weeks.slice(1).map((w, i) => w.games - weeks[i].games).sort((a, b) => a - b)
const medianWeek = perWeek[Math.floor(perWeek.length / 2)]
g.def('ArchiveGames', String(replay.archive.games)).def('Weeks', word(weeks.length)).def('Focuses', word(replay.focuses.length))
g.def('Finished', word(finished.length)).def('Met', word(met)).def('NotMet', word(finished.length - met)).def('Switches', word(switches))
g.def('Graded', word(graded.length)).def('Filled', word(filled)).def('GamesPerWeek', String(medianWeek))
claim(medianWeek > C.FOCUS_WINDOW, 'he plays more games in a week than the focus window holds')
claim(filled >= graded.length - 1, 'all but at most one running focus had been decided by the next Sunday')

// Chance alone: met in at least this many of the finished focuses, at the simulated null rate.
const p0 = sim.summary.byCell['0@40'].app.p
const binomTail = (n, k, p) => {
  let s = 0
  for (let i = k; i <= n; i++) {
    let c = 1
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1)
    s += c * p ** i * (1 - p) ** (n - i)
  }
  return s
}
g.def('ChanceOfMet', percent(binomTail(finished.length, met, p0), 0))

// Does the picker's P(real) say which leaks are still there in the next 40 games?
const pairs = weeks.flatMap((w) => w.candidates.filter((c) => c.next40 && w.gamesAfter >= C.FOCUS_WINDOW).map((c) => ({ p: c.pReal, y: c.next40.gap > 0 ? 1 : 0 })))
const base = pairs.reduce((s, x) => s + x.y, 0) / pairs.length
const brier = (f) => pairs.reduce((s, x) => s + (f(x) - x.y) ** 2, 0) / pairs.length
const bP = brier((x) => x.p)
const bBase = brier(() => base)
g.def('MeanReal', percent(pairs.reduce((s, x) => s + x.p, 0) / pairs.length, 0)).def('Pairs', String(pairs.length)).def('StillThere', percent(base, 0)).def('BrierReal', fixed(bP, 3)).def('BrierBase', fixed(bBase, 3))
claim(bP >= bBase - 0.005, "the picker's P(real) does not beat a constant on the next 40 games")

// The week the picker chose a leak it was least sure of.
const weakest = weeks.map((w) => ({ w, c: w.candidates.find((c) => c.cause === w.chosen) })).filter((x) => x.c && x.w.switched).sort((a, b) => a.c.pReal - b.c.pReal)[0]
g.def('WeakestReal', fixed(weakest.c.pReal, 2)).def('WeakestGap', fixed(weakest.c.gap, 2)).def('WeakestSe', fixed(weakest.c.se, 2))
claim(weakest.c.pReal <= 0.6, 'one switch went to a leak the picker gave even odds of being real')

// ---- the simulation ----
const S = sim.summary
g.def('Runs', sim.runs.toLocaleString('en-US')).def('Pool', String(sim.pool)).def('Perms', String(sim.perms)).def('Level', percent(sim.alpha, 0))
const cell = (r, w) => S.byCell[`${r}@${w}`]
const ROWS = [
  ['the app', (c) => c.app],
  ['\\quad its CUSUM alarm alone', (c) => c.appByCusum],
  ['\\quad its posterior alone', (c) => c.posterior],
  ['fresh (per game)', (c) => c.fresh],
  ['fresh, per move', (c) => c.permove],
]
const table = (w) =>
  [
    '\\begin{tabular}{lrrrr}',
    '\\toprule',
    `grade, ${w} games & ${sim.cuts.map((r) => (r === 0 ? 'no change' : `${percent(r, 0)}\\% cut`)).join(' & ')} \\\\`,
    '\\midrule',
    ...ROWS.map(([name, f]) => `${name} & ${sim.cuts.map((r) => percent(f(cell(r, w)).p, 1)).join(' & ')} \\\\`),
    `random cause, the app's grade & ${percent(cell(0, w).control.p, 1)} & & & \\\\`,
    '\\bottomrule',
    '\\end{tabular}',
  ].join('\n')
for (const [w, name] of [[40, 'TableForty'], [80, 'TableEighty'], [120, 'TableHundred']]) g.block(name, table(w))

const se = Math.sqrt((sim.alpha * (1 - sim.alpha)) / sim.runs)
for (const w of sim.windows) {
  const c = cell(0, w)
  claim(c.app.p > 2 * sim.alpha, `the app's grade says met at more than twice its level with nothing changed (${w} games)`)
  claim(c.control.p > 2 * sim.alpha, `a random cause is graded met at more than twice the level (${w} games)`)
  claim(c.fresh.p <= sim.alpha + 2 * se && c.permove.p <= sim.alpha + 2 * se, `the fresh tests hold their level (${w} games)`)
  for (const r of sim.cuts.filter((x) => x > 0)) claim(cell(r, w).permove.p > cell(r, w).fresh.p, `per move sees more than per game (${r} at ${w})`)
}
claim(cell(0, 120).app.p > cell(0, 40).app.p, 'a longer window says met more often with nothing changed')
g.def('NullApp', percent(cell(0, 40).app.p, 0)).def('NullAppLong', percent(cell(0, 120).app.p, 0))
g.def('NullCusum', percent(cell(0, 40).appByCusum.p, 0)).def('NullPosterior', percent(cell(0, 40).posterior.p, 0))
g.def('NullControl', percent(cell(0, 40).control.p, 0)).def('NullControlPosterior', percent(cell(0, 40).controlPosterior.p, 0))
g.def('NullFresh', percent(cell(0, 40).fresh.p, 1)).def('NullPerMove', percent(cell(0, 40).permove.p, 1))
g.def('NotMetUnclear', percent(cell(0, 40).appNotMetUnclear.p / cell(0, 40).appNotMet.p, 0))
g.def('QuarterApp', percent(cell(0.25, 40).app.p, 0)).def('QuarterPerMove', percent(cell(0.25, 40).permove.p, 0)).def('QuarterPerMoveLong', percent(cell(0.25, 120).permove.p, 0))
g.def('HalfPerMove', percent(cell(0.5, 40).permove.p, 0)).def('HalfPerMoveLong', percent(cell(0.5, 120).permove.p, 0))
// The app's grade, net of what it says with nothing changed.
g.def('QuarterAppNet', percent(cell(0.25, 40).app.p - cell(0, 40).app.p, 0)).def('QuarterPerMoveNet', percent(cell(0.25, 40).permove.p - cell(0, 40).permove.p, 0))

// Targets, power and regression to the mean.
g.def('TargetCut', percent(S.targetCut.median, 0)).def('TargetCutLo', percent(S.targetCut.p10, 0)).def('TargetCutHi', percent(S.targetCut.p90, 0))
g.def('NeededCut', percent(S.neededCut40.median, 0)).def('Cv', fixed(S.baseline.cvMedian, 1))
claim(S.targetCut.median < S.neededCut40.median / 2, 'the median target asks for less than half the cut 40 games can see')
g.def('DriftWindow', percent(-S.nullDrift.windowVsBaselineMedian, 0)).def('DriftOlder', percent(-S.nullDrift.olderVsBaselineMedian, 0))
claim(S.nullDrift.windowVsBaselineMedian < 0 && S.nullDrift.olderVsBaselineMedian < 0, 'the chosen baseline sits above both the older games and the window')
const causes = Object.entries(S.causes).sort((a, b) => b[1] - a[1])
g.def('TopCause', causes[0][0]).def('TopCauseShare', percent(causes[0][1] / sim.runs, 0))

// ---- the candidate grade: per move against older games, three verdicts, a longer hold ----
const cand = json('simulate-permove.json')
const candFresh = json('simulate-permove-seed2.json')
const baseFresh = json('simulate-seed2.json')
const candReplay = json('replay-permove.json')
for (const x of [cand, candFresh, baseFresh, candReplay]) if (x.app !== sim.app) throw new Error('the candidate was measured on a different app commit')
claim(cand.candidate === 'permove' && candFresh.candidate === 'permove' && candReplay.candidate === 'permove', "the candidate's files are the permove candidate's")
claim(cand.seed === sim.seed && candFresh.seed !== sim.seed && baseFresh.seed === candFresh.seed, 'the candidate ran on the same draws and again on fresh ones')
const K = candReplay.constants
const W = K.FOCUS_WINDOW
claim(cand.windows.includes(W), "the simulation grades at the candidate's own window")
g.def('CandWindow', String(W)).def('CandPerms', K.PERMUTATIONS.toLocaleString('en-US')).def('MetP', fixed(1 - K.SUCCESS_P, 1)).def('NotMetP', String(K.NOT_MET_P)).def('FreshSeed', String(candFresh.seed))
const at = (s, r, w) => s.summary.byCell[`${r}@${w}`]
const levelOf = (s) => s.alpha + 2 * Math.sqrt((s.alpha * (1 - s.alpha)) / s.runs)
for (const s of [cand, candFresh]) {
  for (const w of s.windows) {
    claim(at(s, 0, w).app.p <= levelOf(s), `the candidate holds its level with nothing changed (${w} games, seed ${s.seed})`)
    claim(at(s, 0, w).control.p <= levelOf(s), `the candidate holds its level on a random cause (${w} games, seed ${s.seed})`)
  }
}
// The candidate is the per-move test with its own shuffles: on the same draws it agrees with it everywhere.
for (const r of cand.cuts) for (const w of cand.windows) claim(Math.abs(at(cand, r, w).app.p - at(cand, r, w).permove.p) <= 0.02, `the candidate says what the per-move test says (${r} at ${w})`)
claim(at(baseFresh, 0, 40).app.p > 2 * baseFresh.alpha, "the app's false met replicates on fresh draws")
claim(at(cand, 0.25, W).app.p > 0.5, 'at its window the candidate sees a quarter cut more often than not')
g.def('CandNull', percent(at(cand, 0, 40).app.p, 1)).def('CandNullMid', percent(at(cand, 0, 80).app.p, 1)).def('CandNullLong', percent(at(cand, 0, W).app.p, 1))
g.def('CandNullFresh', percent(at(candFresh, 0, W).app.p, 1)).def('CandControl', percent(at(cand, 0, W).control.p, 1)).def('AppNullFresh', percent(at(baseFresh, 0, 40).app.p, 0))
g.def('CandTenthLong', percent(at(cand, 0.1, W).app.p, 0)).def('CandQuarterLong', percent(at(cand, 0.25, W).app.p, 0)).def('CandHalfLong', percent(at(cand, 0.5, W).app.p, 0)).def('CandQuarter', percent(at(cand, 0.25, 40).app.p, 0))
// What the weekly would print at the end of the window: the three verdicts' shares.
const verdicts = (c) => {
  const n = Object.values(c.states).reduce((a, b) => a + b, 0)
  return { met: (c.states.met ?? 0) / n, unclear: (c.states.unclear ?? 0) / n, notMet: (c.states['not-met'] ?? 0) / n, other: (n - (c.states.met ?? 0) - (c.states.unclear ?? 0) - (c.states['not-met'] ?? 0)) / n }
}
const vNull = verdicts(at(cand, 0, W))
const vQuarter = verdicts(at(cand, 0.25, W))
claim(vNull.other < 0.01 && vQuarter.other < 0.01, 'a full window almost always ends in one of the three verdicts')
claim(vQuarter.notMet < 0.15 && vNull.notMet > 0.4, 'not met is common with nothing changed and rare with a quarter cut')
g.def('VNullMet', percent(vNull.met, 1)).def('VNullUnclear', percent(vNull.unclear, 1)).def('VNullNotMet', percent(vNull.notMet, 1))
g.def('VQuarterMet', percent(vQuarter.met, 1)).def('VQuarterUnclear', percent(vQuarter.unclear, 1)).def('VQuarterNotMet', percent(vQuarter.notMet, 1))

// The replay under the candidate.
const cWeeks = candReplay.weeks
const chosenAt = cWeeks.map((w, i) => (w.switched || i === 0 ? i : null)).filter((i) => i !== null)
const spans = chosenAt.slice(1).map((i, j) => i - chosenAt[j])
const ended = cWeeks.filter((w) => w.switched && w.runningGrade)
const ends = { met: 0, unclear: 0, 'not-met': 0 }
for (const w of ended) ends[w.runningGrade.state] = (ends[w.runningGrade.state] ?? 0) + 1
claim(ended.every((w) => ['met', 'unclear', 'not-met'].includes(w.runningGrade.state)), 'every replaced focus had been graded by its window')
claim(ends.met === 0, 'the candidate graded no replayed focus met')
g.def('CandFocuses', word(candReplay.focuses.length)).def('CandSpanMin', word(Math.min(...spans))).def('CandSpanMax', word(Math.max(...spans)))
g.def('CandUnclear', word(ends.unclear)).def('CandNotMet', word(ends['not-met']))
claim(candReplay.focuses.length < replay.focuses.length, 'the candidate holds fewer focuses over the same weeks')
// The focus the app graded met and the candidate not met: what each set of games read per move.
const flip = candReplay.focuses.find((f) => f.outcome === 'not-met' && replay.focuses.some((a) => a.cause === f.cause && a.startedOn === f.startedOn && a.outcome === 'met'))
claim(!!flip, 'a focus the app graded met is graded not met by the candidate')
const appFlip = replay.focuses.find((a) => a.cause === flip.cause && a.startedOn === flip.startedOn)
const rd = flip.read
claim(rd.window.perMove >= rd.reference.perMove && rd.baseline.perMove > rd.window.perMove && rd.baseline.perMove > appFlip.read.window.perMove, "that focus's baseline read above the games before it and the windows after it")
g.def('FlipCause', esc(flip.cause)).def('FlipReference', fixed(rd.reference.perMove, 2)).def('FlipBaseline', fixed(rd.baseline.perMove, 2))
g.def('FlipWindow', fixed(rd.window.perMove, 2)).def('FlipAppWindow', fixed(appFlip.read.window.perMove, 2))
g.def('FlipGameReference', fixed(rd.reference.perGame, 1)).def('FlipGameBaseline', fixed(rd.baseline.perGame, 1)).def('FlipGameAppWindow', fixed(appFlip.read.window.perGame, 1))

g.write(join(HERE, 'generated.tex'))
console.error('wrote projects/focus-backtest/paper/generated.tex')
