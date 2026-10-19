import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

export const PROJECT = 'judge-factors'
export const MONTHS = { train: '2026-08', heldout: '2026-09' }
export const READINGS = ['kingSafety', 'activity', 'structure', 'threats', 'worstPiece']
export const DRILL_FACTORS = ['kingSafety', 'activity', 'structure', 'threats']
export const WORST_PIECE_LEAN = 3
export const MIN_LEGAL_MOVES = 4
export const CAP = 3000
export const BUDGET = 'grade'
export const MIN_HELDOUT = 200
export const RELIABLE = 2 / 3
export const SEED = 20261018
export const BANDS = [
  [1250, 1449],
  [1450, 1649],
]

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
  const raw = file.endsWith('.gz') ? gunzipSync(readFileSync(file)).toString('utf8') : readFileSync(file, 'utf8')
  return raw
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

export function shardOf(arg) {
  const m = /^(\d+)\/(\d+)$/.exec(arg ?? '0/1')
  if (!m) throw new Error(`not a shard: ${arg}`)
  const [i, n] = [Number(m[1]), Number(m[2])]
  if (i >= n) throw new Error(`not a shard: ${arg}`)
  return { i, n }
}

export function argOf(name, fallback = null) {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : fallback
}

export function wilson(k, n, z = 1.959963984540054) {
  if (n === 0) return { k, n, share: null, ci: null }
  const p = k / n
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return { k, n, share: p, ci: [c - h, c + h] }
}

export function readingDecision(agreement) {
  // The report rounds its intervals; a decision must use the counts' full precision.
  const intervals = Object.keys(MONTHS).map((s) => wilson(agreement[s].k, agreement[s].n).ci)
  const above = (bar) => intervals.every((ci) => ci && ci[0] > bar)
  const below = (bar) => intervals.every((ci) => ci && ci[1] < bar)
  let verdict
  if (agreement.heldout.n < MIN_HELDOUT) verdict = `not enough data (n=${agreement.heldout.n})`
  else if (above(0.5)) verdict = 'tells who is better'
  else if (below(0.5)) verdict = 'points the wrong way'
  else verdict = 'no signal'
  return { verdict, reliable: verdict === 'tells who is better' && above(RELIABLE) }
}

export const bandOf = (whiteElo, blackElo) => {
  const mean = (whiteElo + blackElo) / 2
  const b = BANDS.find(([lo, hi]) => mean >= lo && mean <= hi + 0.5)
  return b ? `${b[0]}-${b[1]}` : null
}

export const keyOf = (p) => `${p.month}|${p.game}|${p.ply}`

export function studyRows(dir) {
  const rows = []
  for (const month of Object.values(MONTHS)) {
    const found = readdirSync(dir)
      .filter((f) => f.startsWith(`positions-${month}-`) && f.endsWith('.jsonl'))
      .flatMap((f) => readJsonl(join(dir, f)))
      .sort((a, b) => a.gi - b.gi || READINGS.indexOf(a.reading) - READINGS.indexOf(b.reading))
    const kept = Object.fromEntries(READINGS.map((r) => [r, 0]))
    for (const p of found) {
      if (kept[p.reading] >= CAP) continue
      kept[p.reading]++
      rows.push(p)
    }
  }
  return rows
}
