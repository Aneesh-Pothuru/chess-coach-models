// The board pass uses only the check app. Original rule moves are never redetected.
import { chess } from '../../bridge/lib/chess.mjs'
import { splitsOf } from '../rules-of-thumb/detect.mjs'
import { cli, guardWindow, require, rowKey, RULES } from './common.mjs'
const K = await chess('src/services/knowledge/index.ts')

export function quietOf(board, facts) {
  for (const kind of ['mateInOne', 'winningCaptures']) for (const side of ['w', 'b'])
    require(Array.isArray(facts.threats?.[kind]?.[side]), 'missing threat reading')
  return !board.inCheck() && ['mateInOne', 'winningCaptures'].every(kind =>
    ['w', 'b'].every(side => facts.threats[kind][side].length === 0))
}

export function readBoardRow(row, nullRow, _checked, _engine, instruments = K) {
  require(row.datasetKind === 'amended' && RULES.includes(row.rule), 'only the thirteen inherited rules')
  const times = { positionSeconds: 0, safetySeconds: 0, splitSeconds: 0, positionCalls: 0, safetyCalls: 0, legalMoves: 0, rowSeconds: 0 }
  const started = performance.now()
  try {
    guardWindow()
    let t = performance.now()
    const facts = instruments.describePosition(row.fen), board = facts.board
    times.positionSeconds += (performance.now() - t) / 1000; times.positionCalls++
    require(board, 'invalid board reading')
    const legal = board.movesShared(), ucis = legal.map(move => move.uci)
    require(new Set(ucis).size === ucis.length && ucis.length > 0, 'invalid legal move set')
    require(row.ruleMoves.length > 0 && new Set(row.ruleMoves).size === row.ruleMoves.length && row.ruleMoves.every(uci => ucis.includes(uci)), 'invalid inherited rule moves')
    for (const label of ['R', 'N', 'A']) require(ucis.includes(row[label]) && typeof row.sound?.[label] === 'boolean', 'invalid inherited move')
    require(ucis.includes(nullRow.R0) && typeof nullRow.sound?.R0 === 'boolean', 'invalid null move')
    const quiet = quietOf(board, facts), safeMoves = [], forcingByMove = {}
    times.legalMoves = legal.length
    for (const move of legal) {
      guardWindow(); t = performance.now()
      const check = instruments.safetyCheck(row.fen, move.uci)
      times.safetySeconds += (performance.now() - t) / 1000; times.safetyCalls++
      require(check && ['safe', 'allows-mate', 'loses-material'].includes(check.verdict), 'missing safety reading')
      if (check.verdict === 'safe') safeMoves.push(move.uci)
      forcingByMove[move.uci] = move.isCapture() || board.child(move).inCheck()
    }
    safeMoves.sort()
    const safeRuleMoves = row.ruleMoves.filter(uci => safeMoves.includes(uci)).sort()
    t = performance.now()
    const { material, phase, kingDanger } = splitsOf(row.fen, facts)
    times.splitSeconds = (performance.now() - t) / 1000
    times.rowSeconds = (performance.now() - started) / 1000
    return { key: rowKey(row), datasetKind: 'rules-after-check', month: row.month, game: row.game, rule: row.rule,
      band: row.band, opponentBand: row.opponentBand, quiet, safeMoves, safeRuleMoves, originalRPasses: safeMoves.includes(row.R),
      R: row.R, N: row.N, A: row.A, R0: nullRow.R0, sound: { ...row.sound, R0: nullRow.sound.R0 },
      splits: { material, phase, kingDanger }, forcingByMove, times }
  } catch (error) { times.rowSeconds = (performance.now() - started) / 1000; error.times = times; throw error }
}
await cli('checked', import.meta.url, readBoardRow)
