// Every situation and move label comes from the owner's unchanged readings.
import { chess, CHESS_DIR } from '../../bridge/lib/chess.mjs'
import { seeded, bandOf } from '../rules-of-thumb/detect.mjs'
import { K, CONTROL, UNITS, entersScan, unitsOf, inControlSituation, hangReading, topTwo, labelOf, split } from './readings.mjs'
import { cli, MAIA_DIR, require } from './common.mjs'

const C = await chess('src/core/chess/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')
export const TRADE_UNITS = ['trades-ahead', 'trades-behind', 'trades-level', 'bishop-for-knight', 'knight-for-bishop']
export const emptyCoverage = () => ({ games: 0, skippedInitial: 0, plies: 0, positionsEntering: 0,
  positionsInAUnit: 0, positionsInARule: 0, maiaCalls: 0,
  units: Object.fromEntries(UNITS.map(u => [u, { situation: 0, splits: 0, gamesWithSplit: 0, splitFollowFirst: 0, splitBreakFirst: 0 }])) })
export function draw(game, unit, rows) {
  return rows.length ? rows[Math.floor(seeded(`${game}\0${unit}`)() * rows.length)] : null
}
export function positionSplits(board, unit, F, B, band, p1, p2, phase) {
  const capture = TRADE_UNITS.includes(unit) ? [board.findUci(F), board.findUci(B)].find(m => m.isCapture()) : null
  return { close: p2 >= 0.5 * p1, band, phase,
    tensionCentral: unit === 'tension' ? 'cdef'.includes(board.findUci(B).from[0]) : null,
    tradePiece: capture?.captured ?? null }
}
export function createEngine() {
  return Node.createNodeEngine({ root: CHESS_DIR, pool: 1, evalCache: false, tablebase: false,
    transport: () => { throw new Error('the scan never starts a referee') },
    human: Node.nodeHumanModel({ dir: MAIA_DIR, fetch: async () => { throw new Error('model download is disabled; verify the existing asset') } }) })
}
export async function readGame(game, eng, options = {}) {
  const guard = options.guard ?? (() => {}), started = performance.now()
  const times = { replaySeconds: 0, boardSeconds: 0, entrySeconds: 0, unitsSeconds: 0, maiaSeconds: 0,
    hangSeconds: 0, splitSeconds: 0, rowSeconds: 0, maiaCalls: 0 }
  const coverage = emptyCoverage(); coverage.games = 1
  const candidates = Object.fromEntries(UNITS.map(u => [u, []]))
  const result = () => ({ key: game.key, datasetKind: 'tiebreak-rules', month: game.month, game: game.game,
    gameIndex: game.gameIndex, coverage, drawn: UNITS.map(u => draw(game.game, u, candidates[u])).filter(Boolean), times })
  try {
    guard()
    if (Object.hasOwn(game, 'initialFen')) { coverage.skippedInitial = 1; times.rowSeconds = (performance.now() - started) / 1000; return result() }
    require(bandOf(game.whiteElo) !== null && bandOf(game.blackElo) !== null, 'stream rating outside the registered bands')
    let t = performance.now()
    const fens = K.replayFens(game.sans)
    times.replaySeconds += (performance.now() - t) / 1000
    require(fens.length === game.sans.length + 1, 'game replay stopped early')
    for (let ply = 0; ply < game.sans.length; ply++) {
      guard(); coverage.plies++
      const fen = fens[ply]
      t = performance.now()
      const board = K.boardOf(fen), facts = K.describePosition(fen)
      times.boardSeconds += (performance.now() - t) / 1000
      t = performance.now()
      const enters = entersScan(board, facts, ply, game.sans[ply - 1])
      times.entrySeconds += (performance.now() - t) / 1000
      if (!enters) continue
      coverage.positionsEntering++
      t = performance.now()
      const units = unitsOf(board, facts)
      times.unitsSeconds += (performance.now() - t) / 1000
      if (!Object.keys(units).length) continue
      coverage.positionsInAUnit++
      const control = inControlSituation(units)
      if (control) coverage.positionsInARule++
      const mover = board.turn, band = bandOf(mover === 'w' ? game.whiteElo : game.blackElo)
      const opponentBand = bandOf(mover === 'w' ? game.blackElo : game.whiteElo)
      const legalMoves = board.movesShared().map(m => m.uci).sort()
      guard(); t = performance.now()
      let h
      try { times.maiaCalls++; coverage.maiaCalls++; h = await eng.humanPolicy(C.position(fen), { bands: [band], opponentBand }) }
      finally { times.maiaSeconds += (performance.now() - t) / 1000 }
      guard(); require(h !== 'unavailable', 'Maia unavailable')
      const policy = h.bands.find(b => b.band === band)?.policy, two = topTwo(policy, legalMoves)
      if (control) {
        t = performance.now(); units[CONTROL] = hangReading(board, two)
        times.hangSeconds += (performance.now() - t) / 1000
      }
      t = performance.now()
      const played = board.find(game.sans[ply])
      require(played, 'recorded move is not legal')
      const phase = K.phaseOf(fen)
      for (const unit of UNITS) {
        const reading = units[unit]
        if (!reading) continue
        const counter = coverage.units[unit]; counter.situation++
        const s = split(labelOf(reading, two[0]), labelOf(reading, two[1]))
        if (!s) continue
        counter.splits++; counter[s.stratum === 'follow-first' ? 'splitFollowFirst' : 'splitBreakFirst']++
        const F = two[s.F], B = two[s.B]
        candidates[unit].push({ key: `${game.month}:${game.game}:${ply}`, datasetKind: 'tiebreak-rules',
          month: game.month, game: game.game, gameIndex: game.gameIndex, ply, fen, mover, band, opponentBand,
          played: played.uci, legalMoves, M1: two[0], M2: two[1], p1: policy[two[0]], p2: policy[two[1]],
          units: [{ unit, F, B, stratum: s.stratum, probabilities: { F: policy[F], B: policy[B] },
            splits: positionSplits(board, unit, F, B, band, policy[two[0]], policy[two[1]], phase) }] })
      }
      times.splitSeconds += (performance.now() - t) / 1000
    }
    for (const unit of UNITS) coverage.units[unit].gamesWithSplit = Number(candidates[unit].length > 0)
    times.rowSeconds = (performance.now() - started) / 1000
    return result()
  } catch (error) { times.rowSeconds = (performance.now() - started) / 1000; error.times = times; throw error }
}
await cli('scan', import.meta.url, readGame, createEngine)
