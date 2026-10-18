import { describe, expect, it } from 'vitest'
import { describeMove } from '../describeMove'
import { boardOf } from '../kernel/board'
import { captureExchangeByMove } from '../kernel/exchange'
import { materialFor } from '../kernel/material'
import { themeOfBest } from './theme'
import { detectDeflection } from './tactics/line'

describe('themeOfBest names a line tactic before the defensive fallback', () => {
  it('names a pin', () => {
    expect(themeOfBest('4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1', 'Bb5')).toBe('pin')
  })

  it('names a skewer', () => {
    expect(themeOfBest('3q4/8/8/3k4/8/8/8/R5K1 w - - 0 1', 'Rd1+')).toBe('skewer')
  })

  it('names a discovered attack', () => {
    expect(themeOfBest('7r/4k3/8/8/3N4/8/1B6/6K1 w - - 0 1', 'Nf5+')).toBe('discoveredAttack')
  })

  it('names the pin when the move also rescues a loose piece', () => {
    expect(themeOfBest('4k3/8/2n5/3p4/2B5/8/8/6K1 w - - 0 1', 'Bb5')).toBe('pin')
  })

  it('keeps a plain rescue a defensive move', () => {
    expect(themeOfBest('4k3/8/8/3p4/2B5/8/8/6K1 w - - 0 1', 'Bb3')).toBe('defensiveMove')
  })

  it('keeps a fork a fork', () => {
    expect(themeOfBest('r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1', 'Nc7+')).toBe('fork')
  })
})

describe('themeOfBest names the trapped piece the solution wins', () => {
  const fen = 'k7/8/8/8/8/8/P1P5/nK6 w - - 0 1'
  const trap = (position: string) => describeMove(position, 'Kb2')?.findings.find((f) => f.conceptId === 'trapped-piece' && f.tone === 'gain' && f.actor === 'w')

  it('names the piece with no safe escape when the line takes it', () => {
    const pv = ['b1b2', 'a8b8', 'b2a1']
    expect(trap(fen)?.squares).toEqual(['a1'])
    const beforeCapture = boardOf(fen).play('Kb2')!.play('Kb8')!
    expect(captureExchangeByMove(beforeCapture.fen, pv[2])).toBe(3)
    expect(themeOfBest(fen, 'Kb2', pv)).toBe('trappedPiece')
  })

  it('follows the same trapped piece to the square where it falls', () => {
    const pv = ['b1b2', 'a1b3', 'a2b3']
    expect(trap(fen)?.squares).toEqual(['a1'])
    const beforeCapture = boardOf(fen).play('Kb2')!.play('Nb3')!
    expect(beforeCapture.get('a1')).toBeNull()
    expect(beforeCapture.get('b3')).toMatchObject({ type: 'n', color: 'b' })
    expect(captureExchangeByMove(beforeCapture.fen, pv[2])).toBe(3)
    expect(themeOfBest(fen, 'Kb2', pv)).toBe('trappedPiece')
  })

  it('does not name the trap when the line wins a different target', () => {
    const other = 'k7/8/8/8/8/6b1/P1P4P/nK6 w - - 0 1'
    const pv = ['b1b2', 'a8b8', 'h2g3']
    expect(trap(other)?.squares).toEqual(['a1'])
    const beforeCapture = boardOf(other).play('Kb2')!.play('Kb8')!
    expect(captureExchangeByMove(beforeCapture.fen, pv[2])).toBe(3)
    expect(themeOfBest(other, 'Kb2', pv)).not.toBe('trappedPiece')
  })

  it('does not count a capture whose earlier investment costs more', () => {
    const expensive = 'k7/8/8/8/8/8/P1R5/nK6 w - - 0 1'
    const pv = ['b1b2', 'a1c2', 'b2c2']
    expect(trap(expensive)?.squares).toEqual(['a1'])
    const beforeCapture = boardOf(expensive).play('Kb2')!.play('Nxc2')!
    expect(captureExchangeByMove(beforeCapture.fen, pv[2])).toBe(3)
    expect(materialFor(beforeCapture, 'w') - materialFor(expensive, 'w')).toBe(-5)
    expect(themeOfBest(expensive, 'Kb2', pv)).not.toBe('trappedPiece')
  })

  it('requires the describer to find that every escape loses', () => {
    const escape = 'k1r5/8/8/8/8/8/8/nK6 w - - 0 1'
    expect(trap(escape)).toBeUndefined()
    expect(themeOfBest(escape, 'Kb2', ['b1b2', 'a8b8', 'b2a1'])).not.toBe('trappedPiece')
  })

  it('requires a legal line beginning with this move and reaching the capture', () => {
    expect(themeOfBest(fen, 'Kb2')).not.toBe('trappedPiece')
    expect(themeOfBest(fen, 'Kb2', ['b1b2', 'a8b8'])).toBe(themeOfBest(fen, 'Kb2'))
    expect(themeOfBest(fen, 'Kb2', ['b1c1', 'a8b8', 'b2a1'])).toBe(themeOfBest(fen, 'Kb2'))
    expect(themeOfBest(fen, 'Kb2', ['b1b2', 'a8a5', 'b2a1'])).toBe(themeOfBest(fen, 'Kb2'))
  })
})

describe('themeOfBest names the solution line\'s deflection', () => {
  const fen = '3r2k1/8/8/3q4/8/8/8/4R1KQ w - - 0 1'
  const pv = ['e1e8', 'd8e8', 'h1d5']

  it('names the guard forced away before the guarded piece falls', () => {
    expect(detectDeflection(fen, pv)).toMatchObject({ kind: 'deflection', defender: 'd8', square: 'd5' })
    expect(themeOfBest(fen, 'Re8+', pv)).toBe('deflection')
  })

  it('names an overloaded defender by the same concept', () => {
    const overloaded = '2r1r3/6k1/8/4n3/8/8/7Q/2R3K1 w - - 0 1'
    const line = ['c1c8', 'e8c8', 'h2e5']
    expect(detectDeflection(overloaded, line)).toMatchObject({ kind: 'overloadedDefender', defender: 'e8', square: 'e5' })
    expect(themeOfBest(overloaded, 'Rxc8', line)).toBe('deflection')
  })

  it('needs a line starting with the move it names', () => {
    expect(themeOfBest(fen, 'Re8+')).not.toBe('deflection')
    expect(themeOfBest(fen, 'Kf1', pv)).not.toBe('deflection')
    expect(themeOfBest(fen, 'Re8+', pv.slice(0, 2))).not.toBe('deflection')
    expect(themeOfBest(fen, 'Re8+', ['e1e8', 'd8e8', 'h1h5'])).not.toBe('deflection')
  })

  it('says nothing when the guard wanders away without a forcing move', () => {
    const line = ['g1f1', 'd8a8', 'h1d5']
    expect(detectDeflection(fen, line)).toBeNull()
    expect(themeOfBest(fen, 'Kf1', line)).not.toBe('deflection')
  })

  it('says nothing when another guard still holds the square', () => {
    const guarded = '2r1r3/6k1/3p4/4n3/8/8/7Q/2R3K1 w - - 0 1'
    const line = ['c1c8', 'e8c8', 'h2e5']
    expect(detectDeflection(guarded, line)).toBeNull()
    expect(themeOfBest(guarded, 'Rxc8', line)).not.toBe('deflection')
  })
})

describe('themeOfBest keeps trapped-piece proof before the supplementary deflection reader', () => {
  const fen = '1r2n3/8/7k/8/3B4/8/P1PK4/nR2R3 w - - 0 1'
  const pv = ['d4b2', 'b8b2', 'e1e8', 'h6g5', 'b1a1']

  it('names the trapped piece when the supplied line proves both words', () => {
    const trapped = describeMove(fen, 'Bb2')?.findings.find((f) => f.conceptId === 'trapped-piece' && f.tone === 'gain' && f.actor === 'w')
    expect(trapped?.squares).toEqual(['a1'])
    expect(detectDeflection(fen, pv)).toMatchObject({ kind: 'deflection', defender: 'b8', square: 'e8' })
    let board = boardOf(fen)
    for (const uci of pv.slice(0, -1)) board = board.child(board.findUci(uci)!)
    expect(board.get('a1')).toMatchObject({ type: 'n', color: 'b' })
    const gain = captureExchangeByMove(board.fen, pv.at(-1)!)
    expect(gain).toBeGreaterThan(0)
    expect(materialFor(board, 'w') - materialFor(fen, 'w') + gain!).toBeGreaterThan(0)
    expect(themeOfBest(fen, 'Bb2', pv)).toBe('trappedPiece')
  })

  it('uses deflection when the line stops before collecting the trapped piece', () => {
    expect(detectDeflection(fen, pv.slice(0, 3))).toMatchObject({ defender: 'b8', square: 'e8' })
    expect(themeOfBest(fen, 'Bb2', pv.slice(0, 3))).toBe('deflection')
  })
})
