import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const filename = new URL('./generate.mjs', import.meta.url)
const generator = readFileSync(filename, 'utf8')
function block(start, end) {
  assert.equal(generator.split(start).length, 2)
  assert.equal(generator.split(end).length, 2)
  return generator.slice(generator.indexOf(start), generator.indexOf(end))
}
const groupClaims = block('const groupsShown =', '// ---- his choice, and the ready break against his move ----')
const exampleClaims = block('const firstOf =', 'const engine =')
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}

// Run the generator's actual selection and claims with synthetic readings.
// Nothing here imports an engine, reads private rows or writes the paper.
const expectedGroups = ['london-pyramid|c3-c4', 'london-pyramid|e3-e4', 'advance-chain|...f7-f6']
function groups(keys) {
  const shown = keys.map((group) => ({ group, ready: 40, rushed: 40, stats: { lift: { ci: [-0.1, 0.1] } } }))
  runInNewContext(groupClaims, {
    out: { groups: shown }, claim, holds0: (ci) => ci[0] <= 0 && ci[1] >= 0,
    g: { block() {}, def() {} }, groupTex: String, count: String, cellOf: String, word: String,
    MIN_CELL: 30,
  }, { filename: filename.pathname })
}

test('the three groups named in the prose pass in any order', () => {
  assert.doesNotThrow(() => groups([...expectedGroups].reverse()))
})

test('three different groups with intervals holding zero cannot support the named groups', () => {
  assert.throws(() => groups([...expectedGroups.slice(0, 2), 'iqp|d4-d5']), /paper's claim no longer holds:.*groups.*names/)
})

function examples(readyHalf, rushedHalf) {
  const checks = [
    { id: 1, half: readyHalf, uci: 'c3c4', checks: { safe: true, aimed: true, rooks: true, force: true }, sound: 0 },
    { id: 2, half: rushedHalf, uci: 'e3e4', checks: { safe: true, aimed: false, rooks: true, force: true }, sound: 1 },
  ]
  const rows = new Map(checks.map((b) => [b.id, { played: 'a2a3', breaks: [b.uci], scores: { a2a3: { sound: true } } }]))
  runInNewContext(exampleClaims, {
    checks, rows, claim,
    piecesReady: (c) => c.aimed && c.rooks && c.force,
    soundOf: (r, uci) => Number(r.scores[uci].sound),
  }, { filename: filename.pathname })
}

test('both examples in the later half support the prose', () => {
  assert.doesNotThrow(() => examples(1, 1))
})

test('an earlier-half ready example cannot silently replace the later-half example', () => {
  assert.throws(() => examples(0, 1), /paper's claim no longer holds:.*later half/)
})

test('an earlier-half rushed example cannot silently replace the later-half example', () => {
  assert.throws(() => examples(1, 0), /paper's claim no longer holds:.*later half/)
})
