import { describe, expect, it } from 'vitest'
import { mistakeCandidates } from './mistakes'

describe('the misses publisher passes the best line to the theme reader', () => {
  const fen = 'k7/8/8/8/8/8/P1P5/nK6 w - - 0 1'

  it('reads numbered SAN with annotations as a trapped piece line', () => {
    const items = mistakeCandidates([{ day: 'fixture', meIsWhite: true, deep: [
      { ply: 0, fen, san: 'Kc1', alts: [{ eval: 300, line: '1.Kb2! 1...Nb3 2.axb3' }] },
    ] }])
    expect(items).toHaveLength(1)
    expect(items[0].theme).toBe('trappedPiece')
  })

  it('keeps a short or broken line from claiming a trapped piece', () => {
    for (const line of ['Kb2', 'Kb2 invalid axb3']) {
      const items = mistakeCandidates([{ day: 'fixture', meIsWhite: true, deep: [
        { ply: 0, fen, san: 'Kc1', alts: [{ eval: 300, line }] },
      ] }])
      expect(items).toHaveLength(1)
      expect(items[0].theme).not.toBe('trappedPiece')
    }
  })
})
