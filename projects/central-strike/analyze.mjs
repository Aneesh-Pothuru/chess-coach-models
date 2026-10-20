import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  DRAWS,
  MIN_GAMES,
  PROJECT,
  SEED,
  SOURCE,
  above0,
  argOf,
  below0,
  bootStat,
  byGame,
  centralBreaks,
  flankBreaks,
  gitCommit,
  liftStat,
  lostOf,
  meanStat,
  otherKingInCentre,
  otherKingOnStart,
  queensOn,
  readJsonl,
  soundOf,
  strongReading,
  verdictOf,
} from './lib.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url))
const source = privateDir(SOURCE)
const out = argOf('--out', resultsDir(PROJECT))
const sourceSummary = JSON.parse(readFileSync(join(resultsDir(SOURCE), 'positions.json'), 'utf8'))

const rowsFor = (who) =>
  readdirSync(source)
    .filter((f) => new RegExp(`^${who}-\\d+-of-\\d+\\.jsonl$`).test(f))
    .flatMap((f) => readJsonl(join(source, f)))
const candidates = (who) => new Map(readJsonl(join(source, `${who}-candidates.jsonl`)).map((p) => [p.id, p]))

const exactAll = (r, moves) => moves.every((m) => r.scores[m]?.exact === true)
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length

function positionsOf(who) {
  const cand = candidates(who)
  const rows = rowsFor(who).filter((r) => r.status === 'scored')
  const tally = {}
  const count = (k) => (tally[k] = (tally[k] ?? 0) + 1)
  const entering = []
  const flank = []
  for (const r of rows) {
    const p = cand.get(r.id)
    if (!p) throw new Error(`no candidate for ${who} ${r.id}`)
    if (r.phase !== 'middlegame') {
      count('endgame')
      continue
    }
    const base = {
      id: r.id,
      gi: who === 'his' ? r.gi : r.id,
      half: who === 'his' ? r.half : null,
      centre: otherKingInCentre(p.fen),
      start: otherKingOnStart(p.fen),
      queens: queensOn(p.fen),
      A: soundOf(r, r.played),
      R: soundOf(r, r.R),
      R2: soundOf(r, r.R2),
    }
    const fl = flankBreaks(r)
    if (fl.length && exactAll(r, [...fl, r.played, r.R, r.R2])) {
      flank.push({ ...base, F: mean(fl.map((m) => soundOf(r, m))) })
    }
    const central = centralBreaks(r)
    if (central.length === 0) {
      count('no central break')
      continue
    }
    if (!exactAll(r, [...central, r.played, r.R, r.R2])) {
      count('a score is not exact')
      continue
    }
    count(base.centre ? 'enters, king in the centre' : 'enters, king away')
    entering.push({
      ...base,
      C: mean(central.map((m) => soundOf(r, m))),
      N: r.natural && r.scores[r.natural]?.exact ? soundOf(r, r.natural) : null,
      U: r.above && r.scores[r.above]?.exact ? soundOf(r, r.above) : null,
      playedCentral: central.includes(r.played) ? 1 : 0,
      lostC: mean(central.map((m) => lostOf(r, m))),
      lostA: lostOf(r, r.played),
      pHisC: who === 'his' ? mean(central.map((m) => r.scores[m].pHis)) : null,
      pPlusC: who === 'his' ? mean(central.map((m) => r.scores[m].pPlus)) : null,
      pHisF: who === 'his' && fl.length ? mean(fl.map((m) => r.scores[m].pHis)) : null,
      pPlusF: who === 'his' && fl.length ? mean(fl.map((m) => r.scores[m].pPlus)) : null,
    })
  }
  return { entering, flank, tally, scored: rows.length }
}

const his = positionsOf('his')
const strong = positionsOf('strong')
const seedFor = (k) => SEED + k

const inCentre = (p) => p.centre
const gamesIn = (list) => ({
  centre: new Set(list.filter(inCentre).map((p) => p.gi)).size,
  away: new Set(list.filter((p) => !inCentre(p)).map((p) => p.gi)).size,
})

function measuresOf(list, k, moveKey) {
  const units = byGame(list)
  return {
    positions: { centre: list.filter(inCentre).length, away: list.filter((p) => !inCentre(p)).length },
    games: gamesIn(list),
    referee: bootStat(units, meanStat((p) => p[moveKey] - p.R), seedFor(k + 1)),
    nullLift: bootStat(units, liftStat((p) => p.R2 - p.R, inCentre), seedFor(k + 2)),
    lift: bootStat(units, liftStat((p) => p.C - p.R, inCentre), seedFor(k + 3)),
    gain: bootStat(units, meanStat((p) => p.C - p[moveKey], inCentre), seedFor(k + 4)),
  }
}

const halves = [0, 1].map((h) => measuresOf(his.entering.filter((p) => p.half === h), 10 * h, 'A'))
const strongM = measuresOf(strong.entering, 100, 'A')

const controls = {
  referee: halves.every((h) => above0(h.referee)) && above0(strongM.referee),
  null: !(halves.every((h) => above0(h.nullLift)) || halves.every((h) => below0(h.nullLift))),
}
const verdict = verdictOf({ controls, halves, minGames: MIN_GAMES })
const strongAgrees = strongReading(strongM.lift, verdict)

function describe(list, k, withMaia) {
  const units = byGame(list)
  const arms = withMaia ? ['C', 'A', 'N', 'U', 'R', 'R2'] : ['C', 'A', 'R', 'R2']
  const byCondition = Object.fromEntries(
    [
      ['centre', inCentre],
      ['away', (p) => !inCentre(p)],
    ].map(([name, keep], j) => [
      name,
      Object.fromEntries([
        ...arms.map((arm, i) => [arm, bootStat(units, meanStat((p) => p[arm], (p) => keep(p) && p[arm] !== null), seedFor(k + 20 + 10 * j + i))]),
        ['playedCentral', bootStat(units, meanStat((p) => p.playedCentral, keep), seedFor(k + 40 + j))],
        ['lostC', bootStat(units, meanStat((p) => p.lostC, keep), seedFor(k + 42 + j))],
        ['lostA', bootStat(units, meanStat((p) => p.lostA, keep), seedFor(k + 44 + j))],
        ...(withMaia
          ? [
              ['pHisC', bootStat(units, meanStat((p) => p.pHisC, keep), seedFor(k + 46 + j))],
              ['pPlusC', bootStat(units, meanStat((p) => p.pPlusC, keep), seedFor(k + 48 + j))],
            ]
          : []),
      ]),
    ]),
  )
  const startOnly = (p) => p.start || !p.centre
  return {
    byCondition,
    stricter: {
      positions: list.filter((p) => p.start).length,
      lift: bootStat(units, liftStat((p) => p.C - p.R, (p) => p.start, startOnly), seedFor(k + 50)),
    },
    queensOn: {
      positions: { centre: list.filter((p) => p.queens && p.centre).length, away: list.filter((p) => p.queens && !p.centre).length },
      lift: bootStat(units, liftStat((p) => p.C - p.R, inCentre, (p) => p.queens), seedFor(k + 51)),
    },
  }
}

function flankLift(list, k) {
  const units = byGame(list)
  return {
    positions: { centre: list.filter(inCentre).length, away: list.filter((p) => !inCentre(p)).length },
    lift: bootStat(units, liftStat((p) => p.F - p.R, inCentre), seedFor(k + 60)),
  }
}

function maiaFlank(list, k) {
  const withFlank = list.filter((p) => p.pHisF !== null)
  const units = byGame(withFlank)
  return {
    positions: withFlank.length,
    pHisC: bootStat(units, meanStat((p) => p.pHisC), seedFor(k + 70)),
    pHisF: bootStat(units, meanStat((p) => p.pHisF), seedFor(k + 71)),
    pPlusC: bootStat(units, meanStat((p) => p.pPlusC), seedFor(k + 72)),
    pPlusF: bootStat(units, meanStat((p) => p.pPlusF), seedFor(k + 73)),
  }
}

const descriptions = {
  halves: [0, 1].map((h) => ({
    ...describe(his.entering.filter((p) => p.half === h), 200 + 100 * h, true),
    flank: flankLift(his.flank.filter((p) => p.half === h), 200 + 100 * h),
    maia: maiaFlank(his.entering.filter((p) => p.half === h), 200 + 100 * h),
  })),
  strong: { ...describe(strong.entering, 500, false), flank: flankLift(strong.flank, 500) },
}

const report = {
  app: sourceSummary.app ?? null,
  lab: { commit: gitCommit(LAB) },
  source: SOURCE,
  design: { seed: SEED, draws: DRAWS, minGames: MIN_GAMES },
  coverage: { his: { scored: his.scored, ...his.tally }, strong: { scored: strong.scored, ...strong.tally } },
  verdict,
  controls: { ...controls, halves: halves.map((h) => ({ referee: h.referee, nullLift: h.nullLift })), strong: { referee: strongM.referee } },
  halves,
  strong: { ...strongM, reading: strongAgrees },
  descriptions,
}
writeFileSync(join(out, 'central-strike.json'), JSON.stringify(report, null, 2) + '\n')

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${(100 * x).toFixed(1)}`)
const ciText = (s) => (s?.ci ? `${pct(s.value)} (${pct(s.ci[0])} to ${pct(s.ci[1])})` : s?.value === null || s?.value === undefined ? 'n/a' : `${pct(s.value)} (no interval)`)
const md = [
  '# Is a central break right while the other king is still in the centre?',
  '',
  `Verdict: **${verdict}**. Strong players: **${strongAgrees}**. The rule is in the README.`,
  '',
  `Rows: structure-breaks at app commit \`${report.app?.commit ?? 'unknown'}\`; this report at lab commit \`${report.lab.commit}\`.`,
  '',
  '## The rule',
  '',
  '| | First half | Second half | Strong players |',
  '|---|---|---|---|',
  `| Positions, king in the centre | ${halves[0].positions.centre} (${halves[0].games.centre} games) | ${halves[1].positions.centre} (${halves[1].games.centre} games) | ${strongM.positions.centre} |`,
  `| Positions, king away | ${halves[0].positions.away} (${halves[0].games.away} games) | ${halves[1].positions.away} (${halves[1].games.away} games) | ${strongM.positions.away} |`,
  `| Referee: A − R (S − R) | ${ciText(halves[0].referee)} | ${ciText(halves[1].referee)} | ${ciText(strongM.referee)} |`,
  `| Null: R2 − R, centre minus away | ${ciText(halves[0].nullLift)} | ${ciText(halves[1].nullLift)} | ${ciText(strongM.nullLift)} |`,
  `| The lift: C − R, centre minus away | ${ciText(halves[0].lift)} | ${ciText(halves[1].lift)} | ${ciText(strongM.lift)} |`,
  `| The strike's gain: C − A (S), centre | ${ciText(halves[0].gain)} | ${ciText(halves[1].gain)} | ${ciText(strongM.gain)} |`,
  '',
  `Points of soundness (percent), with 95% intervals from ${DRAWS.toLocaleString('en-US')} bootstrap draws over games. Controls: referee ${controls.referee ? 'passed' : 'failed'}, null ${controls.null ? 'passed' : 'failed'}.`,
  '',
  '## Described, not tested',
  '',
  '| | First half, centre | First half, away | Second half, centre | Second half, away | Strong, centre | Strong, away |',
  '|---|---|---|---|---|---|---|',
  ...['C', 'A', 'N', 'U', 'R', 'R2', 'playedCentral'].map((arm) => {
    const cell = (d, c) => ciText(d.byCondition[c][arm])
    const H = descriptions.halves
    const S = descriptions.strong
    return `| ${arm} | ${cell(H[0], 'centre')} | ${cell(H[0], 'away')} | ${cell(H[1], 'centre')} | ${cell(H[1], 'away')} | ${S.byCondition.centre[arm] ? cell(S, 'centre') : 'n/a'} | ${S.byCondition.away[arm] ? cell(S, 'away') : 'n/a'} |`
  }),
  '',
  `- The stricter reading (king on its starting square): lift ${ciText(descriptions.halves[0].stricter.lift)} and ${ciText(descriptions.halves[1].stricter.lift)}; strong ${ciText(descriptions.strong.stricter.lift)}.`,
  `- With both queens on: lift ${ciText(descriptions.halves[0].queensOn.lift)} and ${ciText(descriptions.halves[1].queensOn.lift)}; strong ${ciText(descriptions.strong.queensOn.lift)}.`,
  `- The flank breaks: lift ${ciText(descriptions.halves[0].flank.lift)} and ${ciText(descriptions.halves[1].flank.lift)}; strong ${ciText(descriptions.strong.flank.lift)}.`,
  `- Maia-2 at his band, per break, central against flank (positions with both on): ${ciText(descriptions.halves[0].maia.pHisC)} against ${ciText(descriptions.halves[0].maia.pHisF)}, and ${ciText(descriptions.halves[1].maia.pHisC)} against ${ciText(descriptions.halves[1].maia.pHisF)}.`,
  `- Win% given up, central breaks and his move, centre: ${descriptions.halves.map((h) => `${h.byCondition.centre.lostC.value.toFixed(1)} and ${h.byCondition.centre.lostA.value.toFixed(1)}`).join('; ')}; away: ${descriptions.halves.map((h) => `${h.byCondition.away.lostC.value.toFixed(1)} and ${h.byCondition.away.lostA.value.toFixed(1)}`).join('; ')}.`,
  '',
].join('\n')
writeFileSync(join(out, 'central-strike.md'), md)
console.log(JSON.stringify({ verdict, strong: strongAgrees, controls, positions: halves.map((h) => h.positions) }, null, 2))
