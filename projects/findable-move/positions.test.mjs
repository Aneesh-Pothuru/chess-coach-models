import assert from 'node:assert/strict'
import test from 'node:test'
import { chess } from '../../bridge/lib/chess.mjs'
import { clocksSayTenMinutes, tenMinutes } from './lib.mjs'

const { timeControlOf } = await chess('tools/coach-review/rule-metrics.cjs')

test('the cohort accepts a 600-second control with no increment', () => {
  assert.equal(tenMinutes({ time_control: '600' }, timeControlOf), true)
  assert.equal(tenMinutes({ time_control: '600+0' }, timeControlOf), true)
})

test('the cohort rejects other base clocks and increments', () => {
  assert.equal(tenMinutes({ time_control: '300' }, timeControlOf), false)
  assert.equal(tenMinutes({ time_control: '600+5' }, timeControlOf), false)
  assert.equal(tenMinutes({ time_control: '900+10' }, timeControlOf), false)
})

test('a game with no time control reads as the app reads it, ten minutes with no increment', () => {
  assert.equal(tenMinutes({}, timeControlOf), true)
  assert.equal(tenMinutes({ time_control: null }, timeControlOf), true)
})

test('the clocks confirm ten minutes when each side starts between 540 and 600 seconds and never gains time', () => {
  assert.equal(clocksSayTenMinutes({ clocks: [597, 598, 590, 585, 580, 560] }), true)
  assert.equal(clocksSayTenMinutes({ clocks: [600, 600] }), true)
})

test('the clocks do not confirm ten minutes on an increment, a longer start or a short record', () => {
  assert.equal(clocksSayTenMinutes({ clocks: [597, 598, 600, 590] }), false)
  assert.equal(clocksSayTenMinutes({ clocks: [895, 898, 880, 870] }), false)
  assert.equal(clocksSayTenMinutes({ clocks: [500, 598, 490, 590] }), false)
  assert.equal(clocksSayTenMinutes({ clocks: [597] }), false)
  assert.equal(clocksSayTenMinutes({}), false)
  assert.equal(clocksSayTenMinutes({ clocks: [597, null, 590, 585] }), false)
})
