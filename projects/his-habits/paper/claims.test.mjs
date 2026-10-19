import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('generate.mjs', import.meta.url), 'utf8')
const assertion = source.split('\n').find((line) => line.includes("'on Lichess, pawn breaks show no trend across the bands'"))
assert.ok(assertion, 'the generator guards the all-band claim')

function check(breakRates) {
  runInNewContext(assertion, {
    breakRates,
    claim(ok, what) {
      if (!ok) throw new Error(what)
    },
  })
}

test('overlapping endpoints do not hide disjoint interior bands', () => {
  const rates = [0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08].map((rate, i) => ({
    rate,
    ciRate: i === 0 || i === 6 ? [0, 0.1] : [rate - 0.001, rate + 0.001],
  }))
  assert.throws(() => check(rates), /pawn breaks show no trend/)
})

test('the committed aggregate intervals still support the guard', () => {
  const description = JSON.parse(readFileSync(new URL('../results/descriptions.json', import.meta.url), 'utf8'))
  assert.doesNotThrow(() => check(description.lichess.map((band) => band.kinds.find((kind) => kind.kind === 'pawn-break'))))
})
