import { describe, expect, it } from 'vitest'
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
