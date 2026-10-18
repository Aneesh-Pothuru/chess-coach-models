import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { BUDGET, PROJECT, argOf, keyOf, readJsonl, shardOf, studyRows } from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')

const dir = privateDir(PROJECT)
const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))

const rows = studyRows(dir)
const unique = [...new Map(rows.map((p) => [keyOf(p), p])).values()]
if (shard === 0) writeFileSync(join(dir, 'study.json'), JSON.stringify({ rows: rows.length, positions: unique.length }) + '\n')
const mine = unique.filter((_, k) => k % shards === shard)
const outFile = join(dir, `verdicts-${shard}-of-${shards}.jsonl`)
const done = new Set(readJsonl(outFile).map((r) => r.key))

const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const started = Date.now()
let n = 0
for (const p of mine) {
  const key = keyOf(p)
  if (done.has(key)) continue
  await engine.newGame('analyst')
  const pos = C.position(C.START_FEN, p.ucis)
  if (C.fenOf(pos) !== p.fen) throw new Error(`replay mismatch at ${key}`)
  const r = await engine.evaluate(pos, BUDGET, { cache: 'bypass', priority: 'batch' })
  appendFileSync(outFile, JSON.stringify({ key, cp: Sc.cpOf(r.eval), wp: Sc.winPercent(r.eval), mate: r.eval.mate ?? null, nodes: r.nodes ?? null }) + '\n')
  n++
  if (n % 250 === 0) console.error(`[shard ${shard}] ${n} of ${mine.length - done.size}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${n} positions in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
