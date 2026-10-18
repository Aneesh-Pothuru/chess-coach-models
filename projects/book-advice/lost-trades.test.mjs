// Synthetic move facts only: no archive, engine, Maia or study output.
// Run with: node --test projects/book-advice/lost-trades.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

const source = readFileSync(new URL('./lost-trades.mjs', import.meta.url), 'utf8')
// The study runs its data pass at import time. Load its actual reader and
// estimator without that pass; supply an already selected synthetic move in
// place of the board search, whose behavior this test does not exercise.
const functions = source.slice(source.indexOf('function rowOf('), source.indexOf('const r4 = '))
const context = vm.createContext({
  FULL_CLOCK: 600,
  CLOCK_EDGE: 30,
  RATING_FLOOR: 1250,
  firstPosition: (g) => ({ m: g.selected, bits: 0, moveNet: null }),
  kindOf: (m) => ({ kind: m.kind, check: false, passed: false }),
})
vm.runInContext(`${functions}\nglobalThis.readRow = rowOf; globalThis.estimate = rows => difference(rows, 'plain', STRATA.after);`, context)

function row(wpAfter, kind = 'keep', saved = 0) {
  return context.readRow({
    score: saved,
    moves: [{}, { clock: 300 }],
    selected: { ply: 2, material: -2, clockBefore: 300, wpBefore: 20, wpAfter, lossPct: 0, kind },
  }, [], 1300, 1300, false)
}

test('post-move strata retain five-point bins above 25 win%', () => {
  for (const [wp, bin] of [[24.9, 4], [25, 5], [29.9, 5], [30, 6], [34.9, 6], [35, 7], [99.9, 19]]) {
    assert.equal(row(wp).wpAfter, bin, `${wp} win%`)
  }
})

test('controls in a higher post-move bin cannot change a matched trade estimate', () => {
  const rows = [
    ...Array.from({ length: 300 }, () => row(26, 'plain', 0)),
    ...Array.from({ length: 300 }, () => row(26, 'keep', 0)),
    ...Array.from({ length: 300 }, () => row(31, 'keep', 1)),
  ]
  const measured = context.estimate(rows)
  assert.equal(measured.used, 300)
  assert.equal(measured.dropped, 0)
  assert.equal(measured.d, 0)
})
