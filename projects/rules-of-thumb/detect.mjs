// The fixed rule, read only through the pinned app's board and detectors.
import { performance } from 'node:perf_hooks'
import { chess } from '../../bridge/lib/chess.mjs'

const K = await chess('src/services/knowledge/index.ts')
const { squaresToGo } = await chess('src/services/knowledge/facts/activity.ts')

export const RULES = [
  'active-king', 'opposition', 'square-rule', 'rook-behind-passer', 'cut-off-king',
  'outside-passer', 'trade-when-ahead', 'lucena', 'philidor', 'open-file',
  'rook-on-the-seventh', 'outpost', 'pawn-break', 'passed-pawn', 'bishop-pair',
  'king-shelter', 'worst-piece',
]
const MOVE_RULES = new Set(RULES.slice(0, -1))
export const emptyRules = () => Object.fromEntries(RULES.map((r) => [r, 0]))
export const bandOf = (rating) => rating >= 1250 && rating <= 1449 ? 1300 : rating >= 1450 && rating <= 1649 ? 1500 : null

/** Findings of the named concept, actor and tone; no engine evidence added. */
export function rulesOfMove(fen, uci, facts = K.describePosition(fen)) {
  const board = facts.board
  const move = board.findUci(uci)
  if (!move) throw new Error('rule detection needs a legal move')
  const described = K.describeMove(fen, uci)
  if (!described) throw new Error('describeMove rejected a legal move')
  const found = new Set(described.findings.filter((f) => MOVE_RULES.has(f.conceptId) && f.actor === board.turn && f.tone === 'gain').map((f) => f.conceptId))
  const worst = facts.side[board.turn].activity.worstPiece
  if (worst?.square === move.from) {
    // The app returns null when mobility of the nonmoving side is unreadable
    // (the move gave check). Null does not establish that mobility increased.
    const afterMoves = squaresToGo(board.child(move), move.to)
    if (afterMoves !== null && afterMoves > worst.moves) found.add('worst-piece')
  }
  return RULES.filter((r) => found.has(r))
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

/** Every legal move is read, even if another move already shows a rule. */
export function availabilityOf(fen) {
  const started = performance.now()
  const facts = K.describePosition(fen)
  const moves = facts.board.movesShared()
  const ruleMoves = Object.fromEntries(RULES.map((r) => [r, []]))
  let describeMoveMs = 0
  let worstPieceMs = 0
  const worstStart = performance.now()
  const worst = facts.side[facts.turn].activity.worstPiece
  worstPieceMs += performance.now() - worstStart
  for (const move of moves) {
    const moveStart = performance.now()
    const described = K.describeMove(fen, move.uci)
    if (!described) throw new Error('describeMove rejected a legal move')
    const showing = new Set(described.findings.filter((f) => MOVE_RULES.has(f.conceptId) && f.actor === facts.turn && f.tone === 'gain').map((f) => f.conceptId))
    describeMoveMs += performance.now() - moveStart
    const worstStart = performance.now()
    if (worst?.square === move.from) {
      const afterMoves = squaresToGo(facts.board.child(move), move.to)
      if (afterMoves !== null && afterMoves > worst.moves) showing.add('worst-piece')
    }
    worstPieceMs += performance.now() - worstStart
    for (const rule of showing) ruleMoves[rule].push(move.uci)
  }
  for (const moves of Object.values(ruleMoves)) moves.sort()
  return { ruleMoves, legalMoves: moves.length, describeMoveMs, worstPieceMs, milliseconds: performance.now() - started }
}

/** FNV-1a then mulberry32, matching book-advice's reproducible lab sampler. */
export function seeded(key) {
  let state = 2166136261
  for (let i = 0; i < key.length; i++) {
    state ^= key.charCodeAt(i)
    state = Math.imul(state, 16777619)
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** One uniform draw after the whole game's eligible positions are known. */
export function drawPosition(game, rule, positions) {
  return positions.length ? positions[Math.floor(seeded(`${game}\0${rule}`)() * positions.length)] : null
}

/** Apply independent per-rule month caps to one game's draws in file order. */
export function cappedRows(rows, counts, cap = 4000) {
  const kept = []
  for (const row of rows) {
    if (!RULES.includes(row.rule)) throw new Error('unknown rule')
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
