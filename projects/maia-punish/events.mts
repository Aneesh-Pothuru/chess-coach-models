// The events for the punish-calibration check: every error in the accuracy
// eval's 60 games (win% given away >= 5), the reply that punishes it (the
// engine's best answer), whether the reply was played, and Maia-2's
// probability of that reply at the replier's band, converted as the app
// converts it: the player's rating at DEFAULT_LICHESS_OFFSET and his
// opponents' at OPPONENT_LICHESS_OFFSET (an app from before that split
// converts both at the default). Reads routine evidence (--evidence DIR, by
// default the accuracy project's private/accuracy-vs-chesscom/evidence/routine)
// and runs Maia through the Node engine service (weights cached on first use).
// Where a review carries the app's own punish odds (ext.punish), each event's
// band and probability must match them.
//
//   bridge/run.sh projects/maia-punish/events.mts [--evidence DIR]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'

const flag = process.argv.indexOf('--evidence')
if (flag >= 0 && !process.argv[flag + 1]) throw new Error('usage: events.mts [--evidence DIR]')
const EVID = flag >= 0 ? process.argv[flag + 1] : join(privateDir('accuracy-vs-chesscom'), 'evidence', 'routine')
const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)

const { createNodeEngine } = await load('src/adapters/node/engine/index.ts')
const { position } = await load('src/core/chess/index.ts')
const engineApi = await load('src/services/engine/index.ts')
const { defaultMaiaElo } = engineApi
const offsets = { player: engineApi.DEFAULT_LICHESS_OFFSET as number, opponents: (engineApi.OPPONENT_LICHESS_OFFSET ?? engineApi.DEFAULT_LICHESS_OFFSET) as number }
if (!Number.isFinite(offsets.player) || !Number.isFinite(offsets.opponents)) throw new Error('the app exports no Lichess offset')

type Side = 'w' | 'b'
interface Case { id: string; playerColor: Side; myRating: number; oppRating: number }
const cases: Case[] = JSON.parse(fs.readFileSync(join(privateDir('accuracy-vs-chesscom'), 'cases.json'), 'utf8'))

const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const skips: Record<string, number> = {}
const skip = (k: string) => (skips[k] = (skips[k] ?? 0) + 1)
const events: any[] = []
const appOdds = { checked: 0, absent: 0 }

for (const c of cases) {
  const doc = JSON.parse(fs.readFileSync(`${EVID}/${c.id}.json`, 'utf8'))
  if (doc.id !== `cc:${c.id}`) throw new Error(`id mismatch ${c.id}`)
  if (doc.playerColor !== c.playerColor) throw new Error(`colour mismatch ${c.id}`)
  if (doc.fens.length !== doc.records.length + 1) throw new Error(`fens/records length ${c.id}`)
  const recs: any[] = doc.records
  const priced: any[] | undefined = doc.ext?.punish
  const pc: Side = c.playerColor
  const oc: Side = pc === 'w' ? 'b' : 'w'
  const directions = [
    // player errs, opponent punishes at the opponent's band
    { dir: 'player-err', errorSide: pc, replier: oc, offset: offsets.opponents, band: defaultMaiaElo(c.oppRating, offsets.opponents), rating: c.oppRating, bandOf: 'oppRating' },
    // opponent errs, player punishes at the player's band
    { dir: 'opp-err', errorSide: oc, replier: pc, offset: offsets.player, band: defaultMaiaElo(c.myRating, offsets.player), rating: c.myRating, bandOf: 'myRating' },
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
      // The review rounds its odds to three decimals.
      const app = priced?.find((o) => o.ply === i && o.reply === nx.bestUci)
      if (app) {
        if (app.band !== d.band || Math.abs(app.p - q) > 0.0005 + 1e-9) throw new Error(`${c.id} ply ${i}: the review priced ${nx.bestUci} at band ${app.band}, p ${app.p}; here band ${d.band}, q ${q}`)
        appOdds.checked++
      } else appOdds.absent++
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
        offset: d.offset,
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
  app: execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  evidence: relative(LAB_DIR, EVID),
  offsets,
  definitions: {
    error: 'records[i].mover is the erring side and lossPct >= 5; reply = records[i+1]',
    E1: 'reply uci === reply bestUci',
    E2: 'reply lossPct <= 2',
    q: 'Maia-2 probability of reply bestUci at fens[i+1] for the replier band (humanPolicy, opponentBand same); the band converts the replier rating at the app offset for that side (offsets)',
    inExact: 'reply evidence in {verified, terminal} (spec literal "exact bestUci")',
    inAll: 'every non-book reply (judged !== null)',
  },
  counts: { events: events.length, exact: events.filter((e) => e.inExact).length, games: new Set(events.map((e) => e.game)).size },
  appOdds,
  skips,
  events,
}
fs.writeFileSync(join(privateDir('maia-punish'), 'events.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify({ counts: out.counts, offsets, appOdds, skips }, null, 1))
