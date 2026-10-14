// The rule in README.md over the rows replay.mjs wrote: round 1's two
// verdicts on the rebuilt record (whether the headline rating's solve chances
// are calibrated within the noise, and whether the view of a set's own channel
// predicts his first tries better on both halves of the days), how the misses
// sit on the memory cards that record was rebuilt from, and the same looks on
// the profile as the app holds it.
//
//   bridge/run.sh projects/learner-solve-chance/fit.mjs
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { solveChance } = await chess('src/services/learner/index.ts')

const SEED = 7
const B = 1000
const EPS = 1e-6
const BINS = [0.5, 0.6, 0.7, 0.8, 0.9]
const SHIFTS = []
for (let d = -500; d <= 500; d += 5) SHIFTS.push(d)

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const quantile = (sorted, q) => sorted[Math.round(q * (sorted.length - 1))]
// As the learner's self-check scores a prediction.
const ll = (p, s) => -(s * Math.log(Math.max(EPS, p)) + (1 - s) * Math.log(Math.max(EPS, 1 - p)))
const brier = (p, s) => (p - s) ** 2
const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length

const dir = privateDir('learner-solve-chance')
const rows = fs.readFileSync(join(dir, 'rows.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const state = JSON.parse(fs.readFileSync(join(dir, 'state.json'), 'utf8'))

/** Rows grouped by day, days in time order. */
function byDay(set) {
  const m = new Map()
  for (const r of set) m.set(r.day, [...(m.get(r.day) ?? []), r])
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, rs]) => ({ day, rows: rs }))
}

/** The mean of f over the rows, and its 95% interval over bootstrap draws of the days. */
function meanInterval(days, f) {
  const parts = days.map((d) => ({ sum: d.rows.reduce((a, r) => a + f(r), 0), n: d.rows.length }))
  const value = parts.reduce((a, p) => a + p.sum, 0) / parts.reduce((a, p) => a + p.n, 0)
  const rng = mulberry32(SEED)
  const draws = []
  for (let b = 0; b < B; b++) {
    let s = 0, n = 0
    for (let t = 0; t < parts.length; t++) { const p = parts[Math.floor(rng() * parts.length)]; s += p.sum; n += p.n }
    draws.push(s / n)
  }
  draws.sort((a, b) => a - b)
  return { value, interval: [quantile(draws, 0.025), quantile(draws, 0.975)] }
}

/** Share solved minus mean chance. */
const gapOf = (days, key) => meanInterval(days, (r) => r.s - r[key])
/** Mean log loss of `a` minus that of `b`. */
const llDiff = (days, a, b) => meanInterval(days, (r) => ll(r[a], r.s) - ll(r[b], r.s))
const KEYS = ['head', 'view', 'run']
const scores = (set) => Object.fromEntries(KEYS.map((k) => [k, { brier: mean(set.map((r) => brier(r[k], r.s))), logLoss: mean(set.map((r) => ll(r[k], r.s))) }]))

function reliability(set, key) {
  const edges = [0, ...BINS, 1.0000001]
  return edges.slice(0, -1).map((lo, i) => {
    const inBin = set.filter((r) => r[key] >= lo && r[key] < edges[i + 1])
    return { from: lo, to: Math.min(1, edges[i + 1]), n: inBin.length, chance: inBin.length ? mean(inBin.map((r) => r[key])) : null, solved: inBin.length ? mean(inBin.map((r) => r.s)) : null }
  })
}

/** The shift taken off every item's rating that best fits an estimate's chances, and its interval over the days. */
function bestShift(days, ratingKey) {
  const perDay = days.map((d) =>
    SHIFTS.map((sh) => d.rows.reduce((a, r) => a - ll(solveChance({ rating: r[ratingKey], rd: 0, volatility: 0 }, r.difficulty - sh, r.rd), r.s), 0)),
  )
  const argmax = (sum) => {
    let bi = 0
    sum.forEach((v, i) => { if (v > sum[bi] || (v === sum[bi] && Math.abs(SHIFTS[i]) < Math.abs(SHIFTS[bi]))) bi = i })
    return SHIFTS[bi]
  }
  const rng = mulberry32(SEED)
  const draws = []
  for (let b = 0; b < B; b++) {
    const sum = SHIFTS.map(() => 0)
    for (let t = 0; t < perDay.length; t++) { const d = perDay[Math.floor(rng() * perDay.length)]; for (let i = 0; i < sum.length; i++) sum[i] += d[i] }
    draws.push(argmax(sum))
  }
  draws.sort((a, b) => a - b)
  return { shift: argmax(SHIFTS.map((_, i) => perDay.reduce((a, d) => a + d[i], 0))), interval: [quantile(draws, 0.025), quantile(draws, 0.975)], edge: [SHIFTS[0], SHIFTS[SHIFTS.length - 1]] }
}

function perBucket(set) {
  return [...new Set(set.map((r) => r.bucket))].sort().map((b) => {
    const rs = set.filter((r) => r.bucket === b)
    return { bucket: b, n: rs.length, solved: mean(rs.map((r) => r.s)), head: mean(rs.map((r) => r.head)), view: mean(rs.map((r) => r.view)), difficulty: mean(rs.map((r) => r.difficulty)) }
  })
}

/** Everything the README reports beside the verdicts, for one record. */
function looks(set) {
  const days = byDay(set)
  return {
    attempts: set.length,
    days: days.length,
    dayRange: [days[0].day, days[days.length - 1].day],
    solved: mean(set.map((r) => r.s)),
    misses: set.filter((r) => r.s === 0).length,
    headline: { meanChance: mean(set.map((r) => r.head)), gap: gapOf(days, 'head') },
    view: { meanChance: mean(set.map((r) => r.view)), gap: gapOf(days, 'view') },
    run: { meanChance: mean(set.map((r) => r.run)) },
    scores: scores(set),
    candidate: llDiff(days, 'view', 'head'),
    reliability: { head: reliability(set, 'head'), view: reliability(set, 'view') },
    buckets: perBucket(set),
    shift: { head: bestShift(days, 'headRating'), view: bestShift(days, 'viewRating') },
  }
}

// ---------------------------------------------------------------- round 1, on the rebuilt record
const R = rows.filter((r) => r.record === 'rebuilt')
const days = byDay(R)
const halves = [days.filter((_, i) => i % 2 === 0), days.filter((_, i) => i % 2 === 1)]
const headGap = gapOf(days, 'head')
const verdict1 = headGap.interval[0] > 0 ? 'under-predicts' : headGap.interval[1] < 0 ? 'over-predicts' : 'calibrated'
const halfTests = halves.map((h) => {
  const rs = h.flatMap((d) => d.rows)
  return { days: h.length, attempts: rs.length, head: mean(rs.map((r) => ll(r.head, r.s))), view: mean(rs.map((r) => ll(r.view, r.s))), ...llDiff(h, 'view', 'head') }
})
const passes = halfTests.every((t) => t.value < 0 && t.interval[1] < 0)

const held = rows.filter((r) => r.record === 'held')
const report = {
  app: state.app,
  seed: SEED,
  draws: B,
  record: {
    cards: state.checks.cards,
    once: state.checks.once,
    more: state.checks.more,
    fromEvents: state.checks.fromEvents,
    rebuilt: state.checks.rebuilt,
    log: state.log,
    firstTries: state.shape.firstTries,
    firstTriesByBucket: state.shape.firstTriesByBucket,
    span: state.shape.span,
    heldPuzzleTotals: state.shape.heldPuzzleTotals,
    lastAttempt: state.shape.lastAttempt,
  },
  // A miss comes back as a redemption card, so the cards reviewed once, the
  // only ones round 1's record keeps, hold almost none of the misses.
  selection: state.selection,
  round1: { verdict1: { gap: headGap, verdict: verdict1 }, verdict2: { halves: halfTests, passes }, looks: looks(R) },
  held: looks(held),
  selfCheck: state.selfCheck,
  today: state.today,
}

// ---------------------------------------------------------------- the report
const f3 = (x) => (x === null ? 'n/a' : x.toFixed(3))
const pct = (x) => (x === null ? 'n/a' : (100 * x).toFixed(1) + '%')
const pp = (x) => (x >= 0 ? '+' : '') + (100 * x).toFixed(1)
const iv = (i, f = pp) => `${f(i[0])} to ${f(i[1])}`
const sel = report.selection
const H = report.held
const shiftText = (s) => `${s.shift} (${s.interval[0]} to ${s.interval[1]}${s.interval.includes(s.edge[1]) || s.interval.includes(s.edge[0]) ? ', at the grid\'s edge' : ''})`
const lookTables = (L) => [
  '| Estimate | Mean chance | Brier | Log loss |',
  '|---|---:|---:|---:|',
  ...KEYS.map((k) => `| ${{ head: 'Headline rating', view: 'View of the channel', run: 'Running rate' }[k]} | ${pct(L[k === 'head' ? 'headline' : k].meanChance)} | ${f3(L.scores[k].brier)} | ${f3(L.scores[k].logLoss)} |`),
  '',
  '| Solve chance | Headline: attempts | mean chance | solved | View: attempts | mean chance | solved |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...L.reliability.head.map((b, i) => {
    const v = L.reliability.view[i]
    return `| ${b.from.toFixed(1)} to ${b.to.toFixed(1)} | ${b.n} | ${pct(b.chance)} | ${pct(b.solved)} | ${v.n} | ${pct(v.chance)} | ${pct(v.solved)} |`
  }),
  '',
  '| Bucket | Scored | Mean rating | Solved | Headline\'s chance | View\'s chance |',
  '|---|---:|---:|---:|---:|---:|',
  ...L.buckets.map((b) => `| ${b.bucket} | ${b.n} | ${Math.round(b.difficulty)} | ${pct(b.solved)} | ${pct(b.head)} | ${pct(b.view)} |`),
]
const md = [
  '# The learner\'s solve chances: results',
  '',
  `Written by fit.mjs. App commit ${state.app}. Bootstrap: ${B} draws over days, seed ${SEED}.`,
  '',
  '## Round 1, on the rebuilt record',
  '',
  `His puzzle first tries rebuilt from ${report.record.cards} memory cards: the ${report.record.once} reviewed once (${report.record.fromEvents} of them with the app's own event), ${report.record.firstTries} first tries from ${report.record.span.from} to ${report.record.span.to}; ${R.length} scored on ${days.length} days. The ${report.record.more} cards reviewed more than once are left out.`,
  '',
  `**Verdict 1, as computed.** He solved ${pct(report.round1.looks.solved)} of the scored first tries; the headline rating's mean solve chance was ${pct(report.round1.looks.headline.meanChance)}, a gap of ${pp(headGap.value)} points (95% interval ${iv(headGap.interval)}): by the rule, the headline ${verdict1 === 'calibrated' ? 'is calibrated within the noise' : verdict1}.`,
  '',
  `**Verdict 2, as computed.** Mean log loss per attempt, the view of the set's own channel against the headline: ${halfTests.map((t, i) => `half ${i + 1} (${t.days} days, ${t.attempts} attempts) ${f3(t.view)} against ${f3(t.head)}, a difference of ${f3(t.value)} (95% interval ${f3(t.interval[0])} to ${f3(t.interval[1])})`).join('; ')}. By the rule, ${passes ? 'both halves pass' : 'it does not pass'}.`,
  '',
  `**Neither verdict stands.** A miss comes back as a redemption card, so a card reviewed once is nearly always a solve: the ${sel.once.cards} cards reviewed once hold ${sel.once.fails} miss${sel.once.fails === 1 ? '' : 'es'}, the ${sel.more.cards} reviewed more than once hold ${sel.more.fails} on ${sel.more.withFail} cards. Leaving those cards out kept his solves and dropped his misses, which is the outcome the rule measures.`,
  '',
  '## The profile as the app holds it',
  '',
  `The legacy log, the puzzle totals as the seed and the events, as the app folds them: ${H.attempts} scored attempts on ${H.days} days (${H.dayRange[0]} to ${H.dayRange[1]}), ${H.misses} misses, ${pct(H.solved)} solved. Every attempt in this record was logged when it was played, so nothing in it selects on the result. Named before the run, deciding nothing.`,
  '',
  `The headline's mean solve chance was ${pct(H.headline.meanChance)} (gap ${pp(H.headline.gap.value)}, 95% interval ${iv(H.headline.gap.interval)}); the view's ${pct(H.view.meanChance)} (gap ${pp(H.view.gap.value)}, ${iv(H.view.gap.interval)}). The view's log loss minus the headline's: ${f3(H.candidate.value)} (${f3(H.candidate.interval[0])} to ${f3(H.candidate.interval[1])}). The shift that best fits the headline's chances takes ${shiftText(H.shift.head)} points off every item's rating; the view's, ${shiftText(H.shift.view)}.`,
  '',
  ...lookTables(H),
  '',
  `The learner's own self-check on this profile: ${report.selfCheck.n} held-out attempts, Brier ${report.selfCheck.brier} against ${report.selfCheck.baseline.brier} for its constant, log loss ${report.selfCheck.logLoss} against ${report.selfCheck.baseline.logLoss}; mean predicted ${report.selfCheck.meanPredicted}, observed ${report.selfCheck.meanObserved}.`,
  '',
  '## What each estimate would aim a set at today',
  '',
  '| Bucket | Phase | Headline | Its target | Themed view | Its target | Hardest in the bank |',
  '|---|---|---:|---:|---:|---:|---:|',
  ...report.today.map((t) => `| ${t.bucket} | ${t.phase} | ${t.head.rating} ± ${t.head.rd} | ${t.head.target} | ${t.view ? `${t.view.rating} ± ${t.view.rd} (n=${t.view.n})` : 'none'} | ${t.view ? t.view.target : 'n/a'} | ${t.bankMax} |`),
  '',
  '## Round 1\'s rebuilt record, for completeness',
  '',
  ...lookTables(report.round1.looks),
  '',
]
const out = resultsDir('learner-solve-chance')
fs.writeFileSync(join(out, 'solve.json'), JSON.stringify(report, null, 1) + '\n')
fs.writeFileSync(join(out, 'solve.md'), md.join('\n'))
console.log(md.join('\n'))
