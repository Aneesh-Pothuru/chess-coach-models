import { appendFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import {
  BUDGET,
  PROJECT,
  SEED,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  armsOf,
  complete,
  legalCodes,
  loadIndex,
  matchOf,
  materialKey,
  normalBoard,
  quietMove,
  readJsonl,
  shardFiles,
  seedOf,
  shardOf,
  topOf,
} from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')

const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const limit = Number(argOf('--limit', 'Infinity'))
const dir = privateDir(PROJECT)
const mine = readJsonl(join(dir, 'his-candidates.jsonl'))
  .filter((p) => p.id % shards === shard)
  .slice(0, limit)
const outFile = join(dir, `his-${shard}-of-${shards}.jsonl`)
const done = new Set(readJsonl(outFile).map((r) => r.id))
const append = (row) => appendFileSync(outFile, JSON.stringify(row) + '\n')

const wanted = new Set(mine.map((p) => materialKey(normalBoard(p.fen))))
const { buckets } = await loadIndex(shardFiles(dir, 'index', readdirSync), wanted)
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })

const started = Date.now()
let n = 0
for (const p of mine) {
  if (done.has(p.id)) continue
  const turn = p.myColor
  const board = normalBoard(p.fen)
  const legal = legalCodes(p.fen, Chess)
  const arms = armsOf(buckets, board, legal, seedOf('his', p.id, SEED))
  const base = { id: p.id, gi: p.gi, half: p.half, ply: p.ply, phase: p.phase, key: materialKey(board), bucket: arms.size }
  n++
  if (!complete(arms)) {
    append({ ...base, status: 'not covered', arms: [arms.T.length, arms.R.length, arms.R2.length] })
    continue
  }
  await engine.newGame('analyst')
  const pos = C.position(C.START_FEN, p.history)
  if (C.fenOf(pos) !== p.fen) throw new Error(`replay mismatch at ${p.id}`)
  const best = await engine.bestMoves(pos, { budget: BUDGET, multiPv: 1, priority: 'batch' })
  const line = best.lines[0]
  if (!line || !Sc.isExactScore(line.score)) {
    append({ ...base, status: 'no exact best' })
    continue
  }
  const wp = Sc.winPercentFor(line.eval, turn)
  if (!quietMove(p.fen, line.move, Chess)) {
    append({ ...base, status: 'forcing best', best: line.move, wp })
    continue
  }
  if (wp < WIN_LOW || wp > WIN_HIGH) {
    append({ ...base, status: 'decided', best: line.move, wp })
    continue
  }
  const hp = await engine.humanPolicy(C.position(p.fen), { bands: [p.hisBand, p.plusBand], opponentBand: p.oppBand })
  if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
  const policyAt = (band) => hp.bands.find((b) => b.band === band)?.policy ?? null
  const hisPolicy = policyAt(p.hisBand)
  const plusPolicy = policyAt(p.plusBand)
  if (!hisPolicy || !plusPolicy) throw new Error(`no policy at ${p.id}`)
  const arm = (list) => list.map((m) => matchOf(arms.bucket, m, turn))
  const T = arm(arms.T)
  const R = arm(arms.R)
  const R2 = arm(arms.R2)
  const real = new Chess(p.fen)
  for (const m of [...T, ...R, ...R2]) {
    const legalHere = real.moves({ verbose: true }).some((x) => x.from + x.to + (x.promotion ?? '') === m.move)
    if (!legalHere) throw new Error(`a match's move is not legal in position ${p.id}: ${m.move}`)
  }
  const natural = topOf(hisPolicy)
  const above = topOf(plusPolicy)
  const moves = [...new Set([...T, ...R, ...R2].map((m) => m.move).concat([natural, above, p.played]))]
  const scores = {}
  for (const uci of moves) {
    const r = await engine.scoreMove(pos, uci, { budget: BUDGET, priority: 'batch' })
    scores[uci] = {
      exact: Sc.isExactScore(r.score),
      sound: E.acceptsAlternative(r.score, line.score, turn),
      lost: Sc.isExactScore(r.score) ? E.lostWp(r.score, line.score, turn) : null,
      pHis: hisPolicy[uci] ?? 0,
      pPlus: plusPolicy[uci] ?? 0,
    }
  }
  append({
    ...base,
    status: 'scored',
    structure: K.structureOf(p.fen)?.id ?? null,
    best: line.move,
    wp,
    hisBand: p.hisBand,
    plusBand: p.plusBand,
    T,
    R,
    R2,
    natural,
    above,
    played: p.played,
    scores,
  })
  if (n % 50 === 0) console.error(`[shard ${shard}] ${n} of ${mine.length - done.size}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${n} positions in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
