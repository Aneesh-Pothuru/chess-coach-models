// Extract the predecessor's event definition from app review documents.
// No probabilities or outcome rates are calculated here.
import fs from 'node:fs'
import { join } from 'node:path'
import { chess } from '../../bridge/lib/chess.mjs'
import { dir, pin, read, hash } from './io.mjs'
const benchmark = process.argv.includes('--benchmark')
if (process.argv.slice(2).some(a => a !== '--benchmark')) throw new Error('usage: events.mjs [--benchmark]')
const cases = read(join(dir, benchmark ? 'benchmark-cases.json' : 'held-cases.json'))
const games = read(join(dir, 'games.json'))
const { gameIdOf } = await chess('src/services/archive/index.ts')
const byId = new Map(games.map(g => [gameIdOf(g.id), g]))
const provenance = read(join(dir, 'evidence/manifest.json'))
if (provenance.app !== pin.commit || provenance.records !== pin.records || provenance.gamesSha256 !== hash(join(dir, 'games.json'))) throw new Error('evidence provenance differs')
const events = [], skips = {}
const skip = why => { skips[why] = (skips[why] ?? 0) + 1 }
for (const c of cases) {
  const g = byId.get(c.game)
  if (!g || g.half !== 'held') throw new Error('guard case is not a matched held-out game')
  const file = join(dir, 'evidence/routine', `${c.id}.json`)
  if (!fs.existsSync(file)) throw new Error('missing routine evidence: finish evidence.mjs --full')
  const doc = read(file)
  if (doc.schema !== 'game-review/2' || doc.id !== c.game || doc.playerColor !== c.playerColor || doc.provenance.profile !== 'routine' || doc.fens.length !== doc.records.length + 1) throw new Error('invalid routine evidence')
  for (let i = 0; i + 1 < doc.records.length; i++) {
    const r = doc.records[i], nx = doc.records[i + 1]
    if (!(r.lossPct >= 5)) continue
    if (nx.mover === r.mover) throw new Error('reply mover mismatch')
    if (nx.judged === null) { skip('book reply'); continue }
    if (!nx.bestUci) { skip('no best reply'); continue }
    const me = nx.mover === c.playerColor
    events.push({ k: events.length, g: g.g, half: g.half, dir: me ? 'opp-err' : 'player-err',
      inExact: nx.evidence === 'verified' || nx.evidence === 'terminal', E1: nx.uci === nx.bestUci,
      r: me ? c.myRating : c.oppRating, me, fen: doc.fens[i + 1], bestUci: nx.bestUci,
      replyPly: nx.ply })
  }
}
const report = { app: pin.commit, records: pin.records, benchmark, evidenceManifest: hash(join(dir, 'evidence/manifest.json')),
  definition: 'maia-punish/events.mts: lossPct >= 5, non-book reply, bestUci; E1 exact best reply; verified or terminal primary',
  counts: { games: cases.length, events: events.length, exact: events.filter(e => e.inExact).length,
    directions: Object.fromEntries(['player-err', 'opp-err'].map(d => [d, { all: events.filter(e => e.dir === d).length, exact: events.filter(e => e.dir === d && e.inExact).length }])) },
  skips, events }
fs.writeFileSync(join(dir, benchmark ? 'benchmark-events.json' : 'punish-events.json'), JSON.stringify(report) + '\n')
console.log(JSON.stringify({ benchmark, counts: report.counts, skips }))
