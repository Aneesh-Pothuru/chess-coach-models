import { appendFileSync } from 'node:fs'
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
  quietMove,
  randomOthers,
  readJsonl,
  seedOf,
  shardOf,
  topOf,
} from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')

const who = argOf('--who', 'his')
if (who !== 'his' && who !== 'strong') throw new Error('--who his|strong')
const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const target = who === 'strong' ? Math.ceil(Number(argOf('--positions', '1200')) / shards) : Infinity
const dir = privateDir(PROJECT)
const mine = readJsonl(join(dir, `${who}-candidates.jsonl`)).filter((p) => p.id % shards === shard)
const outFile = join(dir, `${who}-${shard}-of-${shards}.jsonl`)
const previous = readJsonl(outFile)
const done = new Set(previous.map((r) => r.id))
let kept = previous.filter((r) => r.status === 'scored').length
const append = (row) => appendFileSync(outFile, JSON.stringify(row) + '\n')

const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const started = Date.now()
let n = 0
for (const p of mine) {
  if (kept >= target) break
  if (done.has(p.id)) continue
  n++
  const turn = p.fen.split(' ')[1]
  const base = { id: p.id, gi: p.gi, half: p.half ?? null, ply: p.ply, phase: p.phase, structure: p.structure, first: p.first ?? null }
  const random = randomOthers(p.fen, p.breaks, seedOf(who, p.id, SEED))
  if (!random) {
    append({ ...base, status: 'no other move' })
    continue
  }
  await engine.newGame('analyst')
  const pos = C.position(C.START_FEN, p.history)
  if (C.fenOf(pos) !== p.fen) throw new Error(`replay mismatch at ${who} ${p.id}`)
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
  let natural = null
  let above = null
  let hisPolicy = null
  let plusPolicy = null
  if (who === 'his') {
    const hp = await engine.humanPolicy(C.position(p.fen), { bands: [p.hisBand, p.plusBand], opponentBand: p.oppBand })
    if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
    const policyAt = (band) => hp.bands.find((b) => b.band === band)?.policy ?? null
    hisPolicy = policyAt(p.hisBand)
    plusPolicy = policyAt(p.plusBand)
    if (!hisPolicy || !plusPolicy) throw new Error(`no policy at ${p.id}`)
    natural = topOf(hisPolicy)
    above = topOf(plusPolicy)
  }
  const [R, R2] = random
  const moves = [...new Set([...p.breaks, p.played, R, R2, natural, above].filter(Boolean))]
  const legal = new Set(new Chess(p.fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? '')))
  for (const m of moves) if (!legal.has(m)) throw new Error(`${m} is not legal in ${who} ${p.id}`)
  const scores = {}
  for (const uci of moves) {
    const r = await engine.scoreMove(pos, uci, { budget: BUDGET, priority: 'batch' })
    scores[uci] = {
      exact: Sc.isExactScore(r.score),
      sound: E.acceptsAlternative(r.score, line.score, turn),
      lost: Sc.isExactScore(r.score) ? E.lostWp(r.score, line.score, turn) : null,
      ...(hisPolicy ? { pHis: hisPolicy[uci] ?? 0, pPlus: plusPolicy[uci] ?? 0 } : {}),
    }
  }
  append({
    ...base,
    status: 'scored',
    best: line.move,
    wp,
    breaks: p.breaks,
    played: p.played,
    R,
    R2,
    natural,
    above,
    ...(hisPolicy
      ? {
          breakMass: { his: p.breaks.reduce((s, m) => s + (hisPolicy[m] ?? 0), 0), plus: p.breaks.reduce((s, m) => s + (plusPolicy[m] ?? 0), 0) },
          hisBand: p.hisBand,
          plusBand: p.plusBand,
        }
      : { elo: p.elo, speed: p.speed }),
    scores,
  })
  kept++
  if (n % 50 === 0) console.error(`[${who} ${shard}] ${n} tried, ${kept} scored, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[${who} ${shard}] done: ${n} tried, ${kept} scored in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
