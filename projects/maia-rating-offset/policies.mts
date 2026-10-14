// Maia-2's policy for every counted move at each pair of bands the offsets
// reach: the mover's band at defaultMaiaElo(r, o) and the opponent's at
// defaultMaiaElo(r', o), for o over the app's allowed range. Runs through the
// app's Node engine service (weights cached on first use). Each line keeps the
// probabilities of every legal move and the index of the move played, so the
// fit can read the played move's probability, Maia's first choice, and a
// temperature's effect without running the model again. Resumes where it
// stopped.
//
//   bridge/run.sh projects/maia-rating-offset/policies.mts --shard k/n
import fs from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'

export const OFFSETS = Array.from({ length: 21 }, (_, i) => i * 25)

const arg = process.argv.indexOf('--shard')
const [k, n] = arg > 0 ? process.argv[arg + 1].split('/').map(Number) : [0, 1]
if (!(n >= 1 && k >= 0 && k < n)) throw new Error('usage: policies.mts --shard k/n')

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
const { defaultMaiaElo } = await chess('src/services/engine/index.ts')

const dir = privateDir('maia-rating-offset')
const moves = fs.readFileSync(join(dir, 'positions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const out = join(dir, `policies-${k}-of-${n}.jsonl`)
const done = new Set<number>()
if (fs.existsSync(out)) for (const l of fs.readFileSync(out, 'utf8').split('\n')) if (l) done.add(JSON.parse(l).k)

const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const mine = moves.filter((m) => m.k % n === k && !done.has(m.k))
const started = Date.now()
let written = 0
for (const m of mine) {
  const pairs: Array<{ s: number; o: number }> = []
  for (const off of OFFSETS) {
    const s = defaultMaiaElo(m.r, off)
    const o = defaultMaiaElo(m.ro, off)
    if (!pairs.some((p) => p.s === s && p.o === o)) pairs.push({ s, o })
  }
  const scored = []
  for (const { s, o } of pairs) {
    const hp = await engine.humanPolicy(position(m.fen), { bands: [s], opponentBand: o })
    if (hp === 'unavailable') throw new Error('Maia unavailable')
    const policy: Record<string, number> = hp.bands[0].policy
    const ucis = Object.keys(policy)
    const i = ucis.indexOf(m.uci)
    if (i < 0) throw new Error(`move ${m.k}: ${m.uci} is not in Maia's policy`)
    scored.push({ s, o, i, ps: ucis.map((u) => Number(policy[u].toPrecision(6))) })
  }
  fs.appendFileSync(out, JSON.stringify({ k: m.k, pairs: scored }) + '\n')
  written++
  if (written % 500 === 0) console.error(`shard ${k}/${n}: ${written + done.size} of ${mine.length + done.size} moves, ${Math.round((Date.now() - started) / 1000)} s`)
}
engine.dispose()
console.error(`shard ${k}/${n}: done, ${written} written this run`)
process.exit(0)
