import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const generator = readFileSync(join(here, 'generate.mjs'), 'utf8')
const marker = '// ---- the reproduction ----'
assert.equal(generator.split(marker).length, 2)
const reproduction = generator.slice(generator.indexOf(marker))

// Exercise the generator's real reproduction block without private games,
// candidate checkouts or TeX writes. Only the input and output are replaced.
function generate(mutate = () => {}) {
  const report = JSON.parse(readFileSync(join(here, '..', 'results', 'reproduction.json'), 'utf8'))
  mutate(report.reread)
  let writes = 0
  const g = {
    def() { return this },
    block() { return this },
    write() { writes++ },
  }
  runInNewContext(reproduction, {
    json: () => report,
    resultsDir: () => '/synthetic-results',
    FLOW: 'accuracy-vs-chesscom', HERE: here,
    join, g, fixed: String,
    console: { log() {} },
  }, { filename: join(here, 'generate.mjs') })
  return writes
}

test('the recorded re-read results allow the paper to be written', () => {
  assert.equal(generate(), 1)
})

test('a failed re-read verdict cannot retain the paper claim that it holds', () => {
  assert.throws(() => generate((r) => { r.rerun.holds = false }), /re-read.*paper says/i)
})

test('the re-read thresholds are inclusive', () => {
  assert.equal(generate((r) => {
    r.rerun.mae = r.rule.mae
    r.rerun.p90 = r.rule.p90
  }), 1)
})

for (const set of ['recorded', 'rerun']) {
  for (const measure of ['mae', 'p90']) {
    test(`a ${set} ${measure} above the rule cannot retain the re-read claim`, () => {
      assert.throws(() => generate((r) => {
        r[set][measure] = r.rule[measure] + 0.01
      }), /re-read.*paper says/i)
    })
  }
}
