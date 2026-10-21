// The study's board readings, all through the app's knowledge service: whether a
// position enters the scan, which units it is in, and how a move is labelled for
// each unit ('follow', 'break' or null).
import { chess } from '../../bridge/lib/chess.mjs'

export const K = await chess('src/services/knowledge/index.ts')

export const RULES = Object.freeze({
  tension: ['tension'],
  'trades-development': ['trades-ahead', 'trades-behind'],
  'bishop-knight': ['bishop-for-knight', 'knight-for-bishop'],
  'bishop-colour': ['bishop-colour'],
})
export const CONTROL = 'hang'
export const REFERENCE = 'trades-level'
export const RULE_UNITS = Object.freeze(Object.values(RULES).flat())
export const UNITS = Object.freeze([...RULE_UNITS, REFERENCE, CONTROL])
export const MIN_PLY = 8
export const LEAD = 2
export const LEVEL_MATERIAL = 1

const START = Object.freeze({
  w: { knights: ['b1', 'g1'], bishops: ['c1', 'f1'], king: 'e1' },
  b: { knights: ['b8', 'g8'], bishops: ['c8', 'f8'], king: 'e8' },
})
const other = c => (c === 'w' ? 'b' : 'w')
const PIECES = new Set(['n', 'b', 'r', 'q'])

export function quiet(board, facts) {
  if (board.inCheck()) return false
  for (const kind of ['mateInOne', 'winningCaptures']) for (const side of ['w', 'b']) {
    const list = facts.threats?.[kind]?.[side]
    if (!Array.isArray(list)) throw new Error('missing threat reading')
    if (list.length) return false
  }
  return true
}

export function entersScan(board, facts, ply, previousSan) {
  return ply >= MIN_PLY && !String(previousSan ?? '').includes('x') && board.movesShared().length >= 2 && quiet(board, facts)
}

export function undeveloped(board, color) {
  const start = START[color]
  const on = (square, type) => {
    const piece = board.get(square)
    return piece && piece.color === color && piece.type === type ? 1 : 0
  }
  return start.knights.reduce((n, s) => n + on(s, 'n'), 0)
    + start.bishops.reduce((n, s) => n + on(s, 'b'), 0)
    + on(start.king, 'k')
}

export const developmentLead = (board, mover) => undeveloped(board, other(mover)) - undeveloped(board, mover)

const givesCheck = (board, move) => board.child(move).inCheck()
export const quietMove = (board, move) => !move.isCapture() && !givesCheck(board, move)
const evenCapture = (board, move) => move.isCapture() && !givesCheck(board, move)
  && K.captureExchangeByMove(board.fen, move.uci) === 0

function tension(board, facts, mover, moves) {
  const levers = facts.side[mover].pawns.levers
  if (!levers.length) return null
  const releases = moves.filter(m => m.piece === 'p' && m.isCapture() && !m.isEnPassant()
    && levers.some(l => l.from === m.from && l.target === m.to) && evenCapture(board, m))
  if (!releases.length) return null
  const keeps = moves.filter(m => quietMove(board, m) && !levers.some(l => l.from === m.from))
  return { unit: 'tension', follow: keeps, break: releases }
}

function tradesDevelopment(board, facts, mover, moves) {
  if (K.phaseOf(board.fen) === 'endgame') return null
  if (Math.abs(K.materialFor(board.fen, mover)) > LEVEL_MATERIAL) return null
  const trades = moves.filter(m => PIECES.has(m.captured) && evenCapture(board, m))
  if (!trades.length) return null
  const quiets = moves.filter(m => quietMove(board, m))
  const lead = developmentLead(board, mover)
  if (lead >= LEAD) return { unit: 'trades-ahead', lead, follow: quiets, break: trades }
  if (lead <= -LEAD) return { unit: 'trades-behind', lead, follow: trades, break: quiets }
  return { unit: 'trades-level', lead, follow: quiets, break: trades }
}

function bishopKnight(board, facts, mover, moves) {
  const bxn = moves.filter(m => m.piece === 'b' && m.captured === 'n' && evenCapture(board, m))
  const nxb = moves.filter(m => m.piece === 'n' && m.captured === 'b' && evenCapture(board, m))
  if (!bxn.length === !nxb.length) return null
  const quiets = moves.filter(m => quietMove(board, m))
  if (bxn.length) return { unit: 'bishop-for-knight', follow: quiets, break: bxn }
  return { unit: 'knight-for-bishop', follow: nxb, break: quiets }
}

function bishopColour(board, facts, mover, moves) {
  const material = K.sideMaterial(board.fen)[mover]
  if (material.b !== 1) return null
  const colour = material.bishopColours[0]
  const pushes = moves.filter(m => m.piece === 'p' && !m.promotion && quietMove(board, m))
  const follow = pushes.filter(m => board.squareColor(m.to) !== colour)
  const broke = pushes.filter(m => board.squareColor(m.to) === colour)
  if (!follow.length || !broke.length) return null
  return { unit: 'bishop-colour', colour, follow, break: broke }
}

const READERS = [tension, tradesDevelopment, bishopKnight, bishopColour]

export function unitsOf(board, facts) {
  const mover = board.turn
  const moves = board.movesShared()
  const out = {}
  for (const read of READERS) {
    const r = read(board, facts, mover, moves)
    if (r) out[r.unit] = { ...r, follow: r.follow.map(m => m.uci).sort(), break: r.break.map(m => m.uci).sort() }
  }
  return out
}

export const inControlSituation = units => RULE_UNITS.some(unit => unit in units)

export function hangLabel(board, move) {
  if (!quietMove(board, move)) return null
  const after = board.child(move)
  const captures = K.describePosition(after.fen).threats.winningCaptures[other(board.turn)]
  if (!Array.isArray(captures)) throw new Error('missing threat reading')
  if (captures.length === 0) return 'follow'
  return PIECES.has(move.piece) && captures.some(c => c.uci.slice(2, 4) === move.to) ? 'break' : null
}

export function hangReading(board, ucis) {
  const follow = [], broke = []
  for (const uci of ucis) {
    const label = hangLabel(board, board.findUci(uci))
    if (label === 'follow') follow.push(uci)
    else if (label === 'break') broke.push(uci)
  }
  return { unit: CONTROL, follow: follow.sort(), break: broke.sort() }
}

export function labelOf(reading, uci) {
  if (!reading) return null
  if (reading.follow.includes(uci)) return 'follow'
  if (reading.break.includes(uci)) return 'break'
  return null
}

export function topTwo(policy, legal) {
  if (!policy || legal.length < 2 || legal.some(m => !Number.isFinite(policy[m]) || policy[m] < 0)) throw new Error('incomplete Maia legal policy')
  return [...legal].sort((a, b) => policy[b] - policy[a] || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 2)
}

export function split(labelFirst, labelSecond) {
  if (labelFirst === 'follow' && labelSecond === 'break') return { F: 0, B: 1, stratum: 'follow-first' }
  if (labelFirst === 'break' && labelSecond === 'follow') return { F: 1, B: 0, stratum: 'break-first' }
  return null
}
