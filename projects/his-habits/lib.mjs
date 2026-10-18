import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { Chess } from 'chess.js'

export const PROJECT = 'his-habits'
export const OFFSET = 250
export const ABOVE = 200
export const WIN_LOW = 10
export const WIN_HIGH = 90
export const CLOCK_FLOOR = 30
export const START_CLOCK = 600
export const MIN_LEGAL = 2
export const COST_BUDGET = 'grade'
export const FILTER_BUDGET = 'check'
export const LICHESS_MONTH = '2026-09'
export const LICHESS_BANDS = [1000, 1100, 1200, 1300, 1400, 1500, 1600]
export const LICHESS_FLOOR = 900
export const PER_BAND = 2000
export const PER_PLAYER = 2
export const TRIES = 6
export const MIN_COUNT = 30
export const KAPPA_RANGE = [2 / 3, 3 / 2]
export const DRAWS = 2000
export const SEED = 20261018

export const MOVE_KINDS = ['capture', 'check', 'pawn-push', 'retreat', 'king-move', 'queen-move', 'even-trade', 'worst-piece', 'shelter', 'threat']
export const INSIGHT_KINDS = {
  'open-file': ['open-file'],
  battery: ['battery'],
  'king-pressure': ['king-pressure'],
  'pawn-break': ['pawn-break'],
  'passed-pawn': ['passed-pawn', 'promotion'],
  outpost: ['outpost'],
  'seventh-rank': ['seventh-rank'],
  'active-king': ['active-king'],
  'gives-bishop-pair': ['bishop-pair'],
  'pawn-weakness': ['self-doubled', 'self-isolated'],
  tactic: ['fork', 'pin', 'skewer', 'trapped', 'wins-capture'],
}
export const CONTROL = 'hangs'
export const HANGS = ['hangs-itself', 'leaves-hanging']
export const KINDS = [...MOVE_KINDS, ...Object.keys(INSIGHT_KINDS), CONTROL]
export const BIT = Object.fromEntries(KINDS.map((k, i) => [k, 1 << i]))

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

export function shuffled(items, rnd) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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

export const has = (mask, kind) => (mask & BIT[kind]) !== 0

export function clockBefore(clocks, ply) {
  if (ply < 2) return START_CLOCK
  const c = clocks?.[ply - 2]
  return typeof c === 'number' && Number.isFinite(c) ? c : null
}

export function candidateOf(K, fen) {
  if (K.phaseOf(fen) === 'opening') return 'opening'
  const board = new Chess(fen)
  if (board.isCheck()) return 'in check'
  if (board.moves().length < MIN_LEGAL) return 'one legal move'
  return null
}

export function tenMinutes(g, parseTimeControl) {
  const tc = parseTimeControl(typeof g.time_control === 'string' ? g.time_control : null)
  if (tc) return tc.base === START_CLOCK && tc.inc === 0
  if (typeof g.time_control === 'string') return false
  const clocks = (g.clocks ?? []).filter((c) => typeof c === 'number' && Number.isFinite(c))
  return clocks.length > 0 && Math.max(...clocks) <= START_CLOCK
}

export function kindsReader(K) {
  const targets = (captures) => new Set(captures.map((c) => c.uci.slice(2, 4)))
  return function kindsOf(fen) {
    const board = new Chess(fen)
    const us = board.turn()
    const before = K.describePosition(fen)
    const hadTargets = targets(before.threats.winningCaptures[us])
    const hadMate = before.threats.mateInOne[us].length > 0
    const worst = before.side[us].activity.worstPiece?.square ?? null
    const out = []
    for (const m of board.moves({ verbose: true })) {
      const uci = m.from + m.to + (m.promotion ?? '')
      const capture = m.flags.includes('c') || m.flags.includes('e')
      const castle = m.flags.includes('k') || m.flags.includes('q')
      let mask = 0
      const set = (kind) => {
        mask |= BIT[kind]
      }
      if (capture) set('capture')
      if (m.san.includes('+') || m.san.includes('#')) set('check')
      if (m.piece === 'p' && !capture) set('pawn-push')
      if ('nbrq'.includes(m.piece) && !capture) {
        const from = Number(m.from[1])
        const to = Number(m.to[1])
        if (us === 'w' ? to < from : to > from) set('retreat')
      }
      if (m.piece === 'k' && !castle) set('king-move')
      if (m.piece === 'q') set('queen-move')
      if (capture && m.captured && 'nbrq'.includes(m.captured) && K.captureExchangeByMove(fen, uci) === 0) set('even-trade')
      if (worst && m.from === worst) set('worst-piece')
      const dm = K.describeMove(fen, uci)
      if (dm.delta.shelterThinned) set('shelter')
      const after = dm.after.threats
      const newTarget = after.winningCaptures[us].some((c) => !hadTargets.has(c.uci.slice(2, 4)))
      const newMate = !hadMate && after.mateInOne[us].length > 0
      if (newTarget || newMate) set('threat')
      const ids = new Set(K.moveInsights(fen, uci).map((i) => i.id))
      for (const [kind, list] of Object.entries(INSIGHT_KINDS)) if (list.some((id) => ids.has(id))) set(kind)
      if (!capture && HANGS.some((id) => ids.has(id))) set(CONTROL)
      out.push([uci, mask])
    }
    return out
  }
}

export function expectedOf(moves, policy) {
  const e = new Array(KINDS.length).fill(0)
  for (const [uci, mask] of moves) {
    const p = policy[uci] ?? 0
    if (p === 0) continue
    for (let k = 0; k < KINDS.length; k++) if (mask & (1 << k)) e[k] += p
  }
  return e
}

export function topOf(policy) {
  let best = null
  let bp = -1
  for (const [uci, p] of Object.entries(policy)) {
    if (p > bp) {
      best = uci
      bp = p
    }
  }
  return best
}
