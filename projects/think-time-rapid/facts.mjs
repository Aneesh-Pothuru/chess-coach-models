// The app's move facts for every Lichess game stream.py kept. Each game is
// read as the routine's archive row (the moves, their evals in the player's
// view, whole-second clocks) and built by the metrics service's primaryFacts
// and deriveGameFacts with the routine's own Node ports, so every move of
// both players gets the app's facts and the method service's triggerOf from
// its own side. One CSV row per move with a think time.
//
//   bridge/run.sh projects/think-time-rapid/facts.mjs --month 2026-09 [--limit N] [--shard i/n] [--check N]
//
// The game reader (the row, the ports, the book exit, Black's flipped build)
// is games.mjs's and the CSV row moves.mjs's; archive.mjs shares both.
// primaryFacts is built once per game, with White as the player, and Black's
// build is White's flipped (games.mjs says why). `--check N` builds Black's
// row for real on the first N games and stops on any move whose facts or
// trigger differ.
import { createReadStream, createWriteStream, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { asBlack, parseMovetext, routinePorts, rowOf, setBookExit, unreadable } from './games.mjs'
import { COLUMNS, csvLine, recordsOf } from './moves.mjs'

const { primaryFacts } = await chess('src/services/metrics/index.ts')
const { DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP } = await chess('src/services/method/index.ts')
const { RUSHED_SECONDS, CLOCK_BUCKETS } = await chess('src/core/game/index.ts')
const { replayFens } = await chess('src/services/knowledge/index.ts')
const { DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!month) throw new Error('usage: facts.mjs --month YYYY-MM [--limit N] [--shard i/n] [--check N]')
const limit = Number(arg('limit', '0'))
const check = Number(arg('check', '0'))
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)

const deps = routinePorts()

const dir = privateDir('think-time-rapid')
// The app's own numbers the analysis reads (analyze.py never types them).
writeFileSync(join(privateDir('think-time-rapid'), 'app-constants.json'), JSON.stringify({
  appCommit: CHESS_DIR.split('/').pop(),
  RUSHED_SECONDS, DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP,
  CLOCK_BUCKETS: CLOCK_BUCKETS.map((b) => ({ label: b.label, maxSeconds: Number.isFinite(b.maxSeconds) ? b.maxSeconds : null })),
  DEFAULT_LICHESS_OFFSET,
}, null, 2) + '\n')
const suffix = shards > 1 ? `-${shard}of${shards}` : ''
const outPath = join(dir, `moves-${month}${suffix}.csv.gz`)
const gz = createGzip({ level: 6 })
const out = createWriteStream(`${outPath}.partial`)
gz.pipe(out)
gz.write(COLUMNS.join(',') + '\n')

const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
let read = 0
let built = 0
let rows = 0
let checked = 0
const started = Date.now()

const lines = createInterface({ input: createReadStream(join(dir, `games-${month}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity })
for await (const line of lines) {
  if (!line) continue
  const index = read++
  if (index % shards !== shard) continue
  if (limit && built >= limit) break
  const game = JSON.parse(line)
  const moves = parseMovetext(game.movetext)
  const why = unreadable(moves)
  if (why) { skip(why); continue }

  const white = primaryFacts(rowOf(game, moves, true), deps)
  if (!white || !white.replayed) { skip('does not replay'); continue }
  if (white.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
  setBookExit(white)
  const black = asBlack(white)
  // The positions up to both book-end moves (each side's first move at or after the exit).
  const fens = replayFens(moves.slice(0, (white.bookExitPly ?? 0) + 2).map((m) => m.san))
  built++

  if (checked < check) {
    const real = primaryFacts(rowOf(game, moves, false), deps)
    real.hasBook = true
    real.bookExitPly = white.bookExitPly
    const want = JSON.stringify(recordsOf(game, real, fens))
    if (JSON.stringify(recordsOf(game, black, fens)) !== want) throw new Error(`Black's flipped build differs from its own build in game ${game.id}`)
    checked++
  }

  for (const p of [white, black]) {
    for (const rec of recordsOf(game, p, fens)) {
      if (!gz.write(csvLine(rec))) await new Promise((r) => gz.once('drain', r))
      rows++
    }
  }
  if (built % 2000 === 0) {
    const s = (Date.now() - started) / 1000
    process.stderr.write(`built ${built} games (${(built / s).toFixed(1)}/s), ${rows} moves, skipped ${JSON.stringify(skipped)}\n`)
  }
}
gz.end()
await new Promise((r) => out.on('finish', r))
renameSync(`${outPath}.partial`, outPath)
const seconds = Math.round((Date.now() - started) / 1000)
const summary = { month, shard, shards, gamesRead: read, gamesBuilt: built, blackBuildsChecked: checked, moves: rows, skipped, seconds }
writeFileSync(join(dir, `moves-${month}${suffix}.json`), JSON.stringify(summary, null, 2) + '\n')
process.stderr.write(JSON.stringify(summary) + '\n')
