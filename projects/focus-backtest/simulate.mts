// What the focus's grade says when nothing changed, and when something did.
//
// Each run draws, independently and with replacement from the archive's games,
// an older 100-game history, the 100 games the picker reads, and a window of
// games after it, so the truth is known: nothing changes between them. The
// app's own rankFocus picks the cause, preregister freezes it, and gradeFocus
// grades it on the window, exactly as the weekly would. The same draws are then
// graded again with part of the player's loss on the chosen cause removed
// (each of his moves on the cause loses nothing, with probability r), so the
// improvement is known too.
//
// Beside the app's grade, the run scores candidate grades on the same draws
// (the rules are fixed in the README before any number was read):
//   control   the app's grade on a cause drawn at random instead of the top one
//             (no selection: what is left is the test itself)
//   posterior the app's grade without its CUSUM early pass
//   fresh     a permutation test of the window against the OLDER 100 games,
//             which played no part in choosing the cause
//   permove   the same test on points per move of the cause, not per game
//
//   bridge/run.sh projects/focus-backtest/simulate.mts [--runs 4000] [--seed 1]
//
// Writes results/simulate.json (rates and quantiles only); the per-run rows go
// to private/focus-backtest/.
import fs from 'node:fs'
import { join } from 'node:path'
import { app, appCommit, archiveGames, metricsOver, rng } from './lib.mts'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { rankFocus, preregister, gradeFocus, causeLoss, BASELINE_GAMES, FOCUS_WINDOW, SUCCESS_P } = app.method
const { LEAK_CAUSES } = app.metrics

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const RUNS = arg('runs', 4000)
const SEED = arg('seed', 1)
const PERMS = arg('perms', 400)
/** Shares of his loss on the cause removed in the window (0 is the null). */
const CUTS = [0, 0.1, 0.25, 0.5]
/** Window lengths graded on the same draws: the app's 40, about two weeks, about three. */
const WINDOWS = [40, 80, 120]
const MAXW = Math.max(...WINDOWS)
/** One-sided level matching the app's P(improved) >= 0.9. */
const ALPHA = 1 - SUCCESS_P

const pool = archiveGames().filter((g: any) => g.ptDay !== null && g.moves.length > 0)
const padding = pool.map((g: any) => ({ ...g, ptDay: '2000-01-01' }))
const OLD_DAY = '2000-01-02'
const REG_DAY = '2000-01-03'
const WIN_DAY = '2000-01-04'
const rand = rng(SEED)
const draw = (n: number, day: string) => Array.from({ length: n }, () => ({ ...pool[Math.floor(rand() * pool.length)], ptDay: day }))
const causeOf = (id: string) => LEAK_CAUSES.find((c: any) => c.id === id)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * A copy of the window games with each of his moves on the cause giving
 * nothing away when its fixed uniform falls below r, so a move removed at one
 * cut is removed at every larger cut (the cuts are compared on the same draws).
 */
function thin(games: any[], cause: any, r: number, us: number[][]): any[] {
  if (r === 0) return games
  return games.map((g, i) => ({
    ...g,
    moves: g.moves.map((m: any, j: number) => {
      if (m.mover !== 'me' || m.evalBefore === null || m.evalAfter === null || !cause.test(m, g)) return m
      return us[i][j] < r ? { ...m, evalAfter: m.evalBefore } : m
    }),
  }))
}

/**
 * One-sided permutation p-value that the window's statistic is below the
 * baseline's. `stat` reads a set of games' {mine, moves} rows: the per-game
 * mean, or the ratio of sums (points per move of the cause).
 */
function permP(base: Array<{ mine: number; moves: number }>, win: Array<{ mine: number; moves: number }>, stat: (rows: Array<{ mine: number; moves: number }>) => number, u: () => number): number {
  const obs = stat(base) - stat(win)
  const all = [...base, ...win]
  let hits = 0
  for (let p = 0; p < PERMS; p++) {
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(u() * (i + 1))
      const t = all[i]
      all[i] = all[j]
      all[j] = t
    }
    if (stat(all.slice(0, base.length)) - stat(all.slice(base.length)) >= obs) hits++
  }
  return (1 + hits) / (PERMS + 1)
}
const perGame = (rows: Array<{ mine: number }>) => mean(rows.map((r) => r.mine))
const perMove = (rows: Array<{ mine: number; moves: number }>) => {
  const moves = rows.reduce((s, r) => s + r.moves, 0)
  return moves ? rows.reduce((s, r) => s + r.mine, 0) / moves : 0
}

const rows: any[] = []
const t0 = Date.now()
for (let run = 0; run < RUNS; run++) {
  const older = draw(BASELINE_GAMES, OLD_DAY)
  const baseline = draw(BASELINE_GAMES, REG_DAY)
  const window = draw(MAXW, WIN_DAY)
  const history = [...padding, ...older, ...baseline]
  const reg = metricsOver(history)
  const k = reg.winCurve().k
  const ranked = rankFocus(reg, { asOf: REG_DAY, history: [] })
  if (!ranked.length) continue
  const chosen = ranked[0]
  const focus = preregister(chosen, reg, REG_DAY)
  const cause = causeOf(chosen.cause)
  const control = ranked[Math.floor(rand() * ranked.length)]
  const controlFocus = preregister(control, reg, REG_DAY)
  const lossRows = (games: any[], c: any) => games.map((g: any) => causeLoss(g, c, k) ?? { mine: 0, theirs: 0, moves: 0 })
  const olderRows = lossRows(older, cause)
  const row: any = {
    run,
    cause: chosen.cause,
    control: control.cause,
    score: chosen.score,
    gap: chosen.leak.gap,
    baseline: focus.baseline,
    target: focus.target,
    targetCut: focus.baseline.mean > 0 ? (focus.baseline.mean - focus.target) / focus.baseline.mean : null,
    olderMean: perGame(olderRows),
    grades: {} as any,
  }
  const u = rng(SEED * 1_000_003 + run)
  const us = window.map((g: any) => g.moves.map(() => u()))
  for (const r of CUTS) {
    const win = thin(window, cause, r, us)
    const m = metricsOver([...history, ...win])
    for (const w of WINDOWS) {
      const g = gradeFocus({ ...focus, window: w }, m, WIN_DAY)
      const winRows = lossRows(win.slice(0, w), cause)
      const cell: any = {
        state: g.state,
        alarmAt: g.alarmAt,
        pImproved: g.pImproved,
        mean: g.mean,
        se: g.se,
        moves: winRows.reduce((s, x) => s + x.moves, 0),
        pFresh: permP(olderRows, winRows, perGame, u),
        pPerMove: permP(olderRows, winRows, perMove, u),
      }
      if (r === 0) {
        const cg = gradeFocus({ ...controlFocus, window: w }, m, WIN_DAY)
        cell.control = { state: cg.state, alarmAt: cg.alarmAt, pImproved: cg.pImproved }
      }
      row.grades[`${r}@${w}`] = cell
    }
  }
  rows.push(row)
  if ((run + 1) % 250 === 0) console.error(`${run + 1}/${RUNS} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
}

const tag = process.env.CANDIDATE ?? 'base'
fs.writeFileSync(join(privateDir('focus-backtest'), `simulate-runs-${tag}-${SEED}.json`), JSON.stringify(rows))

const rate = (xs: boolean[]) => ({ n: xs.length, k: xs.filter(Boolean).length, p: xs.filter(Boolean).length / xs.length })
const q = (xs: number[], p: number) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}
const summary: any = { byCell: {}, causes: {}, controls: {} }
for (const r of CUTS) {
  for (const w of WINDOWS) {
    const key = `${r}@${w}`
    const gs = rows.map((x) => x.grades[key])
    summary.byCell[key] = {
      cut: r,
      window: w,
      app: rate(gs.map((g) => g.state === 'met')),
      appByCusum: rate(gs.map((g) => g.alarmAt !== null)),
      posterior: rate(gs.map((g) => g.pImproved !== null && g.pImproved >= SUCCESS_P)),
      fresh: rate(gs.map((g) => g.pFresh <= ALPHA)),
      permove: rate(gs.map((g) => g.pPerMove <= ALPHA)),
      appNotMet: rate(gs.map((g) => g.state === 'not-met')),
      appNotMetUnclear: rate(gs.map((g) => g.state === 'not-met' && g.pImproved !== null && g.pImproved > 1 - SUCCESS_P)),
      control: r === 0 ? rate(gs.map((g) => g.control.state === 'met')) : null,
      controlByCusum: r === 0 ? rate(gs.map((g) => g.control.alarmAt !== null)) : null,
      controlPosterior: r === 0 ? rate(gs.map((g) => g.control.pImproved !== null && g.control.pImproved >= SUCCESS_P)) : null,
    }
  }
}
for (const x of rows) summary.causes[x.cause] = (summary.causes[x.cause] ?? 0) + 1
for (const x of rows) summary.controls[x.control] = (summary.controls[x.control] ?? 0) + 1
summary.targetCut = { median: q(rows.map((x) => x.targetCut), 0.5), p10: q(rows.map((x) => x.targetCut), 0.1), p90: q(rows.map((x) => x.targetCut), 0.9) }
// The cut the app's posterior needs at 40 games: 1.2816 standard errors of the baseline's spread.
summary.neededCut40 = (() => {
  const xs = rows.map((x) => (1.2815516 * x.baseline.sd) / Math.sqrt(40) / x.baseline.mean)
  return { median: q(xs, 0.5), p10: q(xs, 0.1), p90: q(xs, 0.9) }
})()
summary.baseline = { meanMedian: q(rows.map((x) => x.baseline.mean), 0.5), sdMedian: q(rows.map((x) => x.baseline.sd), 0.5), cvMedian: q(rows.map((x) => x.baseline.sd / x.baseline.mean), 0.5) }
// Regression to the mean: with nothing changed, the window against the baseline that chose it, and against the older games.
summary.nullDrift = (() => {
  const xs = rows.map((x) => (x.grades['0@40'].mean - x.baseline.mean) / x.baseline.mean)
  const ys = rows.map((x) => (x.olderMean - x.baseline.mean) / x.baseline.mean)
  return { windowVsBaselineMedian: q(xs, 0.5), windowVsBaselineMean: mean(xs), olderVsBaselineMedian: q(ys, 0.5), olderVsBaselineMean: mean(ys) }
})()

const out = { project: 'focus-backtest', app: await appCommit(), candidate: process.env.CANDIDATE ?? null, runs: rows.length, seed: SEED, perms: PERMS, alpha: ALPHA, pool: pool.length, cuts: CUTS, windows: WINDOWS, summary }
const file = join(resultsDir('focus-backtest'), process.env.CANDIDATE ? `simulate-${process.env.CANDIDATE}.json` : 'simulate.json')
fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n')
console.error(`wrote ${file} in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
