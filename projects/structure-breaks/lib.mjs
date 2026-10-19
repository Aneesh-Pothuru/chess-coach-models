import { Chess } from 'chess.js'
import { boot, mulberry32, readJsonl, seedOf } from '../positions-like-this/lib.mjs'

export {
  argOf,
  boot,
  byGame,
  clockBefore,
  gitCommit,
  interval,
  linesOf,
  menOf,
  mulberry32,
  quietMove,
  readJsonl,
  seedOf,
  shardOf,
  topOf,
} from '../positions-like-this/lib.mjs'

export const PROJECT = 'structure-breaks'
export const SOURCE = 'positions-like-this'
export const MONTH = '2026-09'
export const BUDGET = 'grade'
export const WIN_LOW = 10
export const WIN_HIGH = 90
export const MIN_MEN = 8
export const CLOCK_FLOOR = 30
export const MIN_LEGAL = 2
export const STRONG_POSITIONS = 1200
export const STRONG_CANDIDATES = 3000
export const STRONG_TRIES = 3
export const MIN_POSITIONS = 150
export const MIN_CELL = 30
export const SEED = 20261019

export const uciOf = (m) => m.from + m.to + (m.promotion ?? '')

export function sansOf(ucis) {
  const game = new Chess()
  return ucis.map((u) => game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san)
}

export function breaksOf(fen, sansBefore, K, S) {
  const hit = K.structureOf(fen)
  if (!hit) return { structure: null, holder: null, levers: [], breaks: [] }
  const holder = S.HOLDER_WRITTEN.has(hit.id) && hit.owner !== 'both' ? hit.owner : null
  const meIsWhite = fen.split(' ')[1] === 'w'
  const levers = K.leversFor(K.structureById(hit.id), meIsWhite, holder)
  if (!levers.length) return { structure: hit.id, holder, levers, breaks: [] }
  const ply = sansBefore.length
  const breaks = new Chess(fen)
    .moves({ verbose: true })
    .filter((m) => m.piece === 'p')
    .filter((m) => K.playedLever([...sansBefore, m.san], meIsWhite, levers, ply))
    .map(uciOf)
  return { structure: hit.id, holder, levers, breaks }
}

export function randomOthers(fen, breaks, seed) {
  const others = new Chess(fen)
    .moves({ verbose: true })
    .map(uciOf)
    .filter((u) => !breaks.includes(u))
  if (!others.length) return null
  const rnd = mulberry32(seed)
  return [others[Math.floor(rnd() * others.length)], others[Math.floor(rnd() * others.length)]]
}

export const soundOf = (r, uci) => (r.scores[uci].sound ? 1 : 0)
export const lostOf = (r, uci) => Math.max(0, r.scores[uci].lost)
export const meanOver = (list, f) => list.reduce((s, x) => s + f(x), 0) / list.length
export const breakSound = (r) => meanOver(r.breaks, (m) => soundOf(r, m))
export const breakLost = (r) => meanOver(r.breaks, (m) => lostOf(r, m))
export const breakBest = (r) => meanOver(r.breaks, (m) => (m === r.best ? 1 : 0))

export function rowsOf(dir, prefix, readdirSync) {
  const rows = readdirSync(dir)
    .filter((f) => new RegExp(`^${prefix}-\\d+-of-\\d+\\.jsonl$`).test(f))
    .flatMap((f) => readJsonl(`${dir}/${f}`))
  const statuses = {}
  for (const r of rows) statuses[r.status] = (statuses[r.status] ?? 0) + 1
  const scored = rows.filter((r) => r.status === 'scored')
  const exact = scored.filter((r) => Object.values(r.scores).every((s) => s.exact))
  return { rows, statuses, scored: exact, inexact: scored.length - exact.length }
}

export function bootOf(units, valuesOf, seed) {
  return units.length ? boot(units, valuesOf, seed) : null
}
