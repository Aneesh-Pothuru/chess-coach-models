// 1g: the books' twelve planning positions read by the guess-the-plan drill's
// rule, by the README's rule.
//
//   bridge/run.sh projects/book-advice/capstones.mjs
//
// Reads the answer key from private/book-advice/capstones.json (copied there
// at run time; the books' positions are not in this repository), writes the
// per-position rows to private/book-advice/capstones-rows.json, and commits
// counts only, to results/capstones.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const C = await chess('src/core/chess/index.ts')
const Sc = await chess('src/core/score/index.ts')
const X = await chess('src/services/exercises/index.ts')
const E = await chess('src/adapters/node/engine/index.ts')

const PRIVATE = privateDir('book-advice')
const key = JSON.parse(readFileSync(join(PRIVATE, 'capstones.json'), 'utf8'))
const BUDGETS = [
  { id: 'plan', ref: 'plan', lines: 3 },
  { id: 'n32m', ref: { nodes: 32_000_000 }, lines: 3 },
]
const STEADY_CP = 100
const AHEAD_CP = 250

const engine = E.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false, human: false })
const turnOf = (fen) => fen.split(' ')[1]

async function judge(fen, named, budget) {
  const pos = C.position(fen)
  const mover = turnOf(fen)
  const top = await engine.bestMoves(pos, { budget: budget.ref, multiPv: budget.lines, priority: 'batch' })
  const ucis = Object.fromEntries(named.map((n) => [n.san, C.sanToUci(fen, n.san)]))
  for (const [san, uci] of Object.entries(ucis)) if (!uci) throw new Error(`illegal named move ${san}`)
  const roots = [...new Set([top.best, ...Object.values(ucis)])]
  const all = await engine.bestMoves(pos, { budget: budget.ref, multiPv: roots.length, restrictTo: roots, priority: 'batch' })
  const evalOf = new Map(all.lines.map((l) => [l.move, Sc.povCp(l.eval, mover)]))
  const options = roots.map((uci) => ({ move: uci, eval: evalOf.get(uci) ?? null }))
  if (options.some((o) => o.eval === null)) throw new Error(`a root has no line at ${budget.id}`)
  const best = X.planBest({ options })
  return {
    budget: budget.id,
    engineBest: top.best,
    topThree: top.lines.map((l) => l.move),
    depth: all.depth,
    bestOption: options[best].move,
    bestEval: options[best].eval,
    moves: named.map((n) => {
      const i = roots.indexOf(ucis[n.san])
      return { san: n.san, uci: ucis[n.san], verdict: n.verdict, eval: options[i].eval, right: X.planCorrect({ options }, i), inTopThree: top.lines.some((l) => l.move === ucis[n.san]) }
    }),
  }
}

function namedOf(p) {
  return [
    ...p.preferred.map((san) => ({ san, verdict: 'preferred' })),
    ...p.sound.map((san) => ({ san, verdict: 'sound' })),
    ...p.rejected.map((san) => ({ san, verdict: 'rejected' })),
  ]
}

const disagrees = (m) => (m.verdict === 'rejected' ? m.right : !m.right)

const rows = []
for (const p of key.positions) {
  if (p.turnNormalized) {
    const sides = []
    for (const side of ['w', 'b']) {
      const parts = p.fen.split(' ')
      parts[1] = side
      const fen = parts.join(' ')
      const r = await engine.evaluate(C.position(fen), BUDGETS[1].ref, { priority: 'batch' })
      const white = Sc.cpOf(r.eval)
      sides.push({ toMove: side, whiteCp: white, words: Sc.evalWords(r.eval, 'w') })
    }
    const worst = Math.max(...sides.map((s) => Math.abs(s.whiteCp)))
    const agreement = worst < STEADY_CP ? 'agrees' : worst < AHEAD_CP ? 'half' : 'disagrees'
    rows.push({ n: p.n, kind: 'evaluation', sides, agreement })
    continue
  }
  const named = namedOf(p)
  const reads = []
  for (const b of BUDGETS) reads.push(await judge(p.fen, named, b))
  rows.push({ n: p.n, kind: 'moves', reads })
  for (const [i, later] of (p.laterMoves ?? []).entries()) {
    const lnamed = namedOf({ preferred: [], sound: [], rejected: [], ...later })
    const lreads = []
    for (const b of BUDGETS) lreads.push(await judge(later.fen, lnamed, b))
    rows.push({ n: p.n, later: i + 1, kind: 'moves', reads: lreads })
  }
}
engine.dispose()

const tally = (keep) => {
  const out = {}
  for (const b of BUDGETS) {
    const ms = rows.filter((r) => r.kind === 'moves' && keep(r)).flatMap((r) => r.reads.find((x) => x.budget === b.id).moves)
    out[b.id] = {
      rejected: ms.filter((m) => m.verdict === 'rejected').length,
      rejectedCountedRight: ms.filter((m) => m.verdict === 'rejected' && m.right).length,
      rejectedInTopThree: ms.filter((m) => m.verdict === 'rejected' && m.inTopThree).length,
      preferredOrSound: ms.filter((m) => m.verdict !== 'rejected').length,
      preferredOrSoundCountedWrong: ms.filter((m) => m.verdict !== 'rejected' && !m.right).length,
    }
  }
  const held = rows
    .filter((r) => r.kind === 'moves' && keep(r))
    .flatMap((r) => r.reads[0].moves.map((m, j) => r.reads.every((x) => disagrees(x.moves[j]))))
  out.held = held.filter(Boolean).length
  return out
}

const evaluation = rows.find((r) => r.kind === 'evaluation')
const summary = {
  app: CHESS_DIR.split('/').pop(),
  budgets: BUDGETS.map((b) => ({ id: b.id, budget: b.ref, lines: b.lines })),
  margin: X.PLAN_QUIZ_MARGIN,
  positions: rows.filter((r) => r.kind === 'moves' && !r.later).length,
  twelve: tally((r) => !r.later),
  later: tally((r) => Boolean(r.later)),
  evaluation: evaluation ? { agreement: evaluation.agreement, words: evaluation.sides.map((s) => s.words) } : null,
}
writeFileSync(join(PRIVATE, 'capstones-rows.json'), JSON.stringify({ summary, rows }, null, 2) + '\n')
writeFileSync(join(resultsDir('book-advice'), 'capstones.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
