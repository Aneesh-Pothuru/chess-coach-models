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
const { PASS2_SHARE } = await chess('src/services/review/index.ts')
const { DESKTOP_KNPS, ACCEPT_WINDOW_WP } = await chess('src/services/engine/index.ts')
const { JUDGMENT_THRESHOLDS } = await chess('src/services/knowledge/index.ts')

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

// Added after the results were read; it tests nothing. Why the reviews part:
// on the plies both profiles gave the second look (the same position, nodes
// and candidates), whether the two looks reached the same depth or the same
// numbers and how far apart their losses are; for the serious errors they
// disagree on, the classes they flip between, how many have both losses
// within NEAR points of the mistake line, and how many either profile's own
// extra look at twice the nodes changed. And the phone against the desktop,
// the rule's shares, to see whether two device profiles that differ only in
// their sweep disagree as much.
const NEAR = 3
function readings(device) {
  let bothLooked = 0
  let sameDepth = 0
  let identical = 0
  let serious = 0
  let near = 0
  let unsettled = 0
  const gaps = []
  const flips = {}
  for (const c of cases) {
    const r = docOf('routine', c.id)
    const d = docOf(device, c.id)
    if (!r || !d) continue
    r.records.forEach((rr, i) => {
      const dd = d.records[i]
      const a = r.positions[i]?.deep
      const b = d.positions[i]?.deep
      if (rr.evidence === 'verified' && dd.evidence === 'verified' && a && b) {
        bothLooked++
        sameDepth += a.depth === b.depth
        identical += JSON.stringify([a.lines?.[0]?.move, a.lines?.[0]?.score, a.played]) === JSON.stringify([b.lines?.[0]?.move, b.lines?.[0]?.score, b.played])
        gaps.push(Math.abs(rr.lossPct - dd.lossPct))
      }
      if (isSerious(rr.cls, rr.judged) === isSerious(dd.cls, dd.judged)) return
      serious++
      const pair = `${rr.cls}/${dd.cls}`
      flips[pair] = (flips[pair] ?? 0) + 1
      near += [rr.lossPct, dd.lossPct].every((x) => Math.abs(x - JUDGMENT_THRESHOLDS.mistake) <= NEAR)
      unsettled += a?.stability === 'changed' || b?.stability === 'changed'
    })
  }
  gaps.sort((x, y) => x - y)
  const at = (q) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))] : null)
  return { bothLooked, sameDepth, identical, lossGap: { median: at(0.5), p90: at(0.9), max: gaps.at(-1) ?? null }, serious, flips, near, unsettled }
}
const devicePair = cases.map((c) => {
  const p = docOf('phone', c.id)
  const d = docOf('desktop', c.id)
  if (!p || !d) return null
  const g = { desktopSerious: 0, phoneSerious: 0, missed: 0, extra: 0 }
  d.records.forEach((dd, i) => {
    const pp = p.records[i]
    const ds = isSerious(dd.cls, dd.judged)
    const ps = isSerious(pp.cls, pp.judged)
    g.desktopSerious += ds
    g.phoneSerious += ps
    g.missed += ds && !ps
    g.extra += ps && !ds
  })
  return g
})
const posthoc = {
  near: NEAR,
  mistakeLine: JUDGMENT_THRESHOLDS.mistake,
  readings: Object.fromEntries(DEVICES.map((p) => [p, readings(p)])),
  phoneAgainstDesktop: { miss: ratio(devicePair, (g) => g.missed, (g) => g.desktopSerious), extra: ratio(devicePair, (g) => g.extra, (g) => g.phoneSerious) },
}

// The live coach's accept window, a fact about the code: the line that types
// its own window, and whether the file imports the review's.
const LIVE_COACH = 'src/services/livecoach/verdict.ts'
const liveCoach = readFileSync(join(CHESS_DIR, LIVE_COACH), 'utf8').split('\n')
const typedAt = liveCoach.findIndex((l) => /amongFine\s*=.*<=\s*3\b/.test(l))

const routineDoc = cases.map((c) => docOf('routine', c.id)).find(Boolean)
const out = {
  appCommit: CHESS_DIR.split('/').pop(),
  engine: routineDoc?.provenance?.build ?? null,
  app: { PASS2_SHARE, DESKTOP_KNPS, ACCEPT_WINDOW_WP, liveCoach: { file: LIVE_COACH, typedLine: typedAt >= 0 ? typedAt + 1 : null, importsAcceptWindow: liveCoach.some((l) => /ACCEPT_WINDOW_WP/.test(l)) } },
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
  posthoc,
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
  `## Why the reviews part (added after the results were read; it tests nothing)`,
  '',
  `| Profile | Plies both looked at twice | Same depth | Same numbers | Loss gap: median (90th percentile, largest) | Serious disagreements | Of them, both losses within ${NEAR} points of the ${posthoc.mistakeLine}-point mistake line | Of them, an extra look changed the verdict | Classes (routine/device) |`,
  '|---|---|---|---|---|---|---|---|---|',
  ...DEVICES.map((p) => {
    const x = posthoc.readings[p]
    const g = (v) => (v === null ? 'n/a' : v.toFixed(2))
    return `| ${p} | ${x.bothLooked} | ${x.sameDepth} | ${x.identical} | ${g(x.lossGap.median)} (${g(x.lossGap.p90)}, ${g(x.lossGap.max)}) | ${x.serious} | ${x.near} | ${x.unsettled} | ${Object.entries(x.flips).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')} |`
  }),
  '',
  `The phone against the desktop: the phone misses ${ci(posthoc.phoneAgainstDesktop.miss)} of the desktop's serious errors and adds ${ci(posthoc.phoneAgainstDesktop.extra)}.`,
  '',
]
writeFileSync(join(results_, 'compare.md'), md.join('\n'))
process.stderr.write(JSON.stringify(Object.fromEntries(DEVICES.map((p) => [p, { verdict: results[p].verdict, miss: results[p].miss.value, extra: results[p].extra.value }]))) + '\n')
