import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CHECKS,
  MIN_ARM,
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
  seedOf,
  soundOf,
} from './lib.mjs'

const dir = privateDir(PROJECT)
const out = argOf('--out', resultsDir(PROJECT))
const source = privateDir(SOURCE)

const scored = Object.fromEntries(['his', 'strong'].map((who) => [who, new Map(rowsOf(source, who, readdirSync).scored.map((r) => [r.id, r]))]))
const breaksOf = (who) =>
  readJsonl(join(dir, `${who}-checks.jsonl`)).map((b) => {
    const r = scored[who].get(b.id)
    return { ...b, group: `${b.structure}|${b.lever}`, sound: soundOf(r, b.uci) }
  })
const his = breaksOf('his')
const strong = breaksOf('strong')
const halves = [0, 1].map((h) => his.filter((b) => b.half === h))

const hisUnits = (list) => byGame(list)
const strongUnits = (list) => byGame(list.map((b) => ({ ...b, gi: b.id })))
const sound = (b) => b.sound
const isSafe = (b) => b.checks.safe
const ready = (b) => piecesReady(b.checks)
const liftOf = (armOf, valueOf = sound) => (list) => ({ lift: leverWeighted(list, armOf, valueOf) })
const safeOnly = (arm) => (b) => (isSafe(b) ? arm(b) : null)

const above0 = (s) => !!s?.ci && s.ci[0] > 0
const below0 = (s) => !!s?.ci && s.ci[1] < 0

function placebo(list, seed) {
  const rnd = mulberry32(seed)
  const groups = new Map()
  for (const b of list.filter(isSafe)) {
    if (!groups.has(b.group)) groups.set(b.group, [])
    groups.get(b.group).push(b)
  }
  const drawn = new Set()
  for (const g of [...groups.keys()].sort()) {
    const members = groups.get(g)
    const k = members.filter(ready).length
    const order = members.map((b) => ({ b, key: rnd() })).sort((x, y) => x.key - y.key)
    for (const { b } of order.slice(0, k)) drawn.add(`${b.id}|${b.uci}`)
  }
  return (b) => (isSafe(b) ? drawn.has(`${b.id}|${b.uci}`) : null)
}

const positionRows = (who, list) => {
  const ids = [...new Set(list.map((b) => b.id))]
  return ids.map((id) => scored[who].get(id))
}

const referee = {
  his: [0, 1].map((h) =>
    bootStat(hisUnits(positionRows('his', halves[h])), (rows) => ({ AminusR: mean(rows, (r) => soundOf(r, r.played) - soundOf(r, r.R)) }), SEED + h),
  ),
  strong: bootStat(strongUnits(positionRows('strong', strong)), (rows) => ({ SminusR: mean(rows, (r) => soundOf(r, r.played) - soundOf(r, r.R)) }), SEED + 2),
}
function mean(list, f) {
  return list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : null
}

const positive = [0, 1].map((h) => bootStat(hisUnits(halves[h]), liftOf(isSafe), SEED + 10 + h))
const placeboArm = [0, 1].map((h) => placebo(halves[h], seedOf(PROJECT, 'placebo', h)))
const nullControl = [0, 1].map((h) => bootStat(hisUnits(halves[h]), liftOf(placeboArm[h]), SEED + 20 + h))
const arms = [0, 1].map((h) => ({
  ready: halves[h].filter((b) => isSafe(b) && ready(b)).length,
  rushed: halves[h].filter((b) => isSafe(b) && !ready(b)).length,
}))
const primary = [0, 1].map((h) => bootStat(hisUnits(halves[h]), liftOf(safeOnly(ready)), SEED + 30 + h))

const controls = {
  referee: [0, 1].every((h) => above0(referee.his[h]?.AminusR)) && above0(referee.strong?.SminusR),
  positive: [0, 1].every((h) => above0(positive[h]?.lift)),
  null: !([0, 1].every((h) => above0(nullControl[h]?.lift)) || [0, 1].every((h) => below0(nullControl[h]?.lift))),
}
const enough = arms.every((a) => a.ready >= MIN_ARM && a.rushed >= MIN_ARM)
let verdict
if (!controls.referee || !controls.positive || !controls.null) verdict = 'no verdict: a control failed'
else if (!enough) verdict = `not enough data (n=${arms.map((a) => `${a.ready}/${a.rushed}`).join(', ')})`
else if ([0, 1].every((h) => above0(primary[h]?.lift))) verdict = 'the pieces tell the moment'
else if ([0, 1].every((h) => below0(primary[h]?.lift))) verdict = 'the pieces mislead'
else verdict = 'no signal'

const rawShare = (list, arm) => {
  const yes = list.filter((b) => arm(b) === true)
  const no = list.filter((b) => arm(b) === false)
  return { yes: { n: yes.length, sound: mean(yes, sound) }, no: { n: no.length, sound: mean(no, sound) } }
}
const raw = {
  his: [0, 1].map((h) => ({ pieces: rawShare(halves[h], safeOnly(ready)), safe: rawShare(halves[h], isSafe) })),
  strong: { pieces: rawShare(strong, safeOnly(ready)), safe: rawShare(strong, isSafe) },
}

const others = CHECKS.filter((c) => c !== 'purpose')
const eachQuestion = Object.fromEntries(
  [...CHECKS.map((c) => [c, (b) => b.checks[c]]), ['allButPurpose', (b) => passed(b.checks, others) === others.length]].map(([name, arm], i) => [
    name,
    {
      pooled: bootStat(hisUnits(his), liftOf(arm), SEED + 100 + i),
      halves: [0, 1].map((h) => bootStat(hisUnits(halves[h]), liftOf(arm), SEED + 110 + 10 * i + h)),
      strong: bootStat(strongUnits(strong), liftOf(arm), SEED + 200 + i),
      share: rawShare(his, (b) => arm(b)),
    },
  ]),
)

const byCount = Array.from({ length: CHECKS.length + 1 }, (_, k) => {
  const list = his.filter((b) => passed(b.checks) === k)
  return { passed: k, breaks: list.length, stats: list.length >= MIN_CELL ? bootStat(hisUnits(list), (l) => ({ sound: mean(l, sound) }), SEED + 300 + k) : null }
})

const strongStats = {
  pieces: bootStat(strongUnits(strong), liftOf(safeOnly(ready)), SEED + 400),
  safe: bootStat(strongUnits(strong), liftOf(isSafe), SEED + 401),
  arms: { ready: strong.filter((b) => isSafe(b) && ready(b)).length, rushed: strong.filter((b) => isSafe(b) && !ready(b)).length },
}

const groups = [...Map.groupBy(his.filter(isSafe), (b) => b.group).entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([group, list], i) => {
    const yes = list.filter(ready)
    const no = list.filter((b) => !ready(b))
    const row = { group, ready: yes.length, rushed: no.length }
    if (yes.length < MIN_CELL || no.length < MIN_CELL) return { ...row, stats: null, note: `not enough data (n=${yes.length}/${no.length})` }
    return { ...row, stats: bootStat(hisUnits(list), (l) => ({ ready: mean(l.filter(ready), sound), rushed: mean(l.filter((b) => !ready(b)), sound), lift: mean(l.filter(ready), sound) - mean(l.filter((b) => !ready(b)), sound) }), SEED + 500 + i) }
  })

const choice = {
  shares: rawShare(his, safeOnly(ready)),
  played: {
    ready: mean(his.filter((b) => isSafe(b) && ready(b)), (b) => (b.playedIt ? 1 : 0)),
    rushed: mean(his.filter((b) => isSafe(b) && !ready(b)), (b) => (b.playedIt ? 1 : 0)),
    unsafe: mean(his.filter((b) => !isSafe(b)), (b) => (b.playedIt ? 1 : 0)),
  },
  lift: bootStat(hisUnits(his), liftOf(safeOnly(ready), (b) => (b.playedIt ? 1 : 0)), SEED + 600),
  strongPlayed: {
    ready: mean(strong.filter((b) => isSafe(b) && ready(b)), (b) => (b.playedIt ? 1 : 0)),
    rushed: mean(strong.filter((b) => isSafe(b) && !ready(b)), (b) => (b.playedIt ? 1 : 0)),
    unsafe: mean(strong.filter((b) => !isSafe(b)), (b) => (b.playedIt ? 1 : 0)),
  },
}

function againstHisMove(list, seed) {
  const byId = Map.groupBy(list.filter((b) => isSafe(b) && ready(b)), (b) => b.id)
  const rows = [...byId.entries()].map(([id, bs]) => {
    const r = scored.his.get(id)
    const breakSound = mean(bs, sound)
    return { gi: r.gi, breakSound, own: soundOf(r, r.played), gain: breakSound - soundOf(r, r.played) }
  })
  return bootStat(byGame(rows), (l) => ({ ready: mean(l, (x) => x.breakSound), own: mean(l, (x) => x.own), gain: mean(l, (x) => x.gain) }), seed)
}
const againstMove = [0, 1].map((h) => againstHisMove(halves[h], SEED + 700 + h))

const report = {
  verdict,
  controls,
  referee,
  positive,
  null: nullControl,
  arms,
  primary,
  raw,
  eachQuestion,
  byCount,
  strong: strongStats,
  groups,
  choice,
  againstMove,
  counts: { his: halves.map((l) => ({ breaks: l.length, positions: new Set(l.map((b) => b.id)).size, games: new Set(l.map((b) => b.gi)).size })), strong: { breaks: strong.length, positions: new Set(strong.map((b) => b.id)).size } },
  pieceChecks: PIECE_CHECKS,
}
writeFileSync(join(out, 'break-ready.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? '--' : (100 * x).toFixed(1))
const cell = (s) => (s ? `${pct(s.value)} (${s.ci ? `${pct(s.ci[0])} to ${pct(s.ci[1])}` : '--'})` : '--')
const lines = [`# Does the checklist before a break tell when the break is sound?`, '', `**Verdict: ${verdict}.**`, '']
lines.push('## The controls', '', '| Control | First half | Second half | Strong players | Passes |', '|---|---|---|---|---|')
lines.push(`| His move minus a random move (points) | ${cell(referee.his[0]?.AminusR)} | ${cell(referee.his[1]?.AminusR)} | ${cell(referee.strong?.SminusR)} | ${controls.referee ? 'yes' : 'no'} |`)
lines.push(`| The blunder check's lift (points) | ${cell(positive[0]?.lift)} | ${cell(positive[1]?.lift)} | ${cell(strongStats.safe?.lift)} | ${controls.positive ? 'yes' : 'no'} |`)
lines.push(`| A random reading's lift (points) | ${cell(nullControl[0]?.lift)} | ${cell(nullControl[1]?.lift)} | | ${controls.null ? 'yes' : 'no'} |`)
lines.push('', '## The rule: the lift of pieces ready among safe breaks (points)', '', '| | First half | Second half | Strong players |', '|---|---|---|---|')
lines.push(`| Safe breaks, pieces ready / rushed | ${arms[0].ready} / ${arms[0].rushed} | ${arms[1].ready} / ${arms[1].rushed} | ${strongStats.arms.ready} / ${strongStats.arms.rushed} |`)
lines.push(`| Lift | ${cell(primary[0]?.lift)} | ${cell(primary[1]?.lift)} | ${cell(strongStats.pieces?.lift)} |`)
lines.push(`| Sound, pieces ready (%) | ${pct(raw.his[0].pieces.yes.sound)} | ${pct(raw.his[1].pieces.yes.sound)} | ${pct(raw.strong.pieces.yes.sound)} |`)
lines.push(`| Sound, rushed (%) | ${pct(raw.his[0].pieces.no.sound)} | ${pct(raw.his[1].pieces.no.sound)} | ${pct(raw.strong.pieces.no.sound)} |`)
lines.push(`| Sound, safe / not safe (%) | ${pct(raw.his[0].safe.yes.sound)} / ${pct(raw.his[0].safe.no.sound)} | ${pct(raw.his[1].safe.yes.sound)} / ${pct(raw.his[1].safe.no.sound)} | ${pct(raw.strong.safe.yes.sound)} / ${pct(raw.strong.safe.no.sound)} |`)
lines.push('', '## Each question alone, over all breaks (lift, points)', '', '| Question | Passes / fails (his) | His, halves pooled | First half | Second half | Strong players |', '|---|---|---|---|---|---|')
for (const [name, q] of Object.entries(eachQuestion)) lines.push(`| ${name} | ${q.share.yes.n} / ${q.share.no.n} | ${cell(q.pooled?.lift)} | ${cell(q.halves[0]?.lift)} | ${cell(q.halves[1]?.lift)} | ${cell(q.strong?.lift)} |`)
lines.push('', '## Sound by how many of the five pass, his halves pooled (%)', '', '| Questions passed | Breaks | Sound |', '|---|---|---|')
for (const c of byCount) lines.push(`| ${c.passed} | ${c.breaks} | ${c.stats ? cell(c.stats.sound) : `not enough data (n=${c.breaks})`} |`)
lines.push('', '## By group, his safe breaks, halves pooled (%)', '', '| Group | Ready / rushed | Ready, sound | Rushed, sound | Lift (points) |', '|---|---|---|---|---|')
for (const g of groups) lines.push(`| ${g.group} | ${g.ready} / ${g.rushed} | ${g.stats ? cell(g.stats.ready) : g.note} | ${g.stats ? cell(g.stats.rushed) : ''} | ${g.stats ? cell(g.stats.lift) : ''} |`)
lines.push('', '## His choice (%)', '', '| | Safe, pieces ready | Rushed | Not safe |', '|---|---|---|---|')
lines.push(`| He played the break | ${pct(choice.played.ready)} | ${pct(choice.played.rushed)} | ${pct(choice.played.unsafe)} |`)
lines.push(`| Strong players played it | ${pct(choice.strongPlayed.ready)} | ${pct(choice.strongPlayed.rushed)} | ${pct(choice.strongPlayed.unsafe)} |`)
lines.push('', `Within groups, he plays a safe break with the pieces ready ${cell(choice.lift?.lift)} points more often than a rushed one.`)
lines.push('', '## The ready break against his move, in positions with one (%)', '', '| | Positions | The ready breaks, sound | His move, sound | Difference (points) |', '|---|---|---|---|---|')
againstMove.forEach((s, h) => lines.push(`| ${h ? 'Second' : 'First'} half | ${s?.units ? s.n : 0} | ${cell(s?.ready)} | ${cell(s?.own)} | ${cell(s?.gain)} |`))
writeFileSync(join(out, 'break-ready.md'), lines.join('\n') + '\n')
console.error(lines.join('\n'))
