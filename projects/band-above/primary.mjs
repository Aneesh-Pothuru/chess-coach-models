// Each game think-time-rapid kept, built once with the app's primaryFacts
// (White as the player) by think-time-rapid's game reader, with the review
// reader's motif tags for every move. ledger.mjs derives both players' facts
// from it (Black's build is White's flipped; games.mjs says why).
//
//   bridge/run.sh projects/band-above/primary.mjs --month 2026-09 [--limit N] [--shard i/n] [--check N]
//
// One JSON line a game: { game, primary, motifs }, where game is the kept
// game's id, bin, ratings and result, primary White's PrimaryGame and motifs
// the reader's tags per ply (blunderMotifs on the moves it judges a mistake or
// a blunder, read from the evals alone). `--check N` builds Black's row for
// real on the first N games, and stops on any difference from the flipped
// build in the move facts, the score or the tags.
import { createReadStream, createWriteStream, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { chess, privateDir } from '../../bridge/lib/chess.mjs'
import { asBlack, parseMovetext, routinePorts, rowOf, setBookExit, unreadable } from '../think-time-rapid/games.mjs'

const { primaryFacts, deriveGameFacts } = await chess('src/services/metrics/index.ts')
const { reviewFromArchiveRow } = await chess('src/services/review/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!month) throw new Error('usage: primary.mjs --month YYYY-MM [--limit N] [--shard i/n] [--check N]')
const limit = Number(arg('limit', '0'))
const check = Number(arg('check', '0'))
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)

const deps = routinePorts()
/** The reader's tags per ply: the same reading the classifier port makes, kept for its motifs. */
const motifsOf = (row) => reviewFromArchiveRow(row, { username: 'me' })?.records.map((r) => r.motifs) ?? null

const dir = privateDir('band-above')
const suffix = shards > 1 ? `-${shard}of${shards}` : ''
const outPath = join(dir, `primary-${month}${suffix}.jsonl.gz`)
const gz = createGzip({ level: 6 })
const out = createWriteStream(`${outPath}.partial`)
gz.pipe(out)

const skipped = {}
const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)
let read = 0
let built = 0
let checked = 0
const started = Date.now()

const lines = createInterface({ input: createReadStream(join(privateDir('think-time-rapid'), `games-${month}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity })
for await (const line of lines) {
  if (!line) continue
  const index = read++
  if (index % shards !== shard) continue
  if (limit && built >= limit) break
  const game = JSON.parse(line)
  const moves = parseMovetext(game.movetext)
  const why = unreadable(moves)
  if (why) { skip(why); continue }
  const row = rowOf(game, moves, true)
  const white = primaryFacts(row, deps)
  if (!white || !white.replayed) { skip('does not replay'); continue }
  if (white.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
  setBookExit(white)
  const motifs = motifsOf(row)
  if (!motifs || motifs.length !== white.moves.length) { skip('no reader tags'); continue }

  if (checked < check) {
    const blackRow = rowOf(game, moves, false)
    const real = primaryFacts(blackRow, deps)
    real.hasBook = true
    real.bookExitPly = white.bookExitPly
    // What ledger.mjs reads of a build: every move's facts and the score.
    const view = (g) => JSON.stringify({ moves: g.moves, score: g.score })
    if (view(deriveGameFacts(asBlack(white))) !== view(deriveGameFacts(real))) throw new Error(`Black's flipped build differs from its own build in game ${game.id}`)
    if (JSON.stringify(motifsOf(blackRow)) !== JSON.stringify(motifs)) throw new Error(`the reader's tags differ by the player's colour in game ${game.id}`)
    checked++
  }

  const meta = { id: game.id, bin: game.bin, whiteElo: game.whiteElo, blackElo: game.blackElo, result: game.result, termination: game.termination }
  if (!gz.write(JSON.stringify({ game: meta, primary: white, motifs }) + '\n')) await new Promise((r) => gz.once('drain', r))
  built++
  if (built % 2000 === 0) {
    const s = (Date.now() - started) / 1000
    process.stderr.write(`built ${built} games (${(built / s).toFixed(1)}/s), skipped ${JSON.stringify(skipped)}\n`)
  }
}
gz.end()
await new Promise((r) => out.on('finish', r))
renameSync(`${outPath}.partial`, outPath)
const seconds = Math.round((Date.now() - started) / 1000)
const summary = { month, shard, shards, gamesRead: read, gamesBuilt: built, blackBuildsChecked: checked, skipped, seconds }
writeFileSync(join(dir, `primary-${month}${suffix}.json`), JSON.stringify(summary, null, 2) + '\n')
process.stderr.write(JSON.stringify(summary) + '\n')
