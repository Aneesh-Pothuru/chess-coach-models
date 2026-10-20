import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir, resultsDir } from '../../bridge/lib/lab.mjs'
import { BUDGET, DECOY_DROP, MARGIN, PLIES, PROJECT, ROLLOUTS, bootstrapMean, readJsonl } from './lib.mjs'

const dir = privateDir(PROJECT)
const results = resultsDir(PROJECT)
const setup = JSON.parse(readFileSync(join(results, 'positions.json'), 'utf8'))
const positions = readJsonl(join(dir, 'positions.jsonl'))
const rollouts = readdirSync(dir)
  .filter((f) => /^rollouts-\d+-of-\d+\.jsonl$/.test(f))
  .flatMap((f) => readJsonl(join(dir, f)))

const byKey = new Map()
for (const r of rollouts) {
  const key = `${r.id}|${r.which}`
  const list = byKey.get(key) ?? new Map()
  list.set(r.k, r)
  byKey.set(key, list)
}

function valueOf(id, which, from = 0, to = ROLLOUTS) {
  const list = byKey.get(`${id}|${which}`)
  if (!list) return null
  let sum = 0
  for (let k = from; k < to; k++) {
    const r = list.get(k)
    if (!r || typeof r.wp !== 'number' || !Number.isFinite(r.wp)) return null
    sum += r.wp
  }
  return sum / (to - from)
}

const incomplete = { B: 0, F: 0, P: 0 }
const rows = []
for (const p of positions) {
  const vB = valueOf(p.id, 'B')
  const vF = valueOf(p.id, 'F')
  if (vB === null) incomplete.B++
  if (vF === null) incomplete.F++
  if (vB === null || vF === null) continue
  const rolledP = p.kind === 'turning' && p.P.uci !== p.B.uci && p.P.uci !== p.F.uci
  const vP = rolledP ? valueOf(p.id, 'P') : null
  if (rolledP && vP === null) incomplete.P++
  rows.push({
    id: p.id,
    game: p.game,
    split: p.split,
    kind: p.kind,
    phase: p.phase,
    bestKind: p.B.forcing ? 'forcing' : 'quiet',
    decoy: p.decoy && vP !== null,
    rootGap: p.B.wp - p.F.wp,
    pHisB: p.B.pHis,
    pHisF: p.F.pHis,
    vB,
    vF,
    vP,
    dF: vF - vB,
    dP: vP === null ? null : vP - vB,
    fOverP: vP === null ? null : vF - vP,
    nullHalves: valueOf(p.id, 'B', 0, ROLLOUTS / 2) - valueOf(p.id, 'B', ROLLOUTS / 2, ROLLOUTS),
  })
}

const round = (x, d = 2) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d)
// Keep full precision through the controls and verdict; round only for display.
const est = (list, f) => bootstrapMean(list, f)
const share = (list, f) => (list.length ? round(list.filter(f).length / list.length, 4) : null)

const SPLITS = ['train', 'heldout']
const sets = Object.fromEntries(SPLITS.map((s) => [s, rows.filter((r) => r.split === s)]))

const controls = Object.fromEntries(
  SPLITS.map((s) => {
    const nul = est(sets[s], (r) => r.nullHalves)
    const decoy = est(
      sets[s].filter((r) => r.decoy),
      (r) => r.dP,
    )
    return [
      s,
      {
        null: { ...nul, passes: nul.ci !== null && nul.ci[0] <= 0 && nul.ci[1] >= 0 },
        decoy: { ...decoy, passes: decoy.ci !== null && decoy.ci[1] < 0 },
      },
    ]
  }),
)
const controlsPass = SPLITS.every((s) => controls[s].null.passes && controls[s].decoy.passes)

const primary = Object.fromEntries(SPLITS.map((s) => [s, est(sets[s], (r) => r.dF)]))
const all = (f) => SPLITS.every((s) => primary[s].ci !== null && f(primary[s].ci))
let verdict
if (!controlsPass) verdict = 'no verdict: a control failed'
else if (all((ci) => ci[0] > 0)) verdict = 'better in his hands'
else if (all((ci) => ci[0] > -MARGIN)) verdict = 'holds up'
else if (all((ci) => ci[1] < -MARGIN)) verdict = "the engine's best is worth the trouble"
else verdict = 'unclear'

const groups = (list, key) => {
  const out = {}
  for (const r of list) (out[r[key]] ??= []).push(r)
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, est(v, (r) => r.dF)]))
}
const described = (list) => ({
  n: list.length,
  dF: est(list, (r) => r.dF),
  rootGap: est(list, (r) => r.rootGap),
  minusDF: est(list, (r) => -r.dF),
  shareFAhead: share(list, (r) => r.dF > 0),
  byBestKind: groups(list, 'bestKind'),
  byKind: groups(list, 'kind'),
  byPhase: groups(list, 'phase'),
  fOverPlayed: est(
    list.filter((r) => r.fOverP !== null),
    (r) => r.fOverP,
  ),
  meanPHisBest: round(list.reduce((a, r) => a + r.pHisB, 0) / Math.max(1, list.length), 4),
  meanPHisFindable: round(list.reduce((a, r) => a + r.pHisF, 0) / Math.max(1, list.length), 4),
  nullWidth: (() => {
    const e = est(list, (r) => r.nullHalves)
    return e.ci ? round(e.ci[1] - e.ci[0]) : null
  })(),
})

const report = {
  question: 'At his turning points and plan checkpoints where the sound move his band would find is not the engine best, does it score as well as the engine best when Maia-2 plays on for both sides?',
  app: setup.app,
  design: { rollouts: ROLLOUTS, plies: PLIES, budget: BUDGET, margin: MARGIN, decoyDrop: DECOY_DROP },
  positions: { entering: positions.length, scored: rows.length, incomplete, bySplit: Object.fromEntries(SPLITS.map((s) => [s, sets[s].length])) },
  controls,
  controlsPass,
  primary,
  verdict,
  described: { all: described(rows), ...Object.fromEntries(SPLITS.map((s) => [s, described(sets[s])])) },
}
writeFileSync(join(results, 'findable-move.json'), JSON.stringify(report, null, 2) + '\n')

const ci = (e) => (e.ci ? `${round(e.mean)} (${round(e.ci[0])} to ${round(e.ci[1])})` : 'not enough data')
const md = [
  '# Findable move: results',
  '',
  `Written by \`projects/findable-move/analyze.mjs\` on app commit \`${setup.app.commit.slice(0, 7)}\`, from ${rows.length} of ${positions.length} positions (${ROLLOUTS} rollouts of ${PLIES} plies per move, ends scored at the \`${BUDGET}\` budget).`,
  '',
  `**Verdict: ${verdict}.**`,
  '',
  '| | Train | Held out |',
  '|---|---|---|',
  `| Positions | ${sets.train.length} | ${sets.heldout.length} |`,
  `| Null: B's halves, mean difference | ${ci(controls.train.null)} | ${ci(controls.heldout.null)} |`,
  `| Decoy: his move against B, D_P | ${ci(controls.train.decoy)} | ${ci(controls.heldout.decoy)} |`,
  `| D_F = V(F) − V(B), win% | ${ci(primary.train)} | ${ci(primary.heldout)} |`,
  '',
  'Means in win% with 95% intervals from 2,000 bootstrap draws over games. The rule is in the README.',
  '',
  '## Described, not tested (both sets)',
  '',
  `- The engine's root gap B − F: ${ci(report.described.all.rootGap)} win%; in human hands, −D_F: ${ci(report.described.all.minusDF)}.`,
  `- Share of positions where F scores above B: ${report.described.all.shareFAhead}.`,
  `- F over the move he played, at the ${report.described.all.fOverPlayed.n} turning points where he played neither B nor F: ${ci(report.described.all.fOverPlayed)} win%.`,
  `- Maia-2 at his band plays B ${report.described.all.meanPHisBest} and F ${report.described.all.meanPHisFindable} of the time (means).`,
  `- D_F by the best move's kind: ${Object.entries(report.described.all.byBestKind).map(([k, v]) => `${k} ${ci(v)}`).join('; ')}.`,
  `- D_F by position: ${Object.entries(report.described.all.byKind).map(([k, v]) => `${k} ${ci(v)}`).join('; ')}.`,
  `- D_F by phase: ${Object.entries(report.described.all.byPhase).map(([k, v]) => `${k} ${ci(v)}`).join('; ')}.`,
  '',
].join('\n')
writeFileSync(join(results, 'findable-move.md'), md)
console.log(JSON.stringify({ verdict, primary, controlsPass, scored: rows.length }, null, 2))
