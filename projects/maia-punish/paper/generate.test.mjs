import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const generator = readFileSync(join(here, 'generate.mjs'), 'utf8')
const start = '// The secondary outcome on all replies,'
const end = '// ---- the calibration figure,'
assert.equal(generator.split(start).length, 2)
assert.equal(generator.split(end).length, 2)
const secondary = generator.slice(generator.indexOf(start), generator.indexOf(end))

// Run the actual generator block on synthetic Brier results. The primary E1
// verdict is deliberately left alone: this prose makes a separate E2 claim.
function generate(interval) {
  const results = { 'ALL|player-err': { e2: { bq: 0.2, bb: 0.25, iB: interval } } }
  let definitions = 0
  const g = { def() { definitions++; return this } }
  runInNewContext(secondary, {
    results, g, fixed: String, ci: String,
  }, { filename: join(here, 'generate.mjs') })
  return definitions
}

test('an E2 interval crossing zero supports the stated non-win', () => {
  assert.equal(generate([-0.1, 0.02]), 2)
})

test('an E2 interval ending at zero does not beat the base rate', () => {
  assert.equal(generate([-0.1, 0]), 2)
})

test('an E2 interval below zero contradicts the paper and is refused', () => {
  assert.throws(() => generate([-0.1, -0.01]), /E2.*base rate.*paper says/i)
})
