import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

export const PROJECT = 'findable-move'
export const DECOY_DROP = 10
export const ROLLOUTS = 16
export const PLIES = 12
export const BUDGET = 'check'
export const MARGIN = 1
export const DRAWS = 2000
export const SEED = 20261018
export const BASE_SECONDS = 600
export const CLOCK_SLACK = 60

export function tenMinutes(game, timeControlOf) {
  const tc = timeControlOf(game)
  return tc.base === BASE_SECONDS && tc.inc === 0
}

export function clocksSayTenMinutes(game) {
  const clocks = Array.isArray(game.clocks) ? game.clocks : []
  if (clocks.length < 2 || clocks.some((x) => typeof x !== 'number')) return false
  return [0, 1].every((side) => {
    const own = clocks.filter((_, i) => i % 2 === side)
    return own[0] <= BASE_SECONDS && own[0] >= BASE_SECONDS - CLOCK_SLACK && own.every((x, i) => i === 0 || x <= own[i - 1])
  })
}

export function gitCommit(dir) {
  return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seedOf(...parts) {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export function readJsonl(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

export function bootstrapMean(items, value, { draws = DRAWS, seed = SEED } = {}) {
  const groups = new Map()
  for (const it of items) {
    const v = value(it)
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    const g = groups.get(it.game) ?? { sum: 0, n: 0 }
    g.sum += v
    g.n++
    groups.set(it.game, g)
  }
  const gs = [...groups.values()]
  const n = gs.reduce((a, g) => a + g.n, 0)
  if (n === 0) return { n: 0, games: 0, mean: null, ci: null }
  const mean = gs.reduce((a, g) => a + g.sum, 0) / n
  const rnd = mulberry32(seed)
  const means = []
  for (let b = 0; b < draws; b++) {
    let s = 0
    let m = 0
    for (let i = 0; i < gs.length; i++) {
      const g = gs[Math.floor(rnd() * gs.length)]
      s += g.sum
      m += g.n
    }
    means.push(m ? s / m : 0)
  }
  means.sort((a, b) => a - b)
  return { n, games: gs.length, mean, ci: [means[Math.floor(0.025 * draws)], means[Math.ceil(0.975 * draws) - 1]] }
}
