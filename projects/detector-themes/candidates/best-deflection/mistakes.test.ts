import { describe, expect, it } from 'vitest'
import { mistakeCandidates } from './mistakes'

describe('the misses publisher passes the best line to the theme reader', () => {
  const fen = '3r2k1/8/8/3q4/8/8/8/4R1KQ w - - 0 1'

  it('reads numbered SAN with annotations as a deflection line', () => {
    const items = mistakeCandidates([{ day: 'fixture', meIsWhite: true, deep: [
      { ply: 0, fen, san: 'Kf1', alts: [{ eval: 400, line: '1.Re8+! 1...Rxe8 2.Qxd5' }] },
    ] }])
    expect(items).toHaveLength(1)
    expect(items[0].theme).toBe('deflection')
  })

  it('keeps a short or broken line from claiming a deflection', () => {
    for (const line of ['Re8+', 'Re8+ invalid Qxd5']) {
      const items = mistakeCandidates([{ day: 'fixture', meIsWhite: true, deep: [
        { ply: 0, fen, san: 'Kf1', alts: [{ eval: 400, line }] },
      ] }])
      expect(items).toHaveLength(1)
      expect(items[0].theme).not.toBe('deflection')
    }
  })
})
