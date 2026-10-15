// 1b's warning signs as board code over the app's board kernel, for the
// side to move's king: shared by king.mjs (the score against the engine) and
// king-notes.mjs (how often a warning would speak in a game).
import { chess } from '../../bridge/lib/chess.mjs'

const K = await chess('src/services/knowledge/index.ts')
const { kingFacts } = await chess('src/services/knowledge/facts/king.ts')

export const SIGNS = ['noSafeSquares', 'queenOnExits', 'bishopAimedIn', 'approachingKnight', 'rookLift', 'hookPawn', 'oppositeStorm', 'plusTwo']

const FILES = 'abcdefgh'
const sq = (f, r) => (f >= 0 && f < 8 && r >= 0 && r < 8 ? `${FILES[f]}${r + 1}` : null)
const fileOf = (s) => FILES.indexOf(s[0])
const rankOf = (s) => Number(s[1]) - 1
const other = (c) => (c === 'w' ? 'b' : 'w')
const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]]

function zoneOf(king, color) {
  const f = fileOf(king)
  const r = rankOf(king)
  const dir = color === 'w' ? 1 : -1
  const out = new Set()
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) out.add(sq(f + df, r + dr))
    out.add(sq(f + df, r + 2 * dir))
  }
  out.delete(null)
  return out
}

/** Squares a rook on `from` attacks over `occupied`. */
function rookRays(from, occupied) {
  const out = []
  for (const [df, dr] of ROOK) {
    let f = fileOf(from) + df
    let r = rankOf(from) + dr
    while (sq(f, r)) {
      const s = sq(f, r)
      out.push(s)
      if (occupied.has(s)) break
      f += df
      r += dr
    }
  }
  return out
}

/** The squares a pawn of `color` on `s` attacks. */
const pawnHits = (s, color) => [sq(fileOf(s) - 1, rankOf(s) + (color === 'w' ? 1 : -1)), sq(fileOf(s) + 1, rankOf(s) + (color === 'w' ? 1 : -1))].filter(Boolean)

export function signsOf(fen) {
  const board = K.tryBoard(fen)
  const me = board.turn
  const them = other(me)
  const king = board.king(me)
  const enemyKing = board.king(them)
  const zone = zoneOf(king, me)
  const ring = [...zone].filter((s) => Math.max(Math.abs(fileOf(s) - fileOf(king)), Math.abs(rankOf(s) - rankOf(king))) === 1)
  const theirs = board.pieces(them)
  const mine = board.pieces(me)
  const occupied = new Set([...theirs, ...mine].map((p) => p.square))
  const hitsZone = (b, from, color) => [...zone].some((z) => b.attackers(z, color).includes(from))
  const themToMove = board.turnedTo(them)
  const theirMoves = themToMove.moves()
  const joins = (b, mv) => hitsZone(b.child(mv), mv.to, mv.color)

  const facts = kingFacts(board, me)
  const noSafeSquares = facts.escapes.length === 0

  const queens = theirs.filter((p) => p.type === 'q').map((p) => p.square)
  const queenOnExits = ring.some((s) => board.get(s)?.color !== me && queens.some((q) => board.attackers(s, them).includes(q)))

  let bishopAimedIn = false
  for (const b of theirs.filter((p) => p.type === 'b')) {
    for (const [df, dr] of BISHOP) {
      let pawns = 0
      let f = fileOf(b.square) + df
      let r = rankOf(b.square) + dr
      while (sq(f, r) && !bishopAimedIn) {
        const s = sq(f, r)
        if (zone.has(s)) bishopAimedIn = true
        const on = board.get(s)
        if (on) {
          if (on.type !== 'p' || pawns > 0) break
          pawns++
        }
        f += df
        r += dr
      }
    }
  }

  const knights = theirs.filter((p) => p.type === 'n').map((p) => p.square)
  const knightReach = (s) => KNIGHT.map(([df, dr]) => sq(fileOf(s) + df, rankOf(s) + dr)).filter(Boolean)
  const approachingKnight = knights.some((n) => knightReach(n).some((t) => zone.has(t)) || theirMoves.some((mv) => mv.from === n && knightReach(mv.to).some((t) => zone.has(t))))

  let rookLift = false
  for (const rook of theirs.filter((p) => p.type === 'r').map((p) => p.square)) {
    const open = new Set(occupied)
    open.delete(rook)
    const reach = (from, dirs) => {
      const out = []
      for (const [df, dr] of dirs) {
        let f = fileOf(from) + df
        let r = rankOf(from) + dr
        while (sq(f, r)) {
          const s = sq(f, r)
          const on = board.get(s)
          if (on && s !== rook && on.color === them) break
          out.push(s)
          if (open.has(s)) break
          f += df
          r += dr
        }
      }
      return out
    }
    const lifted = reach(rook, [[0, 1], [0, -1]])
    const second = [rook, ...lifted, ...lifted.flatMap((s) => reach(s, ROOK))]
    if (second.some((s) => rookRays(s, open).some((t) => zone.has(t)))) {
      rookLift = true
      break
    }
  }

  const start = me === 'w' ? 1 : 6
  const kf = fileOf(king)
  const theirPawns = theirs.filter((p) => p.type === 'p').map((p) => p.square)
  const step = them === 'w' ? 1 : -1
  const pawnCanReach = (p, target) => {
    if (fileOf(p) !== fileOf(target)) return false
    if (p === target) return true
    const dist = (rankOf(target) - rankOf(p)) * step
    if (dist <= 0) return false
    for (let k = 1; k <= dist; k++) if (board.get(sq(fileOf(p), rankOf(p) + k * step))) return false
    return true
  }
  const hookPawn = mine
    .filter((p) => p.type === 'p' && Math.abs(fileOf(p.square) - kf) <= 1 && rankOf(p.square) !== start)
    .some((p) => {
      const contact = [sq(fileOf(p.square) - 1, rankOf(p.square) + (me === 'w' ? 1 : -1)), sq(fileOf(p.square) + 1, rankOf(p.square) + (me === 'w' ? 1 : -1))].filter(Boolean)
      return contact.some((c) => theirPawns.some((tp) => pawnCanReach(tp, c)))
    })

  const wing = (s) => (fileOf(s) <= 2 ? 'q' : fileOf(s) >= 5 ? 'k' : null)
  const theirStart = them === 'w' ? 1 : 6
  const oppositeStorm =
    wing(king) !== null &&
    wing(enemyKing) !== null &&
    wing(king) !== wing(enemyKing) &&
    theirPawns.some((p) => Math.abs(fileOf(p) - kf) <= 1 && (rankOf(p) - theirStart) * step >= 2)

  const attackers = new Set()
  for (const p of theirs) {
    if (p.type === 'k') continue
    if (hitsZone(board, p.square, them)) attackers.add(p.square)
  }
  for (const mv of theirMoves) {
    if (mv.piece === 'k' || attackers.has(mv.from)) continue
    if (mv.piece === 'p' && mv.isCapture()) continue
    if (joins(themToMove, mv)) attackers.add(mv.from)
  }
  const defenders = new Set()
  for (const p of mine) {
    if (p.type === 'k' || p.type === 'p') continue
    if (hitsZone(board, p.square, me)) defenders.add(p.square)
  }
  for (const mv of board.moves()) {
    if (mv.piece === 'k' || mv.piece === 'p' || defenders.has(mv.from)) continue
    if (joins(board, mv)) defenders.add(mv.from)
  }
  const plusTwo = attackers.size - defenders.size >= 2

  return {
    noSafeSquares,
    queenOnExits,
    bishopAimedIn,
    approachingKnight,
    rookLift,
    hookPawn,
    oppositeStorm,
    plusTwo,
    attackers: attackers.size,
    defenders: defenders.size,
  }
}
