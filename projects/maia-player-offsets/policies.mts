// Policy storage and timing only: never computes a likelihood, Brier score, or fit.
import fs from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'
import { pairsFor, punishPairs, mulberry32, SEED } from './design.mjs'
import { dir, jsonl, read, manifest, checkManifest, completedKeys } from './io.mjs'
const args = process.argv.slice(2)
const value = (key: string, def: string) => args.includes(key) ? args[args.indexOf(key) + 1] : def
const kind = value('--kind', 'move')
const benchmark = args.includes('--benchmark')
if (!['move', 'punish'].includes(kind)) throw new Error('kind must be move or punish')
const [k, n] = value('--shard', '0/2').split('/').map(Number)
if (n !== 2 || ![0, 1].includes(k)) throw new Error('use exactly two shards, 0/2 and 1/2')
const source = join(dir, kind === 'move' ? 'positions.jsonl' : 'punish-events.json')
const rows = kind === 'move' ? jsonl(source) : read(source).events
const pairs = kind === 'move' ? pairsFor : punishPairs
let selected = rows
if (benchmark) {
  const rng = mulberry32(SEED), order = [...rows]
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  selected = order.slice(0, 32)
}
const prefix = `${benchmark ? 'benchmark-' : ''}${kind}-policies-${k}-of-${n}`
const out = join(dir, `${prefix}.jsonl`)
checkManifest(out + '.meta.json', { ...manifest(source), benchmark, kind, k, n })
let previousSeconds = 0, previousCalls = 0, previousBytes = 0, previousFirst = 0, untimed = 0
const done = await completedKeys(out, (row: any, bytes: number) => {
  if (row.timing) { previousSeconds += row.timing.seconds; previousCalls += row.pairs.length; previousBytes += bytes; previousFirst = Math.max(previousFirst, row.timing.firstSeconds) }
  else untimed++
})
const allowed = new Set(selected.filter((r: any, i: number) => (benchmark ? i : r.k) % n === k).map((r: any) => r.k))
if ([...done].some(key => !allowed.has(key))) throw new Error('cache contains an unexpected position')
const mine = selected.filter((r: any, i: number) => (benchmark ? i : r.k) % n === k && !done.has(r.k))
const timingFile = join(dir, `${prefix}-timing.json`)
if (!mine.length) {
  if (benchmark && !fs.existsSync(timingFile)) {
    if (untimed) throw new Error('legacy benchmark has no durable timing; archive its benchmark files and rerun the fixed slice')
    fs.writeFileSync(timingFile, JSON.stringify({ kind, benchmark, shard: k, processes: 2, rows: done.size, calls: previousCalls, firstSeconds: previousFirst, seconds: previousSeconds, bytes: previousBytes, recovered: true }, null, 2) + '\n')
  }
  console.log(JSON.stringify({ kind, benchmark, shard: k, resumed: true, remaining: 0 })); process.exit(0)
}
if (benchmark && untimed) throw new Error('legacy partial benchmark lacks durable timing; archive its benchmark files and rerun the fixed slice')
const { createNodeEngine, maiaCacheDir, maiaWeightsFile } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
if (!fs.existsSync(maiaWeightsFile(maiaCacheDir(CHESS_DIR)))) throw new Error('Maia weights missing from pinned checkout; no implicit download')
const start = performance.now()
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false, pool: 1 })
let calls = 0, firstSeconds = 0, bytes = 0, written = 0
for (const r of mine) {
  const rowStart = performance.now(), firstBefore = calls
  const scored = []
  for (const { s, o } of pairs(r)) {
    const t = performance.now()
    const hp = await engine.humanPolicy(position(r.fen), { bands: [s], opponentBand: o })
    if (hp === 'unavailable') throw new Error('Maia unavailable')
    const policy = hp.bands[0].policy, ucis = Object.keys(policy), ps = Object.values(policy) as number[]
    if (!ucis.includes(kind === 'move' ? r.uci : r.bestUci)) throw new Error('target move absent from policy')
    if (ps.some(p => !Number.isFinite(p) || p < 0) || Math.abs(ps.reduce((a, b) => a + b, 0) - 1) > 1e-5) throw new Error('invalid policy')
    calls++; if (calls === 1) firstSeconds = (performance.now() - t) / 1000
    scored.push({ s, o, ucis, ps })
  }
  const line = JSON.stringify({ k: r.k, pairs: scored, timing: { seconds: (performance.now() - rowStart) / 1000, firstSeconds: firstBefore === 0 ? firstSeconds : 0 } }) + '\n'
  fs.appendFileSync(out, line); bytes += Buffer.byteLength(line); written++
  if (written % 250 === 0) console.error(JSON.stringify({ kind, shard: k, written, seconds: Math.round((performance.now() - start) / 1000) }))
}
const timing = { kind, benchmark, shard: k, processes: 2, rows: written + done.size, calls: calls + previousCalls, firstSeconds: Math.max(firstSeconds, previousFirst), seconds: (performance.now() - start) / 1000 + previousSeconds, bytes: bytes + previousBytes, resumedRows: done.size }
fs.writeFileSync(timingFile, JSON.stringify(timing, null, 2) + '\n')
console.log(JSON.stringify(timing))
engine.dispose(); process.exit(0)
