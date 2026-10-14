// The leak ledger's numbers for every player-game primary.mjs built, priced on
// one yardstick.
//
//   bridge/run.sh projects/band-above/ledger.mjs --month 2026-09
//   bridge/run.sh projects/band-above/ledger.mjs --month 2026-09 --archive
//
// The first pass derives both players' facts from each build and fits the
// band curve's slope with the metrics service's fitWinCurve: on his band's
// player-games (the yardstick) and on each band's own. The second writes one
// row per player-game: the points given away on each of the ledger's causes
// (the method service's causeLoss, on the yardstick), on every move, and on
// the serious errors of each kind the review reader tagged.
//
// `--archive` reads his 10-minute games from the app's archive instead, as
// think-time-rapid's archive.mjs reads them (the row's evals alone), and
// prices them on the yardstick the month's run fitted.
import { createReadStream, createWriteStream, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { asBlack, routinePorts, setBookExit } from '../think-time-rapid/games.mjs'

const { primaryFacts, deriveGameFacts, fitWinCurve, LEAK_CAUSES, LEAK_DISCOUNT, ELO_PER_POINT } = await chess('src/services/metrics/index.ts')
const { causeLoss } = await chess('src/services/method/index.ts')
const { reviewFromArchiveRow } = await chess('src/services/review/index.ts')
const { LICHESS_WIN_K } = await chess('src/core/score/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!month) throw new Error('usage: ledger.mjs --month YYYY-MM [--archive]')
const archive = process.argv.includes('--archive')

/** The bands, by the player's Lichess rating; his is the yardstick's. */
const BANDS = [[850, 1049], [1050, 1249], [1250, 1449], [1450, 1649], [1650, 1849], [1850, 2049]]
const HIS = '1250-1449'
const bandOf = (r) => {
  const b = BANDS.find(([lo, hi]) => r >= lo && r <= hi)
  return b ? `${b[0]}-${b[1]}` : null
}

/** The six phase-by-position causes and the low clock split every move between them. */
const PARTITION = ['opening.tense', 'opening.quiet', 'middlegame.tense', 'middlegame.quiet', 'endgame.tense', 'endgame.quiet', 'clock.low']
const ALL = { id: 'all', label: 'every move', test: () => true }
/** The serious errors of each kind, by the reader's tags on the ply (`tags`). */
const kinds = (tags) => [
  { id: 'serious', test: (m) => m.serious },
  { id: 'hanging', test: (m) => m.serious && tags[m.ply].includes('hangingPiece') },
  { id: 'mate1', test: (m) => m.serious && tags[m.ply].includes('allowedMate') },
  { id: 'mateN', test: (m) => m.serious && tags[m.ply].includes('allowedForcedMate') },
  { id: 'untagged', test: (m) => m.serious && tags[m.ply].length === 0 },
]
const CAUSE_IDS = [...LEAK_CAUSES.map((c) => c.id), 'all', ...kinds([]).map((c) => c.id)]
const COLUMNS = ['game', 'bin', 'color', 'rating', 'oppRating', 'score', 'plies',
  ...CAUSE_IDS.flatMap((id) => [`${id}.mine`, `${id}.theirs`, `${id}.moves`]), 'partitionGap']

const dir = privateDir('band-above')
const r4 = (x) => Math.round(x * 1e4) / 1e4

/** One player-game's row on the slope k. */
function rowOf(meta, g, tags, k) {
  const row = { game: meta.id, bin: meta.bin, color: g.color, rating: meta.rating, oppRating: meta.oppRating, score: g.score, plies: g.moves.length }
  const byId = {}
  for (const c of [...LEAK_CAUSES, ALL, ...kinds(tags)]) {
    const l = causeLoss(g, c, k)
    if (!l) return null
    byId[c.id] = l
    row[`${c.id}.mine`] = r4(l.mine)
    row[`${c.id}.theirs`] = r4(l.theirs)
    row[`${c.id}.moves`] = l.moves
  }
  // The partition's check: what every move gave away, less the seven causes' sum.
  const gap = (side) => byId.all[side] - PARTITION.reduce((s, id) => s + byId[id][side], 0)
  row.partitionGap = r4(Math.max(Math.abs(gap('mine')), Math.abs(gap('theirs'))))
  return row
}
const csvLine = (row) => COLUMNS.map((c) => (row[c] === null || row[c] === undefined ? '' : String(row[c]))).join(',') + '\n'

/** Each player-game of a built game: its facts, the reader's tags and the player's ratings. */
function* playerGames(rec) {
  const { game, primary, motifs } = rec
  for (const p of [primary, asBlack(primary)]) {
    const white = p.color === 'w'
    yield {
      meta: { id: game.id, bin: game.bin, rating: white ? game.whiteElo : game.blackElo, oppRating: white ? game.blackElo : game.whiteElo },
      g: deriveGameFacts(p),
      tags: motifs,
    }
  }
}

async function* records() {
  const files = readdirSync(dir).filter((f) => f.startsWith(`primary-${month}`) && f.endsWith('.jsonl.gz')).sort()
  if (!files.length) throw new Error(`no builds for ${month}: run primary.mjs first`)
  for (const f of files) {
    const lines = createInterface({ input: createReadStream(join(dir, f)).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) if (line) yield JSON.parse(line)
  }
}

/** The positions fitWinCurve reads of a game (each move's eval, and the score): the rest of the facts are not kept. */
const forFit = (g) => ({ score: g.score, moves: g.moves.map((m) => ({ eval: m.eval })) })

async function writeRows(path, rows) {
  const gz = createGzip({ level: 6 })
  const out = createWriteStream(`${path}.partial`)
  gz.pipe(out)
  gz.write(COLUMNS.join(',') + '\n')
  let n = 0
  let broken = 0
  for await (const row of rows) {
    if (!row) { broken++; continue }
    if (!gz.write(csvLine(row))) await new Promise((r) => gz.once('drain', r))
    n++
  }
  gz.end()
  await new Promise((r) => out.on('finish', r))
  renameSync(`${path}.partial`, path)
  return { rows: n, broken }
}

const started = Date.now()
if (!archive) {
  // Pass 1: the slopes.
  const byBand = new Map()
  let games = 0
  for await (const rec of records()) {
    games++
    for (const { meta, g } of playerGames(rec)) {
      const band = bandOf(meta.rating)
      if (!band) continue
      if (!byBand.has(band)) byBand.set(band, [])
      byBand.get(band).push(forFit(g))
    }
  }
  const fits = {}
  for (const [lo, hi] of BANDS) {
    const label = `${lo}-${hi}`
    const f = fitWinCurve(byBand.get(label) ?? [])
    fits[label] = f ? { k: f.k, positions: f.n, playerGames: byBand.get(label).length } : null
  }
  byBand.clear()
  const yard = fits[HIS]
  if (!yard) throw new Error(`no slope for his band ${HIS}`)
  // The app's own numbers the analysis reads beside the slopes (analyze.py never types them).
  const app = { LEAK_DISCOUNT, ELO_PER_POINT, causes: LEAK_CAUSES.map((c) => ({ id: c.id, label: c.label })), partition: PARTITION }
  const slopes = { month, appCommit: CHESS_DIR.split('/').pop(), yardstick: { band: HIS, ...yard }, bands: fits, lichessK: LICHESS_WIN_K, games, app }
  writeFileSync(join(dir, `slopes-${month}.json`), JSON.stringify(slopes, null, 2) + '\n')
  process.stderr.write(`slopes fitted (${Math.round((Date.now() - started) / 1000)} s): yardstick k ${yard.k.toFixed(6)}\n`)

  // Pass 2: the rows.
  const k = yard.k
  const out = await writeRows(join(dir, `player-games-${month}.csv.gz`), (async function* () {
    for await (const rec of records()) for (const { meta, g, tags } of playerGames(rec)) yield rowOf(meta, g, tags, k)
  })())
  const summary = { month, k, ...out, seconds: Math.round((Date.now() - started) / 1000) }
  writeFileSync(join(dir, `player-games-${month}.json`), JSON.stringify(summary, null, 2) + '\n')
  process.stderr.write(JSON.stringify(summary) + '\n')
} else {
  const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')
  const { parseTimeControl } = await chess('src/core/game/index.ts')
  const { gidOf } = await chess('src/services/metrics/index.ts')
  const slopes = JSON.parse(readFileSync(join(dir, `slopes-${month}.json`), 'utf8'))
  const k = slopes.yardstick.k
  const deps = routinePorts()
  const skipped = {}
  const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
  const own = []
  const out = await writeRows(join(dir, 'archive-player-games.csv.gz'), (async function* () {
    for (const r of loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })) {
      // A row without a time control is read as 10|0, as the facts read it.
      const tc = parseTimeControl(typeof r.time_control === 'string' ? r.time_control : null)
      if (tc && (tc.base !== 600 || tc.inc !== 0)) { skip('not 10|0'); continue }
      const row = { sans: r.sans, evals: r.evals, clocks: r.clocks, meIsWhite: r.meIsWhite, time_control: r.time_control, result: r.result }
      const p = primaryFacts(row, deps)
      if (!p || !p.replayed) { skip('does not replay'); continue }
      if (p.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
      setBookExit(p)
      const tags = reviewFromArchiveRow(row, { username: 'me' })?.records.map((x) => x.motifs) ?? null
      if (!tags || tags.length !== p.moves.length) { skip('no reader tags'); continue }
      const g = deriveGameFacts(p)
      own.push(forFit(g))
      yield rowOf({ id: gidOf(r), bin: 'archive', rating: r.myRating ?? null, oppRating: r.oppRating ?? null }, g, tags, k)
    }
  })())
  const f = fitWinCurve(own)
  const summary = { k, ownSlope: f ? { k: f.k, positions: f.n, games: own.length } : null, ...out, skipped, seconds: Math.round((Date.now() - started) / 1000) }
  writeFileSync(join(dir, 'archive-player-games.json'), JSON.stringify(summary, null, 2) + '\n')
  process.stderr.write(JSON.stringify(summary) + '\n')
}
