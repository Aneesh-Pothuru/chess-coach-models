// Maia-2's policy for each counted move of maia-rating-offset at the bands the
// app gives the two players (bands.mjs): a pair the single-offset grid of
// maia-rating-offset's policies.mts reaches only where the bands happen to
// coincide. Scores only the pairs that neither its cache nor this one holds,
// in the same form: every legal move's probability to six significant digits
// and the index of the move played. Resumes where it stopped.
//
//   bridge/run.sh projects/maia-calibration/app-policies.mts --shard k/n
import fs from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { appOffsets, moveBands } from './bands.mjs'

const arg = process.argv.indexOf('--shard')
const [k, n] = arg > 0 ? process.argv[arg + 1].split('/').map(Number) : [0, 1]
if (!(n >= 1 && k >= 0 && k < n)) throw new Error('usage: app-policies.mts --shard k/n')

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
const engineApi = await chess('src/services/engine/index.ts')
const offsets = appOffsets(engineApi)

const readJsonl = (file: string) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const mro = privateDir('maia-rating-offset')
const cal = privateDir('maia-calibration')
const moves = readJsonl(join(mro, 'positions.jsonl')).filter((m) => m.k % n === k)
const have = new Set<string>()
const note = (file: string) => { for (const row of readJsonl(file)) if (row.k % n === k) for (const p of row.pairs) have.add(`${row.k}/${p.s}/${p.o}`) }
for (const f of fs.readdirSync(mro).filter((f) => /^policies-\d+-of-\d+\.jsonl$/.test(f))) note(join(mro, f))
for (const f of fs.readdirSync(cal).filter((f) => /^app-policies-\d+-of-\d+\.jsonl$/.test(f))) note(join(cal, f))

const out = join(cal, `app-policies-${k}-of-${n}.jsonl`)
const todo = moves.map((m) => ({ m, ...moveBands(m, offsets, engineApi.defaultMaiaElo) })).filter(({ m, s, o }) => !have.has(`${m.k}/${s}/${o}`))
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const started = Date.now()
let written = 0
for (const { m, s, o } of todo) {
  const hp = await engine.humanPolicy(position(m.fen), { bands: [s], opponentBand: o })
  if (hp === 'unavailable') throw new Error('Maia unavailable')
  const policy: Record<string, number> = hp.bands[0].policy
  const ucis = Object.keys(policy)
  const i = ucis.indexOf(m.uci)
  if (i < 0) throw new Error(`move ${m.k}: ${m.uci} is not in Maia's policy`)
  fs.appendFileSync(out, JSON.stringify({ k: m.k, pairs: [{ s, o, i, ps: ucis.map((u) => Number(policy[u].toPrecision(6))) }] }) + '\n')
  written++
  if (written % 500 === 0) console.error(`shard ${k}/${n}: ${written} of ${todo.length} moves, ${Math.round((Date.now() - started) / 1000)} s`)
}
engine.dispose()
console.error(`shard ${k}/${n}: done, ${written} written this run (offsets: player ${offsets.player}, opponents ${offsets.opponents})`)
process.exit(0)
