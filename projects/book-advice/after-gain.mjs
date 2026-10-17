// 6a: are serious errors more common in the three moves after a player wins
// material than in positions alike? By the README's rule.
//
//   bridge/run.sh projects/book-advice/after-gain.mjs
//
// Reads every player-game of both bands and his games from the move facts and
// the board, and writes counts only to results/after-gain.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'
import { archiveGames, bandOf, mulberry32, playerGames, records } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')

const GAIN = 2
const WINDOW = 3
const LIFT = 1.1
const RESAMPLES = 2000
const SEED = 20261015
const GROUPS = ['his', 'above', 'archive']
const FULL_CLOCK = 600
const CLOCK_EDGES = [60, 180]
const PHASES = ['opening', 'middlegame', 'endgame']
const GAIN_BINS = [[2, 2], [3, 4], [5, Infinity]]
const WP_BINS = 10
const STRATA = WP_BINS * 2 * 2 * PHASES.length * (CLOCK_EDGES.length + 1)
const LOOSE_STRATA = WP_BINS * 2 * 2

const changes = (m) => m.captured !== null || m.promotion !== null
const clockBin = (s) => CLOCK_EDGES.filter((e) => s >= e).length
const gainBin = (gain) => GAIN_BINS.findIndex(([lo, hi]) => gain >= lo && gain <= hi)

/** His winning runs: the event ply of each, with the material it won, and every ply of his inside them. */
function winningRuns(g) {
  const n = g.moves.length
  const bal = (i) => (g.moves[i].mover === 'me' ? g.moves[i].material : -g.moves[i].material)
  const events = []
  const inRun = new Set()
  let i = 0
  while (i < n) {
    if (!changes(g.moves[i])) {
      i++
      continue
    }
    let e = i
    while (e + 1 < n && changes(g.moves[e + 1])) e++
    if (e + 1 < n) {
      const gain = bal(e + 1) - bal(i)
      const mine = []
      for (let j = i; j <= e; j++) if (g.moves[j].mover === 'me') mine.push(j)
      if (mine.length && gain >= GAIN) {
        events.push({ ply: mine[mine.length - 1], gain })
        for (const j of mine) inRun.add(j)
      }
    }
    i = e + 1
  }
  return { events, inRun }
}

/**
 * One player-game's counted moves: each graded move of his with its two strata, whether it is in a window (the
 * offset 1 to 3 after the latest event, 0 for a control) and its outcome.
 */
function movesOf(g, danger, skipped) {
  const { events, inRun } = winningRuns(g)
  const windowAt = new Map()
  for (const ev of events) {
    for (let k = 1; k <= WINDOW; k++) {
      const ply = ev.ply + 2 * k
      if (ply < g.moves.length) windowAt.set(ply, { k, gain: gainBin(ev.gain) })
    }
  }
  const out = []
  for (const m of g.moves) {
    if (m.mover !== 'me' || !m.graded) continue
    const w = windowAt.get(m.ply) ?? null
    if (!w && inRun.has(m.ply)) continue
    const clock = m.ply < 2 ? FULL_CLOCK : m.clockBefore
    if (clock === null) {
      skipped.noClock++
      continue
    }
    if (m.tense === null) {
      skipped.noTension++
      continue
    }
    const wp = Math.min(WP_BINS - 1, Math.floor(m.wpBefore / 10))
    const kd = danger[m.ply] ? 1 : 0
    const loose = (wp * 2 + (m.tense ? 1 : 0)) * 2 + kd
    const s = (loose * PHASES.length + PHASES.indexOf(m.phase)) * (CLOCK_EDGES.length + 1) + clockBin(clock)
    out.push({ s, loose, k: w ? w.k : 0, gain: w ? w.gain : -1, serious: m.serious ? 1 : 0, noMiss: m.serious && m.cls !== 'miss' ? 1 : 0 })
  }
  return out
}

/** Whether the mover's king shows either sign before each ply. */
function dangerOf(g, fens) {
  return g.moves.map((m) => {
    const d = K.kingDanger(fens[m.ply], m.color)
    return d !== null && d.signs.length > 0
  })
}

function blankGroup() {
  return { playerGames: 0, events: 0, gains: GAIN_BINS.map(() => 0), games: [], skipped: { noClock: 0, noTension: 0, noReplay: 0 } }
}

const groups = Object.fromEntries(GROUPS.map((k) => [k, blankGroup()]))

function addGame(group, g, fens, danger) {
  const G = groups[group]
  const moves = movesOf(g, danger, G.skipped)
  const { events } = winningRuns(g)
  G.playerGames++
  G.events += events.length
  for (const ev of events) G.gains[gainBin(ev.gain)]++
  if (moves.length) G.games.push(moves)
}

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const LIMIT = arg('limit', Infinity)
const t0 = Date.now()
let seen = 0
for await (const rec of records()) {
  if (seen >= LIMIT) break
  const pgs = [...playerGames(rec)].map((pg) => ({ ...pg, band: bandOf(pg.rating) })).filter((pg) => pg.band)
  if (!pgs.length) continue
  const g0 = pgs[0].g
  const fens = K.replayFens(g0.moves.map((m) => m.san))
  if (fens.length !== g0.moves.length + 1) {
    for (const pg of pgs) groups[pg.band].skipped.noReplay++
    continue
  }
  const danger = dangerOf(g0, fens)
  for (const pg of pgs) addGame(pg.band, pg.g, fens, danger)
  if (++seen % 5000 === 0) console.error(`${seen} games, ${Math.round((Date.now() - t0) / 1000)} s`)
}
console.error(`lichess: ${seen} games, ${Math.round((Date.now() - t0) / 1000)} s`)
const archive = await archiveGames()
for (const x of archive.games) {
  const fens = K.replayFens(x.g.moves.map((m) => m.san))
  if (fens.length !== x.g.moves.length + 1) {
    groups.archive.skipped.noReplay++
    continue
  }
  addGame('archive', x.g, fens, dangerOf(x.g, fens))
}
console.error(`archive: ${archive.games.length} games, ${Math.round((Date.now() - t0) / 1000)} s`)

/** A group's counted moves as flat columns, with each player-game's first row, for fast resampling. */
function columns(games) {
  let n = 0
  for (const g of games) n += g.length
  const cols = { start: new Int32Array(games.length + 1), s: new Int16Array(n), loose: new Int16Array(n), k: new Int8Array(n), gain: new Int8Array(n), serious: new Uint8Array(n), noMiss: new Uint8Array(n) }
  let j = 0
  games.forEach((g, i) => {
    cols.start[i] = j
    for (const m of g) {
      cols.s[j] = m.s
      cols.loose[j] = m.loose
      cols.k[j] = m.k
      cols.gain[j] = m.gain
      cols.serious[j] = m.serious
      cols.noMiss[j] = m.noMiss
      j++
    }
  })
  cols.start[games.length] = j
  return cols
}

/**
 * Every measure of a resample of the player-games (weights: how many times each is drawn, all 1 for the point
 * estimate): per stratum, the window moves and their serious errors against the controls' rate.
 */
function measures(cols, weights) {
  const S = STRATA
  const acc = {
    C: new Float64Array(S), c: new Float64Array(S), cm: new Float64Array(S), W: new Float64Array(S), w: new Float64Array(S), wm: new Float64Array(S),
    CL: new Float64Array(LOOSE_STRATA), cL: new Float64Array(LOOSE_STRATA), WL: new Float64Array(LOOSE_STRATA), wL: new Float64Array(LOOSE_STRATA),
    Wk: new Float64Array(WINDOW * S), wk: new Float64Array(WINDOW * S), Wg: new Float64Array(GAIN_BINS.length * S), wg: new Float64Array(GAIN_BINS.length * S),
  }
  const games = cols.start.length - 1
  for (let i = 0; i < games; i++) {
    const wt = weights[i]
    if (!wt) continue
    for (let j = cols.start[i]; j < cols.start[i + 1]; j++) {
      const s = cols.s[j]
      const l = cols.loose[j]
      const e = cols.serious[j]
      if (cols.k[j] === 0) {
        acc.C[s] += wt
        acc.c[s] += wt * e
        acc.cm[s] += wt * cols.noMiss[j]
        acc.CL[l] += wt
        acc.cL[l] += wt * e
        continue
      }
      acc.W[s] += wt
      acc.w[s] += wt * e
      acc.wm[s] += wt * cols.noMiss[j]
      acc.WL[l] += wt
      acc.wL[l] += wt * e
      const k = (cols.k[j] - 1) * S + s
      acc.Wk[k] += wt
      acc.wk[k] += wt * e
      const g = cols.gain[j] * S + s
      acc.Wg[g] += wt
      acc.wg[g] += wt * e
    }
  }
  const sub = (a, i, n) => a.subarray(i * n, (i + 1) * n)
  return {
    primary: compare(acc.C, acc.c, acc.W, acc.w),
    evalAndDanger: compare(acc.CL, acc.cL, acc.WL, acc.wL),
    mistakesAndBlunders: compare(acc.C, acc.cm, acc.W, acc.wm),
    ...Object.fromEntries([1, 2, 3].map((k) => [`move${k}`, compare(acc.C, acc.c, sub(acc.Wk, k - 1, S), sub(acc.wk, k - 1, S))])),
    ...Object.fromEntries(GAIN_BINS.map((_, i) => [`gain${i}`, compare(acc.C, acc.c, sub(acc.Wg, i, S), sub(acc.wg, i, S))])),
  }
}

/** The window's serious errors against their expected number at the control rate of each window move's stratum. */
function compare(C, c, W, w) {
  let window = 0
  let errors = 0
  let expected = 0
  let dropped = 0
  let controls = 0
  let controlErrors = 0
  for (let s = 0; s < C.length; s++) {
    controls += C[s]
    controlErrors += c[s]
    if (!W[s]) continue
    if (!C[s]) {
      dropped += W[s]
      continue
    }
    window += W[s]
    errors += w[s]
    expected += (W[s] * c[s]) / C[s]
  }
  return {
    window,
    dropped,
    controls,
    rate: window ? errors / window : null,
    controlRate: controls ? controlErrors / controls : null,
    expectedRate: window ? expected / window : null,
    excess: window ? (errors - expected) / window : null,
    lift: expected ? errors / expected : null,
  }
}

const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4)
function measured(games) {
  const cols = columns(games)
  const point = measures(cols, new Uint16Array(games.length).fill(1))
  const draws = Object.fromEntries(Object.keys(point).map((k) => [k, { excess: [], lift: [] }]))
  const rnd = mulberry32(SEED)
  const weights = new Uint16Array(games.length)
  for (let b = 0; b < RESAMPLES; b++) {
    weights.fill(0)
    for (let i = 0; i < games.length; i++) weights[Math.floor(rnd() * games.length)]++
    const m = measures(cols, weights)
    for (const k of Object.keys(m)) {
      if (m[k].excess !== null) draws[k].excess.push(m[k].excess)
      if (m[k].lift !== null) draws[k].lift.push(m[k].lift)
    }
  }
  const ci = (xs) => {
    if (!xs.length) return null
    xs.sort((a, b) => a - b)
    const q = (p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))]
    return [r4(q(0.025)), r4(q(0.975))]
  }
  return Object.fromEntries(
    Object.entries(point).map(([k, p]) => [
      k,
      {
        windowMoves: p.window,
        droppedWindowMoves: p.dropped,
        controlMoves: p.controls,
        rate: r4(p.rate),
        controlRate: r4(p.controlRate),
        expectedRate: r4(p.expectedRate),
        excess: r4(p.excess),
        excessCi: ci(draws[k].excess),
        lift: r4(p.lift),
        liftCi: ci(draws[k].lift),
      },
    ]),
  )
}

const gainName = ([lo, hi]) => (hi === Infinity ? `${lo}+` : lo === hi ? `${lo}` : `${lo}-${hi}`)
const results = {}
for (const group of GROUPS) {
  const G = groups[group]
  const m = measured(G.games)
  console.error(`${group}: measured, ${Math.round((Date.now() - t0) / 1000)} s`)
  results[group] = {
    playerGames: G.playerGames,
    events: G.events,
    eventsByGain: Object.fromEntries(GAIN_BINS.map((b, i) => [gainName(b), G.gains[i]])),
    skipped: G.skipped,
    primary: m.primary,
    evalAndDanger: m.evalAndDanger,
    mistakesAndBlunders: m.mistakesAndBlunders,
    byMove: Object.fromEntries([1, 2, 3].map((k) => [k, m[`move${k}`]])),
    byGain: Object.fromEntries(GAIN_BINS.map((b, i) => [gainName(b), m[`gain${i}`]])),
  }
}
const his = results.his.primary
const holds = his.excessCi !== null && his.excessCi[0] > 0 && his.lift !== null && his.lift >= LIFT
const summary = {
  app: CHESS_DIR.split('/').pop(),
  month: process.env.BOOK_ADVICE_MONTH ?? '2026-09',
  rule: { gain: GAIN, window: WINDOW, lift: LIFT, resamples: RESAMPLES, seed: SEED, clockEdges: CLOCK_EDGES, wpBin: 10 },
  seconds: Math.round((Date.now() - t0) / 1000),
  archiveSkipped: archive.skipped,
  holds,
  groups: results,
}
if (LIMIT === Infinity) writeFileSync(join(resultsDir('book-advice'), 'after-gain.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ holds, his: results.his.primary, above: results.above.primary, archive: results.archive.primary }, null, 2))
