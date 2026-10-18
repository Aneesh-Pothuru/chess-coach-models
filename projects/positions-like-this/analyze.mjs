import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { ARM, DISTANCE_BINS, DRAWS, HARD, MIN_POSITIONS, PROJECT, SEED, argOf, mulberry32, readJsonl } from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const rowsOf = (prefix) =>
  readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && /-of-\d+\.jsonl$/.test(f))
    .flatMap((f) => readJsonl(join(dir, f)))

const HALVES = [0, 1]
const hisRows = rowsOf('his')
const strongRows = rowsOf('strong')

const tally = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }), {})
const movesOf = (r, arms) => arms.flatMap((a) => r[a].map((m) => m.move))
const exact = (r, moves) => moves.every((m) => r.scores[m]?.exact === true)
const soundOf = (r, uci) => (r.scores[uci].sound ? 1 : 0)
const shareOf = (r, arm) => r[arm].reduce((s, m) => s + soundOf(r, m.move), 0) / ARM
const anySound = (r, arm) => (r[arm].some((m) => soundOf(r, m.move) === 1) ? 1 : 0)
const newTo = (r, arm) =>
  r[arm].some((m) => soundOf(r, m.move) === 1 && m.move !== r.played && r.scores[m.move].pHis < HARD) ? 1 : 0

const hisScored = hisRows.filter((r) => r.status === 'scored')
const hisMoves = (r) => [...movesOf(r, ['T', 'R', 'R2']), r.natural, r.above, r.played]
const his = hisScored.filter((r) => exact(r, hisMoves(r)))
const strongScored = strongRows.filter((r) => r.status === 'scored')
const strongMoves = (r) => [...movesOf(r, ['T', 'R']), r.twin]
const strong = strongScored.filter((r) => exact(r, strongMoves(r)))

const hisValues = (r) => ({
  T: shareOf(r, 'T'),
  R: shareOf(r, 'R'),
  R2: shareOf(r, 'R2'),
  N: soundOf(r, r.natural),
  U: soundOf(r, r.above),
  A: soundOf(r, r.played),
  lift: shareOf(r, 'T') - shareOf(r, 'R'),
  nullLift: shareOf(r, 'R2') - shareOf(r, 'R'),
  newT: newTo(r, 'T'),
  newR: newTo(r, 'R'),
  newLift: newTo(r, 'T') - newTo(r, 'R'),
})
const strongValues = (r) => ({
  twin: soundOf(r, r.twin),
  T: shareOf(r, 'T'),
  R: shareOf(r, 'R'),
  twinLift: soundOf(r, r.twin) - shareOf(r, 'R'),
  lift: shareOf(r, 'T') - shareOf(r, 'R'),
})

const interval = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  if (s.length < 0.95 * xs.length || s.length === 0) return null
  return [s[Math.floor(0.025 * (s.length - 1))], s[Math.ceil(0.975 * (s.length - 1))]]
}

function boot(units, valuesOf, seed) {
  const vals = units.map((u) => u.map(valuesOf))
  const names = Object.keys(vals.find((u) => u.length)?.[0] ?? {})
  const meanOf = (list) => {
    const out = Object.fromEntries(names.map((k) => [k, 0]))
    let n = 0
    for (const u of list) {
      for (const v of u) {
        for (const k of names) out[k] += v[k]
        n++
      }
    }
    for (const k of names) out[k] = n ? out[k] / n : null
    return { n, ...out }
  }
  const point = meanOf(vals)
  const rnd = mulberry32(seed)
  const draws = []
  for (let d = 0; d < DRAWS; d++) draws.push(meanOf(vals.map(() => vals[Math.floor(rnd() * vals.length)])))
  return Object.fromEntries([
    ['n', point.n],
    ['units', units.length],
    ...names.map((k) => [k, { value: point[k], ci: interval(draws.map((x) => x[k])) }]),
  ])
}

const byGame = (rows) => {
  const m = new Map()
  for (const r of rows) {
    const list = m.get(r.gi)
    if (list) list.push(r)
    else m.set(r.gi, [r])
  }
  return [...m.values()]
}

const halfRows = HALVES.map((h) => his.filter((r) => r.half === h))
const main = halfRows.map((rows, h) => boot(byGame(rows), hisValues, SEED + h))
const strongStats = boot(strong.map((r) => [r]), strongValues, SEED + 10)

const above = (ci) => ci !== null && ci[0] > 0
const below = (ci) => ci !== null && ci[1] < 0
const twinPass = above(strongStats.twinLift.ci)
const nullFails = (above(main[0].nullLift.ci) && above(main[1].nullLift.ci)) || (below(main[0].nullLift.ci) && below(main[1].nullLift.ci))
const nullPass = !nullFails
const enough = main.every((m) => m.n >= MIN_POSITIONS)
let verdict
if (!twinPass || !nullPass) verdict = 'no verdict'
else if (!enough) verdict = `not enough data (n=${main.map((m) => m.n).join(', ')})`
else if (above(main[0].lift.ci) && above(main[1].lift.ci)) verdict = 'alike works'
else if (below(main[0].lift.ci) && below(main[1].lift.ci)) verdict = 'alike misleads'
else verdict = 'no better than a random match'

const binOf = (d) => DISTANCE_BINS.findIndex(([lo, hi]) => d >= lo && d <= hi)
function distanceTable(rows, seed) {
  return DISTANCE_BINS.map(([lo, hi], b) => {
    const units = byGame(rows)
      .map((u) => u.flatMap((r) => ['T', 'R'].flatMap((arm) => r[arm].filter((m) => binOf(m.d) === b).map((m) => ({ s: soundOf(r, m.move), t: arm === 'T' ? 1 : 0 })))))
      .filter((u) => u.length)
    const stats = units.length ? boot(units, (x) => ({ sound: x.s, fromT: x.t }), seed + b) : null
    return { bin: [lo, Number.isFinite(hi) ? hi : null], matches: stats?.n ?? 0, sound: stats?.sound ?? null, fromT: stats?.fromT ?? null }
  })
}

function split(rows, keyOf, seed) {
  const keys = [...new Set(rows.map(keyOf))].sort()
  return keys.map((k, i) => {
    const sub = rows.filter((r) => keyOf(r) === k)
    const s = boot(byGame(sub), hisValues, seed + i)
    return { key: k, n: s.n, T: s.T, R: s.R, lift: s.lift }
  })
}

function rescue(rows, seed) {
  const wrong = rows.filter((r) => soundOf(r, r.played) === 0)
  const s = boot(byGame(wrong), (r) => ({ T: anySound(r, 'T'), R: anySound(r, 'R'), lift: anySound(r, 'T') - anySound(r, 'R') }), seed)
  return { n: s.n, T: s.T, R: s.R, lift: s.lift }
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}

const report = {
  verdict,
  controls: {
    twin: { pass: twinPass, positions: strongStats.n, twin: strongStats.twin, R: strongStats.R, lift: strongStats.twinLift },
    null: { pass: nullPass, halves: main.map((m) => m.nullLift) },
  },
  halves: HALVES.map((h) => ({
    half: h,
    candidates: hisRows.filter((r) => r.half === h).length,
    status: tally(hisRows.filter((r) => r.half === h), 'status'),
    inexact: hisScored.filter((r) => r.half === h).length - halfRows[h].length,
    positions: main[h].n,
    games: main[h].units,
    lift: main[h].lift,
    soundness: Object.fromEntries(['T', 'R', 'R2', 'N', 'U', 'A'].map((k) => [k, main[h][k]])),
    nearestDistance: median(halfRows[h].map((r) => r.T[0].d)),
    distances: distanceTable(halfRows[h], SEED + 20 + 10 * h),
    phase: split(halfRows[h], (r) => r.phase, SEED + 40 + 10 * h),
    structure: split(halfRows[h], (r) => (r.structure ? 'named' : 'none'), SEED + 60 + 10 * h),
    newToHim: { T: main[h].newT, R: main[h].newR, lift: main[h].newLift },
    whenWrong: rescue(halfRows[h], SEED + 80 + h),
  })),
  strong: {
    tried: strongRows.length,
    status: tally(strongRows, 'status'),
    inexact: strongScored.length - strong.length,
    positions: strongStats.n,
    twin: strongStats.twin,
    T: strongStats.T,
    R: strongStats.R,
    lift: strongStats.lift,
    nearestDistance: median(strong.map((r) => r.T[0].d)),
    phase: [...new Set(strong.map((r) => r.phase))].sort().map((k, i) => {
      const s = boot(strong.filter((r) => r.phase === k).map((r) => [r]), strongValues, SEED + 90 + i)
      return { key: k, n: s.n, T: s.T, R: s.R, lift: s.lift }
    }),
  },
}

writeFileSync(join(out, 'positions-like-this.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const ci = (s) => (s?.ci ? `${pct(s.ci[0])} to ${pct(s.ci[1])}` : '--')
const cell = (s) => (s ? `${pct(s.value)} (${ci(s)})` : '--')
const lines = ['# Positions like this: the rule applied', '', `**Verdict: ${verdict}.**`, '']
lines.push('## Controls', '')
lines.push(`- Planted twin: ${twinPass ? 'passed' : 'failed'}. Over ${strongStats.n} held-out strong positions, the strong player's own move is sound in ${cell(strongStats.twin)}% of them, a random match's in ${cell(strongStats.R)}%; the difference ${cell(strongStats.twinLift)} points.`)
lines.push(`- Null: ${nullPass ? 'passed' : 'failed'}. A second random draw against the first: ${main.map((m, h) => `${h === 0 ? 'first' : 'second'} half ${cell(m.nullLift)} points`).join(', ')}.`)
lines.push('', '## His positions: the share of each arm\'s moves that are sound (%)', '', '| Half | Positions | Games | T, the matches | R, random matches | Lift (points) | R2 | N, his band | U, band above | A, his move |', '|---|---|---|---|---|---|---|---|---|---|')
for (const h of report.halves) {
  const s = h.soundness
  lines.push(`| ${h.half === 0 ? 'First' : 'Second'} | ${h.positions} | ${h.games} | ${cell(s.T)} | ${cell(s.R)} | ${cell(h.lift)} | ${cell(s.R2)} | ${cell(s.N)} | ${cell(s.U)} | ${cell(s.A)} |`)
}
lines.push('', '## Soundness by distance (every T and R match)', '', '| Half | Distance | Matches | Sound (%) | From T (%) |', '|---|---|---|---|---|')
for (const h of report.halves) {
  for (const b of h.distances) lines.push(`| ${h.half === 0 ? 'First' : 'Second'} | ${b.bin[0]}${b.bin[1] === null ? '+' : ` to ${b.bin[1]}`} | ${b.matches} | ${cell(b.sound)} | ${cell(b.fromT)} |`)
}
lines.push('', '## Strong players\' held-out positions, no plant', '', `T ${cell(strongStats.T)}%, R ${cell(strongStats.R)}%, lift ${cell(strongStats.lift)} points over ${strongStats.n} positions.`)
lines.push('', '## Splits of his positions (lift in points)', '', '| Half | Split | Cell | Positions | T | R | Lift |', '|---|---|---|---|---|---|---|')
for (const h of report.halves) {
  for (const [name, rows] of [['phase', h.phase], ['structure', h.structure]]) {
    for (const c of rows) lines.push(`| ${h.half === 0 ? 'First' : 'Second'} | ${name} | ${c.key} | ${c.n} | ${cell(c.T)} | ${cell(c.R)} | ${cell(c.lift)} |`)
  }
}
lines.push('', '## New to him, and when he went wrong (%)', '', '| Half | New to him: T | R | Difference | His move unsound: positions | Some T move sound | Some R move sound | Difference |', '|---|---|---|---|---|---|---|---|')
for (const h of report.halves) {
  lines.push(`| ${h.half === 0 ? 'First' : 'Second'} | ${cell(h.newToHim.T)} | ${cell(h.newToHim.R)} | ${cell(h.newToHim.lift)} | ${h.whenWrong.n} | ${cell(h.whenWrong.T)} | ${cell(h.whenWrong.R)} | ${cell(h.whenWrong.lift)} |`)
}
writeFileSync(join(out, 'positions-like-this.md'), lines.join('\n') + '\n')
console.error(lines.slice(0, 8).join('\n'))
