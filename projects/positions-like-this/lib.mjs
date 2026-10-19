import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createGunzip, gunzipSync } from 'node:zlib'

export const PROJECT = 'positions-like-this'
export const MONTH = '2026-09'
export const HELD_OUT_ONE_IN = 10
export const MIN_MEN = 8
export const CLOCK_FLOOR = 30
export const START_CLOCK = 600
export const MIN_LEGAL = 2
export const WIN_LOW = 10
export const WIN_HIGH = 90
export const OFFSET = 250
export const ABOVE = 200
export const BUDGET = 'grade'
export const ARM = 3
export const RANDOM_DRAWS = 20000
export const PIECE_CAP = 2
export const KING_CAP = 3
export const STRONG_QUERIES = 1200
export const STRONG_TRIES = 3
export const MIN_POSITIONS = 300
export const HARD = 0.1
export const DISTANCE_BINS = [
  [0, 2],
  [3, 5],
  [6, 9],
  [10, Infinity],
]
export const DRAWS = 2000
export const SEED = 20261019

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

export async function* linesOf(file) {
  const input = file.endsWith('.gz') ? createReadStream(file).pipe(createGunzip()) : createReadStream(file)
  for await (const line of createInterface({ input, crlfDelay: Infinity })) if (line.trim()) yield line
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

export function tenMinutes(g, parseTimeControl) {
  const tc = parseTimeControl(typeof g.time_control === 'string' ? g.time_control : null)
  if (tc) return tc.base === START_CLOCK && tc.inc === 0
  if (typeof g.time_control === 'string') return false
  const clocks = (g.clocks ?? []).filter((c) => typeof c === 'number' && Number.isFinite(c))
  return clocks.length > 0 && Math.max(...clocks) <= START_CLOCK
}

export function clockBefore(clocks, ply, start) {
  if (ply < 2) return start
  const c = clocks?.[ply - 2]
  return typeof c === 'number' && Number.isFinite(c) ? c : null
}

export function heldOut(id) {
  return seedOf(id, SEED) % HELD_OUT_ONE_IN === 0
}

export function menOf(fen) {
  let n = 0
  for (const ch of fen.split(' ')[0]) if (/[a-zA-Z]/.test(ch)) n++
  return n
}

export function normalBoard(fen) {
  const [placement, turn] = fen.split(' ')
  const out = new Array(64).fill('.')
  let rank = 7
  let file = 0
  for (const ch of placement) {
    if (ch === '/') {
      rank--
      file = 0
      continue
    }
    if (ch >= '1' && ch <= '8') {
      file += Number(ch)
      continue
    }
    const white = ch === ch.toUpperCase()
    const ours = white === (turn === 'w')
    const r = turn === 'w' ? rank : 7 - rank
    out[r * 8 + file] = ours ? ch.toUpperCase() : ch.toLowerCase()
    file++
  }
  return out.join('')
}

export function flipUci(uci) {
  const r = (c) => String(9 - Number(c))
  return uci[0] + r(uci[1]) + uci[2] + r(uci[3]) + uci.slice(4)
}

export const normalUci = (uci, turn) => (turn === 'w' ? uci : flipUci(uci))
export const realUci = normalUci

const squareOf = (s) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97)
const PROMOS = ['', 'n', 'b', 'r', 'q']

export function moveCode(nuci) {
  return squareOf(nuci.slice(0, 2)) | (squareOf(nuci.slice(2, 4)) << 6) | (PROMOS.indexOf(nuci[4] ?? '') << 12)
}

export function codeUci(code) {
  const sq = (x) => String.fromCharCode(97 + (x & 7)) + String((x >> 3) + 1)
  return sq(code & 63) + sq((code >> 6) & 63) + PROMOS[(code >> 12) & 7]
}

export const fromOf = (code) => code & 63

const lightSquare = (sq) => ((sq >> 3) + (sq & 7)) % 2 === 1

export const GROUPS = ['N', 'L', 'D', 'R', 'Q', 'n', 'l', 'd', 'r', 'q']

function groupOf(ch, sq) {
  if (ch === 'B') return lightSquare(sq) ? 'L' : 'D'
  if (ch === 'b') return lightSquare(sq) ? 'l' : 'd'
  return ch
}

export function materialKey(board) {
  const count = Object.fromEntries([...GROUPS, 'P', 'p'].map((g) => [g, 0]))
  for (let sq = 0; sq < 64; sq++) {
    const ch = board[sq]
    if (ch === '.' || ch === 'K' || ch === 'k') continue
    count[groupOf(ch, sq)]++
  }
  // A side can promote all eight pawns: ten rooks or knights still need one digit.
  const side = (gs) => gs.map((g) => count[g].toString(16)).join('')
  return `${side(['Q', 'R', 'L', 'D', 'N', 'P'])}/${side(['q', 'r', 'l', 'd', 'n', 'p'])}`
}

export function groupSizes(key) {
  const [us, them] = key.split('/')
  const n = (s, i) => Number.parseInt(s[i], 16)
  return [n(us, 4), n(us, 2), n(us, 3), n(us, 1), n(us, 0), n(them, 4), n(them, 2), n(them, 3), n(them, 1), n(them, 0)]
}

export function featuresOf(board) {
  const pawns = new Uint32Array(4)
  const kings = new Uint8Array(2)
  const groups = Object.fromEntries(GROUPS.map((g) => [g, []]))
  for (let sq = 0; sq < 64; sq++) {
    const ch = board[sq]
    if (ch === '.') continue
    if (ch === 'P' || ch === 'p') {
      const at = (ch === 'P' ? 0 : 2) + (sq >> 5)
      pawns[at] |= 1 << (sq & 31)
      continue
    }
    if (ch === 'K') kings[0] = sq
    else if (ch === 'k') kings[1] = sq
    else groups[groupOf(ch, sq)].push(sq)
  }
  const slots = []
  for (const g of GROUPS) slots.push(...groups[g])
  return { pawns, kings, slots: Uint8Array.from(slots) }
}

const CHEB = new Uint8Array(64 * 64)
for (let a = 0; a < 64; a++) {
  for (let b = 0; b < 64; b++) CHEB[a * 64 + b] = Math.max(Math.abs((a & 7) - (b & 7)), Math.abs((a >> 3) - (b >> 3)))
}
const PIECE_COST = CHEB.map((c) => Math.min(c, PIECE_CAP))
const KING_COST = CHEB.map((c) => Math.min(c, KING_CAP))

export function popcount(x) {
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24)
}

function groupCost(a, ao, b, bo, k) {
  if (k === 1) return PIECE_COST[a[ao] * 64 + b[bo]]
  if (k === 2) {
    const s = PIECE_COST[a[ao] * 64 + b[bo]] + PIECE_COST[a[ao + 1] * 64 + b[bo + 1]]
    const t = PIECE_COST[a[ao] * 64 + b[bo + 1]] + PIECE_COST[a[ao + 1] * 64 + b[bo]]
    return s < t ? s : t
  }
  let best = Infinity
  const idx = [...Array(k).keys()]
  const permute = (i, used, sum) => {
    if (sum >= best) return
    if (i === k) {
      best = sum
      return
    }
    for (const j of idx) {
      if (used & (1 << j)) continue
      permute(i + 1, used | (1 << j), sum + PIECE_COST[a[ao + i] * 64 + b[bo + j]])
    }
  }
  if (k <= 6) permute(0, 0, 0)
  else {
    // Promotions can leave more than six pieces of one kind. Keep the same
    // minimum-assignment distance without enumerating every permutation.
    const costs = new Float64Array(1 << k).fill(Infinity)
    costs[0] = 0
    for (let used = 0; used < costs.length - 1; used++) {
      const i = popcount(used)
      for (let j = 0; j < k; j++) {
        if (used & (1 << j)) continue
        const next = used | (1 << j)
        costs[next] = Math.min(costs[next], costs[used] + PIECE_COST[a[ao + i] * 64 + b[bo + j]])
      }
    }
    best = costs.at(-1)
  }
  return best
}

export function distance(q, sizes, e) {
  let d =
    popcount(q.pawns[0] ^ e.pawns[0]) +
    popcount(q.pawns[1] ^ e.pawns[1]) +
    popcount(q.pawns[2] ^ e.pawns[2]) +
    popcount(q.pawns[3] ^ e.pawns[3])
  d += KING_COST[q.kings[0] * 64 + e.kings[0]] + KING_COST[q.kings[1] * 64 + e.kings[1]]
  let at = 0
  for (const k of sizes) {
    if (k > 0) d += groupCost(q.slots, at, e.slots, at, k)
    at += k
  }
  return d
}

function grow(arr, need) {
  if (need <= arr.length) return arr
  let size = Math.max(16, arr.length)
  while (size < need) size *= 2
  const out = new arr.constructor(size)
  out.set(arr)
  return out
}

export class Bucket {
  constructor(key) {
    this.key = key
    this.sizes = groupSizes(key)
    this.width = this.sizes.reduce((s, k) => s + k, 0)
    this.n = 0
    this.pawns = new Uint32Array(0)
    this.kings = new Uint8Array(0)
    this.slots = new Uint8Array(0)
    this.game = new Int32Array(0)
    this.ply = new Int16Array(0)
    this.move = new Int32Array(0)
    this.piece = new Uint8Array(0)
    this.phase = new Uint8Array(0)
  }

  add(features, row) {
    const i = this.n
    this.pawns = grow(this.pawns, 4 * (i + 1))
    this.kings = grow(this.kings, 2 * (i + 1))
    this.slots = grow(this.slots, this.width * (i + 1))
    this.game = grow(this.game, i + 1)
    this.ply = grow(this.ply, i + 1)
    this.move = grow(this.move, i + 1)
    this.piece = grow(this.piece, i + 1)
    this.phase = grow(this.phase, i + 1)
    this.pawns.set(features.pawns, 4 * i)
    this.kings.set(features.kings, 2 * i)
    this.slots.set(features.slots, this.width * i)
    this.game[i] = row.game
    this.ply[i] = row.ply
    this.move[i] = moveCode(row.move)
    this.piece[i] = row.piece.charCodeAt(0)
    this.phase[i] = row.phase === 'e' ? 1 : 0
    this.n++
  }

  freeze() {
    const cut = (arr, len) => arr.slice(0, len)
    this.pawns = cut(this.pawns, 4 * this.n)
    this.kings = cut(this.kings, 2 * this.n)
    this.slots = cut(this.slots, this.width * this.n)
    this.game = cut(this.game, this.n)
    this.ply = cut(this.ply, this.n)
    this.move = cut(this.move, this.n)
    this.piece = cut(this.piece, this.n)
    this.phase = cut(this.phase, this.n)
    return this
  }

  distancesTo(q) {
    const out = new Uint8Array(this.n)
    const e = { pawns: null, kings: null, slots: null }
    for (let i = 0; i < this.n; i++) {
      e.pawns = this.pawns.subarray(4 * i, 4 * i + 4)
      e.kings = this.kings.subarray(2 * i, 2 * i + 2)
      e.slots = this.slots.subarray(this.width * i, this.width * i + this.width)
      out[i] = Math.min(255, distance(q, this.sizes, e))
    }
    return out
  }
}

export function legalCodes(fen, Chess) {
  const turn = fen.split(' ')[1]
  return new Set(new Chess(fen).moves({ verbose: true }).map((m) => moveCode(normalUci(m.from + m.to + (m.promotion ?? ''), turn))))
}

export function transfers(legal, board, bucket, i) {
  const m = bucket.move[i]
  if (!legal.has(m)) return false
  return board.charCodeAt(fromOf(m)) === bucket.piece[i]
}

export function nearest(bucket, dist, legal, board, k, seed, excluded = new Set()) {
  const levels = new Map()
  for (let i = 0; i < bucket.n; i++) {
    const d = dist[i]
    let list = levels.get(d)
    if (!list) levels.set(d, (list = []))
    list.push(i)
  }
  const out = []
  const games = new Set(excluded)
  for (const d of [...levels.keys()].sort((a, b) => a - b)) {
    const list = levels.get(d).map((i) => [seedOf(seed, i), i]).sort((a, b) => a[0] - b[0])
    for (const [, i] of list) {
      if (games.has(bucket.game[i])) continue
      if (!transfers(legal, board, bucket, i)) continue
      games.add(bucket.game[i])
      out.push({ i, d })
      if (out.length === k) return out
    }
  }
  return out
}

export function drawRandom(bucket, dist, legal, board, k, rnd, excluded, draws = RANDOM_DRAWS) {
  const order = Int32Array.from({ length: bucket.n }, (_, i) => i)
  const out = []
  const games = new Set(excluded)
  const limit = Math.min(draws, bucket.n)
  for (let t = 0; t < limit; t++) {
    const j = t + Math.floor(rnd() * (bucket.n - t))
    const i = order[j]
    order[j] = order[t]
    order[t] = i
    if (games.has(bucket.game[i])) continue
    if (!transfers(legal, board, bucket, i)) continue
    games.add(bucket.game[i])
    out.push({ i, d: dist[i] })
    if (out.length === k) break
  }
  return out
}

export function shardFiles(dir, prefix, readdirSync) {
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && /-of-\d+\.jsonl$/.test(f))
    .sort()
    .map((f) => `${dir}/${f}`)
}

export async function loadIndex(files, wanted = null) {
  const buckets = new Map()
  let rows = 0
  for (const file of [files].flat()) {
    for await (const line of linesOf(file)) {
      const [game, ply, board, move, piece, phase] = JSON.parse(line)
      const key = materialKey(board)
      if (wanted && !wanted.has(key)) continue
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = new Bucket(key)))
      b.add(featuresOf(board), { game, ply, move, piece, phase })
      rows++
    }
  }
  for (const b of buckets.values()) b.freeze()
  return { buckets, rows }
}

export function quietMove(fen, uci, Chess) {
  const board = new Chess(fen)
  let m
  try {
    m = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
  } catch {
    return null
  }
  if (!m) return null
  return !(m.flags.includes('c') || m.flags.includes('e') || m.promotion || m.san.includes('+') || m.san.includes('#'))
}

export function armsOf(buckets, board, legal, seed, { second = true } = {}) {
  const bucket = buckets.get(materialKey(board))
  if (!bucket) return { bucket: null, size: 0, T: [], R: [], R2: [] }
  const q = featuresOf(board)
  const dist = bucket.distancesTo(q)
  const T = nearest(bucket, dist, legal, board, ARM, seed)
  const rnd = mulberry32(seedOf('random', seed))
  const used = new Set(T.map((m) => bucket.game[m.i]))
  const R = drawRandom(bucket, dist, legal, board, ARM, rnd, used)
  for (const m of R) used.add(bucket.game[m.i])
  const R2 = second ? drawRandom(bucket, dist, legal, board, ARM, rnd, used) : []
  return { bucket, size: bucket.n, T, R, R2 }
}

export function complete(arms, { second = true } = {}) {
  return arms.T.length === ARM && arms.R.length === ARM && (!second || arms.R2.length === ARM)
}

export function matchOf(bucket, m, turn) {
  return {
    d: m.d,
    move: realUci(codeUci(bucket.move[m.i]), turn),
    game: bucket.game[m.i],
    ply: bucket.ply[m.i],
    phase: bucket.phase[m.i] === 1 ? 'endgame' : 'middlegame',
  }
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

export async function* linesOfAll(files) {
  for (const file of files) yield* linesOf(file)
}

export function distanceParts(q, sizes, e) {
  const pawns =
    popcount(q.pawns[0] ^ e.pawns[0]) +
    popcount(q.pawns[1] ^ e.pawns[1]) +
    popcount(q.pawns[2] ^ e.pawns[2]) +
    popcount(q.pawns[3] ^ e.pawns[3])
  const kings = KING_COST[q.kings[0] * 64 + e.kings[0]] + KING_COST[q.kings[1] * 64 + e.kings[1]]
  let pieces = 0
  let at = 0
  for (const k of sizes) {
    if (k > 0) pieces += groupCost(q.slots, at, e.slots, at, k)
    at += k
  }
  return { pawns, pieces, kings }
}

export function rowsOf(dir, readdirSync) {
  const read = (prefix) =>
    readdirSync(dir)
      .filter((f) => f.startsWith(`${prefix}-`) && /-of-\d+\.jsonl$/.test(f))
      .flatMap((f) => readJsonl(`${dir}/${f}`))
  const movesOf = (r, arms) => arms.flatMap((a) => r[a].map((m) => m.move))
  const exact = (r, moves) => moves.every((m) => r.scores[m]?.exact === true)
  const hisRows = read('his')
  const strongRows = read('strong')
  const hisScored = hisRows.filter((r) => r.status === 'scored')
  const strongScored = strongRows.filter((r) => r.status === 'scored')
  return {
    hisRows,
    hisScored,
    his: hisScored.filter((r) => exact(r, [...movesOf(r, ['T', 'R', 'R2']), r.natural, r.above, r.played])),
    strongRows,
    strongScored,
    strong: strongScored.filter((r) => exact(r, [...movesOf(r, ['T', 'R']), r.twin])),
  }
}

export const soundOf = (r, uci) => (r.scores[uci].sound ? 1 : 0)
export const shareOf = (r, arm) => r[arm].reduce((s, m) => s + soundOf(r, m.move), 0) / ARM

export function interval(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (s.length < 0.95 * xs.length || s.length === 0) return null
  return [s[Math.floor(0.025 * (s.length - 1))], s[Math.ceil(0.975 * (s.length - 1))]]
}

export function boot(units, valuesOf, seed) {
  const vals = units.map((u) => u.map(valuesOf))
  const names = Object.keys(vals.find((u) => u.length)?.[0] ?? {})
  const meanOf = (list) => {
    const out = Object.fromEntries(names.map((k) => [k, 0]))
    let n = 0
    for (const u of list) {
      for (const v of u) {
        for (const k of names) out[k] += v[k]
        n++
      }
    }
    for (const k of names) out[k] = n ? out[k] / n : null
    return { n, ...out }
  }
  const point = meanOf(vals)
  const rnd = mulberry32(seed)
  const draws = []
  for (let d = 0; d < DRAWS; d++) draws.push(meanOf(vals.map(() => vals[Math.floor(rnd() * vals.length)])))
  return Object.fromEntries([
    ['n', point.n],
    ['units', units.length],
    ...names.map((k) => [k, { value: point[k], ci: interval(draws.map((x) => x[k])) }]),
  ])
}

export function byGame(rows) {
  const m = new Map()
  for (const r of rows) {
    const list = m.get(r.gi ?? r.game)
    if (list) list.push(r)
    else m.set(r.gi ?? r.game, [r])
  }
  return [...m.values()]
}
