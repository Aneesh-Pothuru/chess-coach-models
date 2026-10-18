// App-pool counts only. Deliberately never opens held-out labels or computes a keep verdict.
import fs from 'node:fs'
import { join } from 'node:path'
import { chess, LAB_DIR, resultsDir } from '../../bridge/lib/chess.mjs'

const { VOCABULARY } = await chess('src/services/knowledge/index.ts')
const results = join(resultsDir('detector-themes'), 'round2')
const privatePath = join(LAB_DIR, 'private/detector-themes/round2')
const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const read = (candidate) => {
  const tag = candidate ? `-${candidate}` : ''
  return { score: json(join(results, `score-app${tag}.json`)), rows: json(join(privatePath, `detector-themes-labels-app${tag}.json`)) }
}
const baseline = read(null)
const rowScore = (r) => {
  const concept = VOCABULARY[r.best]
  return { agree: Number(!!concept && r.truth.includes(concept)), disagree: Number(!!concept && !r.truth.includes(concept)) }
}
const totals = (rows) => rows.reduce((sum, r) => {
  const s = rowScore(r)
  return { agree: sum.agree + s.agree, disagree: sum.disagree + s.disagree }
}, { agree: 0, disagree: 0 })
const baseRows = new Map(baseline.rows.map((r) => [r.id, r]))
if (baseRows.size !== baseline.rows.length || !baseRows.size || baseline.score.skipped) throw new Error('invalid baseline')
const candidates = process.argv.slice(2)
if (!candidates.length || candidates.some((c) => !/^[a-z0-9-]+$/.test(c))) throw new Error('name the finalized candidates')
const out = { project: 'detector-themes', round: 2, set: 'app', app: baseline.score.app,
  datasetSha256: baseline.score.datasetSha256, puzzles: baseline.rows.length,
  baseline: { ...totals(baseline.rows), puzzleSeconds: baseline.score.timing.puzzleSeconds }, candidates: {} }
for (const name of candidates) {
  const { score, rows } = read(name)
  if (score.app !== out.app || score.datasetSha256 !== out.datasetSha256 || score.scorerSha256 !== baseline.score.scorerSha256 || rows.length !== out.puzzles || score.skipped) throw new Error('unpaired candidate')
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error('duplicate puzzle')
  const transition = { agreeAdded: 0, agreeLost: 0, disagreeAdded: 0, disagreeLost: 0 }
  let changed = 0
  for (const r of rows) {
    const b = baseRows.get(r.id)
    if (!b || ['truth', 'blunder', 'move', 'themes'].some((key) => JSON.stringify(b[key]) !== JSON.stringify(r[key]))) throw new Error('data or another labeller changed')
    if (b.best !== r.best) changed++
    const before = rowScore(b), after = rowScore(r)
    for (const key of ['agree', 'disagree']) {
      if (after[key] > before[key]) transition[`${key}Added`]++
      if (after[key] < before[key]) transition[`${key}Lost`]++
    }
  }
  out.candidates[name] = { ...totals(rows), ...transition, changed, bestWords: score.bestWords,
    concept: score.table.best[name === 'best-deflection' ? 'deflection' : 'trapped-piece'],
    puzzleSeconds: score.timing.puzzleSeconds,
    sourceSha256: score.sourceSha256,
    status: 'finalized for held-out test; no keep verdict' }
}
const sample = json(join(results, 'sample.json'))
out.sample = sample
const seconds = out.baseline.puzzleSeconds + Object.values(out.candidates).reduce((s, c) => s + c.puzzleSeconds, 0)
out.estimatedHeldout = { puzzles: sample.sampled, processes: 2, scoringSeconds: seconds * sample.sampled / out.puzzles / 2,
  basis: 'sum of app-pool per-puzzle wall times, scaled to the sample and divided by two; excludes launch, copy and comparison overhead' }
fs.writeFileSync(join(results, 'development.json'), JSON.stringify(out, null, 2) + '\n')
const lines = [`# Detector themes: app-pool development`, '', `App: ${out.app}.`, '',
  `Data: ${out.puzzles} unique shipped puzzles; SHA256 ${out.datasetSha256}.`, '',
  '| Candidate | Agree | Disagree | Changed words | Agreement added / lost | Disagreement added / lost | Puzzle seconds |',
  '|---|---:|---:|---:|---:|---:|---:|',
  `| pinned | ${out.baseline.agree} | ${out.baseline.disagree} | — | — | — | ${out.baseline.puzzleSeconds.toFixed(3)} |`,
  ...Object.entries(out.candidates).map(([n,c]) => `| ${n} | ${c.agree} | ${c.disagree} | ${c.changed} | ${c.agreeAdded} / ${c.agreeLost} | ${c.disagreeAdded} / ${c.disagreeLost} | ${c.puzzleSeconds.toFixed(3)} |`), '',
  `Held-out labels were not read. No keep verdict is computed. The sample has ${sample.sampled} puzzles from ${sample.eligible} eligible rows.`, '',
  `Estimated held-out scoring at two processes: ${out.estimatedHeldout.scoringSeconds.toFixed(1)} seconds, excluding launch, copy and comparison overhead.`, '']
fs.writeFileSync(join(results, 'development.md'), lines.join('\n'))
console.log(lines.join('\n'))
