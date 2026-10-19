import assert from 'node:assert/strict'
import test from 'node:test'
import { chess } from '../../bridge/lib/chess.mjs'
import { tenMinutes } from './lib.mjs'

const { parseTimeControl } = await chess('src/core/game/index.ts')

test('the cohort accepts a parsed 600-second control with no increment', () => {
  assert.equal(tenMinutes({ time_control: '600' }, parseTimeControl), true)
  assert.equal(tenMinutes({ time_control: '600+0' }, parseTimeControl), true)
})

test('the cohort rejects other base clocks and increments', () => {
  assert.equal(tenMinutes({ time_control: '300' }, parseTimeControl), false)
  assert.equal(tenMinutes({ time_control: '600+5' }, parseTimeControl), false)
})

test('a missing time control does not establish 600 seconds with no increment', () => {
  assert.equal(tenMinutes({ clocks: [900, 850] }, parseTimeControl), false)
  assert.equal(tenMinutes({ clocks: [600, 590] }, parseTimeControl), false)
})

test('an invalid time control does not establish 600 seconds with no increment', () => {
  assert.equal(tenMinutes({ time_control: 'invalid' }, parseTimeControl), false)
})
