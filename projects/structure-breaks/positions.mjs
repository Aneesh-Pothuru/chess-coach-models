import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CLOCK_FLOOR,
  MIN_LEGAL,
  MIN_MEN,
  MONTH,
  PROJECT,
  SEED,
  SOURCE,
  STRONG_CANDIDATES,
  STRONG_TRIES,
  breaksOf,
  clockBefore,
  gitCommit,
  linesOf,
  menOf,
  mulberry32,
  readJsonl,
  sansOf,
  seedOf,
} from './lib.mjs'

const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const S = await chess('src/services/knowledge/catalogue/structures.ts')

const dir = privateDir(PROJECT)
const skipped = { his: {}, strong: {} }
const skip = (who, why) => {
  skipped[who][why] = (skipped[who][why] ?? 0) + 1
}

const his = []
for (const p of readJsonl(join(privateDir(SOURCE), 'his-candidates.jsonl'))) {
  const r = breaksOf(p.fen, sansOf(p.history), K, S)
  if (!r.structure) {
    skip('his', 'no named structure')
    continue
  }
  if (!r.levers.length) {
    skip('his', 'no break for his side')
    continue
  }
  if (!r.breaks.length) {
    skip('his', 'break not on')
    continue
  }
  his.push({ ...p, structure: r.structure, holder: r.holder, levers: r.levers, breaks: r.breaks })
}
const firstPly = new Map()
for (const p of his) firstPly.set(p.gi, Math.min(firstPly.get(p.gi) ?? Infinity, p.ply))
for (const p of his) p.first = firstPly.get(p.gi) === p.ply
writeFileSync(join(dir, 'his-candidates.jsonl'), his.map((p) => JSON.stringify(p)).join('\n') + '\n')

const strong = []
let games = 0
let gi = -1
for await (const line of linesOf(join(privateDir(SOURCE), `strong-${MONTH}.jsonl.gz`))) {
  gi++
  if (strong.length >= STRONG_CANDIDATES) break
  games++
  const g = JSON.parse(line)
  const base = Number(String(g.timeControl).split('+')[0])
  const replayed = C.replaySans(C.START_FEN, g.sans)
  const eligible = []
  for (let ply = 0; ply < replayed.ucis.length; ply++) {
    const fen = replayed.fens[ply]
    if (ply > 0 && /[+#]$/.test(replayed.sans[ply - 1])) continue
    if (menOf(fen) < MIN_MEN) continue
    const clock = clockBefore(g.clocks, ply, base)
    if (clock === null || clock < CLOCK_FLOOR) continue
    if (K.phaseOf(fen) === 'opening') continue
    if (new Chess(fen).moves().length < MIN_LEGAL) continue
    const hit = K.structureOf(fen)
    if (!hit) continue
    eligible.push(ply)
  }
  if (!eligible.length) {
    skip('strong', 'game: no position with a named structure')
    continue
  }
  const rnd = mulberry32(seedOf('plies', g.id, SEED))
  for (let t = eligible.length - 1; t > 0; t--) {
    const j = Math.floor(rnd() * (t + 1))
    ;[eligible[t], eligible[j]] = [eligible[j], eligible[t]]
  }
  let found = null
  for (const ply of eligible.slice(0, STRONG_TRIES)) {
    const fen = replayed.fens[ply]
    const r = breaksOf(fen, replayed.sans.slice(0, ply), K, S)
    if (r.breaks.length) {
      found = { ply, fen, ...r }
      break
    }
  }
  if (!found) {
    skip('strong', `game: no break on in ${STRONG_TRIES} tries`)
    continue
  }
  const turn = found.fen.split(' ')[1]
  strong.push({
    id: strong.length,
    gi,
    ply: found.ply,
    fen: found.fen,
    history: replayed.ucis.slice(0, found.ply),
    played: replayed.ucis[found.ply],
    side: turn,
    elo: turn === 'w' ? g.whiteElo : g.blackElo,
    speed: g.speed,
    phase: K.phaseOf(found.fen),
    structure: found.structure,
    holder: found.holder,
    levers: found.levers,
    breaks: found.breaks,
  })
}
writeFileSync(join(dir, 'strong-candidates.jsonl'), strong.map((p) => JSON.stringify(p)).join('\n') + '\n')

const tally = (list, key) => list.reduce((acc, p) => ({ ...acc, [p[key]]: (acc[p[key]] ?? 0) + 1 }), {})
const summary = {
  app: { commit: gitCommit(CHESS_DIR) },
  his: {
    candidates: readJsonl(join(privateDir(SOURCE), 'his-candidates.jsonl')).length,
    breakOn: his.length,
    byHalf: [0, 1].map((h) => his.filter((p) => p.half === h).length),
    games: [0, 1].map((h) => new Set(his.filter((p) => p.half === h).map((p) => p.gi)).size),
    byStructure: tally(his, 'structure'),
    byPhase: tally(his, 'phase'),
    playedABreak: his.filter((p) => p.breaks.includes(p.played)).length,
    skipped: skipped.his,
  },
  strong: {
    gamesRead: games,
    candidates: strong.length,
    byStructure: tally(strong, 'structure'),
    bySpeed: tally(strong, 'speed'),
    skipped: skipped.strong,
  },
}
writeFileSync(join(resultsDir(PROJECT), 'positions.json'), JSON.stringify(summary, null, 2) + '\n')
console.error(JSON.stringify(summary))
