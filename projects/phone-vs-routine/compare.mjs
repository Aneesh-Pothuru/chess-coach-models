// The phone's, the desktop's and the routine's reviews of the same games,
// ply by ply, and the rule in README.md over them.
//
//   bridge/run.sh projects/phone-vs-routine/compare.mjs
//
// Reads accuracy-vs-chesscom's frozen cases and the documents its
// build-evidence.mjs wrote for each profile. Writes the shares the rule reads,
// their intervals, where each difference comes from and the verdicts to
// results/compare.json and results/compare.md; every differing ply, which
// names his games, goes to private/phone-vs-routine/differences.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { isSerious, isBlunder } = await chess('src/services/metrics/index.ts')

// The study's own parameters, as the README fixes them.
const LINE = 0.05
const DRAWS = 2000
const SEED = 20261014
const DEVICES = ['phone', 'desktop']

const evidence = join(privateDir('accuracy-vs-chesscom'), 'evidence')
const cases = JSON.parse(readFileSync(join(privateDir('accuracy-vs-chesscom'), 'cases.json'), 'utf8'))
const docOf = (profile, id) => {
  const f = join(evidence, profile, `${id}.json`)
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null
}
const timingOf = (profile) => {
  const f = join(evidence, profile, '_timing.jsonl')
  const out = new Map()
  if (existsSync(f)) for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const t = JSON.parse(line)
    out.set(t.id, t)
  }
  return out
}

/** mulberry32: a seeded generator, so the intervals do not wander between runs. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** A Poisson(1) draw (Knuth). */
function poisson1(rand) {
  const limit = Math.exp(-1)
  let k = 0
  let p = rand()
  while (p > limit) {
    k++
    p *= rand()
  }
  return k
}
const WEIGHTS = (() => {
  const rand = mulberry32(SEED)
  return Array.from({ length: DRAWS }, () => cases.map(() => poisson1(rand)))
})()

function percentile(xs, q) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!s.length) return null
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo)
}
/** A ratio of sums over games (num / den), with its bootstrap interval. */
function ratio(games, num, den) {
  const at = (w) => {
    let n = 0
    let d = 0
    games.forEach((g, i) => {
      if (!g) return
      n += w[i] * num(g)
      d += w[i] * den(g)
    })
    return d > 0 ? n / d : NaN
  }
  const draws = WEIGHTS.map(at)
  return { value: at(cases.map(() => 1)), lo: percentile(draws, 0.025), hi: percentile(draws, 0.975), num: games.reduce((s, g) => s + (g ? num(g) : 0), 0), den: games.reduce((s, g) => s + (g ? den(g) : 0), 0) }
}

const routineTiming = timingOf('routine')
const differences = []
const skipped = {}
const results = {}
for (const device of DEVICES) {
  const timing = timingOf(device)
  const games = cases.map((c) => {
    const r = docOf('routine', c.id)
    const d = docOf(device, c.id)
    if (!r || !d) {
      skipped[`${device}: a document missing`] = (skipped[`${device}: a document missing`] ?? 0) + 1
      return null
    }
    if (r.records.length !== d.records.length || r.records.some((x, i) => x.san !== d.records[i].san)) throw new Error(`${c.id}: the ${device} and routine documents are not the same game`)
    const g = { plies: r.records.length, routineSerious: 0, deviceSerious: 0, missed: 0, extra: 0, routineBlunders: 0, deviceBlunders: 0, missedBlunders: 0, extraBlunders: 0, routineInacc: 0, deviceInacc: 0, missedInacc: 0, extraInacc: 0, differ: 0, missedVerified: 0, missedSweep: 0, extraVerified: 0, extraSweep: 0, missedTablebase: 0, extraTablebase: 0, deviceLooks: timing.get(c.id)?.verified ?? null, deviceFlags: timing.get(c.id)?.flagged ?? null, routineLooks: routineTiming.get(c.id)?.verified ?? null, accuracy: [] }
    r.records.forEach((rr, i) => {
      const dd = d.records[i]
      const rs = isSerious(rr.cls, rr.judged)
      const ds = isSerious(dd.cls, dd.judged)
      const rb = isBlunder(rr.cls, rr.judged)
      const db = isBlunder(dd.cls, dd.judged)
      const ri = rr.cls === 'inaccuracy'
      const di = dd.cls === 'inaccuracy'
      g.routineSerious += rs
      g.deviceSerious += ds
      g.routineBlunders += rb
      g.deviceBlunders += db
      g.missedBlunders += rb && !db
      g.extraBlunders += db && !rb
      g.routineInacc += ri
      g.deviceInacc += di
      g.missedInacc += ri && !di
      g.extraInacc += di && !ri
      g.differ += rr.cls !== dd.cls
      const kind = rs && !ds ? 'missed' : ds && !rs ? 'extra' : null
      if (!kind) return
      g[kind]++
      if (dd.evidence === 'verified') g[`${kind}Verified`]++
      else g[`${kind}Sweep`]++
      if (rr.tablebase) g[`${kind}Tablebase`]++
      differences.push({ game: c.id, device, kind, ply: rr.ply, san: rr.san, mover: rr.mover, routine: { cls: rr.cls, lossPct: rr.lossPct, evidence: rr.evidence, tablebase: rr.tablebase ?? null }, [device]: { cls: dd.cls, lossPct: dd.lossPct, evidence: dd.evidence } })
    })
    for (const side of ['white', 'black']) if (Number.isFinite(d[side]?.accuracy) && Number.isFinite(r[side]?.accuracy)) g.accuracy.push(d[side].accuracy - r[side].accuracy)
    return g
  })
  const sum = (key) => games.reduce((s, g) => s + (g ? g[key] ?? 0 : 0), 0)
  const miss = ratio(games, (g) => g.missed, (g) => g.routineSerious)
  const extra = ratio(games, (g) => g.extra, (g) => g.deviceSerious)
  const known = [miss.lo, miss.hi, extra.lo, extra.hi].every(Number.isFinite)
  const verdict = !known ? 'no data' : miss.hi < LINE && extra.hi < LINE ? 'agrees' : miss.lo > LINE || extra.lo > LINE ? 'differs' : 'unclear'
  const sides = games.flatMap((g) => (g ? g.accuracy : []))
  results[device] = {
    games: games.filter(Boolean).length,
    plies: sum('plies'),
    serious: { routine: sum('routineSerious'), device: sum('deviceSerious'), both: sum('routineSerious') - sum('missed') },
    miss, extra, verdict,
    blunders: { routine: sum('routineBlunders'), device: sum('deviceBlunders'), miss: ratio(games, (g) => g.missedBlunders, (g) => g.routineBlunders), extra: ratio(games, (g) => g.extraBlunders, (g) => g.deviceBlunders) },
    inaccuracies: { routine: sum('routineInacc'), device: sum('deviceInacc'), miss: ratio(games, (g) => g.missedInacc, (g) => g.routineInacc), extra: ratio(games, (g) => g.extraInacc, (g) => g.deviceInacc) },
    differ: ratio(games, (g) => g.differ, (g) => g.plies),
    where: {
      missed: { verified: sum('missedVerified'), sweep: sum('missedSweep'), routineTablebase: sum('missedTablebase') },
      extra: { verified: sum('extraVerified'), sweep: sum('extraSweep'), routineTablebase: sum('extraTablebase') },
    },
    looks: { device: sum('deviceLooks'), deviceFlags: sum('deviceFlags'), routine: sum('routineLooks') },
    accuracy: { sides: sides.length, bias: sides.reduce((s, x) => s + x, 0) / Math.max(sides.length, 1), mae: sides.reduce((s, x) => s + Math.abs(x), 0) / Math.max(sides.length, 1), largest: sides.reduce((m, x) => Math.max(m, Math.abs(x)), 0) },
  }
}

const routineDoc = cases.map((c) => docOf('routine', c.id)).find(Boolean)
const out = {
  appCommit: CHESS_DIR.split('/').pop(),
  engine: routineDoc?.provenance?.build ?? null,
  budgets: Object.fromEntries(['phone', 'desktop', 'routine'].map((p) => {
    const d = cases.map((c) => docOf(p, c.id)).find(Boolean)
    return [p, d ? { sweepNodes: d.provenance.scanNodes, verifyNodes: d.provenance.verifyNodes, tablebase: d.provenance.tablebase } : null]
  })),
  cases: cases.length,
  line: LINE,
  draws: DRAWS,
  seed: SEED,
  skipped,
  results,
}
const results_ = resultsDir('phone-vs-routine')
writeFileSync(join(results_, 'compare.json'), JSON.stringify(out, null, 2) + '\n')
writeFileSync(join(privateDir('phone-vs-routine'), 'differences.json'), JSON.stringify(differences, null, 2) + '\n')

const pct = (x) => (x === null || !Number.isFinite(x) ? 'n/a' : `${(100 * x).toFixed(1)}%`)
const ci = (r) => `${pct(r.value)} (${pct(r.lo)} to ${pct(r.hi)}; ${r.num} of ${r.den})`
const md = [
  '# Phone against routine: results',
  '',
  `Written by \`compare.mjs\` on the app at \`${out.appCommit}\` (${out.engine}). ${out.cases} games; intervals are 95% from ${DRAWS} bootstrap draws over games.`,
  '',
  '| Profile | Sweep nodes | Second looks (flags) | Serious, routine | Serious, device | Miss share | Extra share | Verdict |',
  '|---|---|---|---|---|---|---|---|',
  ...DEVICES.map((p) => {
    const r = results[p]
    return `| ${p} | ${out.budgets[p]?.sweepNodes ?? 'n/a'} | ${r.looks.device} (${r.looks.deviceFlags}) | ${r.serious.routine} | ${r.serious.device} | ${ci(r.miss)} | ${ci(r.extra)} | ${r.verdict} |`
  }),
  '',
  `The routine: ${out.budgets.routine?.sweepNodes ?? 'n/a'} nodes a position, ${results.phone.looks.routine} second looks.`,
  '',
  '| Profile | Blunders missed | Blunders extra | Inaccuracies missed | Inaccuracies extra | Plies whose class differs | Accuracy bias (MAE, largest) |',
  '|---|---|---|---|---|---|---|',
  ...DEVICES.map((p) => {
    const r = results[p]
    return `| ${p} | ${ci(r.blunders.miss)} | ${ci(r.blunders.extra)} | ${ci(r.inaccuracies.miss)} | ${ci(r.inaccuracies.extra)} | ${ci(r.differ)} | ${r.accuracy.bias.toFixed(2)} (${r.accuracy.mae.toFixed(2)}, ${r.accuracy.largest.toFixed(2)}) over ${r.accuracy.sides} sides |`
  }),
  '',
  '## Where the differences come from',
  '',
  '| Profile | Missed: second look | Missed: sweep only | Missed: routine read the tablebase | Extra: second look | Extra: sweep only | Extra: routine read the tablebase |',
  '|---|---|---|---|---|---|---|',
  ...DEVICES.map((p) => {
    const w = results[p].where
    return `| ${p} | ${w.missed.verified} | ${w.missed.sweep} | ${w.missed.routineTablebase} | ${w.extra.verified} | ${w.extra.sweep} | ${w.extra.routineTablebase} |`
  }),
  '',
]
writeFileSync(join(results_, 'compare.md'), md.join('\n'))
process.stderr.write(JSON.stringify(Object.fromEntries(DEVICES.map((p) => [p, { verdict: results[p].verdict, miss: results[p].miss.value, extra: results[p].extra.value }]))) + '\n')
