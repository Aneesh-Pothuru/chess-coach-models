import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  MIN_CELL,
  PIECE_CHECKS,
  PROJECT,
  SEED,
  SOURCE,
  argOf,
  bootStat,
  byGame,
  leverWeighted,
  mulberry32,
  passed,
  piecesReady,
  readJsonl,
  rowsOf,
  soundOf,
} from './lib.mjs'

const CALIBRATION_READINGS = 100
const PERMUTATIONS = 1000

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const scored = Object.fromEntries(['his', 'strong'].map((who) => [who, new Map(rowsOf(privateDir(SOURCE), who, readdirSync).scored.map((r) => [r.id, r]))]))
const breaksOf = (who) =>
  readJsonl(join(dir, `${who}-checks.jsonl`)).map((b) => ({ ...b, group: `${b.structure}|${b.lever}`, sound: soundOf(scored[who].get(b.id), b.uci) }))
const his = breaksOf('his')
const strong = breaksOf('strong')
const halves = [0, 1].map((h) => his.filter((b) => b.half === h))
const strongUnits = (list) => byGame(list.map((b) => ({ ...b, gi: b.id })))
const sound = (b) => b.sound
const isSafe = (b) => b.checks.safe
const mean = (list, f) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : null)
const liftOf = (arm) => (list) => ({ lift: leverWeighted(list, arm, sound) })

function randomReading(list, seed) {
  const rnd = mulberry32(seed)
  const drawn = new Set()
  const groups = Map.groupBy(list.filter(isSafe), (b) => b.group)
  for (const g of [...groups.keys()].sort()) {
    const members = groups.get(g)
    const k = members.filter((b) => piecesReady(b.checks)).length
    members
      .map((b) => ({ b, key: rnd() }))
      .sort((x, y) => x.key - y.key)
      .slice(0, k)
      .forEach(({ b }) => drawn.add(b))
  }
  return (b) => (isSafe(b) ? drawn.has(b) : null)
}

const calibration = [0, 1].map((h) => {
  const list = halves[h]
  const lifts = Array.from({ length: PERMUTATIONS }, (_, s) => leverWeighted(list, randomReading(list, SEED + 10000 + s), sound))
  const spread = Math.sqrt(mean(lifts, (d) => d * d))
  let excludes = 0
  let width = 0
  for (let s = 0; s < CALIBRATION_READINGS; s++) {
    const ci = bootStat(byGame(list), liftOf(randomReading(list, SEED + 10000 + s)), SEED + 20000 + s).lift.ci
    if (ci[0] > 0 || ci[1] < 0) excludes++
    width += (ci[1] - ci[0]) / 3.92
  }
  const real = leverWeighted(list, (b) => (isSafe(b) ? piecesReady(b.checks) : null), sound)
  return {
    permutations: PERMUTATIONS,
    permutationSpread: spread,
    readings: CALIBRATION_READINGS,
    bootstrapSpread: width / CALIBRATION_READINGS,
    excludes,
    real,
    permutationP: lifts.filter((d) => Math.abs(d) >= Math.abs(real)).length / PERMUTATIONS,
  }
})

const amongSafe = Object.fromEntries(
  PIECE_CHECKS.map((c, i) => {
    const arm = (b) => (isSafe(b) ? b.checks[c] : null)
    return [
      c,
      {
        passes: his.filter((b) => isSafe(b) && b.checks[c]).length,
        fails: his.filter((b) => isSafe(b) && !b.checks[c]).length,
        pooled: bootStat(byGame(his), liftOf(arm), SEED + 900 + i),
        halves: [0, 1].map((h) => bootStat(byGame(halves[h]), liftOf(arm), SEED + 910 + 10 * i + h)),
        strong: bootStat(strongUnits(strong), liftOf(arm), SEED + 950 + i),
      },
    ]
  }),
)

const pieceCount = Array.from({ length: PIECE_CHECKS.length + 1 }, (_, k) => {
  const of = (list) => list.filter((b) => isSafe(b) && passed(b.checks, PIECE_CHECKS) === k)
  const mine = of(his)
  const theirs = of(strong)
  return {
    passed: k,
    his: { breaks: mine.length, stats: mine.length >= MIN_CELL ? bootStat(byGame(mine), (l) => ({ sound: mean(l, sound) }), SEED + 1000 + k) : null },
    strong: { breaks: theirs.length, stats: theirs.length >= MIN_CELL ? bootStat(strongUnits(theirs), (l) => ({ sound: mean(l, sound) }), SEED + 1010 + k) : null },
  }
})

const report = { calibration, amongSafe, pieceCount }
writeFileSync(join(out, 'descriptions.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const cell = (s) => (s ? `${pct(s.value)} (${s.ci ? `${pct(s.ci[0])} to ${pct(s.ci[1])}` : '--'})` : '--')
const lines = ['# Added after the run', '', 'None of this was named before the run; it describes and decides nothing.', '']
lines.push(
  '## The intervals, checked on random readings',
  '',
  `Random readings drawn as the null control draws its own (as many safe breaks in each group as pieces ready passes): the spread of their lifts over ${PERMUTATIONS} draws, the bootstrap's spread for ${CALIBRATION_READINGS} of them, and how many of those ${CALIBRATION_READINGS} intervals leave out 0 (a 95% interval should for about 5).`,
  '',
  '| Half | Spread of random lifts (points) | Bootstrap spread (points) | Intervals leaving out 0 | Pieces ready\'s lift (points) | Share of random lifts as far from 0 |',
  '|---|---|---|---|---|---|',
)
calibration.forEach((c, h) => lines.push(`| ${h ? 'Second' : 'First'} | ${pct(c.permutationSpread)} | ${pct(c.bootstrapSpread)} | ${c.excludes} of ${c.readings} | ${pct(c.real)} | ${c.permutationP.toFixed(2)} |`))
lines.push('', '## Each piece question alone, among the safe breaks (lift, points)', '', '| Question | Passes / fails (his) | His, halves pooled | First half | Second half | Strong players |', '|---|---|---|---|---|---|')
for (const [name, q] of Object.entries(amongSafe)) lines.push(`| ${name} | ${q.passes} / ${q.fails} | ${cell(q.pooled?.lift)} | ${cell(q.halves[0]?.lift)} | ${cell(q.halves[1]?.lift)} | ${cell(q.strong?.lift)} |`)
lines.push('', '## Sound by how many piece questions pass, among the safe breaks (%)', '', '| Piece questions passed | His breaks | His, sound | Strong breaks | Strong, sound |', '|---|---|---|---|---|')
for (const c of pieceCount) lines.push(`| ${c.passed} | ${c.his.breaks} | ${c.his.stats ? cell(c.his.stats.sound) : `not enough data (n=${c.his.breaks})`} | ${c.strong.breaks} | ${c.strong.stats ? cell(c.strong.stats.sound) : `not enough data (n=${c.strong.breaks})`} |`)
writeFileSync(join(out, 'descriptions.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
