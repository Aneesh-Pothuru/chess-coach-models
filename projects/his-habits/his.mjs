import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  ABOVE,
  CLOCK_FLOOR,
  COST_BUDGET,
  OFFSET,
  PROJECT,
  WIN_HIGH,
  WIN_LOW,
  argOf,
  candidateOf,
  clockBefore,
  expectedOf,
  gitCommit,
  kindsReader,
  mulberry32,
  readJsonl,
  seedOf,
  shardOf,
  tenMinutes,
  topOf,
} from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { parseTimeControl } = await chess('src/core/game/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')

const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const limit = Number(argOf('--limit', 'Infinity'))
const dir = privateDir(PROJECT)

const skipped = {}
const skip = (why) => {
  skipped[why] = (skipped[why] ?? 0) + 1
}

const all = loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })
const games = all
  .filter((g) => {
    if (tenMinutes(g, parseTimeControl)) return true
    skip('game: not 10 minutes')
    return false
  })
  .sort((a, b) => a.endTime - b.endTime)
const firstHalf = Math.ceil(games.length / 2)

const positions = []
for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi]
  if (typeof g.myRating !== 'number' || typeof g.oppRating !== 'number') {
    skip('game: no ratings')
    continue
  }
  const myColor = g.meIsWhite ? 'w' : 'b'
  const replayed = C.replaySans(C.START_FEN, g.sans ?? [])
  if (replayed.ucis.length !== (g.sans?.length ?? 0)) skip('game: does not replay to the end')
  for (let ply = 0; ply < replayed.ucis.length; ply++) {
    const fen = replayed.fens[ply]
    if (fen.split(' ')[1] !== myColor) continue
    const why = candidateOf(K, fen)
    if (why) {
      skip(why)
      continue
    }
    const ev = g.evals?.[ply]
    if (typeof ev !== 'number') {
      skip('no evaluation')
      continue
    }
    const wp = Sc.lichessWinPercent(ev)
    if (wp < WIN_LOW || wp > WIN_HIGH) {
      skip('decided')
      continue
    }
    const clock = clockBefore(g.clocks, ply)
    if (clock === null) {
      skip('no clock')
      continue
    }
    if (clock < CLOCK_FLOOR) {
      skip('clock under the floor')
      continue
    }
    positions.push({
      id: positions.length,
      gi,
      half: gi < firstHalf ? 0 : 1,
      ply,
      fen,
      history: replayed.ucis.slice(0, ply),
      played: replayed.ucis[ply],
      myColor,
      wpBefore: wp,
      clock,
      hisBand: E.defaultMaiaElo(g.myRating, OFFSET),
      plusBand: E.defaultMaiaElo(g.myRating + ABOVE, OFFSET),
      oppBand: E.defaultMaiaElo(g.oppRating, OFFSET),
    })
  }
}

if (shard === 0) {
  const count = (h) => positions.filter((p) => p.half === h).length
  const summary = {
    app: { commit: gitCommit(CHESS_DIR), archive: ARCHIVE_SUBDIR },
    games: games.length,
    halves: [firstHalf, games.length - firstHalf],
    dates: [games[0], games[firstHalf - 1], games[firstHalf], games.at(-1)].map((g) => new Date(g.endTime * 1000).toISOString().slice(0, 10)),
    positions: positions.length,
    byHalf: [count(0), count(1)],
    skipped,
  }
  writeFileSync(join(resultsDir(PROJECT), 'positions.json'), JSON.stringify(summary, null, 2) + '\n')
  console.error(JSON.stringify(summary))
}

const mine = positions.filter((p) => p.id % shards === shard).slice(0, limit)
const outFile = join(dir, `his-${shard}-of-${shards}.jsonl`)
const done = new Set(readJsonl(outFile).map((r) => r.id))
const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
const kindsOf = kindsReader(K)

async function wpAfter(p, uci) {
  await engine.newGame('analyst')
  const pos = C.child(C.position(C.START_FEN, p.history), uci)
  const r = await engine.evaluate(pos, COST_BUDGET, { cache: 'bypass', priority: 'batch' })
  return { wp: Sc.winPercentFor(r.eval, p.myColor), nodes: r.nodes ?? null }
}

const started = Date.now()
let n = 0
for (const p of mine) {
  if (done.has(p.id)) continue
  const start = C.position(C.START_FEN, p.history)
  if (C.fenOf(start) !== p.fen) throw new Error(`replay mismatch at ${p.id}`)
  const moves = kindsOf(p.fen)
  const hp = await engine.humanPolicy(C.position(p.fen), { bands: [p.hisBand, p.plusBand], opponentBand: p.oppBand })
  if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
  const policyAt = (band) => hp.bands.find((b) => b.band === band)?.policy ?? null
  const his = policyAt(p.hisBand)
  const plus = policyAt(p.plusBand)
  if (!his || !plus) throw new Error(`no policy at ${p.id}`)
  const maskOf = (uci) => moves.find(([u]) => u === uci)?.[1] ?? null
  const T = topOf(plus)
  const [S] = E.sampleFromPolicy(Object.entries(plus), mulberry32(seedOf('null', p.gi, p.ply)))
  const maskP = maskOf(p.played)
  if (maskP === null || maskOf(T) === null || maskOf(S) === null) throw new Error(`a move outside the legal list at ${p.id}`)
  const evP = await wpAfter(p, p.played)
  const evT = T === p.played ? evP : await wpAfter(p, T)
  appendFileSync(
    outFile,
    JSON.stringify({
      id: p.id,
      gi: p.gi,
      half: p.half,
      ply: p.ply,
      phase: K.phaseOf(p.fen),
      myColor: p.myColor,
      wpBefore: p.wpBefore,
      hisBand: p.hisBand,
      plusBand: p.plusBand,
      oppBand: p.oppBand,
      P: p.played,
      T,
      S,
      topHis: topOf(his),
      maskP,
      maskT: maskOf(T),
      maskS: maskOf(S),
      eHis: expectedOf(moves, his),
      ePlus: expectedOf(moves, plus),
      pHisP: his[p.played] ?? 0,
      pPlusP: plus[p.played] ?? 0,
      wpP: evP.wp,
      wpT: evT.wp,
      nodes: [evP.nodes, evT.nodes],
      moves: moves.map(([u, m]) => [u, m, his[u] ?? 0, plus[u] ?? 0]),
    }) + '\n',
  )
  n++
  if (n % 200 === 0) console.error(`[shard ${shard}] ${n} of ${mine.length - done.size}, ${Math.round((Date.now() - started) / 1000)}s`)
}
console.error(`[shard ${shard}] done: ${n} positions in ${Math.round((Date.now() - started) / 1000)}s`)
await engine.dispose?.()
process.exit(0)
