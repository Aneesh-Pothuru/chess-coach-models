// What the review-lessons scripts share: the split the README fixed, the
// bootstrap, and where the per-game reviews and rows live.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROJECT = 'review-lessons'
export const TRAIN_UNTIL = '2026-09-16'
export const HELDOUT_FROM = '2026-09-17'
export const HELDOUT_UNTIL = '2026-11-04'
export const INSPECTED = ['2026-10-31', '2026-11-02', '2026-11-03']
export const TRAIN_EVERY = 8
export const JUDGE_TRAIN = 60
export const JUDGE_HELDOUT = 120
export const CONTROLS = 20
export const DRAWS = 10000
export const SEED = 20261105
export const COVERAGE_SLACK = 0.02
export const SAME_BAR = 16
export const DECOY_BAR = 14

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

export function splitOf(games) {
  const train = games.filter((g) => g.date <= TRAIN_UNTIL).filter((_, i) => i % TRAIN_EVERY === 0)
  const heldout = games.filter((g) => g.date >= HELDOUT_FROM && g.date <= HELDOUT_UNTIL && !INSPECTED.includes(g.date))
  return { train, heldout }
}

export function reviewPath(dir, gameId) {
  return join(dir, 'phone', `${gameId.replace(/^cc:/, '')}.json`)
}

export function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
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
