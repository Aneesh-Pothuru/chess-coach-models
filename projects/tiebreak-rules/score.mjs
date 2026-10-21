// One referee per retained occurrence. Timing mode returns timings, never judgments.
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chess, CHESS_DIR, LAB_DIR } from '../../bridge/lib/chess.mjs'
import { emptyTimes, engineSound, probeWithRetry, tablebaseSound, validateScores } from '../rules-of-thumb/score.mjs'
import { K, UNITS } from './readings.mjs'

const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')
export const APP = 'ffee8dbb166f77dcc75721b6cca28d37703f4515'
const require = (condition, message) => { if (!condition) throw new Error(message) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const pieces = fen => (fen.split(' ')[0].match(/[a-z]/gi) ?? []).length
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export function requireInstruments() {
  require(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', APP), 'tiebreak referee requires its registered app')
  require(E.BUDGETS.grade.node.nodes === 250000 && E.ACCEPT_WINDOW_WP === 3, 'fixed referee instruments changed')
}

/** The first unit in the registered order supplies F then B. Later units share
 * those readings, even when they give the two natural moves opposite labels. */
export function movesToScore(row) {
  require(Array.isArray(row.units) && row.units.length > 0, 'occurrence has no kept unit')
  require(new Set(row.units.map(unit => unit.unit)).size === row.units.length, 'duplicate occurrence unit')
  const moves = []
  for (const unit of row.units) {
    require(UNITS.includes(unit.unit), 'unknown occurrence unit')
    require(unit.F !== unit.B && [unit.F, unit.B].every(uci => [row.M1, row.M2].includes(uci)), 'unit does not split the two natural moves')
    require(unit.stratum === (unit.F === row.M1 ? 'follow-first' : 'break-first'), 'unit order differs from natural moves')
    require(unit.probabilities?.F === (unit.F === row.M1 ? row.p1 : row.p2)
      && unit.probabilities?.B === (unit.B === row.M1 ? row.p1 : row.p2), 'unit probabilities differ from natural moves')
  }
  for (const id of UNITS) {
    const unit = row.units.find(value => value.unit === id)
    if (unit) for (const uci of [unit.F, unit.B]) if (!moves.includes(uci)) moves.push(uci)
  }
  return moves
}

export function validatePosition(row) {
  require(row && row.key === `${row.month}:${row.game}:${row.ply}`, 'occurrence key differs')
  require(['2026-07', '2026-08', '2026-09'].includes(row.month), 'occurrence month differs')
  require(typeof row.game === 'string' && row.game.length > 0 && Number.isInteger(row.gameIndex) && row.gameIndex >= 0
    && Number.isInteger(row.ply) && row.ply >= 8, 'invalid occurrence identity')
  const board = K.tryBoard(row.fen)
  require(board && row.mover === board.turn, 'invalid FEN or mover')
  const legal = board.movesShared().map(move => move.uci).sort()
  require(Array.isArray(row.legalMoves) && same(row.legalMoves, legal), 'stored legal moves differ from the app')
  require(legal.includes(row.played) && legal.includes(row.M1) && legal.includes(row.M2) && row.M1 !== row.M2, 'illegal or repeated occurrence move')
  require([1300, 1500].includes(row.band) && [1300, 1500].includes(row.opponentBand), 'invalid occurrence band')
  require([row.p1, row.p2].every(p => Number.isFinite(p) && p >= 0 && p <= 1) && row.p1 >= row.p2, 'invalid natural-move probabilities')
  require(row.p1 !== row.p2 || row.M1 < row.M2, 'natural-move probability tie is not lexical')
  return { board, moves: movesToScore(row) }
}

export function bestLine(best, legal) {
  const line = best?.lines?.[0]
  require(best?.complete && !best.partial && best.completion === 'complete' && S.isExactScore(line?.score), 'inexact referee best')
  require(line.move && line.pv?.[0] === line.move && legal.includes(line.move), 'referee first line has an invalid root')
  return line
}

export async function readPosition(row, eng, options = {}) {
  requireInstruments()
  const started = performance.now(), times = emptyTimes()
  const timing = options.timing === true, guard = options.guard ?? (() => {})
  const judgeEngine = options.judgeEngine ?? engineSound, judgeTablebase = options.judgeTablebase ?? tablebaseSound
  try {
    const { board, moves } = validatePosition(row)
    const pos = C.position(row.fen)
    let evidence, sound
    if (pieces(row.fen) <= 7) {
      const t = performance.now()
      let probe
      try {
        // Reuse the predecessor's backoff and event names; a clock guard also
        // runs before every retry, not only before the first network request.
        const guarded = { tablebase: async position => { guard(); return eng.tablebase(position) },
          status: () => eng.status(), reset: target => eng.reset(target) }
        probe = await probeWithRetry(guarded, pos, times, { onEvent: options.onEvent,
          sleep: async ms => { await (options.sleep ?? wait)(ms); guard() } })
        require(probe && Array.isArray(probe.moves), 'tablebase unavailable; occurrence remains pending')
        if (!timing) {
          sound = Object.fromEntries(moves.map(uci => [uci, judgeTablebase(probe, uci)]))
          require(Object.values(sound).every(value => typeof value === 'boolean'), 'invalid tablebase judgment')
          evidence = { source: 'tablebase', probe }
        }
      } finally { times.tablebaseSeconds += (performance.now() - t) / 1000 }
    } else {
      const t = performance.now()
      try {
        guard()
        const clearing = performance.now()
        try { times.newGameCalls++; await eng.newGame() }
        finally { times.newGameSeconds += (performance.now() - clearing) / 1000 }
        guard(); times.bestCalls++
        const best = await eng.bestMoves(pos, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
        bestLine(best, row.legalMoves)
        const readings = {}
        for (const uci of moves) {
          guard(); times.scoreCalls++
          const reading = await eng.scoreMove(pos, uci, { budget: 'grade', priority: 'batch', cache: 'bypass' })
          require(reading && (reading.best === uci || reading.pv?.[0] === uci), 'scoreMove did not score its requested root')
          validateScores(reading, best)
          readings[uci] = reading
        }
        if (!timing) {
          sound = Object.fromEntries(moves.map(uci => [uci, judgeEngine(readings[uci], best, board.turn)]))
          require(Object.values(sound).every(value => typeof value === 'boolean'), 'invalid engine judgment')
          evidence = { source: 'stockfish', best, readings }
        }
      } finally { times.engineSeconds += (performance.now() - t) / 1000 }
    }
    times.rowSeconds = (performance.now() - started) / 1000
    if (timing) return { key: row.key, times }
    return { ...row, sound, evidence, times }
  } catch (error) { times.rowSeconds = (performance.now() - started) / 1000; error.times = times; throw error }
}

export function createEngine({ tablebasePath } = {}) {
  requireInstruments()
  const privateRoot = join(LAB_DIR, 'private/tiebreak-rules')
  require(typeof tablebasePath === 'string' && resolve(tablebasePath).startsWith(`${privateRoot}/`), 'tablebase cache must stay in this project')
  const tablebase = Node.nodeTablebase({ cacheFile: tablebasePath })
  return Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase, evalCache: false, human: false })
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const { cli } = await import('./common.mjs')
  await cli('scored', import.meta.url, readPosition, createEngine)
}
