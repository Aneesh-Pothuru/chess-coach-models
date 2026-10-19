import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import { ARM, DISTANCE_BINS, HARD, MIN_POSITIONS, PROJECT, SEED, argOf, boot, byGame, requirePlantedTwins, rowsOf, shareOf, soundOf } from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))

const HALVES = [0, 1]
const { hisRows, hisScored, his, strongRows, strongScored, strong } = rowsOf(dir, readdirSync)
requirePlantedTwins(strongScored)

const tally = (rows, key) => rows.reduce((acc, r) => ({ ...acc, [r[key]]: (acc[r[key]] ?? 0) + 1 }), {})
const anySound = (r, arm) => (r[arm].some((m) => soundOf(r, m.move) === 1) ? 1 : 0)
const lostOf = (r, arm) => r[arm].reduce((s, m) => s + Math.max(0, r.scores[m.move].lost), 0) / ARM
const bestOf = (r, arm) => r[arm].filter((m) => m.move === r.best).length / ARM
const newTo = (r, arm) =>
  r[arm].some((m) => soundOf(r, m.move) === 1 && m.move !== r.played && r.scores[m.move].pHis < HARD) ? 1 : 0

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
  lostT: lostOf(r, 'T'),
  lostR: lostOf(r, 'R'),
  lostR2: lostOf(r, 'R2'),
  lostA: Math.max(0, r.scores[r.played].lost),
  bestT: bestOf(r, 'T'),
  bestR: bestOf(r, 'R'),
  bestR2: bestOf(r, 'R2'),
})
const strongValues = (r) => ({
  twin: soundOf(r, r.twin),
  T: shareOf(r, 'T'),
  R: shareOf(r, 'R'),
  twinLift: soundOf(r, r.twin) - shareOf(r, 'R'),
  lift: shareOf(r, 'T') - shareOf(r, 'R'),
  lostT: lostOf(r, 'T'),
  lostR: lostOf(r, 'R'),
  bestT: bestOf(r, 'T'),
  bestR: bestOf(r, 'R'),
})

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
else if (above(main[0].lift.ci) && above(main[1].lift.ci)) verdict = 'likeness works'
else if (below(main[0].lift.ci) && below(main[1].lift.ci)) verdict = 'likeness misleads'
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
    twin: { pass: twinPass, positions: strongStats.n, retrieval: { checked: strong.length }, twin: strongStats.twin, R: strongStats.R, lift: strongStats.twinLift },
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
    lost: { T: main[h].lostT, R: main[h].lostR, R2: main[h].lostR2, A: main[h].lostA },
    best: { T: main[h].bestT, R: main[h].bestR, R2: main[h].bestR2 },
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
    distances: distanceTable(strong, SEED + 100),
    lost: { T: strongStats.lostT, R: strongStats.lostR },
    best: { T: strongStats.bestT, R: strongStats.bestR },
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
lines.push('', '| Distance | Matches | Sound (%) | From T (%) |', '|---|---|---|---|')
for (const b of report.strong.distances) lines.push(`| ${b.bin[0]}${b.bin[1] === null ? '+' : ` to ${b.bin[1]}`} | ${b.matches} | ${cell(b.sound)} | ${cell(b.fromT)} |`)
const wp = (s) => (s ? `${s.value.toFixed(2)} (${s.ci ? `${s.ci[0].toFixed(2)} to ${s.ci[1].toFixed(2)}` : '--'})` : '--')
lines.push('', '## The win% each arm\'s moves give up, and the share that are the referee\'s best (%)', '', '| Positions | Given up: T | R | R2 | A | Best: T | R | R2 |', '|---|---|---|---|---|---|---|---|')
for (const h of report.halves) lines.push(`| ${h.half === 0 ? 'First' : 'Second'} half | ${wp(h.lost.T)} | ${wp(h.lost.R)} | ${wp(h.lost.R2)} | ${wp(h.lost.A)} | ${cell(h.best.T)} | ${cell(h.best.R)} | ${cell(h.best.R2)} |`)
lines.push(`| Strong players | ${wp(report.strong.lost.T)} | ${wp(report.strong.lost.R)} | -- | -- | ${cell(report.strong.best.T)} | ${cell(report.strong.best.R)} | -- |`)
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
