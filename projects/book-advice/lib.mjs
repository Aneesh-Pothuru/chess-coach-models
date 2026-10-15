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

export const MONTH = '2026-09'
/** His band and the band above, by the player's Lichess rating (inclusive). */
export const HIS = [1250, 1449]
export const ABOVE = [1450, 1649]
export const BANDS = { his: HIS, above: ABOVE }
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
