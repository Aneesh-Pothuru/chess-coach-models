// Development of line-tactics.mjs's rule, on the app's pool only: the precision and
// recall against Lichess's themes of variants of the sources whose first reading is
// loose (the back-rank mate, the sacrifice, the attraction, the in-between move, the
// quiet move, the fork, the double and discovered check). It reads the signals
// line-tactics.mjs wrote and replays each line where a variant needs the board.
//
//   bridge/run.sh models/coach-narrator/coach-eval/line-tactics-dev.mjs --shards 6
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir } from '../../../bridge/lib/chess.mjs'

const K = await chess('src/services/knowledge/index.ts')
const OUT = join(privateDir('coach-eval'), 'line-tactics')
const shards = Number(process.argv[process.argv.indexOf('--shards') + 1] ?? 1)
const rows = []
for (let k = 0; k < shards; k++) rows.push(...readFileSync(join(OUT, `signals-app-${k}-of-${shards}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const b = JSON.parse(readFileSync(join(CHESS_DIR, 'src/data/puzzles.json'), 'utf8'))
const pool = new Map((Array.isArray(b) ? b : Object.values(b).flat()).map((p) => [p.id, p]))
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** The line replayed from the position the solver faces: each ply's move and the board after it. */
function replay(p) {
  const ucis = p.moves.split(' ')
  const board = new Chess(p.fen)
  board.move({ from: ucis[0].slice(0, 2), to: ucis[0].slice(2, 4), promotion: ucis[0][4] })
  const solver = board.turn()
  const plies = []
  for (const u of ucis.slice(1)) {
    const before = board.fen()
    const mv = board.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })
    plies.push({ mv, before, after: board.fen() })
  }
  return { solver, plies }
}

const fileIdx = (sq) => sq.charCodeAt(0) - 97
const rankNum = (sq) => Number(sq[1])
const sqOf = (f, r) => String.fromCharCode(97 + f) + r

/** Back-rank mate readings of a mating position, from strict to loose. */
function backRank(fen) {
  const g = new Chess(fen)
  if (!g.isCheckmate()) return null
  const loser = g.turn()
  const winner = loser === 'w' ? 'b' : 'w'
  const king = g.board().flat().find((c) => c && c.type === 'k' && c.color === loser).square
  const back = loser === 'w' ? 1 : 8
  if (rankNum(king) !== back) return { onBack: false }
  const checkers = g.attackers(king, winner)
  const checker = checkers.map((s) => ({ s, p: g.get(s) }))
  const alongRank = checker.some(({ s, p }) => (p.type === 'r' || p.type === 'q') && rankNum(s) === back)
  const front = loser === 'w' ? 2 : 7
  const fronts = [-1, 0, 1].map((d) => fileIdx(king) + d).filter((f) => f >= 0 && f < 8).map((f) => sqOf(f, front))
  const own = fronts.filter((s) => g.get(s)?.color === loser).length
  const ownPawns = fronts.filter((s) => g.get(s)?.color === loser && g.get(s)?.type === 'p').length
  return { onBack: true, alongRank, fronts: fronts.length, own, ownPawns }
}

const truthOf = (r) => {
  const t = new Set()
  for (const w of r.themes) {
    const c = K.VOCABULARY[w] ?? { sacrifice: 'sacrifice', quietMove: 'quiet-move', mate: 'checkmate' }[w]
    if (c) t.add(c)
  }
  return t
}

const variants = {}
const tally = (name, concept, said, truth) => {
  const x = (variants[name] ??= { concept, tp: 0, fp: 0, fn: 0 })
  if (said) x[truth.has(concept) ? 'tp' : 'fp']++
  else if (truth.has(concept)) x.fn++
}

for (const r of rows) {
  if (r.skip) continue
  const p = pool.get(r.id)
  const truth = truthOf(r)
  const s = r.signals
  const steps = s.steps
  const { solver, plies } = replay(p)

  // Back-rank mate.
  const br = s.mate ? backRank(plies[plies.length - 1].after) : null
  tally('backRank: app nameMate', 'back-rank-mate', s.shape === 'back-rank-mate', truth)
  tally('backRank: R/Q mates along the back rank', 'back-rank-mate', !!br?.alongRank, truth)
  tally('backRank: along the rank, one front square own', 'back-rank-mate', !!br?.alongRank && br.own >= 1, truth)
  tally('backRank: along the rank, two front squares own', 'back-rank-mate', !!br?.alongRank && br.own >= 2, truth)
  tally('backRank: along the rank, all front squares own', 'back-rank-mate', !!br?.alongRank && br.own === br.fronts, truth)
  tally('backRank: along the rank, two own pawns in front', 'back-rank-mate', !!br?.alongRank && br.ownPawns >= 2, truth)
  tally('backRank: nameMate and two front squares own', 'back-rank-mate', s.shape === 'back-rank-mate' && !!br?.onBack && br.own >= 2, truth)
  tally('backRank: all front squares own, none attacked (signals)', 'back-rank-mate', s.backRank === true, truth)

  // Sacrifice.
  const promotes = steps.some((x) => x.promotion)
  tally('sacrifice: down 2 after a reply, won back or mate', 'sacrifice', s.low <= -2 && (s.mate || s.net > s.low), truth)
  tally('sacrifice: down 3 after a reply, won back or mate', 'sacrifice', s.low <= -3 && (s.mate || s.net > s.low), truth)
  tally('sacrifice: down 2, no promotion', 'sacrifice', s.low <= -2 && (s.mate || s.net > s.low) && !promotes, truth)
  let offered = false
  let offeredCheap = false
  for (let i = 0; i + 1 < plies.length; i += 2) {
    const m1 = plies[i].mv
    const m2 = plies[i + 1].mv
    if (m2.captured && m2.to === m1.to) {
      const gave = VALUE[m1.promotion ?? m1.piece] - (m1.captured ? VALUE[m1.captured] : 0)
      if (gave >= 2) offered = true
      if (gave >= 2 && i + 2 < plies.length) offeredCheap = true
    }
  }
  tally('sacrifice: a solver piece taken where it landed, 2 or more net', 'sacrifice', offered, truth)
  tally('sacrifice: the same, before the last solver move', 'sacrifice', offeredCheap, truth)
  tally('sacrifice: offered and down 2 after a reply', 'sacrifice', offered && s.low <= -2, truth)

  // Attraction.
  tally('attraction: any', 'attraction', steps.some((x) => x.attraction), truth)
  tally('attraction: the king', 'attraction', steps.some((x) => x.attraction?.attracted === 'k'), truth)
  tally('attraction: queen or rook', 'attraction', steps.some((x) => x.attraction && x.attraction.attracted !== 'k'), truth)
  tally('attraction: first move only', 'attraction', !!steps[0]?.attraction, truth)
  tally('attraction: king, first move', 'attraction', steps[0]?.attraction?.attracted === 'k', truth)

  // In-between move.
  tally('intermezzo: first move', 'zwischenzug', !!steps[0]?.intermezzo, truth)
  tally('intermezzo: first move, no mate', 'zwischenzug', !!steps[0]?.intermezzo && !s.mate, truth)
  tally('intermezzo: first move, no mate, no removal or attraction', 'zwischenzug', !!steps[0]?.intermezzo && !s.mate && !steps[0].deflection && !steps[0].capturingDefender && !steps[0].attraction, truth)

  // Quiet move.
  tally('quiet: any but the last', 'quiet-move', steps.some((x, i) => x.quiet && i < steps.length - 1), truth)
  tally('quiet: a later move but the last', 'quiet-move', steps.some((x, i) => x.quiet && i > 0 && i < steps.length - 1), truth)
  tally('quiet: the first move, line of two or more', 'quiet-move', steps.length > 1 && steps[0].quiet, truth)
  tally('quiet: any, not check, not capture', 'quiet-move', steps.some((x, i) => x.quiet && !x.check && !x.capture && i < steps.length - 1), truth)

  // Fork.
  tally('fork: describe, any move', 'fork', steps.some((x) => x.describe.includes('fork')), truth)
  tally('fork: describe first or detectFork later without mate', 'fork', steps.some((x, i) => x.describe.includes('fork') || (i > 0 && x.fork && !x.san.endsWith('#'))), truth)
  tally('fork: detectFork, not a mating move', 'fork', steps.some((x) => x.fork && !x.san.endsWith('#')), truth)
  tally('fork: detectFork, line ends without mate', 'fork', !s.mate && steps.some((x) => x.fork), truth)
  tally('fork: describe any, or detectFork without mate in the line', 'fork', steps.some((x) => x.describe.includes('fork')) || (!s.mate && steps.some((x) => x.fork)), truth)

  // Double and discovered check, read off the board at every solver move.
  let dbl = false
  let disc = false
  for (let i = 0; i < plies.length; i += 2) {
    const { mv, after } = plies[i]
    const g = new Chess(after)
    if (!g.inCheck()) continue
    const them = g.turn()
    const king = g.board().flat().find((c) => c && c.type === 'k' && c.color === them).square
    const checkers = g.attackers(king, solver)
    if (checkers.length >= 2) dbl = true
    if (checkers.some((sq) => sq !== mv.to)) disc = true
  }
  tally('double check: themes', 'double-check', steps.some((x) => x.themes.includes('doubleCheck')), truth)
  tally('double check: board, any solver move', 'double-check', dbl, truth)
  tally('discovered: themes any', 'discovered-attack', steps.some((x) => x.themes.includes('discoveredAttack') || x.themes.includes('discoveredCheck')), truth)
  tally('discovered: themes any or a discovered check on the board', 'discovered-attack', disc || steps.some((x) => x.themes.includes('discoveredAttack') || x.themes.includes('discoveredCheck')), truth)
  tally('discovered: themes first or describe any', 'discovered-attack', steps.some((x, i) => (i === 0 && (x.themes.includes('discoveredAttack') || x.themes.includes('discoveredCheck'))) || x.describe.includes('discovered-attack')), truth)

  // Pin and skewer.
  tally('pin: themes first', 'pin', steps[0]?.themes.some((t) => t.startsWith('pin')) ?? false, truth)
  tally('pin: themes or describe, first', 'pin', !!steps[0] && (steps[0].themes.some((t) => t.startsWith('pin')) || steps[0].describe.includes('pin')), truth)
  tally('pin: absolute, any move', 'pin', steps.some((x) => x.themes.includes('pinAbsolute')), truth)
  tally('pin: relative, any move', 'pin', steps.some((x) => x.themes.includes('pinRelative')), truth)
  tally('skewer: themes first', 'skewer', steps[0]?.themes.includes('skewer') ?? false, truth)
  tally('skewer: themes first or describe later', 'skewer', !!steps[0]?.themes.includes('skewer') || steps.slice(1).some((x) => x.describe.includes('skewer')), truth)

  // Deflection.
  tally('deflection: any', 'deflection', steps.some((x) => x.deflection), truth)
  tally('deflection: kind deflection', 'deflection', steps.some((x) => x.deflection?.kind === 'deflection'), truth)
  tally('deflection: kind overloaded', 'deflection', steps.some((x) => x.deflection?.kind === 'overloadedDefender'), truth)
  tally('deflection: any, no mate in the line', 'deflection', !s.mate && steps.some((x) => x.deflection), truth)

  // Passed pawn (Lichess's advanced pawn).
  tally('passed: describe any', 'passed-pawn', steps.some((x) => x.describe.includes('passed-pawn')), truth)
  tally('passed: describe any, or a promotion', 'passed-pawn', promotes || steps.some((x) => x.describe.includes('passed-pawn')), truth)
}

const fmt = (x) => (x === null ? '  - ' : x.toFixed(2))
for (const [name, x] of Object.entries(variants)) {
  const P = x.tp + x.fp ? x.tp / (x.tp + x.fp) : null
  const R = x.tp + x.fn ? x.tp / (x.tp + x.fn) : null
  console.log(`${name.padEnd(62)} tp ${String(x.tp).padStart(5)} fp ${String(x.fp).padStart(5)} fn ${String(x.fn).padStart(5)}  P ${fmt(P)}  R ${fmt(R)}`)
}
process.exit(0)
