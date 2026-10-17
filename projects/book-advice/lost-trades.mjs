// 6b: when down material and losing, does an even trade of pieces lower the
// chance of saving the game? By the README's rule.
//
//   bridge/run.sh projects/book-advice/lost-trades.mjs
//
// Reads every player-game of both bands and his games, takes the first
// position in each that qualifies, and writes counts only to
// results/lost-trades.json.
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'
import { archiveGames, bandOf, mulberry32, playerGames, records, share } from './lib.mjs'

const K = await chess('src/services/knowledge/index.ts')
const B = await chess('src/services/metrics/facts/board.ts')
const ports = createRequire(import.meta.url)(join(CHESS_DIR, 'tools/coach-review/lib/facts-deps.cjs'))
const exchange = ports.positions().exchange

const BEHIND_CP = 300
const DOWN = 2
const PIECES = new Set(['n', 'b', 'r', 'q'])
const MIN_TRADES = 300
const DROP = 0.03
const RESAMPLES = 2000
const SEED = 20261015
const FULL_CLOCK = 600
const CLOCK_EDGE = 30
const RATING_FLOOR = 1250
const KINDS = ['plain', 'check', 'passed', 'pawnTrade', 'otherCapture', 'keep']
const TRADES = new Set(['plain', 'check', 'passed'])
const GROUPS = ['his', 'above', 'archive']

const arg = (name, d) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const LIMIT = arg('limit', Infinity)

/** The first position of his that qualifies, with the trade bits over the pieces he can take there. */
function firstPosition(g, fens) {
  for (const m of g.moves) {
    if (m.mover !== 'me' || !m.graded || m.inCheck || m.prevCapture) continue
    if (m.evalBefore > -BEHIND_CP || m.material > -DOWN) continue
    const fen = fens[m.ply]
    const options = new Chess(fen).moves({ verbose: true })
    const squares = [...new Set(options.filter((o) => o.captured && PIECES.has(o.captured)).map((o) => o.to))]
    if (!squares.length) continue
    const prev = m.ply > 0 ? g.moves[m.ply - 1] : null
    const played = { captured: m.captured ?? undefined, to: m.uci.slice(2, 4) }
    const bits = B.tradeBits(fen, squares, played, prev ? { captured: prev.captured !== null, to: prev.uci.slice(2, 4) } : null, exchange)
    if (bits & B.TRADE_HAS_EVEN) return { m, bits, moveNet: m.captured === null ? null : K.captureExchangeByMove(fen, m.uci) }
  }
  return null
}

function kindOf(m, bits, fens) {
  if (m.captured === null) return { kind: 'keep', check: false, passed: false }
  const even = (bits & B.TRADE_TOOK_EVEN) !== 0
  if (!even) return { kind: 'otherCapture', check: false, passed: false }
  if (m.captured === 'p') return { kind: 'pawnTrade', check: false, passed: false }
  const passedIn = (fen) => K.passedPawns(K.boardOf(fen), m.color).length
  const passed = passedIn(fens[Math.min(m.ply + 2, fens.length - 1)]) > passedIn(fens[m.ply])
  return { kind: m.check ? 'check' : passed ? 'passed' : 'plain', check: m.check, passed }
}

function rowOf(g, fens, rating, oppRating, archive) {
  const found = firstPosition(g, fens)
  if (!found) return null
  const { m, bits, moveNet } = found
  const { kind, check, passed } = kindOf(m, bits, fens)
  const down = -m.material
  const mine = m.ply < 2 ? FULL_CLOCK : m.clockBefore
  const theirs = g.moves[m.ply - 1].clock
  const gap = mine === null || theirs === null ? null : mine - theirs
  return {
    kind,
    check,
    passed,
    saved: g.score >= 0.5 ? 1 : 0,
    wp: Math.min(4, Math.floor(m.wpBefore / 5)),
    wpAfter: Math.min(5, Math.floor(m.wpAfter / 5)),
    down: down >= 5 ? 2 : down >= 3 ? 1 : 0,
    rating: archive ? 0 : Math.floor((rating - RATING_FLOOR) / 100),
    oppHigher: rating === null || oppRating === null ? 2 : oppRating > rating ? 1 : 0,
    clock: gap === null ? 3 : gap >= CLOCK_EDGE ? 0 : gap <= -CLOCK_EDGE ? 2 : 1,
    lossPct: m.lossPct,
    moveNet,
    ply: m.ply,
  }
}

const STRATA = {
  before: (r) => ((r.wp * 3 + r.down) * 4 + r.rating) * 3 + r.oppHigher,
  after: (r) => ((r.wpAfter * 3 + r.down) * 4 + r.rating) * 3 + r.oppHigher,
  clock: (r) => (((r.wp * 3 + r.down) * 4 + r.rating) * 3 + r.oppHigher) * 4 + r.clock,
}

/**
 * The save rate after `treat` minus the rate after keeping the pieces, within each stratum, weighted by the
 * treated positions of the strata that hold both.
 */
function difference(rows, treat, strata) {
  const by = new Map()
  for (const r of rows) {
    if (r.kind !== treat && r.kind !== 'keep') continue
    const s = strata(r)
    let b = by.get(s)
    if (!b) by.set(s, (b = { t: 0, ts: 0, k: 0, ks: 0 }))
    if (r.kind === treat) {
      b.t++
      b.ts += r.saved
    } else {
      b.k++
      b.ks += r.saved
    }
  }
  let used = 0
  let dropped = 0
  let sum = 0
  for (const b of by.values()) {
    if (!b.t) continue
    if (!b.k) {
      dropped += b.t
      continue
    }
    used += b.t
    sum += b.t * (b.ts / b.t - b.ks / b.k)
  }
  return { used, dropped, d: used ? sum / used : null }
}

const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4)
function withCi(rows, treat, strata) {
  const point = difference(rows, treat, strata)
  const rnd = mulberry32(SEED)
  const ds = []
  for (let b = 0; b < RESAMPLES; b++) {
    const pick = Array.from({ length: rows.length }, () => rows[Math.floor(rnd() * rows.length)])
    const x = difference(pick, treat, strata).d
    if (x !== null) ds.push(x)
  }
  ds.sort((a, b) => a - b)
  const q = (p) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))]
  return { trades: point.used, dropped: point.dropped, d: r4(point.d), ci: ds.length ? [r4(q(0.025)), r4(q(0.975))] : null }
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
function report(rows) {
  const of = (kind) => rows.filter((r) => r.kind === kind)
  return {
    positions: rows.length,
    kinds: Object.fromEntries(KINDS.map((k) => [k, of(k).length])),
    checkAndPassed: rows.filter((r) => r.kind === 'check' && r.passed).length,
    tradesTheMoveLoses: rows.filter((r) => TRADES.has(r.kind) && r.moveNet !== 0).length,
    traded: share(rows.filter((r) => TRADES.has(r.kind)).length, rows.length),
    saved: Object.fromEntries(KINDS.map((k) => [k, share(of(k).filter((r) => r.saved).length, of(k).length)])),
    lossPct: Object.fromEntries(KINDS.map((k) => [k, r4(mean(of(k).map((r) => r.lossPct)))])),
    primary: withCi(rows, 'plain', STRATA.before),
    evalAfter: withCi(rows, 'plain', STRATA.after),
    withClock: withCi(rows, 'plain', STRATA.clock),
    apart: Object.fromEntries(['check', 'passed', 'pawnTrade', 'otherCapture'].map((k) => [k, withCi(rows, k, STRATA.before)])),
  }
}

const rows = Object.fromEntries(GROUPS.map((k) => [k, []]))
const counts = Object.fromEntries(GROUPS.map((k) => [k, { playerGames: 0, noReplay: 0 }]))
const t0 = Date.now()
let seen = 0
for await (const rec of records()) {
  if (seen >= LIMIT) break
  const pgs = [...playerGames(rec)].map((pg) => ({ ...pg, band: bandOf(pg.rating) })).filter((pg) => pg.band)
  if (!pgs.length) continue
  const fens = K.replayFens(pgs[0].g.moves.map((m) => m.san))
  for (const pg of pgs) {
    counts[pg.band].playerGames++
    if (fens.length !== pg.g.moves.length + 1) {
      counts[pg.band].noReplay++
      continue
    }
    const row = rowOf(pg.g, fens, pg.rating, pg.oppRating, false)
    if (row) rows[pg.band].push(row)
  }
  if (++seen % 5000 === 0) console.error(`${seen} games, ${Math.round((Date.now() - t0) / 1000)} s`)
}
console.error(`lichess: ${seen} games, ${Math.round((Date.now() - t0) / 1000)} s`)
const archive = LIMIT === Infinity ? await archiveGames() : { games: [], skipped: {} }
for (const x of archive.games) {
  counts.archive.playerGames++
  const fens = K.replayFens(x.g.moves.map((m) => m.san))
  if (fens.length !== x.g.moves.length + 1) {
    counts.archive.noReplay++
    continue
  }
  const row = rowOf(x.g, fens, x.rating, x.oppRating, true)
  if (row) rows.archive.push(row)
}
console.error(`archive: ${archive.games.length} games, ${Math.round((Date.now() - t0) / 1000)} s`)

const results = {
  both: { ...report([...rows.his, ...rows.above]), playerGames: counts.his.playerGames + counts.above.playerGames },
  ...Object.fromEntries(GROUPS.map((k) => [k, { ...report(rows[k]), ...counts[k] }])),
}
const both = results.both.primary
const enough = both.trades >= MIN_TRADES
const holds = enough ? both.ci !== null && both.ci[1] < 0 && both.d <= -DROP : null
const summary = {
  app: CHESS_DIR.split('/').pop(),
  month: process.env.BOOK_ADVICE_MONTH ?? '2026-09',
  rule: { behindCp: BEHIND_CP, down: DOWN, minTrades: MIN_TRADES, drop: DROP, resamples: RESAMPLES, seed: SEED, clockEdge: CLOCK_EDGE },
  seconds: Math.round((Date.now() - t0) / 1000),
  archiveSkipped: archive.skipped,
  enough,
  holds,
  groups: results,
}
if (LIMIT === Infinity) writeFileSync(join(resultsDir('book-advice'), 'lost-trades.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ enough, holds, both: results.both.primary, his: results.his.primary, above: results.above.primary, archive: results.archive.primary, kinds: results.both.kinds }, null, 2))
