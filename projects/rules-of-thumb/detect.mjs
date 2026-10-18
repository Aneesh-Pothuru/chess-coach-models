// The amended rule, read only through the pinned app's instruments.
import { performance } from 'node:perf_hooks'
import { chess } from '../../bridge/lib/chess.mjs'

const K = await chess('src/services/knowledge/index.ts')
const { squaresToGo } = await chess('src/services/knowledge/facts/activity.ts')
const { techniqueInsights } = await chess('src/services/knowledge/detectors/technique/insights.ts')

export const ORIGINAL_RULES = [
  'active-king', 'opposition', 'square-rule', 'rook-behind-passer', 'cut-off-king',
  'outside-passer', 'trade-when-ahead', 'lucena', 'philidor', 'open-file',
  'rook-on-the-seventh', 'outpost', 'pawn-break', 'passed-pawn', 'bishop-pair',
  'king-shelter', 'worst-piece',
]
export const REMOVED_RULES = ['bishop-pair', 'king-shelter']
export const RULES = ORIGINAL_RULES.filter((rule) => !REMOVED_RULES.includes(rule))
export const NOTE_RULES = ['outside-passer', 'lucena', 'philidor']
export const LEGACY_NOTE_RULES = [...NOTE_RULES, 'bishop-pair']
const ORIGINAL_MOVE_RULES = new Set(ORIGINAL_RULES.filter((rule) => rule !== 'worst-piece'))
export const emptyRules = () => Object.fromEntries(RULES.map((rule) => [rule, 0]))
const moveMap = (rules) => Object.fromEntries(rules.map((rule) => [rule, []]))
export const sparseMoves = (moves) => Object.fromEntries(Object.entries(moves).filter(([, ucis]) => ucis.length > 0))
export const bandOf = (rating) => rating >= 1250 && rating <= 1449 ? 1300 : rating >= 1450 && rating <= 1649 ? 1500 : null

/** The note describes the child board. The app says which side owns its pawn. */
export function noteBelongsToMover(board, move, rule) {
  if (rule === 'outside-passer') return true
  if (rule !== 'lucena' && rule !== 'philidor') throw new Error('unknown note-side rule')
  const material = K.sideMaterial(board.child(move))
  const mover = move.color
  const opponent = mover === 'w' ? 'b' : 'w'
  return rule === 'lucena'
    ? material[mover].p === 1 && material[opponent].p === 0
    : material[mover].p === 0 && material[opponent].p === 1
}

/** Only captures of a piece worth at least three app points need this reader. */
export function tradeShows(fen, move) {
  if (!move.isCapture() || !move.captured || K.PIECE_VALUE[move.captured] < 3) return false
  return techniqueInsights(fen, move.uci).some((finding) => finding.id === 'trade-when-ahead' && finding.tone === 'good')
}

/** Apply only the amendments to saved original findings. Never describeMove. */
export function amendAvailability(fen, originalRuleMoves, rawNoteRuleMoves) {
  const board = K.boardOf(fen)
  const ruleMoves = Object.fromEntries(RULES.map((rule) => [rule, [...(originalRuleMoves[rule] ?? [])]]))
  const sideStart = performance.now()
  for (const rule of NOTE_RULES) {
    ruleMoves[rule] = (rawNoteRuleMoves[rule] ?? []).filter((uci) => {
      const move = board.findUci(uci)
      if (!move) throw new Error('saved note names an illegal move')
      return noteBelongsToMover(board, move, rule)
    })
  }
  const noteSideMs = performance.now() - sideStart
  const tradeStart = performance.now()
  let tradeReaderCalls = 0
  ruleMoves['trade-when-ahead'] = []
  for (const move of board.movesShared()) {
    if (!move.isCapture() || !move.captured || K.PIECE_VALUE[move.captured] < 3) continue
    tradeReaderCalls++
    if (tradeShows(fen, move)) ruleMoves['trade-when-ahead'].push(move.uci)
  }
  const tradeReaderMs = performance.now() - tradeStart
  for (const moves of Object.values(ruleMoves)) moves.sort()
  const audit = {
    originalAvailable: ORIGINAL_RULES.filter((rule) => originalRuleMoves[rule]?.length),
    rawNoteAvailable: LEGACY_NOTE_RULES.filter((rule) => rawNoteRuleMoves[rule]?.length),
    noteSideFilter: Object.fromEntries(['lucena', 'philidor'].map((rule) => [rule, { rawMoves: rawNoteRuleMoves[rule]?.length ?? 0, keptMoves: ruleMoves[rule].length }])),
  }
  return { ruleMoves, audit, tradeReaderCalls, tradeReaderMs, noteSideMs }
}

export function rulesOfMove(fen, uci, facts = K.describePosition(fen)) {
  const board = facts.board
  const move = board.findUci(uci)
  if (!move) throw new Error('rule detection needs a legal move')
  const described = K.describeMove(fen, uci)
  if (!described) throw new Error('describeMove rejected a legal move')
  const found = new Set(described.findings.filter((f) => RULES.includes(f.conceptId) && !NOTE_RULES.includes(f.conceptId) && f.conceptId !== 'trade-when-ahead' && f.actor === board.turn && f.tone === 'gain').map((f) => f.conceptId))
  for (const rule of NOTE_RULES) if (described.findings.some((f) => f.conceptId === rule && f.actor === board.turn && f.tone === 'note') && noteBelongsToMover(board, move, rule)) found.add(rule)
  if (tradeShows(fen, move)) found.add('trade-when-ahead')
  const worst = facts.side[board.turn].activity.worstPiece
  if (worst?.square === move.from) {
    const afterMoves = squaresToGo(board.child(move), move.to)
    if (afterMoves !== null && afterMoves > worst.moves) found.add('worst-piece')
  }
  return RULES.filter((rule) => found.has(rule))
}

export function splitsOf(fen, facts = K.describePosition(fen)) {
  const mover = facts.turn
  const opponent = mover === 'w' ? 'b' : 'w'
  const material = K.materialCount(fen).diff * (mover === 'w' ? 1 : -1)
  const threat = facts.threats
  return {
    opponentThreat: threat.mateInOne[opponent].length > 0 || threat.winningCaptures[opponent].length > 0,
    material: material >= 2 ? 'ahead' : material <= -2 ? 'behind' : 'level',
    phase: K.phaseOf(fen),
    kingDanger: (K.kingDanger(fen, mover)?.signs.length ?? 0) > 0,
  }
}

/** Every legal move is described once, with no optional engine evidence. */
export function availabilityOf(fen) {
  const started = performance.now()
  const facts = K.describePosition(fen)
  const moves = facts.board.movesShared()
  const original = moveMap(ORIGINAL_RULES)
  const notes = moveMap(LEGACY_NOTE_RULES)
  let describeMoveMs = 0
  let worstPieceMs = 0
  const worstStart = performance.now()
  const worst = facts.side[facts.turn].activity.worstPiece
  worstPieceMs += performance.now() - worstStart
  for (const move of moves) {
    const moveStart = performance.now()
    const described = K.describeMove(fen, move.uci)
    if (!described) throw new Error('describeMove rejected a legal move')
    const findings = described.findings
    const gains = new Set(findings.filter((f) => ORIGINAL_MOVE_RULES.has(f.conceptId) && f.actor === facts.turn && f.tone === 'gain').map((f) => f.conceptId))
    const noted = new Set(findings.filter((f) => LEGACY_NOTE_RULES.includes(f.conceptId) && f.actor === facts.turn && f.tone === 'note').map((f) => f.conceptId))
    describeMoveMs += performance.now() - moveStart
    const worstStart = performance.now()
    if (worst?.square === move.from) {
      const afterMoves = squaresToGo(facts.board.child(move), move.to)
      if (afterMoves !== null && afterMoves > worst.moves) gains.add('worst-piece')
    }
    worstPieceMs += performance.now() - worstStart
    for (const rule of gains) original[rule].push(move.uci)
    for (const rule of noted) notes[rule].push(move.uci)
  }
  return { ...amendAvailability(fen, original, notes), legalMoves: moves.length, describeMoveMs, worstPieceMs, milliseconds: performance.now() - started }
}

export function seeded(key) {
  let state = 2166136261
  for (let i = 0; i < key.length; i++) { state ^= key.charCodeAt(i); state = Math.imul(state, 16777619) }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function drawPosition(game, rule, positions) {
  return positions.length ? positions[Math.floor(seeded(`${game}\0${rule}`)() * positions.length)] : null
}
export function cappedRows(rows, counts, cap = 4000) {
  const kept = []
  for (const row of rows) {
    if (!RULES.includes(row.rule)) throw new Error('unknown or removed rule')
    if ((counts[row.rule] ?? 0) >= cap) continue
    counts[row.rule] = (counts[row.rule] ?? 0) + 1
    kept.push(row)
  }
  return kept
}
export const phaseOf = K.phaseOf
export const boardOf = K.boardOf
export const replayFens = K.replayFens
export const describePosition = K.describePosition
