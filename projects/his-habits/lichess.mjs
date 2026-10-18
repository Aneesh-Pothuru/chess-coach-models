import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CLOCK_FLOOR,
  FILTER_BUDGET,
  LICHESS_BANDS,
  LICHESS_FLOOR,
  LICHESS_MONTH,
  PER_BAND,
  PER_PLAYER,
  PROJECT,
  TRIES,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  candidateOf,
  clockBefore,
  expectedOf,
  kindsReader,
  mulberry32,
  readJsonl,
  seedOf,
  shardOf,
  shuffled,
} from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')

const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const limit = Number(argOf('--limit', 'Infinity'))
const dir = privateDir(PROJECT)

const games = readJsonl(join(dir, `lichess-${LICHESS_MONTH}.jsonl.gz`))
const bandOf = (rating) => {
  if (!Number.isFinite(rating) || rating < LICHESS_FLOOR) return null
  const band = E.normalizeMaiaElo(rating)
  return LICHESS_BANDS.includes(band) ? band : null
}

const counts = Object.fromEntries(LICHESS_BANDS.map((b) => [b, 0]))
const entries = []
for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi]
  for (const color of ['w', 'b']) {
    const rating = color === 'w' ? g.whiteElo : g.blackElo
    const opp = color === 'w' ? g.blackElo : g.whiteElo
    const band = bandOf(rating)
    if (band === null || counts[band] >= PER_BAND) continue
    counts[band]++
    entries.push({ k: entries.length, gi, color, band, oppBand: E.normalizeMaiaElo(opp) })
  }
}
if (shard === 0) {
  const summary = { month: LICHESS_MONTH, games: games.length, playerGames: entries.length, byBand: counts }
  writeFileSync(join(resultsDir(PROJECT), 'lichess.json'), JSON.stringify(summary, null, 2) + '\n')
  console.error(JSON.stringify(summary))
}

const mine = entries.filter((e) => e.k % shards === shard).slice(0, limit)
const outFile = join(dir, `lichess-${shard}-of-${shards}.jsonl`)
const done = new Set(readJsonl(outFile).map((r) => r.k))
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const kindsOf = kindsReader(K)

const started = Date.now()
let n = 0
for (const e of mine) {
  if (done.has(e.k)) continue
  const g = games[e.gi]
  const replayed = C.replaySans(C.START_FEN, g.sans)
  const candidates = []
  const skipped = {}
  for (let ply = 0; ply < replayed.ucis.length; ply++) {
    const fen = replayed.fens[ply]
    if (fen.split(' ')[1] !== e.color) continue
    const why = candidateOf(K, fen) ?? ((clockBefore(g.clocks, ply) ?? -1) < CLOCK_FLOOR ? 'clock under the floor' : null)
    if (why) {
      skipped[why] = (skipped[why] ?? 0) + 1
      continue
    }
    candidates.push(ply)
  }
  const order = shuffled(candidates, mulberry32(seedOf(g.id, e.color)))
  const positions = []
  let tried = 0
  for (const ply of order) {
    if (positions.length >= PER_PLAYER || tried >= TRIES) break
    tried++
    await engine.newGame('analyst')
    const pos = C.position(C.START_FEN, replayed.ucis.slice(0, ply))
    const r = await engine.evaluate(pos, FILTER_BUDGET, { cache: 'bypass', priority: 'batch' })
    const wp = Sc.winPercentFor(r.eval, e.color)
    if (wp < WIN_LOW || wp > WIN_HIGH) continue
    const fen = replayed.fens[ply]
    const moves = kindsOf(fen)
    const hp = await engine.humanPolicy(C.position(fen), { bands: [e.band], opponentBand: e.oppBand })
    if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
    const policy = hp.bands[0]?.policy
    if (!policy) throw new Error(`no policy at ${e.k}`)
    const real = replayed.ucis[ply]
    const maskReal = moves.find(([u]) => u === real)?.[1]
    if (maskReal === undefined) throw new Error(`the played move is outside the legal list at ${e.k}`)
    positions.push({ ply, phase: K.phaseOf(fen), wp, real, maskReal, pReal: policy[real] ?? 0, e: expectedOf(moves, policy) })
  }
  appendFileSync(outFile, JSON.stringify({ k: e.k, gi: e.gi, color: e.color, band: e.band, oppBand: e.oppBand, candidates: candidates.length, tried, skipped, positions }) + '\n')
  n++
  if (n % 200 === 0) console.error(`[shard ${shard}] ${n} of ${mine.length - done.size}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${n} player-games in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
