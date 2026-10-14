// The events for the punish-calibration check: every error in the accuracy
// eval's 60 games (win% given away >= 5), the reply that punishes it (the
// engine's best answer), whether the reply was played, and Maia-2's
// probability of that reply at the replier's band. Reads the frozen routine
// evidence (private/accuracy-vs-chesscom/evidence, rebuilt by
// projects/accuracy-vs-chesscom/build-evidence.mjs) and runs Maia through the
// Node engine service (weights cached on first use).
//
//   bridge/run.sh projects/maia-punish/events.mts
import fs from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR, privateDir } from '../../bridge/lib/chess.mjs'

const EVID = join(privateDir('accuracy-vs-chesscom'), 'evidence', 'routine')
const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)

const { createNodeEngine } = await load('src/adapters/node/engine/index.ts')
const { position } = await load('src/core/chess/index.ts')
const { defaultMaiaElo } = await load('src/services/engine/index.ts')

type Side = 'w' | 'b'
interface Case { id: string; playerColor: Side; myRating: number; oppRating: number }
const cases: Case[] = JSON.parse(fs.readFileSync(join(privateDir('accuracy-vs-chesscom'), 'cases.json'), 'utf8'))

const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const skips: Record<string, number> = {}
const skip = (k: string) => (skips[k] = (skips[k] ?? 0) + 1)
const events: any[] = []

for (const c of cases) {
  const doc = JSON.parse(fs.readFileSync(`${EVID}/${c.id}.json`, 'utf8'))
  if (doc.id !== `cc:${c.id}`) throw new Error(`id mismatch ${c.id}`)
  if (doc.playerColor !== c.playerColor) throw new Error(`colour mismatch ${c.id}`)
  if (doc.fens.length !== doc.records.length + 1) throw new Error(`fens/records length ${c.id}`)
  const recs: any[] = doc.records
  const pc: Side = c.playerColor
  const oc: Side = pc === 'w' ? 'b' : 'w'
  const directions = [
    // player errs, opponent punishes at the opponent's band
    { dir: 'player-err', errorSide: pc, replier: oc, band: defaultMaiaElo(c.oppRating), rating: c.oppRating, bandOf: 'oppRating' },
    // opponent errs, player punishes at the player's band
    { dir: 'opp-err', errorSide: oc, replier: pc, band: defaultMaiaElo(c.myRating), rating: c.myRating, bandOf: 'myRating' },
  ]
  for (let i = 0; i + 1 < recs.length; i++) {
    const r = recs[i]
    const nx = recs[i + 1]
    for (const d of directions) {
      if (r.mover !== d.errorSide || !(r.lossPct >= 5)) continue
      if (nx.mover !== d.replier) { skip(`${d.dir}: reply mover mismatch`); continue }
      // judged === null is a book ply: its lossPct 0 is a placeholder, not a measured reply
      if (nx.judged === null) { skip(`${d.dir}: reply is book (placeholder lossPct)`); continue }
      if (!nx.bestUci) { skip(`${d.dir}: reply has no bestUci`); continue }
      const fen = doc.fens[i + 1]
      const hp = await engine.humanPolicy(position(fen), { bands: [d.band] })
      if (hp === 'unavailable') throw new Error('Maia unavailable')
      const pol: Record<string, number> = hp.bands[0].policy
      const q = pol[nx.bestUci]
      if (q === undefined) { skip(`${d.dir}: bestUci not in Maia policy`); continue }
      const psum = Object.values(pol).reduce((a, b) => a + b, 0)
      events.push({
        dir: d.dir,
        game: c.id,
        errorPly: r.ply,
        errorUci: r.uci,
        errorSan: r.san,
        errorLossPct: r.lossPct,
        errorCls: r.cls,
        errorEvidence: r.evidence,
        replyPly: nx.ply,
        replyUci: nx.uci,
        replySan: nx.san,
        bestUci: nx.bestUci,
        replyLossPct: nx.lossPct,
        replyCls: nx.cls,
        replyEvidence: nx.evidence,
        fenBeforeReply: fen,
        band: d.band,
        bandOf: d.bandOf,
        rating: d.rating,
        q,
        pPlayed: pol[nx.uci] ?? null,
        policySum: psum,
        E1: nx.uci === nx.bestUci,
        E2: nx.lossPct <= 2,
        inExact: nx.evidence === 'verified' || nx.evidence === 'terminal',
        inAll: true,
      })
    }
  }
}
engine.dispose()

const out = {
  built: new Date().toISOString(),
  definitions: {
    error: 'records[i].mover is the erring side and lossPct >= 5; reply = records[i+1]',
    E1: 'reply uci === reply bestUci',
    E2: 'reply lossPct <= 2',
    q: 'Maia-2 probability of reply bestUci at fens[i+1] for the replier band (humanPolicy, opponentBand same)',
    inExact: 'reply evidence in {verified, terminal} (spec literal "exact bestUci")',
    inAll: 'every non-book reply (judged !== null)',
  },
  counts: { events: events.length, exact: events.filter((e) => e.inExact).length, games: new Set(events.map((e) => e.game)).size },
  skips,
  events,
}
fs.writeFileSync(join(privateDir('maia-punish'), 'events.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ counts: out.counts, skips }, null, 1))
