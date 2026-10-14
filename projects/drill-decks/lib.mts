// What the misses deck's stored engine lines show, by the rules in the README:
// the board code the census and the threat search share.
import { Chess } from 'chess.js'

/** Mate scores in the decks' collapsed centipawns. */
export const MATE = 9000
/** Points of material that count as a gain or a loss. */
export const GAIN = 2
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

export const sanTokens = (line: string): string[] =>
  line
    .split(/\s+/)
    .map((t) => t.replace(/^\d+\.(\.\.)?/, ''))
    .filter((t) => t.length > 0)

/** A UCI move as chess.js plays it. */
export const uciMove = (uci: string) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })

/** His material minus theirs. */
function balance(c: Chess, me: 'w' | 'b'): number {
  let s = 0
  for (const row of c.board()) for (const sq of row) if (sq) s += (sq.color === me ? 1 : -1) * VALUE[sq.type]
  return s
}

/**
 * Walk a line of moves (SAN, or UCI objects) from a position; `me`'s balance
 * change at its end (the lower of the last two when it ends on a capture), and
 * whether it ends in mate. Null when the line does not replay.
 */
export function walk(fen: string, moves: Array<string | { from: string; to: string; promotion?: string }>, me: 'w' | 'b'): { delta: number; mate: boolean; plies: number; mated: 'w' | 'b' | null } | null {
  const c = new Chess(fen)
  const start = balance(c, me)
  const bal: number[] = [start]
  let lastCapture = false
  for (const m of moves) {
    let mv
    try {
      mv = c.move(m)
    } catch {
      return null
    }
    lastCapture = !!mv.captured
    bal.push(balance(c, me))
  }
  const n = bal.length - 1
  const end = lastCapture && n >= 1 ? Math.min(bal[n], bal[n - 1]) : bal[n]
  const mate = c.isCheckmate()
  return { delta: end - start, mate, plies: n, mated: mate ? c.turn() : null }
}

/** One deck item's cell: what the best move did and what his move cost, from the stored lines. */
export function classify(it: any): { best: 'mates' | 'wins' | 'holds'; played: 'allowedMate' | 'lost' | 'other'; shape: 'attacking' | 'defensive' | 'mixed'; bestDelta: number | null; playedDelta: number | null; readable: { best: boolean; played: boolean } } {
  const me: 'w' | 'b' = new Chess(it.fen).turn()
  const bestOpt = it.options.find((o: any) => o.move === it.best) ?? null
  const bestLine = bestOpt ? sanTokens(bestOpt.line) : [it.best]
  const b = walk(it.fen, bestLine, me)
  const bestMates = it.kind === 'missedMate' || (b?.mate ?? false) || (bestOpt !== null && bestOpt.eval >= MATE)
  const bestWins = !bestMates && b !== null && b.delta >= GAIN
  const best = bestMates ? 'mates' : bestWins ? 'wins' : 'holds'

  const playedOpt = it.options.find((o: any) => o.move === it.played) ?? null
  const playedLine = playedOpt ? sanTokens(playedOpt.line) : [it.played, ...(it.punish ? sanTokens(it.punish) : [])]
  const p = walk(it.fen, playedLine, me)
  const allowedMate = (p?.mate ?? false) || (playedOpt !== null && playedOpt.eval <= -MATE)
  const lost = !allowedMate && p !== null && p.delta <= -GAIN
  const played = allowedMate ? 'allowedMate' : lost ? 'lost' : 'other'

  const shape = best !== 'holds' && played === 'other' ? 'attacking' : best === 'holds' && played !== 'other' ? 'defensive' : 'mixed'
  return { best, played, shape, bestDelta: b?.delta ?? null, playedDelta: p?.delta ?? null, readable: { best: b !== null, played: p !== null } }
}
