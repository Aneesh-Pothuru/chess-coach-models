// The theme of a turning point, in the player's own vocabulary: what the best
// move DOES, named the way the misses deck, the puzzle buckets and the rule
// ledger name it. One definition of "hangingPiece" keeps the three from
// disagreeing about what the player is missing.
//
// Every tag is gated on what `best` actually does: a coincidental loose piece
// is not a `hangingPiece` when best is an unrelated mating attack, and a weak
// back rank is not a `backRankMate` unless the mate is the point. Wrong tags
// feed the rules graded by theme and the weakness profile. When nothing fires
// the position's phase names it, so every item is still groupable.

import { Chess, type Color } from 'chess.js'
import { describeMove } from '../describeMove'
import { phaseOf } from '../facts/phase'
import { hangingPieces } from '../kernel/hanging'
import { flipTurn } from '../kernel/probe'
import { detectFork } from './fork'
import { backRankWeakness, f7f2Danger, mateInOneMoves } from './threats'

/** The themes a turning point is filed under (a phase name when no motif fires). */
export type BestMoveTheme = 'mateIn1' | 'backRankMate' | 'fork' | 'attackingF2F7' | 'hangingPiece' | 'skewer' | 'discoveredAttack' | 'pin' | 'defensiveMove' | 'opening' | 'middlegame' | 'endgame' | 'tactics'

/** Does the move (already played; `afterFen` is the result) cash the back rank: mate there now, or a mate-in-one threat landing there next? */
function exploitsBackRank(mv: { san: string; to: string }, afterFen: string, enemy: Color): boolean {
  const backRank = enemy === 'w' ? '1' : '8'
  if (mv.san.endsWith('#') && mv.to[1] === backRank) return true
  const flipped = flipTurn(afterFen)
  if (!flipped) return false
  try {
    return mateInOneMoves(flipped).some((san) => {
      try {
        return new Chess(flipped).move(san).to[1] === backRank
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

/** Was one of the mover's pieces loose (or its f-square under fire), and did the move fix it? */
function defends(fen: string, mine: Color, mv: { from: string; to: string }, afterFen: string): boolean {
  const f7 = f7f2Danger(fen, mine)
  if (f7 && !f7f2Danger(afterFen, mine)) return true
  const looseBefore = hangingPieces(fen, mine)
  if (looseBefore.length === 0) return false
  const after = new Chess(afterFen)
  const looseAfter = new Set(hangingPieces(afterFen, mine).map((h) => h.square))
  return looseBefore.some((h) => {
    // The rescued piece may have been the one that moved.
    const sq = (mv.from === h.square ? mv.to : h.square) as Parameters<Chess['get']>[0]
    const cell = after.get(sq)
    if (!cell || cell.color !== mine) return false
    return !looseAfter.has(sq)
  })
}

/** The describer's tactics the theme names, most precise first. */
const DESCRIBED: ReadonlyArray<readonly [string, BestMoveTheme]> = [
  ['skewer', 'skewer'],
  ['discovered-attack', 'discoveredAttack'],
  ['pin', 'pin'],
]

/** The theme of `best` (SAN) played from `fen`; 'tactics' when the move does not apply there. */
export function themeOfBest(fen: string, best: string): BestMoveTheme {
  try {
    const c = new Chess(fen)
    const mine = c.turn()
    const enemy: Color = mine === 'w' ? 'b' : 'w'
    const mv = c.move(best)
    const afterFen = c.fen()
    if (mateInOneMoves(fen).includes(mv.san)) return 'mateIn1'
    if (backRankWeakness(fen, enemy) && exploitsBackRank(mv, afterFen, enemy)) return 'backRankMate'
    if (detectFork(fen, best)) return 'fork'
    if (f7f2Danger(fen, enemy)) {
      const fsq = enemy === 'w' ? 'f2' : 'f7'
      if (mv.to === fsq || new Chess(afterFen).attackers(fsq, mine).includes(mv.to)) return 'attackingF2F7'
    }
    if (hangingPieces(fen, enemy).some((h) => h.kind === 'free' && h.square === mv.to)) return 'hangingPiece'
    // The move describer's line tactics, before a loose piece makes it a defensive move.
    const gains = new Set((describeMove(fen, mv.lan)?.findings ?? []).filter((f) => f.tone === 'gain' && f.actor === mine).map((f) => f.conceptId))
    for (const [concept, word] of DESCRIBED) if (gains.has(concept)) return word
    if (defends(fen, mine, mv, afterFen)) return 'defensiveMove'
    return phaseOf(fen)
  } catch {
    return 'tactics'
  }
}
