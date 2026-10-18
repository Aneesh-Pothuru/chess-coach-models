import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { BUDGET, PLIES, PROJECT, ROLLOUTS, mulberry32, readJsonl, seedOf } from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const [shard, shards] = arg('--shard', '0/1').split('/').map(Number)
const limit = Number(arg('--limit', 'Infinity'))

const dir = privateDir(PROJECT)
const positions = readJsonl(join(dir, 'positions.jsonl')).filter((p) => p.id % shards === shard).slice(0, limit)
const outFile = join(dir, `rollouts-${shard}-of-${shards}.jsonl`)
const done = new Set(readJsonl(outFile).map((r) => `${r.id}|${r.which}|${r.k}`))

const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const policyCache = new Map()
const DRAWN = { claimableEndsGame: true }

async function policyFor(fen, self, oppo) {
  const key = `${C.positionKey(fen)}|${self}|${oppo}`
  const hit = policyCache.get(key)
  if (hit) return hit
  const hp = await engine.humanPolicy(C.position(fen), { bands: [self], opponentBand: oppo })
  if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
  const entries = Object.entries(hp.bands[0]?.policy ?? {})
  if (policyCache.size > 40000) policyCache.clear()
  policyCache.set(key, entries)
  return entries
}

function endScore(status, myColor) {
  if (status.draw) return 50
  if (status.winner === myColor) return 100
  if (status.winner) return 0
  return null
}

async function rollout(p, which, uci, k) {
  const rng = mulberry32(seedOf(p.id, which, uci, k))
  let pos = C.child(C.position(C.START_FEN, p.history), uci)
  const game = C.replay(pos)
  let status = C.terminalStatus(game, {}, DRAWN)
  let plies = 0
  while (!status && plies < PLIES) {
    const fen = C.fenOf(pos)
    const mover = C.sideToMove(fen)
    const self = mover === p.myColor ? p.hisBand : p.oppBand
    const oppo = mover === p.myColor ? p.oppBand : p.hisBand
    const entries = await policyFor(fen, self, oppo)
    if (entries.length === 0) break
    const [move] = E.sampleFromPolicy(entries, rng)
    C.playUci(game, move)
    pos = C.child(pos, move)
    plies++
    status = C.terminalStatus(game, {}, DRAWN)
  }
  if (status) {
    return { plies, end: status.kind, wp: endScore(status, p.myColor), fen: C.fenOf(pos) }
  }
  const r = await engine.evaluate(pos, BUDGET, { cache: 'bypass', priority: 'batch' })
  return { plies, end: null, wp: Sc.winPercentFor(r.eval, p.myColor), fen: C.fenOf(pos), nodes: r.nodes ?? null }
}

const started = Date.now()
let n = 0
for (const p of positions) {
  const moves = [['B', p.B.uci], ['F', p.F.uci]]
  if (p.kind === 'turning' && p.P.uci !== p.B.uci && p.P.uci !== p.F.uci) moves.push(['P', p.P.uci])
  for (const [which, uci] of moves) {
    for (let k = 0; k < ROLLOUTS; k++) {
      if (done.has(`${p.id}|${which}|${k}`)) continue
      const r = await rollout(p, which, uci, k)
      appendFileSync(outFile, JSON.stringify({ id: p.id, game: p.game, which, uci, k, ...r }) + '\n')
      n++
    }
  }
  if (p.id % 20 === shard) console.error(`[shard ${shard}] position ${p.id}, ${n} rollouts, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${n} rollouts in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
