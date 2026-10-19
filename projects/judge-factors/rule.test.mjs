import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { readingDecision, wilson } from './lib.mjs'

const reported = (k, n) => {
  const a = wilson(k, n)
  return { ...a, ci: a.ci?.map((x) => Math.round(x * 1e4) / 1e4) ?? null }
}
const both = (k, n) => ({ train: reported(k, n), heldout: reported(k, n) })

test('the rule uses the Wilson interval before rounding at one half', () => {
  assert.equal(readingDecision(both(116, 204)).verdict, 'tells who is better')
  assert.equal(readingDecision(both(88, 204)).verdict, 'points the wrong way')
})

test('rounding cannot award reliability at two thirds', () => {
  assert.equal(readingDecision(both(216, 300)).reliable, false)
})

test('the held-out minimum overrides an otherwise clear result', () => {
  assert.deepEqual(readingDecision(both(199, 199)), { verdict: 'not enough data (n=199)', reliable: false })
})

test('the committed aggregate counts keep their verdicts', () => {
  const report = JSON.parse(readFileSync(new URL('./results/judge-factors.json', import.meta.url), 'utf8'))
  for (const reading of Object.values(report.readings)) {
    assert.deepEqual(readingDecision(reading.agreement), { verdict: reading.verdict, reliable: reading.reliable })
  }
})
