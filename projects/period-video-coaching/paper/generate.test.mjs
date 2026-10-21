import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const results = join(here, '..', 'results')
const generator = readFileSync(join(here, 'generate.mjs'), 'utf8')
  .replace(/^#!.*\n/, '')
  .replace(/^import .*\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(new URL('./generate.mjs', import.meta.url).href))

// Exercise the complete generator on in-memory copies of the aggregates. Only
// imports and the output writer are replaced; no result or paper file changes.
function generate(mutate = () => {}) {
  let writes = 0
  const fixtures = new Map()
  runInNewContext(generator, {
    readFileSync(file) {
      if (!fixtures.has(file)) {
        const value = JSON.parse(readFileSync(file, 'utf8'))
        if (file === join(results, 'runs.json')) mutate(value)
        fixtures.set(file, JSON.stringify(value))
      }
      return fixtures.get(file)
    },
    dirname, join, fileURLToPath,
    resultsDir: () => results,
    Generated: class {
      def() { return this }
      block() { return this }
      write() { writes++ }
    },
    esc: String, fixed: String, percent: String, word: String,
    console: { log() {} },
  }, { filename: join(here, 'generate.mjs') })
  return writes
}

test('the committed aggregates pass the paper claims', () => {
  assert.equal(generate(), 1)
})

test('no controls cannot satisfy the every-period claim', () => {
  assert.throws(() => generate((runs) => { runs.controls = {} }), /both controls cover every judged period/)
})

for (const kind of ['same', 'decoy']) {
  test(`a missing ${kind} control cannot satisfy the every-period claim`, () => {
    assert.throws(() => generate((runs) => {
      delete Object.values(runs.controls)[0][kind]
    }), /both controls cover every judged period/)
  })
}
