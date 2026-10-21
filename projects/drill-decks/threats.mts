// What his opponent threatened in the misses deck's positions: each position
// searched as he faced it and with the move passed to the opponent, by the
// rules in the README.
//
//   bridge/run.sh projects/drill-decks/threats.mts [--pool 4] [--limit N]
//
// Writes results/threats.json (counts only); the per-item rows, which carry the
// deck's ids, go to private/drill-decks/.
import fs from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Chess } from 'chess.js'
import { CHESS_DIR, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { GAIN, MATE, classify, uciMove, walk } from './lib.mts'

const load = (rel: string) => import(pathToFileURL(join(CHESS_DIR, rel)).href)
const K = await load('src/services/knowledge/index.ts')
const C = await load('src/core/chess/index.ts')
const Sc = await load('src/core/score/index.ts')
const S = await load('src/services/exercises/index.ts')
const E = await load('src/adapters/node/engine/index.ts')

const arg = (name: string, d: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : d
}
const POOL = arg('pool', 4)
const LIMIT = arg('limit', Infinity)
/** The routine's punish search: the budget behind every move the app names. */
const BUDGET = 'best'

const deck: any[] = JSON.parse(fs.readFileSync(join(CHESS_DIR, 'public/coach/mistake-deck.json'), 'utf8'))
const items = deck
  .filter((m) => m.kind !== 'deviation')
  .slice(0, LIMIT)
  .map((it) => ({ it, me: new Chess(it.fen).turn() as 'w' | 'b', passed: K.flipTurn(it.fen) as string | null }))

// Every position searched once: as he faced it, and passed.
const fens = [...new Set(items.flatMap((x) => (x.passed ? [x.it.fen, x.passed] : [x.it.fen])))]
const engine = E.createNodeEngine({ root: CHESS_DIR, pool: POOL, tablebase: false, evalCache: false, human: false })
const t0 = Date.now()
let done = 0
const settled = await Promise.allSettled(
  fens.map((fen) =>
    engine.evaluate(C.position(fen), BUDGET, { priority: 'batch' }).finally(() => {
      if (++done % 200 === 0) console.error(`${done}/${fens.length} searches, ${((Date.now() - t0) / 1000).toFixed(0)} s`)
    }),
  ),
)
engine.dispose()
const reading = new Map<string, any>()
let failed = 0
fens.forEach((fen, i) => {
  const s = settled[i]
  if (s.status === 'fulfilled' && s.value.eval) reading.set(fen, s.value)
  else failed++
})
const budget = settled.find((s) => s.status === 'fulfilled')?.value.budget ?? null

const rows: any[] = []
for (const { it, me, passed } of items) {
  const cell = classify(it)
  const opp = me === 'w' ? 'b' : 'w'
  const gate = K.readThreatGate(it.fen, me)
  const here = reading.get(it.fen) ?? null
  const there = passed ? (reading.get(passed) ?? null) : null
  let threatened: boolean | null = null
  let threat: 'mate' | 'material' | 'none' | null = null
  let passCost: number | null = null
  if (there) {
    const line = there.pv.length ? walk(passed!, there.pv.map(uciMove), opp) : null
    const mates = Sc.povCp(there.eval, me) <= -MATE || (line !== null && line.mate && line.mated === me)
    const wins = !mates && line !== null && line.delta >= GAIN
    threatened = mates || wins
    threat = mates ? 'mate' : wins ? 'material' : 'none'
    if (here) passCost = Sc.winPercentFor(here.eval, me) - Sc.winPercentFor(there.eval, me)
  }
  const quiet = cell.best === 'holds' && cell.played === 'other' && threatened === false
  let quiz: boolean | null = null
  if (quiet) {
    const top = [...it.options].sort((a: any, b: any) => b.eval - a.eval).slice(0, 3)
    quiz =
      top.length === 3 &&
      top.filter((_: any, i: number) => S.planCorrect({ options: top }, i)).length === 1 &&
      !/[x+#]/.test(top[0].move) &&
      top[0].eval - top[1].eval < 200
  }
  rows.push({
    id: it.id,
    theme: it.theme,
    cell: `${cell.best}/${cell.played}`,
    shape: cell.shape,
    inCheck: passed === null,
    threatened,
    threat,
    passCost,
    gate: gate.prompt !== null,
    gateHanging: gate.hanging.length > 0,
    gateF7: gate.f7 !== null,
    gateMate: gate.mateThreats.length > 0,
    quiet,
    quiz,
    wpDrop: it.wpDrop ?? null,
  })
}

const q = (xs: Array<number | null>, p: number) => {
  const s = xs.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}
/** One group's readings: threatened, the gate, and the gate against the search. */
function summarize(rs: any[]) {
  const searched = rs.filter((r) => r.threatened !== null)
  const t = searched.filter((r) => r.threatened)
  const tp = searched.filter((r) => r.threatened && r.gate).length
  const fp = searched.filter((r) => !r.threatened && r.gate).length
  const fn = searched.filter((r) => r.threatened && !r.gate).length
  return {
    items: rs.length,
    inCheck: rs.filter((r) => r.inCheck).length,
    searched: searched.length,
    threatened: t.length,
    mate: t.filter((r) => r.threat === 'mate').length,
    material: t.filter((r) => r.threat === 'material').length,
    gate: rs.filter((r) => r.gate).length,
    gateOnSearched: { tp, fp, fn, tn: searched.length - tp - fp - fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null },
    passCost: { p25: q(rs.map((r) => r.passCost), 0.25), median: q(rs.map((r) => r.passCost), 0.5), p75: q(rs.map((r) => r.passCost), 0.75) },
    passCostThreatened: q(t.map((r) => r.passCost), 0.5),
    passCostNot: q(searched.filter((r) => !r.threatened).map((r) => r.passCost), 0.5),
  }
}
const groupBy = (key: (r: any) => string) => {
  const out: Record<string, any> = {}
  for (const k of [...new Set(rows.map(key))]) out[k] = summarize(rows.filter((r) => key(r) === k))
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].items - a[1].items))
}
const quiet = rows.filter((r) => r.quiet)
const out = {
  project: 'drill-decks',
  app: (await import('node:child_process')).execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  budget,
  items: rows.length,
  searches: fens.length,
  failed,
  all: summarize(rows),
  byCell: groupBy((r) => r.cell),
  byShape: groupBy((r) => r.shape),
  byTheme: groupBy((r) => r.theme),
  quiet: { items: quiet.length, quiz: quiet.filter((r) => r.quiz).length, byTheme: Object.fromEntries([...new Set(quiet.map((r) => r.theme))].map((t) => [t, { items: quiet.filter((r) => r.theme === t).length, quiz: quiet.filter((r) => r.theme === t && r.quiz).length }])) },
}
fs.writeFileSync(join(resultsDir('drill-decks'), 'threats.json'), JSON.stringify(out, null, 1) + '\n')
fs.writeFileSync(join(privateDir('drill-decks'), 'threats-rows.json'), JSON.stringify(rows))
console.error(`threats: ${rows.length} positions, ${fens.length} searches (${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
