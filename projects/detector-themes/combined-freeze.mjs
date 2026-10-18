// Shared content inventory for the combined candidate; importing never writes.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const PROJECT = 'projects/detector-themes'
export const COMBINED = 'best-deflection-trapped'
export const SPEC = `${PROJECT}/combined-spec.json`
export const MANIFEST = `${PROJECT}/results/round2/combined-design.json`
const independent = ['best-deflection', 'best-trapped']
export const FROZEN_FILES = [
  'bridge/chess.json', SPEC,
  ...['candidate.sh', 'run-score.sh', 'run-combined.sh', 'score.mts', 'compare.mjs', 'sample.py', 'development.mjs', 'combined-freeze.mjs', 'freeze-combined.mjs', 'overlap-combined.mjs'].map((name) => `${PROJECT}/${name}`),
  ...[...independent, COMBINED].flatMap((name) => ['theme.ts', 'theme.test.ts', 'mistakes.ts', 'mistakes.test.ts', 'knowledge-README.md'].map((file) => `${PROJECT}/candidates/${name}/${file}`)),
  ...['sample.json', 'development.json', 'development.md', ...['app', 'heldout'].flatMap((set) => [`score-${set}.json`, ...independent.map((name) => `score-${set}-${name}.json`)]), ...independent.map((name) => `compare-${name}.json`)].map((file) => `${PROJECT}/results/round2/${file}`),
].sort()
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
export const read = (path) => fs.readFileSync(join(ROOT, path))
export const json = (path) => JSON.parse(read(path))
export const assert = (condition, message) => { if (!condition) throw new Error(message) }
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

export function verifyCombined() {
  const bytes = read(MANIFEST)
  const manifest = JSON.parse(bytes)
  const spec = json(SPEC)
  assert(manifest.project === 'detector-themes' && manifest.round === 2 && manifest.phase === 3 && manifest.candidate === COMBINED, 'wrong combined design identity')
  assert(same(Object.keys(manifest.files).sort(), FROZEN_FILES), 'combined content inventory differs')
  for (const path of FROZEN_FILES) assert(digest(read(path)) === manifest.files[path], `${path}: changed after the combined freeze`)
  for (const key of ['priority', 'availabilityDefinition', 'rule']) assert(same(manifest[key], spec[key]), `combined ${key} differs from its specification`)
  assert(manifest.app === json('bridge/chess.json').commit, 'combined app pin changed')
  for (const set of ['app', 'heldout']) {
    const baseline = json(`${PROJECT}/results/round2/score-${set}.json`)
    assert(manifest.datasets[set].puzzles === baseline.puzzles && manifest.datasets[set].datasetSha256 === baseline.datasetSha256, `${set}: combined data identity differs`)
  }
  assert(manifest.datasets.heldout.serializedSha256 === json(`${PROJECT}/results/round2/sample.json`).data_sha256, 'combined serialized sample differs')
  return { manifest, sha256: digest(bytes) }
}
