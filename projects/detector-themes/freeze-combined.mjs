// Create once before scoring; subsequent invocations verify the same bytes.
import fs from 'node:fs'
import { join } from 'node:path'
import { ROOT, PROJECT, COMBINED, SPEC, MANIFEST, FROZEN_FILES, digest, read, json, assert, verifyCombined } from './combined-freeze.mjs'

const flags = process.argv.slice(2)
assert(flags.every((flag) => ['--verify', '--bind-work'].includes(flag)), 'usage: freeze-combined.mjs [--verify|--bind-work]')
if (!fs.existsSync(join(ROOT, MANIFEST))) {
  assert(flags.length === 0, 'combined design must be frozen before scoring')
  for (const directory of [`${PROJECT}/results/round2`, 'private/detector-themes/round2']) {
    const entries = fs.existsSync(join(ROOT, directory)) ? fs.readdirSync(join(ROOT, directory)) : []
    assert(!entries.some((name) => name.includes(COMBINED) || name === 'combined-freeze.sha256'), 'combined work already exists; refusing a retrospective freeze')
  }
  const spec = json(SPEC)
  const sample = json(`${PROJECT}/results/round2/sample.json`)
  const datasets = Object.fromEntries(['app', 'heldout'].map((set) => {
    const score = json(`${PROJECT}/results/round2/score-${set}.json`)
    return [set, { puzzles: score.puzzles, datasetSha256: score.datasetSha256, ...(set === 'heldout' ? { serializedSha256: sample.data_sha256 } : {}) }]
  }))
  const manifest = {
    project: spec.project, round: spec.round, phase: spec.phase, candidate: spec.candidate,
    app: json('bridge/chess.json').commit,
    priority: spec.priority, availabilityDefinition: spec.availabilityDefinition, rule: spec.rule,
    files: Object.fromEntries(FROZEN_FILES.map((path) => [path, digest(read(path))])), datasets,
  }
  fs.writeFileSync(join(ROOT, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
}
const verified = verifyCombined()
if (flags.includes('--bind-work')) {
  const directory = join(ROOT, 'private/detector-themes/round2')
  fs.mkdirSync(directory, { recursive: true })
  const path = join(directory, 'combined-freeze.sha256')
  if (fs.existsSync(path)) assert(fs.readFileSync(path, 'utf8').trim() === verified.sha256, 'resumed combined work belongs to another frozen design')
  else {
    for (const relative of [`${PROJECT}/results/round2`, 'private/detector-themes/round2']) {
      assert(!fs.readdirSync(join(ROOT, relative)).some((name) => name.includes(COMBINED)), 'unbound combined work already exists; refusing to adopt it')
    }
    fs.writeFileSync(path, verified.sha256 + '\n', { flag: 'wx' })
  }
}
console.log(`verified combined design SHA256 ${verified.sha256}`)
