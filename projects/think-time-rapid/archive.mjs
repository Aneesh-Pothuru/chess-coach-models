// His own 10-minute games from the app's archive, read the way facts.mjs reads
// a Lichess game: the same reader over the evals alone (the routine's stored
// classes, turning points and ledgers left out), the same book rule and the
// same CSV row, for his moves only.
//
//   bridge/run.sh projects/think-time-rapid/archive.mjs
//
// Reads the archive at the commit the bridge pins and writes
// private/think-time-rapid/archive-moves.csv.gz, which stays private:
// analyze.py commits only aggregates of it.
import { createWriteStream, renameSync } from 'node:fs'
import { join } from 'node:path'
import { createGzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { routinePorts, setBookExit } from './games.mjs'
import { COLUMNS, csvLine, recordsOf } from './moves.mjs'

const { primaryFacts, gidOf } = await chess('src/services/metrics/index.ts')
const { parseTimeControl } = await chess('src/core/game/index.ts')
const { replayFens } = await chess('src/services/knowledge/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')

const deps = routinePorts()
const rows = loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })

const outPath = join(privateDir('think-time-rapid'), 'archive-moves.csv.gz')
const gz = createGzip({ level: 6 })
const out = createWriteStream(`${outPath}.partial`)
gz.pipe(out)
gz.write(COLUMNS.join(',') + '\n')

const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
let built = 0
let moves = 0
for (const r of rows) {
  // A row without a time control is read as 10|0, as the facts read it.
  const tc = parseTimeControl(typeof r.time_control === 'string' ? r.time_control : null)
  if (tc && (tc.base !== 600 || tc.inc !== 0)) { skip('not 10|0'); continue }
  const row = { sans: r.sans, evals: r.evals, clocks: r.clocks, meIsWhite: r.meIsWhite, time_control: r.time_control, result: r.result }
  const p = primaryFacts(row, deps)
  if (!p || !p.replayed) { skip('does not replay'); continue }
  if (p.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
  if (p.moves.some((m) => m.clock === null)) { skip('a clock missing'); continue }
  setBookExit(p)
  const fens = replayFens(p.moves.slice(0, (p.bookExitPly ?? 0) + 2).map((m) => m.san))
  const white = p.color === 'w'
  const game = {
    id: gidOf(r),
    bin: 'archive',
    tc: '600+0',
    whiteElo: white ? r.myRating : r.oppRating,
    blackElo: white ? r.oppRating : r.myRating,
  }
  for (const rec of recordsOf(game, p, fens)) {
    gz.write(csvLine(rec))
    moves++
  }
  built++
}
gz.end()
await new Promise((r) => out.on('finish', r))
renameSync(`${outPath}.partial`, outPath)
process.stderr.write(JSON.stringify({ rows: rows.length, built, moves, skipped }) + '\n')
