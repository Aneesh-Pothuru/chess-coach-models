// What the review-walk scripts share: the held-out sample the README fixed,
// the bars of its rule, and where the per-game reviews live.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROJECT = 'review-walk'
export const HELDOUT_BEFORE = '2026-09-23'
export const HELDOUT_GAMES = 80
export const SEED = 20261112
export const DRAWS = 10000
export const CAPS = [1, 2, 3, 4, 5, 6]
export const LONG_WALK = 5
export const COVERAGE_MEDIAN_ABOVE = 0.5
export const COVERAGE_QUARTILE_BAR = 0.4
export const TURN_BAR = 0.9

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

export function sample(items, n, seed) {
  if (items.length <= n) return items.slice()
  const rand = mulberry32(seed)
  const pool = items.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, n)
}

/** The held-out games: a seeded sample of the games played before any game read while the walk was designed. */
export function heldoutOf(games) {
  const before = games.filter((g) => g.date < HELDOUT_BEFORE).sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
  return sample(before, HELDOUT_GAMES, SEED).sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
}

export function reviewPath(dir, gameId) {
  return join(dir, 'phone', `${gameId.replace(/^cc:/, '')}.json`)
}

export function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

export function quantile(values, p) {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const at = (sorted.length - 1) * p
  const low = Math.floor(at)
  const high = Math.min(low + 1, sorted.length - 1)
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low)
}

/** The 95% interval of a statistic over games, from DRAWS bootstrap resamples of the games. */
export function interval(values, stat, seed = SEED) {
  if (values.length === 0) return null
  const rand = mulberry32(seed)
  const draws = []
  for (let d = 0; d < DRAWS; d++) {
    const resample = Array.from({ length: values.length }, () => values[Math.floor(rand() * values.length)])
    draws.push(stat(resample))
  }
  return [quantile(draws, 0.025), quantile(draws, 0.975)]
}
