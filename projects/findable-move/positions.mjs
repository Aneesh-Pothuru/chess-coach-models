import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { gitCommit, PROJECT, OFFSET, DECOY_DROP, tenMinutes } from './lib.mjs'

const N = await chess('src/adapters/node/engine/index.ts')
const E = await chess('src/services/engine/index.ts')
const Sc = await chess('src/core/score/index.ts')
const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { parseTimeControl } = await chess('src/core/game/index.ts')
const { ARCHIVE_SUBDIR, loadArchiveGames } = await chess('src/adapters/node/archive/days.ts')

const engine = N.createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })

const skipped = {}
const skip = (why) => {
  skipped[why] = (skipped[why] ?? 0) + 1
}

function firstSan(line) {
  const tok = String(line ?? '').trim().split(/\s+/)[0] ?? ''
  return tok.replace(/^\d+\.(\.\.)?/, '')
}

function moveOf(fen, san) {
  const uci = C.sanToUci(fen, san)
  if (!uci) return null
  const sanNow = C.uciToSan(fen, uci) ?? ''
  return { uci, forcing: /[x+#]/.test(sanNow) }
}

const all = loadArchiveGames({ dir: join(CHESS_DIR, ARCHIVE_SUBDIR) })
const games = all
  .filter((g) => {
    if (!tenMinutes(g, parseTimeControl)) {
      skip('game: not 10|0')
      return false
    }
    return true
  })
  .sort((a, b) => a.endTime - b.endTime)
const trainGames = Math.floor((games.length * 2) / 3)

const positions = []
let examined = 0
for (let gi = 0; gi < games.length; gi++) {
  const g = games[gi]
  const split = gi < trainGames ? 'train' : 'heldout'
  if (typeof g.myRating !== 'number' || typeof g.oppRating !== 'number') {
    skip('game: no ratings')
    continue
  }
  const replayed = C.replaySans(C.START_FEN, g.sans ?? [])
  const myColor = g.meIsWhite ? 'w' : 'b'
  const hisBand = E.defaultMaiaElo(g.myRating, OFFSET)
  const oppBand = E.defaultMaiaElo(g.oppRating, OFFSET)
  const entries = [
    ...(g.deep ?? []).map((e) => ({ kind: 'turning', e, playedSan: e.san })),
    ...(g.plans ?? []).map((e) => ({ kind: 'plan', e, playedSan: e.played })),
  ]
  for (const { kind, e, playedSan } of entries) {
    examined++
    const ply = e.ply
    const fen = e.fen
    if (typeof ply !== 'number' || !fen) {
      skip(`${kind}: no ply or fen`)
      continue
    }
    if (replayed.fens[ply] !== fen) {
      skip(`${kind}: history does not reach the stored position`)
      continue
    }
    if (C.sideToMove(fen) !== myColor) {
      skip(`${kind}: not his move`)
      continue
    }
    const cands = []
    let broken = false
    for (const a of e.alts ?? []) {
      if (typeof a.eval !== 'number') continue
      const m = moveOf(fen, firstSan(a.line))
      if (!m) {
        broken = true
        break
      }
      if (cands.some((c) => c.uci === m.uci)) continue
      cands.push({ ...m, eval: a.eval, wp: Sc.lichessWinPercent(a.eval) })
    }
    if (broken) {
      skip(`${kind}: a stored line does not replay`)
      continue
    }
    if (cands.length < 2) {
      skip(`${kind}: fewer than 2 candidates`)
      continue
    }
    cands.sort((a, b) => b.eval - a.eval)
    const B = cands[0]
    const sound = cands.filter((c) => B.wp - c.wp <= E.ACCEPT_WINDOW_WP)
    const hp = await engine.humanPolicy(C.position(fen), { bands: [hisBand], opponentBand: oppBand })
    if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
    const policy = hp.bands[0]?.policy ?? {}
    const F = sound.reduce((a, c) => ((policy[c.uci] ?? 0) > (policy[a.uci] ?? 0) ? c : a), sound[0])
    if (F.uci === B.uci) {
      skip(`${kind}: the move he would find is the best`)
      continue
    }
    const played = playedSan ? moveOf(fen, playedSan) : null
    if (!played) {
      skip(`${kind}: the played move does not replay`)
      continue
    }
    positions.push({
      id: positions.length,
      game: gi,
      split,
      kind,
      ply,
      fen,
      history: replayed.ucis.slice(0, ply),
      myColor,
      hisBand,
      oppBand,
      phase: K.phaseOf(fen),
      candidates: cands.length,
      sound: sound.length,
      B: { uci: B.uci, eval: B.eval, wp: B.wp, forcing: B.forcing, pHis: policy[B.uci] ?? 0 },
      F: { uci: F.uci, eval: F.eval, wp: F.wp, forcing: F.forcing, pHis: policy[F.uci] ?? 0 },
      P: { uci: played.uci, wpDrop: typeof e.wpDrop === 'number' ? e.wpDrop : null, pHis: policy[played.uci] ?? 0 },
      decoy: kind === 'turning' && played.uci !== B.uci && played.uci !== F.uci && typeof e.wpDrop === 'number' && e.wpDrop >= DECOY_DROP,
    })
  }
}

const out = privateDir(PROJECT)
writeFileSync(join(out, 'positions.jsonl'), positions.map((p) => JSON.stringify(p)).join('\n') + '\n')
const count = (f) => positions.filter(f).length
const summary = {
  app: { commit: gitCommit(CHESS_DIR), archive: ARCHIVE_SUBDIR },
  games: games.length,
  trainGames,
  heldoutGames: games.length - trainGames,
  examined,
  entering: positions.length,
  byKind: { turning: count((p) => p.kind === 'turning'), plan: count((p) => p.kind === 'plan') },
  bySplit: { train: count((p) => p.split === 'train'), heldout: count((p) => p.split === 'heldout') },
  decoys: count((p) => p.decoy),
  skipped,
}
writeFileSync(join(resultsDir(PROJECT), 'positions.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
await engine.dispose?.()
process.exit(0)
