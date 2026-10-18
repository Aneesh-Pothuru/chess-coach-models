// The prespecified grid. Every rating conversion is the pinned app's.
import { chess } from '../../bridge/lib/chess.mjs'
const { defaultMaiaElo, clampOffset, DEFAULT_LICHESS_OFFSET, LICHESS_OFFSET_RANGE } = await chess('src/services/engine/index.ts')
export const BASE = DEFAULT_LICHESS_OFFSET
if (BASE !== 250 || LICHESS_OFFSET_RANGE.min !== 0 || LICHESS_OFFSET_RANGE.max !== 500) throw new Error('app conversion changed: new rule required')
export const SEED = 7, DRAWS = 1000, GUARD_MARGIN = 0.005
export const OFFSETS = Array.from({ length: 21 }, (_, i) => i * 25)
export const SLOPES = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]
export const CANDIDATES = {
  A: OFFSETS.flatMap(him => OFFSETS.map(opp => ({ kind: 'A', id: `A:${him}:${opp}`, him, opp }))),
  B: OFFSETS.flatMap(a => SLOPES.map(b => ({ kind: 'B', id: `B:${a}:${b}`, a, b }))),
}
export const baseline = { kind: 'base', id: 'base' }
export function offsetFor(r, me, c) {
  return c.kind === 'A' ? (me ? c.him : c.opp) : c.kind === 'B' ? clampOffset(c.a + c.b * (r - 1000)) : BASE
}
export function bandsFor(m, c) {
  return { s: defaultMaiaElo(m.r, offsetFor(m.r, m.me, c)), o: defaultMaiaElo(m.ro, offsetFor(m.ro, !m.me, c)) }
}
export const punishBand = (e, c) => defaultMaiaElo(e.r, offsetFor(e.r, e.me, c))
const pairCache = new Map()
export function pairsFor(m) {
  const key = `${m.r}/${m.ro}/${m.me}`
  if (!pairCache.has(key)) {
    const pairs = new Map()
    for (const c of [baseline, ...CANDIDATES.A, ...CANDIDATES.B]) {
      const p = bandsFor(m, c); pairs.set(`${p.s}/${p.o}`, p)
    }
    pairCache.set(key, [...pairs.values()].sort((a, b) => a.s - b.s || a.o - b.o))
  }
  return pairCache.get(key)
}
export function punishPairs(e) {
  return [...new Set([baseline, ...CANDIDATES.A, ...CANDIDATES.B].map(c => punishBand(e, c)))].sort((a, b) => a - b).map(s => ({ s, o: s }))
}
export function fitTie(a, b) {
  const key = c => c.kind === 'A' ? [(c.him - BASE) ** 2 + (c.opp - BASE) ** 2, Math.abs(c.him - c.opp), c.him, c.opp] : [Math.abs(c.b), Math.abs(c.a - BASE), c.a, c.b]
  const ka = key(a), kb = key(b)
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i]
  return 0
}
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
export const quantile = (sorted, q) => sorted[Math.round(q * (sorted.length - 1))]
