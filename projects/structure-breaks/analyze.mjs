import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  MIN_CELL,
  MIN_POSITIONS,
  PROJECT,
  SEED,
  argOf,
  bootOf,
  breakBest,
  breakLost,
  breakSound,
  byGame,
  lostOf,
  rowsOf,
  soundOf,
} from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const his = rowsOf(dir, 'his', readdirSync)
const strong = rowsOf(dir, 'strong', readdirSync)
const positions = JSON.parse(readFileSync(join(resultsDir(PROJECT), 'positions.json'), 'utf8'))

const isBreak = (r, uci) => (r.breaks.includes(uci) ? 1 : 0)
const hisValues = (r) => ({
  B: breakSound(r),
  A: soundOf(r, r.played),
  N: soundOf(r, r.natural),
  U: soundOf(r, r.above),
  R: soundOf(r, r.R),
  R2: soundOf(r, r.R2),
  gain: breakSound(r) - soundOf(r, r.played),
  BminusN: breakSound(r) - soundOf(r, r.natural),
  AminusR: soundOf(r, r.played) - soundOf(r, r.R),
  R2minusR: soundOf(r, r.R2) - soundOf(r, r.R),
  playedBreak: isBreak(r, r.played),
  massHis: r.breakMass.his,
  massPlus: r.breakMass.plus,
  lostB: breakLost(r),
  lostA: lostOf(r, r.played),
  bestB: breakBest(r),
})
const strongValues = (r) => ({
  B: breakSound(r),
  S: soundOf(r, r.played),
  R: soundOf(r, r.R),
  R2: soundOf(r, r.R2),
  BminusS: breakSound(r) - soundOf(r, r.played),
  SminusR: soundOf(r, r.played) - soundOf(r, r.R),
  playedBreak: isBreak(r, r.played),
  lostB: breakLost(r),
  lostS: lostOf(r, r.played),
  bestB: breakBest(r),
})
const hisBoot = (rows, seed) => bootOf(byGame(rows), hisValues, seed)
const strongBoot = (rows, seed) => bootOf(rows.map((r) => [r]), strongValues, seed)

const halves = [0, 1].map((h) => his.scored.filter((r) => r.half === h))
const stats = halves.map((rows, h) => hisBoot(rows, SEED + h))
const strongStats = strongBoot(strong.scored, SEED + 10)

const above = (s, k) => !!s?.[k]?.ci && s[k].ci[0] > 0
const below = (s, k) => !!s?.[k]?.ci && s[k].ci[1] < 0
const verdictOf = (k) => {
  if (stats.every((s) => above(s, k))) return 'holds'
  if (stats.every((s) => below(s, k))) return 'misleads'
  return 'no better'
}
const enough = halves.every((rows) => rows.length >= MIN_POSITIONS)
const controls = {
  tellsApart: { his: stats.map((s) => above(s, 'AminusR')), strong: above(strongStats, 'SminusR') },
  null: verdictOf('R2minusR'),
}
controls.tellsApartPassed = controls.tellsApart.his.every(Boolean) && controls.tellsApart.strong
controls.nullPassed = controls.null === 'no better'
const verdict = !enough
  ? `not enough data (n=${halves.map((rows) => rows.length).join(', ')})`
  : !controls.tellsApartPassed || !controls.nullPassed
    ? 'no verdict: a control failed'
    : { holds: 'the break holds', misleads: 'the break misleads', 'no better': 'no better than his own move' }[verdictOf('gain')]

const pooled = his.scored
const cells = (rows, keyOf, seed) => {
  const groups = new Map()
  for (const r of rows) {
    const k = keyOf(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
    .map(([k, list], i) => ({
      cell: k,
      positions: list.length,
      games: new Set(list.map((r) => r.gi)).size,
      ...(list.length >= MIN_CELL ? { stats: hisBoot(list, seed + i) } : { stats: null, note: `not enough data (n=${list.length})` }),
    }))
}
const report = {
  positions,
  statuses: { his: his.statuses, strong: strong.statuses },
  inexact: { his: his.inexact, strong: strong.inexact },
  verdict,
  enough,
  controls,
  halves: stats.map((s, h) => ({ half: h, positions: halves[h].length, games: new Set(halves[h].map((r) => r.gi)).size, stats: s })),
  strong: { positions: strong.scored.length, stats: strongStats },
  byStructure: cells(pooled, (r) => r.structure, SEED + 100),
  byPhase: cells(pooled, (r) => r.phase, SEED + 200),
  notPlayed: halves.map((rows, h) => hisBoot(rows.filter((r) => !r.breaks.includes(r.played)), SEED + 300 + h)),
  firstChance: cells(pooled, (r) => (r.first ? 'first' : 'later'), SEED + 400),
}
writeFileSync(join(out, 'structure-breaks.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const num = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : x.toFixed(2))
const cell = (s, f = pct) => (s ? `${f(s.value)} (${s.ci ? `${f(s.ci[0])} to ${f(s.ci[1])}` : '--'})` : '--')
const lines = ['# Do the structure\'s breaks hold at his level? The rule applied', '', `**Verdict: ${verdict}.**`, '']
lines.push('## Controls', '')
lines.push(`- The referee tells moves apart: ${controls.tellsApartPassed ? 'passed' : 'failed'}. His move minus a random move: ${stats.map((s, h) => `${h ? 'second' : 'first'} half ${cell(s?.AminusR)}`).join(', ')} points; the strong player's move minus a random move ${cell(strongStats?.SminusR)} points.`)
lines.push(`- Null: ${controls.nullPassed ? 'passed' : 'failed'}. A second random move against the first: ${stats.map((s, h) => `${h ? 'second' : 'first'} half ${cell(s?.R2minusR)}`).join(', ')} points.`, '')
lines.push('## His positions: the share of each arm\'s moves that are sound (%)', '', '| Half | Positions | Games | B, the break | A, his move | Gain (points) | N, his band | U, band above | B minus N | R | R2 |', '|---|---|---|---|---|---|---|---|---|---|---|')
for (const h of report.halves) {
  const s = h.stats
  lines.push(`| ${h.half ? 'Second' : 'First'} | ${h.positions} | ${h.games} | ${cell(s?.B)} | ${cell(s?.A)} | ${cell(s?.gain)} | ${cell(s?.N)} | ${cell(s?.U)} | ${cell(s?.BminusN)} | ${cell(s?.R)} | ${cell(s?.R2)} |`)
}
lines.push('', '## Finding it (%)', '', '| Positions | He played a break | Maia-2 at his band gives the breaks | At the band above | Strong players played a break |', '|---|---|---|---|---|')
for (const h of report.halves) lines.push(`| ${h.half ? 'Second' : 'First'} half | ${cell(h.stats?.playedBreak)} | ${cell(h.stats?.massHis)} | ${cell(h.stats?.massPlus)} | |`)
lines.push(`| Strong players | | | | ${cell(strongStats?.playedBreak)} |`)
lines.push('', '## By structure, halves pooled (%)', '', '| Structure | Positions | Games | B | A | Gain |', '|---|---|---|---|---|---|')
for (const c of report.byStructure) lines.push(`| ${c.cell} | ${c.positions} | ${c.games} | ${c.stats ? cell(c.stats.B) : c.note} | ${c.stats ? cell(c.stats.A) : ''} | ${c.stats ? cell(c.stats.gain) : ''} |`)
lines.push('', '## By phase, halves pooled (%)', '', '| Phase | Positions | Games | B | A | Gain |', '|---|---|---|---|---|---|')
for (const c of report.byPhase) lines.push(`| ${c.cell} | ${c.positions} | ${c.games} | ${c.stats ? cell(c.stats.B) : c.note} | ${c.stats ? cell(c.stats.A) : ''} | ${c.stats ? cell(c.stats.gain) : ''} |`)
lines.push('', '## When he did not play it (%)', '', '| Half | Positions | B | A | Gain |', '|---|---|---|---|---|')
report.notPlayed.forEach((s, h) => lines.push(`| ${h ? 'Second' : 'First'} | ${s?.n ?? 0} | ${cell(s?.B)} | ${cell(s?.A)} | ${cell(s?.gain)} |`))
lines.push('', '## The first chance in a game against later ones, halves pooled (%)', '', '| Position | Positions | Games | B | A | Gain |', '|---|---|---|---|---|---|')
for (const c of report.firstChance) lines.push(`| ${c.cell} | ${c.positions} | ${c.games} | ${c.stats ? cell(c.stats.B) : c.note} | ${c.stats ? cell(c.stats.A) : ''} | ${c.stats ? cell(c.stats.gain) : ''} |`)
lines.push('', '## Strong players\' positions (%)', '', `Over ${report.strong.positions} positions: B ${cell(strongStats?.B)}, S ${cell(strongStats?.S)}, R ${cell(strongStats?.R)}, R2 ${cell(strongStats?.R2)}; B minus S ${cell(strongStats?.BminusS)} points.`)
lines.push('', '## The win% given up, and the share of breaks that are the referee\'s best', '', '| Positions | Given up: B | His or the strong player\'s move | Best: B (%) |', '|---|---|---|---|')
for (const h of report.halves) lines.push(`| ${h.half ? 'Second' : 'First'} half | ${cell(h.stats?.lostB, num)} | ${cell(h.stats?.lostA, num)} | ${cell(h.stats?.bestB)} |`)
lines.push(`| Strong players | ${cell(strongStats?.lostB, num)} | ${cell(strongStats?.lostS, num)} | ${cell(strongStats?.bestB)} |`)
writeFileSync(join(out, 'structure-breaks.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
