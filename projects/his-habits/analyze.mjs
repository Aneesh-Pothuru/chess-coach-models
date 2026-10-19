import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { CONTROL, DRAWS, KAPPA_RANGE, KINDS, LICHESS_BANDS, MIN_COUNT, PROJECT, SEED, argOf, gitCommit, mulberry32, readJsonl } from './lib.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url))
const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const partial = process.argv.includes('--partial')
const K = KINDS.length
const HALVES = [0, 1]
const PHASES = ['middlegame', 'endgame']
const bit = (k) => 1 << k
const zeros = () => new Float64Array(K)

const rowsOf = (prefix) =>
  readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && /-of-\d+\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(dir, f)))

const hisRows = rowsOf('his').sort((a, b) => a.id - b.id)
const lichessRows = rowsOf('lichess').sort((a, b) => a.k - b.k)
const positionsSummary = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'positions.json'), 'utf8'))
const lichessSummary = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'lichess.json'), 'utf8'))
if (!partial && hisRows.length !== positionsSummary.positions) throw new Error(`his rows ${hisRows.length} of ${positionsSummary.positions}`)
if (!partial && lichessRows.length !== lichessSummary.playerGames) throw new Error(`lichess rows ${lichessRows.length} of ${lichessSummary.playerGames}`)

const games = new Map()
for (const r of hisRows) {
  let g = games.get(r.gi)
  if (!g) {
    g = {
      gi: r.gi,
      half: r.half,
      plusBand: r.plusBand,
      hisBand: r.hisBand,
      n: 0,
      N: zeros(),
      NS: zeros(),
      eRaw: zeros(),
      eHisRaw: zeros(),
      phase: Object.fromEntries(PHASES.map((p) => [p, { n: 0, N: zeros(), eRaw: zeros() }])),
      over: { sum: zeros(), cnt: zeros() },
      under: { sum: zeros(), cnt: zeros() },
      ref: { sum: zeros(), cnt: zeros() },
      agreeT: 0,
      agreeHis: 0,
      diff: 0,
      diffSum: 0,
    }
    games.set(r.gi, g)
  }
  if (g.plusBand !== r.plusBand || g.half !== r.half) throw new Error(`game ${r.gi} changes band or half`)
  g.n++
  const D = r.P === r.T ? 0 : r.wpT - r.wpP
  if (r.P === r.T) g.agreeT++
  else {
    g.diff++
    g.diffSum += D
  }
  if (r.P === r.topHis) g.agreeHis++
  const ph = g.phase[r.phase]
  if (ph) ph.n++
  for (let k = 0; k < K; k++) {
    const inP = (r.maskP & bit(k)) !== 0
    const inT = (r.maskT & bit(k)) !== 0
    const inS = (r.maskS & bit(k)) !== 0
    if (inP) g.N[k]++
    if (inS) g.NS[k]++
    g.eRaw[k] += r.ePlus[k]
    g.eHisRaw[k] += r.eHis[k]
    if (ph) {
      if (inP) ph.N[k]++
      ph.eRaw[k] += r.ePlus[k]
    }
    if (inP && !inT) {
      g.over.sum[k] += D
      g.over.cnt[k]++
    }
    if (inT && !inP) {
      g.under.sum[k] += D
      g.under.cnt[k]++
    }
    if (r.P !== r.T && !inP && !inT) {
      g.ref.sum[k] += D
      g.ref.cnt[k]++
    }
  }
}
const gameList = [...games.values()]
const byHalf = HALVES.map((h) => gameList.filter((g) => g.half === h))

const units = new Map(LICHESS_BANDS.map((b) => [b, []]))
let lichessPositions = 0
for (const r of lichessRows) {
  if (r.positions.length === 0) continue
  const u = { band: r.band, n: r.positions.length, N: zeros(), E: zeros() }
  for (const p of r.positions) {
    lichessPositions++
    for (let k = 0; k < K; k++) {
      if (p.maskReal & bit(k)) u.N[k]++
      u.E[k] += p.e[k]
    }
  }
  units.get(r.band).push(u)
}

const bandIndex = new Map(LICHESS_BANDS.map((b, i) => [b, i]))
for (const g of gameList) {
  if (!bandIndex.has(g.plusBand) || !bandIndex.has(g.hisBand)) throw new Error(`game ${g.gi} has a band outside the Lichess sample`)
}

function kappaOf(sumN, sumE) {
  const B = LICHESS_BANDS.length
  const pooledN = zeros()
  const pooledE = zeros()
  for (let b = 0; b < B; b++) {
    for (let k = 0; k < K; k++) {
      pooledN[k] += sumN[b][k]
      pooledE[k] += sumE[b][k]
    }
  }
  return LICHESS_BANDS.map((_, b) => {
    const kap = zeros()
    for (let k = 0; k < K; k++) kap[k] = sumE[b][k] >= MIN_COUNT ? sumN[b][k] / sumE[b][k] : pooledN[k] / pooledE[k]
    return kap
  })
}

function lichessSums(pick) {
  const sumN = LICHESS_BANDS.map(() => zeros())
  const sumE = LICHESS_BANDS.map(() => zeros())
  LICHESS_BANDS.forEach((band, b) => {
    for (const u of pick(units.get(band))) {
      for (let k = 0; k < K; k++) {
        sumN[b][k] += u.N[k]
        sumE[b][k] += u.E[k]
      }
    }
  })
  return { sumN, sumE }
}

function halfStats(list, kappa) {
  const B = LICHESS_BANDS.length
  const N = zeros()
  const NS = zeros()
  const eRaw = zeros()
  const eHisRaw = zeros()
  const ePlusBand = LICHESS_BANDS.map(() => zeros())
  const eHisBand = LICHESS_BANDS.map(() => zeros())
  const over = { sum: zeros(), cnt: zeros() }
  const under = { sum: zeros(), cnt: zeros() }
  const ref = { sum: zeros(), cnt: zeros() }
  let n = 0
  let agreeT = 0
  let agreeHis = 0
  let diff = 0
  let diffSum = 0
  for (const g of list) {
    n += g.n
    agreeT += g.agreeT
    agreeHis += g.agreeHis
    diff += g.diff
    diffSum += g.diffSum
    const pb = bandIndex.get(g.plusBand)
    const hb = bandIndex.get(g.hisBand)
    for (let k = 0; k < K; k++) {
      N[k] += g.N[k]
      NS[k] += g.NS[k]
      eRaw[k] += g.eRaw[k]
      eHisRaw[k] += g.eHisRaw[k]
      ePlusBand[pb][k] += g.eRaw[k]
      eHisBand[hb][k] += g.eHisRaw[k]
      over.sum[k] += g.over.sum[k]
      over.cnt[k] += g.over.cnt[k]
      under.sum[k] += g.under.sum[k]
      under.cnt[k] += g.under.cnt[k]
      ref.sum[k] += g.ref.sum[k]
      ref.cnt[k] += g.ref.cnt[k]
    }
  }
  const E = zeros()
  const EHis = zeros()
  for (let b = 0; b < B; b++) {
    for (let k = 0; k < K; k++) {
      E[k] += kappa[b][k] * ePlusBand[b][k]
      EHis[k] += kappa[b][k] * eHisBand[b][k]
    }
  }
  const per = (f) => Array.from({ length: K }, (_, k) => f(k))
  const mean = (s, c, k) => (c[k] > 0 ? s[k] / c[k] : null)
  return {
    games: list.length,
    n,
    N: [...N],
    E: [...E],
    eRaw: [...eRaw],
    R: per((k) => (E[k] > 0 ? N[k] / E[k] : null)),
    Rraw: per((k) => (eRaw[k] > 0 ? N[k] / eRaw[k] : null)),
    Rhis: per((k) => (EHis[k] > 0 ? N[k] / EHis[k] : null)),
    Rnull: per((k) => (eRaw[k] > 0 ? NS[k] / eRaw[k] : null)),
    correction: per((k) => (eRaw[k] > 0 ? E[k] / eRaw[k] : null)),
    over: { n: [...over.cnt], mean: per((k) => mean(over.sum, over.cnt, k)), sum: [...over.sum] },
    under: { n: [...under.cnt], mean: per((k) => mean(under.sum, under.cnt, k)), sum: [...under.sum] },
    ref: { n: [...ref.cnt], mean: per((k) => mean(ref.sum, ref.cnt, k)) },
    relOver: per((k) => (over.cnt[k] > 0 && ref.cnt[k] > 0 ? over.sum[k] / over.cnt[k] - ref.sum[k] / ref.cnt[k] : null)),
    relUnder: per((k) => (under.cnt[k] > 0 && ref.cnt[k] > 0 ? under.sum[k] / under.cnt[k] - ref.sum[k] / ref.cnt[k] : null)),
    agreeT: agreeT / n,
    agreeHis: agreeHis / n,
    diffMean: diff > 0 ? diffSum / diff : null,
    diffShare: diff / n,
  }
}

function phaseStats(list, kappa) {
  return Object.fromEntries(
    PHASES.map((p) => {
      const N = zeros()
      const E = zeros()
      let n = 0
      for (const g of list) {
        const ph = g.phase[p]
        n += ph.n
        const pb = bandIndex.get(g.plusBand)
        for (let k = 0; k < K; k++) {
          N[k] += ph.N[k]
          E[k] += kappa[pb][k] * ph.eRaw[k]
        }
      }
      return [p, { n, N: [...N], E: [...E], R: Array.from({ length: K }, (_, k) => (E[k] > 0 ? N[k] / E[k] : null)) }]
    }),
  )
}

const identity = (xs) => xs
const point = (() => {
  const { sumN, sumE } = lichessSums(identity)
  const kappa = kappaOf(sumN, sumE)
  return {
    lichess: { sumN, sumE, kappa },
    halves: byHalf.map((list) => halfStats(list, kappa)),
    phases: phaseStats(gameList, kappa),
  }
})()

const rnd = mulberry32(SEED)
const resample = (xs) => {
  const outList = new Array(xs.length)
  for (let i = 0; i < xs.length; i++) outList[i] = xs[Math.floor(rnd() * xs.length)]
  return outList
}
const draws = { halves: HALVES.map(() => ({})), phases: {}, kappa: [] }
const keep = (store, key, values) => {
  if (!store[key]) store[key] = values.map(() => [])
  values.forEach((v, k) => store[key][k].push(v))
}
for (let d = 0; d < DRAWS; d++) {
  const { sumN, sumE } = lichessSums(resample)
  const kappa = kappaOf(sumN, sumE)
  draws.kappa.push(kappa.map((row) => [...row]))
  HALVES.forEach((h) => {
    const s = halfStats(resample(byHalf[h]), kappa)
    for (const key of ['R', 'Rraw', 'Rhis', 'Rnull', 'relOver', 'relUnder', 'correction']) keep(draws.halves[h], key, s[key])
    keep(draws.halves[h], 'overMean', s.over.mean)
    keep(draws.halves[h], 'underMean', s.under.mean)
    keep(draws.halves[h], 'refMean', s.ref.mean)
    keep(draws.halves[h], 'agree', [s.agreeT, s.agreeHis, s.diffMean])
  })
  const ph = phaseStats(resample(gameList), kappa)
  for (const p of PHASES) keep(draws.phases, p, ph[p].R)
}

function interval(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x)).sort((a, b) => a - b)
  if (v.length < DRAWS * 0.95) return null
  return [v[Math.floor(0.025 * v.length)], v[Math.ceil(0.975 * v.length) - 1]]
}
const ciOf = (store, key, k) => interval(store[key][k])
const kappaCi = LICHESS_BANDS.map((_, b) => Array.from({ length: K }, (_, k) => interval(draws.kappa.map((row) => row[b][k]))))

const above = (ci, bar) => ci !== null && ci[0] > bar
const below = (ci, bar) => ci !== null && ci[1] < bar

function directionOf(cis) {
  if (cis.every((ci) => above(ci, 1))) return 'over'
  if (cis.every((ci) => below(ci, 1))) return 'under'
  return null
}

const kinds = KINDS.map((kind, k) => {
  const halves = HALVES.map((h) => {
    const s = point.halves[h]
    const store = draws.halves[h]
    return {
      N: s.N[k],
      E: s.E[k],
      eRaw: s.eRaw[k],
      R: s.R[k],
      ci: ciOf(store, 'R', k),
      Rraw: s.Rraw[k],
      ciRaw: ciOf(store, 'Rraw', k),
      Rhis: s.Rhis[k],
      ciHis: ciOf(store, 'Rhis', k),
      Rnull: s.Rnull[k],
      ciNull: ciOf(store, 'Rnull', k),
      correction: s.correction[k],
      over: { n: s.over.n[k], meanD: s.over.mean[k], ci: ciOf(store, 'overMean', k), perGame: s.over.n[k] / s.games, wpPerGame: s.over.sum[k] / s.games, rel: s.relOver[k], ciRel: ciOf(store, 'relOver', k) },
      under: { n: s.under.n[k], meanD: s.under.mean[k], ci: ciOf(store, 'underMean', k), perGame: s.under.n[k] / s.games, wpPerGame: s.under.sum[k] / s.games, rel: s.relUnder[k], ciRel: ciOf(store, 'relUnder', k) },
      ref: { n: s.ref.n[k], meanD: s.ref.mean[k], ci: ciOf(store, 'refMean', k) },
    }
  })
  const lowE = halves.find((x) => x.E < MIN_COUNT)
  const offCorrection = halves.find((x) => x.correction === null || x.correction < KAPPA_RANGE[0] || x.correction > KAPPA_RANGE[1])
  const direction = directionOf(halves.map((x) => x.ci))
  const nullDirection = directionOf(halves.map((x) => x.ciNull))
  let verdict
  let cost = null
  if (lowE) verdict = `not enough data (n=${Math.round(Math.min(...halves.map((x) => x.E)))})`
  else if (offCorrection) verdict = 'not measurable'
  else if (!direction) verdict = 'no habit'
  else {
    const side = halves.map((x) => x[direction])
    const fewest = Math.min(...side.map((x) => x.n))
    if (fewest < MIN_COUNT) {
      cost = `not enough data (n=${fewest})`
      verdict = `${direction === 'over' ? 'over-used' : 'under-used'}, its cost not enough data (n=${fewest})`
    } else if (side.every((x) => above(x.ciRel, 0))) {
      cost = 'costs'
      verdict = 'a costly habit'
    } else if (side.every((x) => below(x.ciRel, 0))) {
      cost = 'cheap'
      verdict = 'a cheap habit'
    } else {
      cost = 'neither'
      verdict = 'a habit that costs no more'
    }
  }
  const phases = Object.fromEntries(
    PHASES.map((p) => [p, { N: point.phases[p].N[k], E: point.phases[p].E[k], R: point.phases[p].R[k], ci: interval(draws.phases[p][k]) }]),
  )
  const kappa = LICHESS_BANDS.map((band, b) => ({
    band,
    N: point.lichess.sumN[b][k],
    E: point.lichess.sumE[b][k],
    kappa: point.lichess.kappa[b][k],
    pooled: point.lichess.sumE[b][k] < MIN_COUNT,
    ci: kappaCi[b][k],
  }))
  return { kind, control: kind === CONTROL, verdict, direction, cost, nullDirection, halves, phases, kappa }
})

const control = kinds.find((x) => x.control)
const controlPasses = {
  knownFault:
    control.direction === 'over' &&
    !control.verdict.startsWith('not') &&
    control.halves.every((x) => x.over.n >= MIN_COUNT && above(x.over.ciRel, 0)),
  null: kinds.every((x) => x.nullDirection === null),
}
const verdictGiven = controlPasses.knownFault && controlPasses.null

const agreement = HALVES.map((h) => {
  const s = point.halves[h]
  const store = draws.halves[h]
  return {
    positions: s.n,
    games: s.games,
    topAbove: s.agreeT,
    ciTopAbove: interval(store.agree[0]),
    topHis: s.agreeHis,
    ciTopHis: interval(store.agree[1]),
    differShare: s.diffShare,
    differMeanD: s.diffMean,
    ciDifferMeanD: interval(store.agree[2]),
  }
})

const report = {
  app: positionsSummary.app,
  lab: { commit: gitCommit(LAB) },
  data: {
    his: positionsSummary,
    lichess: { ...lichessSummary, playerGamesWithPositions: [...units.values()].reduce((a, u) => a + u.length, 0), positions: lichessPositions, byBand: Object.fromEntries(LICHESS_BANDS.map((b) => [b, { playerGames: units.get(b).length, positions: units.get(b).reduce((a, u) => a + u.n, 0) }])) },
  },
  bands: HALVES.map((h) => {
    const count = (key) => Object.fromEntries(LICHESS_BANDS.map((b) => [b, byHalf[h].filter((g) => g[key] === b).length]).filter(([, n]) => n > 0))
    return { his: count('hisBand'), above: count('plusBand') }
  }),
  controls: controlPasses,
  verdictGiven,
  agreement,
  kinds,
}
writeFileSync(join(out, 'his-habits.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(100 * x).toFixed(0)}%`)
const num = (x, d = 2) => (x === null || x === undefined ? 'n/a' : x.toFixed(d))
const ci = (c, d = 2) => (c ? `${num(c[0], d)} to ${num(c[1], d)}` : 'n/a')
const lines = []
lines.push('# His habits against Maia-2 at the band above')
lines.push('')
lines.push(`App commit \`${report.app.commit}\`. His positions: ${positionsSummary.positions} from ${positionsSummary.games} games (halves of ${positionsSummary.halves.join(' and ')} games, ${positionsSummary.dates[0]} to ${positionsSummary.dates[1]} and ${positionsSummary.dates[2]} to ${positionsSummary.dates[3]}). Lichess ${lichessSummary.month}: ${report.data.lichess.positions} positions from ${report.data.lichess.playerGamesWithPositions} player-games.`)
lines.push('')
lines.push(`**Controls.** The known fault (\`${CONTROL}\` over-used and costly on both halves): ${controlPasses.knownFault ? 'passes' : 'fails'}. The null (no kind flagged for a player drawn from Maia-2's policy): ${controlPasses.null ? 'passes' : 'fails'}. ${verdictGiven ? 'The rule gives its verdicts.' : 'No verdict is given.'}`)
lines.push('')
lines.push('## Verdicts')
lines.push('')
lines.push('| Kind | Verdict | R, first half | R, second half | Relative cost, first | Relative cost, second |')
lines.push('|---|---|---|---|---|---|')
for (const x of kinds) {
  const dir = x.direction ?? (x.halves[0].R !== null && x.halves[0].R >= 1 ? 'over' : 'under')
  const rel = x.halves.map((h) => `${num(h[dir].rel, 1)} (${ci(h[dir].ciRel, 1)}, n=${h[dir].n})`)
  lines.push(`| \`${x.kind}\`${x.control ? ' (control)' : ''} | ${x.verdict} | ${num(x.halves[0].R)} (${ci(x.halves[0].ci)}) | ${num(x.halves[1].R)} (${ci(x.halves[1].ci)}) | ${rel[0]} | ${rel[1]} |`)
}
lines.push('')
lines.push('R is his count over the expected count for the band above, corrected by Maia-2\'s bias on Lichess. Relative cost is the mean win% his instances give up against the band above\'s most likely move, minus the same over his other differences, in the direction of the habit (over-use when no habit is shown and R is at least 1, under-use otherwise).')
lines.push('')
lines.push('## Against his own band, without the correction, and the null')
lines.push('')
lines.push('| Kind | R vs his band, first | second | R uncorrected, first | second | Null, first | second | Correction, first | second |')
lines.push('|---|---|---|---|---|---|---|---|---|')
for (const x of kinds) {
  const [a, b] = x.halves
  lines.push(`| \`${x.kind}\` | ${num(a.Rhis)} (${ci(a.ciHis)}) | ${num(b.Rhis)} (${ci(b.ciHis)}) | ${num(a.Rraw)} | ${num(b.Rraw)} | ${num(a.Rnull)} (${ci(a.ciNull)}) | ${num(b.Rnull)} (${ci(b.ciNull)}) | ${num(a.correction)} | ${num(b.correction)} |`)
}
lines.push('')
lines.push('## Counts and costs')
lines.push('')
lines.push('| Kind | N, first | E, first | N, second | E, second | Over: per game, mean D (first; second) | Under: per game, mean D (first; second) |')
lines.push('|---|---|---|---|---|---|---|')
for (const x of kinds) {
  const [a, b] = x.halves
  lines.push(`| \`${x.kind}\` | ${a.N} | ${num(a.E, 0)} | ${b.N} | ${num(b.E, 0)} | ${num(a.over.perGame, 2)}, ${num(a.over.meanD, 1)}; ${num(b.over.perGame, 2)}, ${num(b.over.meanD, 1)} | ${num(a.under.perGame, 2)}, ${num(a.under.meanD, 1)}; ${num(b.under.perGame, 2)}, ${num(b.under.meanD, 1)} |`)
}
lines.push('')
lines.push('## By phase, both halves')
lines.push('')
lines.push('| Kind | Middlegame R | Endgame R |')
lines.push('|---|---|---|')
for (const x of kinds) lines.push(`| \`${x.kind}\` | ${num(x.phases.middlegame.R)} (${ci(x.phases.middlegame.ci)}, n=${x.phases.middlegame.N}) | ${num(x.phases.endgame.R)} (${ci(x.phases.endgame.ci)}, n=${x.phases.endgame.N}) |`)
lines.push('')
lines.push('## Agreement with Maia-2')
lines.push('')
lines.push('| Half | Positions | His move is the band above\'s most likely | His band\'s most likely | Differs from the band above: share, mean D |')
lines.push('|---|---|---|---|---|')
agreement.forEach((a, h) => lines.push(`| ${h === 0 ? 'First' : 'Second'} | ${a.positions} | ${pct(a.topAbove)} (${ci(a.ciTopAbove?.map((v) => 100 * v), 0)}) | ${pct(a.topHis)} (${ci(a.ciTopHis?.map((v) => 100 * v), 0)}) | ${pct(a.differShare)}, ${num(a.differMeanD, 1)} (${ci(a.ciDifferMeanD, 1)}) |`))
lines.push('')
lines.push('## Maia-2\'s bias on Lichess, by band')
lines.push('')
lines.push(`| Kind | ${LICHESS_BANDS.join(' | ')} |`)
lines.push(`|---|${LICHESS_BANDS.map(() => '---').join('|')}|`)
for (const x of kinds) lines.push(`| \`${x.kind}\` | ${x.kappa.map((c) => `${num(c.kappa)}${c.pooled ? '*' : ''}`).join(' | ')} |`)
lines.push('')
lines.push('\\* Maia-2\'s expected count at that band is under 30, so the pooled bias stands in.')
lines.push('')
writeFileSync(join(out, 'his-habits.md'), lines.join('\n'))
console.log(JSON.stringify({ controls: controlPasses, verdictGiven, verdicts: Object.fromEntries(kinds.map((x) => [x.kind, x.verdict])) }, null, 2))
