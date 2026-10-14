// Maia-2's policy at each punish event of maia-punish, priced as the app
// prices it: the replier's band at the offset maia-rating-offset keeps, facing
// an equal opponent, through the app's Node engine service. Keeps every legal
// move's probability and the index of the punishing reply, so the fit can
// price the event with or without a temperature.
//
//   bridge/run.sh projects/maia-calibration/punish-policies.mts
import fs from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, projectDir } from '../../bridge/lib/chess.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
const { defaultMaiaElo, DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')

const kept: number = JSON.parse(fs.readFileSync(join(projectDir('maia-rating-offset'), 'results', 'offset.json'), 'utf8')).kept
const { events } = JSON.parse(fs.readFileSync(join(privateDir('maia-punish'), 'events.json'), 'utf8'))

const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const rows = []
for (const [idx, e] of events.entries()) {
  const band = defaultMaiaElo(e.rating, kept)
  // At the app's own offset the band is the one maia-punish priced the event at.
  if (kept === DEFAULT_LICHESS_OFFSET && band !== e.band) throw new Error(`event ${idx}: band ${band}, maia-punish had ${e.band}`)
  const hp = await engine.humanPolicy(position(e.fenBeforeReply), { bands: [band] })
  if (hp === 'unavailable') throw new Error('Maia unavailable')
  const policy: Record<string, number> = hp.bands[0].policy
  const ucis = Object.keys(policy)
  const best = ucis.indexOf(e.bestUci)
  if (best < 0) throw new Error(`event ${idx}: ${e.bestUci} is not in Maia's policy`)
  if (kept === DEFAULT_LICHESS_OFFSET && Math.abs(policy[e.bestUci] - e.q) > 1e-6) throw new Error(`event ${idx}: q ${policy[e.bestUci]}, maia-punish had ${e.q}`)
  rows.push({ idx, game: e.game, dir: e.dir, inExact: e.inExact, E1: e.E1, band, best, ps: ucis.map((u) => Number(policy[u].toPrecision(6))) })
}
engine.dispose()
fs.writeFileSync(join(privateDir('maia-calibration'), 'punish-policies.json'), JSON.stringify({ offset: kept, rows }))
console.log(JSON.stringify({ offset: kept, events: rows.length, exact: rows.filter((r) => r.inExact).length, games: new Set(rows.map((r) => r.game)).size }))
process.exit(0)
