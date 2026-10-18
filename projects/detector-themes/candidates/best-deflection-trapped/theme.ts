import { Chess, type Color } from 'chess.js'
import { phaseOf } from '../facts/phase'
import { boardOf } from '../kernel/board'
import { captureExchangeByMove } from '../kernel/exchange'
import { hangingPieces } from '../kernel/hanging'
import { materialFor } from '../kernel/material'
import { flipTurn } from '../kernel/probe'
import { describeMove } from '../describeMove'
import { detectFork } from './fork'
import { detectDeflection } from './tactics/line'
import { backRankWeakness, f7f2Danger, mateInOneMoves } from './threats'

export type BestMoveTheme = 'mateIn1' | 'backRankMate' | 'fork' | 'attackingF2F7' | 'hangingPiece' | 'skewer' | 'discoveredAttack' | 'pin' | 'trappedPiece' | 'deflection' | 'defensiveMove' | 'opening' | 'middlegame' | 'endgame' | 'tactics'

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

function defends(fen: string, mine: Color, mv: { from: string; to: string }, afterFen: string): boolean {
  const f7 = f7f2Danger(fen, mine)
  if (f7 && !f7f2Danger(afterFen, mine)) return true
  const looseBefore = hangingPieces(fen, mine)
  if (looseBefore.length === 0) return false
  const after = new Chess(afterFen)
  const looseAfter = new Set(hangingPieces(afterFen, mine).map((h) => h.square))
  return looseBefore.some((h) => {
    const sq = (mv.from === h.square ? mv.to : h.square) as Parameters<Chess['get']>[0]
    const cell = after.get(sq)
    if (!cell || cell.color !== mine) return false
    return !looseAfter.has(sq)
  })
}

const DESCRIBED: ReadonlyArray<readonly [string, BestMoveTheme]> = [
  ['skewer', 'skewer'],
  ['discovered-attack', 'discoveredAttack'],
  ['pin', 'pin'],
]

function collectsTrappedPiece(fen: string, afterFen: string, square: string, solutionPv: string[], mine: Color): boolean {
  let board = boardOf(afterFen)
  const piece = board.get(square)
  if (!piece || piece.color === mine || piece.type === 'k' || piece.type === 'p') return false
  let target = square
  const before = materialFor(fen, mine)
  for (const uci of solutionPv.slice(1)) {
    const move = board.findUci(uci)
    if (!move) return false
    if (move.color === mine && move.to === target && move.isCapture()) {
      const gain = captureExchangeByMove(board.fen, uci)
      return gain !== null && gain > 0 && materialFor(board, mine) - before + gain > 0
    }
    if (move.color === piece.color && move.from === target) target = move.to
    board = board.child(move)
    const still = board.get(target)
    if (!still || still.color !== piece.color || still.type !== piece.type) return false
  }
  return false
}

export function themeOfBest(fen: string, best: string, solutionPv: string[] = []): BestMoveTheme {
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
    const findings = (describeMove(fen, mv.lan)?.findings ?? []).filter((f) => f.tone === 'gain' && f.actor === mine)
    const gains = new Set(findings.map((f) => f.conceptId))
    for (const [concept, theme] of DESCRIBED) if (gains.has(concept)) return theme
    const trapped = findings.find((f) => f.conceptId === 'trapped-piece')?.squares[0]
    if (trapped && solutionPv[0] === mv.lan && collectsTrappedPiece(fen, afterFen, trapped, solutionPv, mine)) return 'trappedPiece'
    if (solutionPv[0] === mv.lan && detectDeflection(fen, solutionPv)) return 'deflection'
    if (defends(fen, mine, mv, afterFen)) return 'defensiveMove'
    return phaseOf(fen)
  } catch {
    return 'tactics'
  }
}
