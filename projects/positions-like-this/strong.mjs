import { appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import {
  BUDGET,
  MONTH,
  PROJECT,
  SEED,
  STRONG_QUERIES,
  STRONG_TRIES,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  armsOf,
  complete,
  distance,
  featuresOf,
  groupSizes,
  legalCodes,
  linesOf,
  linesOfAll,
  loadIndex,
  matchOf,
  materialKey,
  moveCode,
  mulberry32,
  normalBoard,
  quietMove,
  readJsonl,
  shardFiles,
  realUci,
  seedOf,
  shardOf,
} from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')

const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const target = Math.ceil(Number(argOf('--queries', String(STRONG_QUERIES))) / shards)
const dir = privateDir(PROJECT)
const outFile = join(dir, `strong-${shard}-of-${shards}.jsonl`)
const previous = readJsonl(outFile)
const tried = new Set(previous.map((r) => r.game))
let kept = previous.filter((r) => r.status === 'scored').length
const append = (row) => appendFileSync(outFile, JSON.stringify(row) + '\n')

const rowsByGame = new Map()
for await (const line of linesOfAll(shardFiles(dir, 'heldout', readdirSync))) {
  const row = JSON.parse(line)
  const list = rowsByGame.get(row[0])
  if (list) list.push(row)
  else rowsByGame.set(row[0], [row])
}
const order = [...rowsByGame.keys()].sort((a, b) => seedOf('game', a, SEED) - seedOf('game', b, SEED))
const mine = order.filter((_, k) => k % shards === shard)
const wantedGames = new Set(mine)
const sans = new Map()
let gi = -1
for await (const line of linesOf(join(dir, `strong-${MONTH}.jsonl.gz`))) {
  gi++
  if (wantedGames.has(gi)) sans.set(gi, JSON.parse(line).sans)
}

const wanted = new Set(mine.flatMap((g) => rowsByGame.get(g).map((r) => materialKey(r[2]))))
const { buckets } = await loadIndex(shardFiles(dir, 'index', readdirSync), wanted)
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })

const started = Date.now()
for (const game of mine) {
  if (kept >= target) break
  if (tried.has(game)) continue
  const replayed = C.replaySans(C.START_FEN, sans.get(game))
  const rnd = mulberry32(seedOf('rows', game, SEED))
  const rows = [...rowsByGame.get(game)]
  for (let t = rows.length - 1; t > 0; t--) {
    const j = Math.floor(rnd() * (t + 1))
    ;[rows[t], rows[j]] = [rows[j], rows[t]]
  }
  const attempts = []
  let scored = null
  for (const [, ply, board, nuci, piece, phase] of rows.slice(0, STRONG_TRIES)) {
    const fen = replayed.fens[ply]
    const turn = fen.split(' ')[1]
    if (normalBoard(fen) !== board) throw new Error(`board mismatch in game ${game} at ${ply}`)
    const legal = legalCodes(fen, Chess)
    const own = moveCode(nuci)
    if (!legal.has(own) || board[own & 63] !== piece) throw new Error(`the twin's move does not transfer in game ${game} at ${ply}`)
    const twin = featuresOf(board)
    if (distance(twin, groupSizes(materialKey(board)), twin) !== 0) throw new Error(`the twin is not at distance 0 in game ${game} at ${ply}`)
    const arms = armsOf(buckets, board, legal, seedOf('strong', game, ply, SEED), { second: false })
    if (!complete(arms, { second: false })) {
      attempts.push({ ply, status: 'not covered', arms: [arms.T.length, arms.R.length] })
      continue
    }
    await engine.newGame('analyst')
    const pos = C.position(C.START_FEN, replayed.ucis.slice(0, ply))
    const best = await engine.bestMoves(pos, { budget: BUDGET, multiPv: 1, priority: 'batch' })
    const line = best.lines[0]
    if (!line || !Sc.isExactScore(line.score)) {
      attempts.push({ ply, status: 'no exact best' })
      continue
    }
    const wp = Sc.winPercentFor(line.eval, turn)
    if (!quietMove(fen, line.move, Chess)) {
      attempts.push({ ply, status: 'forcing best', wp })
      continue
    }
    if (wp < WIN_LOW || wp > WIN_HIGH) {
      attempts.push({ ply, status: 'decided', wp })
      continue
    }
    const T = arms.T.map((m) => matchOf(arms.bucket, m, turn))
    const R = arms.R.map((m) => matchOf(arms.bucket, m, turn))
    const twinMove = realUci(nuci, turn)
    if (twinMove !== replayed.ucis[ply]) throw new Error(`the twin's move is not the move played in game ${game} at ${ply}`)
    const moves = [...new Set([...T, ...R].map((m) => m.move).concat([twinMove]))]
    const scores = {}
    for (const uci of moves) {
      const r = await engine.scoreMove(pos, uci, { budget: BUDGET, priority: 'batch' })
      scores[uci] = {
        exact: Sc.isExactScore(r.score),
        sound: E.acceptsAlternative(r.score, line.score, turn),
        lost: Sc.isExactScore(r.score) ? E.lostWp(r.score, line.score, turn) : null,
      }
    }
    scored = { ply, phase: phase === 'e' ? 'endgame' : 'middlegame', best: line.move, wp, key: materialKey(board), bucket: arms.size, T, R, twin: twinMove, scores }
    break
  }
  if (scored) {
    kept++
    append({ game, status: 'scored', attempts, ...scored })
  } else append({ game, status: 'none kept', attempts })
  if (kept % 25 === 0 && scored) console.error(`[shard ${shard}] ${kept} of ${target}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${kept} queries in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
