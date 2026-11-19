// Game Review's facts at each of the player's key moments in the Lichess games
// stream.py kept, read with the app's own code. Each game is reviewed as the
// phone's Game Review reviews it (the review service at the phone profile), with
// White as the player in even games and Black in odd ones. At every moment where
// the screen writes a lesson for a move of the player's, the script records what
// the lesson was written from (the board, the engine's verdict and lines, the
// board code's reading of the mistake and of the better move, the human-move
// model's odds that the reply is found, the lesson chapter the screen links) and
// the text the player reads today (MoveLesson). One JSON object a moment under
// private/review-writer/. Resumes where it stopped.
//
//   bridge/run.sh projects/review-writer/facts.mjs --month 2026-10 [--limit N] [--shard i/n]
import { appendFileSync, createReadStream, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { parseMovetext, rowOf, unreadable } from '../think-time-rapid/games.mjs'
import { PROFILE, PROJECT, splitOf } from './lib.mjs'

const { createNodeReview } = await chess('src/adapters/node/review/index.ts')
const { rowToGame } = await chess('src/services/archive/index.ts')
const { lessonFor, lessonReading, punishOddsAt, punishingReply } = await chess('src/services/review/index.ts')
const { uciToSan } = await chess('src/core/chess/index.ts')
const { readChapters } = await chess('src/adapters/content/study.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')
const { ERROR_CLASS } = await chess('src/features/gamereview/format.ts')
const { lessonLinkAt } = await chess('src/features/gamereview/lessonLink.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!month) throw new Error('usage: facts.mjs --month YYYY-MM [--limit N] [--shard i/n]')
const limit = Number(arg('limit', '0'))
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)

const dir = privateDir(PROJECT)
const suffix = shards > 1 ? `-${shard}of${shards}` : ''
const outPath = join(dir, `facts-${month}${suffix}.jsonl`)
const donePath = join(dir, `facts-${month}${suffix}.done`)
const done = new Set(existsSync(donePath) ? readFileSync(donePath, 'utf8').split('\n').filter(Boolean) : [])

const study = buildStudyFromDisk(CHESS_DIR)
const chapters = readChapters(study.lessons)
const node = createNodeReview({ root: CHESS_DIR, evalCache: false, reviews: false })

const pick = (o, keys) => (o ? Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) : null)
const purpose = (p) => pick(p, ['kind', 'ideas', 'text', 'squares'])

function momentOf(doc, game, i) {
  const r = doc.records[i]
  if (r.mover !== doc.playerColor || !ERROR_CLASS.has(r.cls)) return null
  const lesson = lessonFor(doc, i)
  if (!lesson) return null
  const fen = doc.fens[i]
  const reading = lessonReading(doc, i)
  const link = lessonLinkAt(doc, i, chapters)
  const reply = punishingReply(doc, i)
  const odds = punishOddsAt(doc, i, reply)
  return {
    game: game.id,
    split: splitOf(game.id),
    month,
    index: i,
    ply: r.ply,
    moveNumber: r.moveNumber,
    mover: r.mover,
    rating: r.mover === 'w' ? game.whiteElo : game.blackElo,
    opponentRating: r.mover === 'w' ? game.blackElo : game.whiteElo,
    fen,
    played: { uci: r.uci, san: r.san },
    best: { uci: r.bestUci, san: uciToSan(fen, r.bestUci), pv: r.bestPv },
    cls: r.cls,
    lossPct: r.lossPct,
    before: r.before,
    after: r.after,
    phase: r.phase,
    evidence: r.evidence,
    motifs: r.motifs,
    reading: reading && {
      mistake: pick(reading.mistake, ['kind', 'idea', 'ideas', 'piece', 'square', 'points', 'line', 'moved', 'phase']),
      fix: reading.fix.map(purpose),
      reply: reading.reply.map(purpose),
    },
    link: pick(link, ['title', 'idea', 'why', 'via']),
    punish: odds ? { reply: { uci: reply, san: uciToSan(doc.fens[i + 1] ?? fen, reply) }, band: odds.band, p: odds.p } : null,
    lesson,
  }
}

const lines = createInterface({ input: createReadStream(join(dir, `games-${month}.jsonl.gz`)).pipe(createGunzip()), crlfDelay: Infinity })
let read = 0
let reviewed = 0
let moments = 0
const skipped = {}
const started = Date.now()
try {
  for await (const line of lines) {
    if (!line) continue
    const index = read++
    if (index % shards !== shard) continue
    if (limit && reviewed >= limit) break
    const game = JSON.parse(line)
    if (done.has(game.id)) continue
    const moves = parseMovetext(game.movetext)
    const why = unreadable(moves)
    if (why) { skipped[why] = (skipped[why] ?? 0) + 1; continue }
    const white = index % 2 === 0
    const reviewGame = rowToGame(rowOf(game, moves, white), 'player')
    if (!reviewGame) { skipped['does not replay'] = (skipped['does not replay'] ?? 0) + 1; continue }
    const doc = await node.service.review(reviewGame, { profile: PROFILE, playerColor: white ? 'w' : 'b' }).result
    if (!doc) { skipped['review aborted'] = (skipped['review aborted'] ?? 0) + 1; continue }
    const rows = doc.moments.map((i) => momentOf(doc, game, i)).filter(Boolean)
    if (rows.length) appendFileSync(outPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
    appendFileSync(donePath, `${game.id}\n`)
    reviewed++
    moments += rows.length
    console.error(`shard ${shard}/${shards}: ${reviewed} games, ${moments} moments, ${Math.round((Date.now() - started) / 1000)} s`)
  }
} finally {
  node.dispose()
}
writeFileSync(join(dir, `facts-${month}${suffix}.json`), JSON.stringify({
  app: CHESS_DIR.split('/').pop(), month, profile: PROFILE, shard: `${shard}/${shards}`,
  reviewed, moments, skipped, seconds: Math.round((Date.now() - started) / 1000),
}, null, 2) + '\n')
process.exit(0)
