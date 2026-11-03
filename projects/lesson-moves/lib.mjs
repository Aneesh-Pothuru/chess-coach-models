// What the lesson-moves scripts share: the split the README fixed, the
// bootstrap, and the private rows' file.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

export const PROJECT = 'lesson-moves'
export const TRAIN_UNTIL = '2026-09-16'
export const HELDOUT_UNTIL = '2026-11-02'
export const INSPECTED = ['2026-10-31', '2026-11-02']
export const DRAWS = 10000
export const SEED = 20261103
export const COVERAGE_BAR = 0.5
export const COST_BAR = 1.5

export function splitOf(day) {
  if (day <= TRAIN_UNTIL) return 'train'
  if (day <= HELDOUT_UNTIL && !INSPECTED.includes(day)) return 'heldout'
  return null
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

// The SAN moves of an archive line such as "27...h6 28.Qb6 Kh7".
export function sansOf(line) {
  return String(line ?? '')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !/^\d+\.(\.\.)?$/.test(t))
    .map((t) => t.replace(/^\d+\.(\.\.)?/, ''))
    .filter(Boolean)
}

// The UCI moves of SAN moves from a position, or none when they do not replay.
export function lineOf(C, fen, sans) {
  try {
    return C.replaySans(fen, sans).ucis
  } catch {
    return []
  }
}

export function readJsonl(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

// A mean over rows with a 95% interval from resampling whole games, so a
// game's turning points move together.
export function bootstrapMean(rows, value, { draws = DRAWS, seed = SEED } = {}) {
  const groups = new Map()
  for (const r of rows) {
    const v = value(r)
    if (v === null || v === undefined || !Number.isFinite(v)) continue
    const g = groups.get(r.game) ?? { sum: 0, n: 0 }
    g.sum += v
    g.n++
    groups.set(r.game, g)
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
    means.push(s / m)
  }
  means.sort((a, b) => a - b)
  return { n, games: gs.length, mean, ci: [means[Math.floor(draws * 0.025)], means[Math.ceil(draws * 0.975) - 1]] }
}

export function share(rows, test) {
  const n = rows.length
  const k = rows.filter(test).length
  return { k, n, p: n ? k / n : null }
}
