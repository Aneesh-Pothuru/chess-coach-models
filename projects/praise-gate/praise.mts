// The live coach's held praise, replayed on his archive by the rules in the
// README: every move of his where an instant rule holds praise, its verdict at
// the coach's live budgets, and the archive's deeper reading of the same move.
//
//   CHESS_DIR=<checkout of the change> bridge/run.sh projects/praise-gate/praise.mts [--pool 4] [--limit N]
//
// Writes results/praise.json (counts only); the per-move rows, which carry game
// ids, go to private/praise-gate/.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)
const nodeMetrics = await load('src/adapters/node/metrics/index.ts')
const factsDeps = await load('src/cli/factsDeps.ts')
const E = await load('src/adapters/node/engine/index.ts')
const ES = await load('src/services/engine/index.ts')
const LC = await load('src/services/livecoach/index.ts')
const P = await load('src/services/livecoach/praise.ts')
const K = await load('src/services/knowledge/index.ts')
const Sc = await load('src/core/score/index.ts')
const St = await load('src/core/stats/index.ts')

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const POOL = arg('pool', 4)
const LIMIT = arg('limit', Infinity)
const BAR: number = K.PRAISE_LOSS_PCT
/** Clearly faulted: an inaccuracy or worse on the judge's scale. */
const CLEAR: number = K.JUDGMENT_THRESHOLDS.inaccuracy
const PRAISING = ['castling', 'tradeWhileAhead'] as const

const policy = LC.playPolicy({ strict: false, custom: false, tenSecondFloor: false })
const games: any[] = nodeMetrics.archiveFacts({ root: CHESS_DIR, deps: factsDeps.loadFactsDeps(CHESS_DIR, false) }).games
const pieceCount = (fen: string) => fen.split(' ')[0].replace(/[^a-z]/gi, '').length
const capturedOn = (san: string | undefined): string | null => (san ? (/x([a-h][1-8])/.exec(san)?.[1] ?? null) : null)

// ---- the moves: his moves where an instant rule holds praise ----
interface Target {
  gid: string
  ply: number
  san: string
  color: 'w' | 'b'
  fenBefore: string
  fenAfter: string
  moves: string[]
  history: string[]
  rules: string[]
  loose: boolean
  allowsMate: boolean
  givenAway: any
  archive: { lossPct: number | null; cls: string | null; book: boolean }
}
const targets: Target[] = []
let replayFailed = 0
let mine = 0
for (const g of games) {
  const c = new Chess()
  const ucis: string[] = []
  const history: string[] = []
  const once = new Set<string>()
  // The Won-Game Protocol, which the trade rule speaks under: the coach reads it from its
  // verdict on his previous move; the replay reads that position from the archive's eval.
  let wonGame = false
  for (const m of g.moves) {
    const fenBefore = c.fen()
    let mv
    try {
      mv = c.move(m.san)
    } catch {
      replayFailed++
      break
    }
    ucis.push(`${mv.from}${mv.to}${mv.promotion ?? ''}`)
    history.push(mv.san)
    if (m.mover !== 'me') continue
    mine++
    const f = LC.moveFindings(
      { fenBefore, fenAfter: c.fen(), san: mv.san, color: mv.color, ply: m.ply + 1, seconds: m.think ?? 30, over: c.isGameOver(), wonGame, inBook: false, history: [...history] },
      policy,
      once,
    )
    for (const k of f.once) once.add(k)
    // The archive's eval is his; the Score is White's.
    if (m.eval !== null) wonGame = K.wonGameActive({ cp: mv.color === 'w' ? m.eval : -m.eval, mate: null }, c.fen(), mv.color)
    const rules = f.findings.filter((x: any) => x.praise).map((x: any) => x.rule)
    if (!rules.length) continue
    targets.push({
      gid: g.gid,
      ply: m.ply + 1,
      san: mv.san,
      color: mv.color,
      fenBefore,
      fenAfter: c.fen(),
      moves: [...ucis],
      history: [...history],
      rules,
      loose: f.findings.some((x: any) => x.held),
      allowsMate: f.findings.some((x: any) => x.rule === 'allowsMate'),
      givenAway: f.givenAway,
      archive: { lossPct: m.lossPct ?? null, cls: m.cls ?? null, book: !!m.book },
    })
  }
}
const run = targets.slice(0, LIMIT)
console.error(`${games.length} games, ${mine} of his moves, ${targets.length} hold praise; replaying ${run.length}`)

// ---- the verdict at the live budgets ----
// One single-thread engine per shard, each move searched from a cleared hash
// (ucinewgame), so a rerun reads every move the same way whatever order the
// shards reach it in.
const engines = Array.from({ length: POOL }, () => E.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false, human: false }))
const t0 = Date.now()
let done = 0
const settled: PromiseSettledResult<any>[] = new Array(run.length)
await Promise.all(
  engines.map(async (engine, shard) => {
    for (let i = shard; i < run.length; i += POOL) {
      const t = run[i]
      try {
        await engine.newGame()
        const lt = LC.liveTargets({ root: 'startpos', moves: t.moves, fenBefore: t.fenBefore, fenAfter: t.fenAfter })
        settled[i] = { status: 'fulfilled', value: await LC.readLiveMove(engine, lt, () => false) }
      } catch (reason) {
        settled[i] = { status: 'rejected', reason }
      }
      if (++done % 50 === 0) console.error(`${done}/${run.length} verdicts, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }
  }),
)
for (const engine of engines) engine.dispose()

const rows: any[] = []
let failed = 0
run.forEach((t, i) => {
  const s = settled[i]
  const reading = s.status === 'fulfilled' ? s.value : null
  if (!reading || reading.terminal) {
    failed++
    rows.push({ gid: t.gid, ply: t.ply, rules: t.rules, reading: false, archive: t.archive, fenBefore: t.fenBefore, uci: t.moves[t.moves.length - 1] })
    return
  }
  const v = LC.composeVerdict({
    san: t.san,
    color: t.color,
    reading,
    tablebase: null,
    loose: t.loose,
    allowsMate: t.allowsMate,
    givenAway: t.givenAway,
    prevCapture: capturedOn(t.history[t.history.length - 2]),
  })
  const check = { fenBefore: reading.fenBefore, san: t.san, bestUci: reading.bestMove, winBefore: Sc.winPercentFor(reading.beforeScore, t.color) }
  const strip = (s: string) => s.replace(/[+#]/g, '')
  const inLines = reading.lines.some((l: any) => strip(sanOf(reading.fenBefore, l.move)) === strip(t.san))
  const praised = Object.fromEntries(t.rules.map((r) => [r, P.confirmsPraise(r, v, check)]))
  rows.push({
    gid: t.gid,
    ply: t.ply,
    rules: t.rules,
    reading: true,
    judgment: v.judgment,
    lossWp: v.lossWp,
    praiseable: v.praiseable,
    praised,
    inLines,
    lines: reading.lines.length,
    small: pieceCount(t.fenBefore) <= 7,
    archive: t.archive,
    fenBefore: t.fenBefore,
    uci: t.moves[t.moves.length - 1],
    best: reading.bestMove,
  })
})

/** A UCI move as SAN in a position. */
function sanOf(fen: string, uci: string): string {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return uci
  }
}

// ---- the counts ----
const share = (k: number, n: number) => ({ k, n, share: n ? k / n : null, ci: St.wilson({ k, n }) })
const q = (xs: number[], p: number) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}
function summarize(rule: string | null) {
  const rs = rows.filter((r) => rule === null || r.rules.includes(rule))
  const read = rs.filter((r) => r.reading && r.archive.lossPct !== null)
  const isPraised = (r: any) => (rule === null ? Object.values(r.praised).some(Boolean) : r.praised[rule])
  const praised = read.filter(isPraised)
  const faulted = (r: any) => r.archive.lossPct >= BAR
  const clear = (r: any) => r.archive.lossPct >= CLEAR
  const fine = read.filter((r) => !faulted(r))
  const withheld = read.filter((r) => !isPraised(r))
  const reason = (r: any) => (r.praiseable ? 'trade reading' : r.lossWp >= BAR ? 'loss' : r.judgment !== 'good' ? 'judgment' : 'line')
  return {
    moves: rs.length,
    noReading: rs.filter((r) => !r.reading).length,
    noArchive: rs.filter((r) => r.reading && r.archive.lossPct === null).length,
    small: read.filter((r) => r.small).length,
    book: read.filter((r) => r.archive.book).length,
    read: read.length,
    praised: share(praised.length, read.length),
    faultedAll: share(read.filter(faulted).length, read.length),
    clearAll: share(read.filter(clear).length, read.length),
    faultedPraised: share(praised.filter(faulted).length, praised.length),
    clearPraised: share(praised.filter(clear).length, praised.length),
    praisedOfFine: share(fine.filter(isPraised).length, fine.length),
    caughtOfFaulted: share(read.filter((r) => faulted(r) && !isPraised(r)).length, read.filter(faulted).length),
    // Where the praised moves the archive faults sit: in the engine's own lines, and how far past the bar.
    praisedInLines: praised.filter((r) => r.inLines).length,
    faultedPraisedInLines: praised.filter((r) => faulted(r) && r.inLines).length,
    faultedPraisedRange: praised.some(faulted) ? [Math.min(...praised.filter(faulted).map((r) => r.archive.lossPct)), Math.max(...praised.filter(faulted).map((r) => r.archive.lossPct))] : null,
    faultedPraisedClasses: praised.filter(faulted).reduce((t: Record<string, number>, r) => ({ ...t, [r.archive.cls ?? 'none']: (t[r.archive.cls ?? 'none'] ?? 0) + 1 }), {}),
    withheldWhy: withheld.reduce((t: Record<string, number>, r) => ({ ...t, [reason(r)]: (t[reason(r)] ?? 0) + 1 }), {}),
    judgments: read.reduce((t: Record<string, number>, r) => ({ ...t, [r.judgment]: (t[r.judgment] ?? 0) + 1 }), {}),
    archiveClasses: read.reduce((t: Record<string, number>, r) => ({ ...t, [r.archive.cls ?? 'none']: (t[r.archive.cls ?? 'none'] ?? 0) + 1 }), {}),
    // The live search against the archive's on the same move: how far apart their losses are.
    lossGap: { median: q(read.map((r) => Math.abs(r.lossWp - r.archive.lossPct)), 0.5), p90: q(read.map((r) => Math.abs(r.lossWp - r.archive.lossPct)), 0.9) },
    agree: {
      bothFaulted: read.filter((r) => r.lossWp >= BAR && faulted(r)).length,
      liveOnly: read.filter((r) => r.lossWp >= BAR && !faulted(r)).length,
      archiveOnly: read.filter((r) => r.lossWp < BAR && faulted(r)).length,
      neither: read.filter((r) => r.lossWp < BAR && !faulted(r)).length,
    },
  }
}

/**
 * The same praised moves read at a stricter live bar: what the gate would praise if it also
 * asked the live loss to sit under each bar. Descriptive: the bars were not fixed before the run.
 */
function sweep() {
  const read = rows.filter((r) => r.reading && r.archive.lossPct !== null)
  const fine = read.filter((r) => r.archive.lossPct < BAR)
  const isPraised = (r: any) => Object.values(r.praised).some(Boolean)
  return [0.5, 1, 1.5, 2].map((bar) => {
    const praised = read.filter((r) => isPraised(r) && r.lossWp < bar)
    return {
      bar,
      praised: praised.length,
      faultedPraised: share(praised.filter((r) => r.archive.lossPct >= BAR).length, praised.length),
      praisedOfFine: share(fine.filter((r) => isPraised(r) && r.lossWp < bar).length, fine.length),
    }
  })
}

// The live budgets on each tier the coach runs on, and the archive's: the routine's sweep in Node.
const nodesOf = (name: string) => ({ name, phone: ES.budgetNodes(name, 'phone'), desktop: ES.budgetNodes(name, 'desktop'), node: ES.budgetNodes(name, 'node') })
const budgets = { naming: nodesOf(LC.LIVE_NAMING_BUDGET), check: nodesOf(LC.LIVE_CHECK_BUDGET), archive: nodesOf('sweep'), lines: Math.max(...rows.filter((r) => r.reading).map((r) => r.lines)) }
const out = {
  project: 'praise-gate',
  app: execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  budgets,
  bar: BAR,
  clear: CLEAR,
  games: games.length,
  // The day of the archive's latest game: the next round reads only games after it.
  archiveThrough: games.reduce((d: string, g: any) => (g.day > d ? g.day : d), ''),
  hisMoves: mine,
  replayFailed,
  targets: targets.length,
  replayed: run.length,
  failed,
  all: summarize(null),
  byRule: Object.fromEntries(PRAISING.map((r) => [r, summarize(r)])),
  sweep: sweep(),
}
fs.writeFileSync(join(resultsDir('praise-gate'), `praise${LIMIT === Infinity ? '' : '-sample'}.json`), JSON.stringify(out, null, 1) + '\n')
fs.writeFileSync(join(privateDir('praise-gate'), 'rows.json'), JSON.stringify(rows))
console.error(`praise: ${run.length} moves (${failed} without a verdict) in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
