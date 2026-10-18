// A deferred paper scaffold. The answer is written after the full run.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Generated } from '../../paper.mjs'

const result = JSON.parse(readFileSync(new URL('../results/phase1.json', import.meta.url)))
assert.equal(result.phase, 'counts and timings only')
assert.equal(result.data.month, '2026-07')
assert.equal(result.packagesInstalled.length, 0)
assert(!existsSync(new URL('../results/rules.json', import.meta.url)), 'full results exist: write the reviewed paper and its claim checks before regenerating')
const generated = new Generated('projects/rules-of-thumb/paper/generate.mjs')
generated.def('StudyStatus', 'The full study has not run. This is a deferred paper scaffold. The implementation and timing record are in the project results directory. The answer and paper follow the full scan and review.')
generated.write(fileURLToPath(new URL('./generated.tex', import.meta.url)))
