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

// Run the generator's actual claims on the committed aggregates, while replacing
// only its imports and TeX output. This needs neither private data nor the app.
function generate(mutate = () => {}) {
  const fixtures = new Map()
  let writes = 0
  const context = {
    readFileSync(file) {
      if (!fixtures.has(file)) {
        const value = JSON.parse(readFileSync(file, 'utf8'))
        mutate(file, value)
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
    console: { error() {} },
  }
  runInNewContext(generator, context, { filename: join(here, 'generate.mjs') })
  return writes
}

test('the committed aggregates pass every paper claim', () => {
  assert.equal(generate(), 1)
})

test('the older reference must also beat the app window in the replay example', () => {
  const candidate = JSON.parse(readFileSync(join(results, 'replay-permove.json'), 'utf8'))
  const baseline = JSON.parse(readFileSync(join(results, 'replay.json'), 'utf8'))
  const flip = candidate.focuses.find((f) => f.outcome === 'not-met' && baseline.focuses.some((a) => a.cause === f.cause && a.startedOn === f.startedOn && a.outcome === 'met'))
  assert.ok(flip)
  assert.ok(flip.read.reference.perMove > 0)
  assert.throws(() => generate((file, value) => {
    if (file !== join(results, 'replay.json')) return
    const appFlip = value.focuses.find((f) => f.cause === flip.cause && f.startedOn === flip.startedOn)
    // This window improved over the reference, contradicting the paper's claim
    // about both windows, while leaving the candidate window and all rates intact.
    appFlip.read.window.perMove = 0
  }), /the paper's claim no longer holds: that focus's baseline/)
})
