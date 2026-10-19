import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { byGame, interval, mulberry32 } from '../positions-like-this/lib.mjs'

const filename = new URL('./analyze.mjs', import.meta.url)
const analysis = readFileSync(filename, 'utf8')
const start = 'const groups = [...Map.groupBy'
const end = 'const choice ='
assert.equal(analysis.split(start).length, 2)
assert.equal(analysis.split(end).length, 2)
const groupAnalysis = analysis.slice(analysis.indexOf(start), analysis.indexOf(end))
const library = readFileSync(new URL('./lib.mjs', import.meta.url), 'utf8')
const statistics = library.slice(library.indexOf('export function leverWeighted')).replaceAll('export function ', 'function ')
const { bootStat, leverWeighted } = runInNewContext(`${statistics}\n;({ bootStat, leverWeighted })`, { interval, mulberry32, DRAWS: 2000 })

// Exercise the actual descriptive group calculation and bootstrap. Each row is
// a synthetic break reading, and every score is the same on both sides.
function estimate(readyGames, rushedGames, readyPerGame, rushedPerGame) {
  const his = []
  for (let gi = 0; gi < readyGames + rushedGames; gi++) {
    const ready = gi < readyGames
    const count = ready ? readyPerGame : rushedPerGame
    for (let j = 0; j < count; j++) his.push({ gi, group: 'synthetic', ready, sound: 1, safe: true })
  }
  const context = {
    his, bootStat, leverWeighted, MIN_CELL: 30, SEED: 20261020,
    hisUnits: byGame, isSafe: (b) => b.safe, ready: (b) => b.ready, sound: (b) => b.sound,
    mean: (list, f) => list.length ? list.reduce((sum, row) => sum + f(row), 0) / list.length : null,
  }
  return runInNewContext(`${groupAnalysis}\n;groups[0].stats`, context, { filename: filename.pathname })
}

test('a resample missing one arm is undefined, not a difference against zero', () => {
  const stats = estimate(3, 7, 10, 5)
  assert.equal(stats.lift.value, 0)
  assert.deepEqual(Array.from(stats.lift.ci), [0, 0])
})

test('too many resamples missing an arm suppress the group interval', () => {
  const stats = estimate(1, 1, 30, 30)
  assert.equal(stats.lift.value, 0)
  assert.equal(stats.lift.ci, null)
})
