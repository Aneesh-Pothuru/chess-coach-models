// What the tests share: the bands, the Lichess player-games band-above's
// primary.mjs built, and his own 10-minute games read the same way.
import { createReadStream, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { asBlack, routinePorts, setBookExit } from '../think-time-rapid/games.mjs'

const M = await chess('src/services/metrics/index.ts')
const R = await chess('src/services/review/index.ts')
const S = await chess('src/core/stats/index.ts')

export const MONTH = process.env.BOOK_ADVICE_MONTH ?? '2026-09'
/** His band and the band above, by the player's Lichess rating (inclusive). */
export const HIS = [1250, 1449]
export const ABOVE = [1450, 1649]
export const BANDS = { his: HIS, above: ABOVE }
/** 1a: the punish goal's gifts (win% given), and the win% from which a move counts as winning. */
export const GIFT_FLOOR = 20
export const HIGH_WP = 75
/** 1b's swing: the player 30 win% or more lower within six plies, by the game's own evals. */
export const SWING_PLIES = 6
export const SWING_WP = 30
export const inBand = (rating, [lo, hi]) => rating !== null && rating >= lo && rating <= hi
export const bandOf = (rating) => Object.keys(BANDS).find((k) => inBand(rating, BANDS[k])) ?? null

/** A share with its 95% Wilson interval, rounded for a results file. */
export function share(k, n) {
  const ci = S.wilson({ k, n })
  const r = (x) => Math.round(x * 1e4) / 1e4
  return { k, n, p: n > 0 ? r(k / n) : null, ci: ci ? ci.map(r) : null }
}

/** Every build band-above's primary.mjs wrote for the month, as JSON records. */
export async function* records(month = MONTH) {
  const dir = privateDir('band-above')
  const files = readdirSync(dir).filter((f) => f.startsWith(`primary-${month}`) && f.endsWith('.jsonl.gz')).sort()
  if (!files.length) throw new Error(`no builds for ${month}: run band-above/primary.mjs first`)
  for (const f of files) {
    const lines = createInterface({ input: createReadStream(join(dir, f)).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) if (line) yield JSON.parse(line)
  }
}

/** Both player-games of a build: the derived facts, the reader's tags and the ratings. */
export function* playerGames(rec) {
  const { game, primary, motifs } = rec
  for (const p of [primary, asBlack(primary)]) {
    const white = p.color === 'w'
    yield {
      id: game.id,
      rating: white ? game.whiteElo : game.blackElo,
      oppRating: white ? game.blackElo : game.whiteElo,
      g: M.deriveGameFacts(p),
      tags: motifs,
    }
  }
}

/** His 10-minute games in the archive, read the way a Lichess game is read (the row's evals alone). */
export async function archiveGames() {
  const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')
  const { parseTimeControl } = await chess('src/core/game/index.ts')
  const deps = routinePorts()
  const out = []
  const skipped = {}
  const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
  for (const r of loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })) {
    const tc = parseTimeControl(typeof r.time_control === 'string' ? r.time_control : null)
    if (tc && (tc.base !== 600 || tc.inc !== 0)) { skip('not 10|0'); continue }
    const row = { sans: r.sans, evals: r.evals, clocks: r.clocks, meIsWhite: r.meIsWhite, time_control: r.time_control, result: r.result }
    const p = M.primaryFacts(row, deps)
    if (!p || !p.replayed) { skip('does not replay'); continue }
    if (p.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
    setBookExit(p)
    const tags = R.reviewFromArchiveRow(row, { username: 'me' })?.records.map((x) => x.motifs) ?? null
    if (!tags || tags.length !== p.moves.length) { skip('no reader tags'); continue }
    out.push({ id: M.gidOf(r), rating: r.myRating ?? null, oppRating: r.oppRating ?? null, endTime: r.endTime ?? null, g: M.deriveGameFacts(p), tags })
  }
  return { games: out, skipped }
}

/** A seeded generator (mulberry32), so a draw is the same on every run. */
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

/** A generator seeded by a key (FNV-1a), so each player-game draws the same positions on every run. */
export function seeded(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return mulberry32(h)
}

/** A seeded shuffle's first n. */
export function sample(list, n, seed) {
  const rnd = mulberry32(seed)
  const xs = [...list]
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return n >= xs.length ? xs : xs.slice(0, n)
}

/**
 * The player's win% and eval before each ply, and after the last: the move facts give them from the
 * mover's side. A game that ended in mate ends at 0 or 100 and at the mate's eval.
 */
export function playerSeries(g) {
  const n = g.moves.length
  const wp = new Array(n + 1).fill(null)
  const cp = new Array(n + 1).fill(null)
  for (const m of g.moves) {
    const mine = m.mover === 'me'
    if (m.wpBefore !== null) wp[m.ply] = mine ? m.wpBefore : 100 - m.wpBefore
    if (m.evalBefore !== null) cp[m.ply] = mine ? m.evalBefore : -m.evalBefore
  }
  const last = g.moves[n - 1]
  if (last) {
    const mine = last.mover === 'me'
    if (last.wpAfter !== null) wp[n] = mine ? last.wpAfter : 100 - last.wpAfter
    if (last.evalAfter !== null) cp[n] = mine ? last.evalAfter : -last.evalAfter
    if (g.terminationHow === 'checkmate') {
      wp[n] = g.score === 1 ? 100 : 0
      cp[n] = g.score === 1 ? 10000 : -10000
    }
  }
  return { wp, cp }
}
