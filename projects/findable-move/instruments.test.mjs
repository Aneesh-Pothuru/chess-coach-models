import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

// Exercise the producers' actual call arguments against a changed app default.
// No engine or Maia policy is constructed.
for (const [project, script, count] of [
  ['findable-move', 'positions.mjs', 2],
  ['his-habits', 'his.mjs', 3],
  ['positions-like-this', 'positions.mjs', 3],
  ['structure-breaks', null, 0],
]) {
  const source = (file) => readFileSync(new URL(`../${project}/${file}`, import.meta.url), 'utf8')
  const context = () => ({
    OFFSET: 250, ABOVE: 200, g: { myRating: 1100, oppRating: 1200 },
    E: { DEFAULT_LICHESS_OFFSET: 400, defaultMaiaElo: (rating, offset = 400) => offset },
  })

  if (script) test(`${project} takes every rating offset from the app`, () => {
    const calls = [...source(script).matchAll(/E\.defaultMaiaElo\([^)]*\)/g)].map(([call]) => call)
    assert.equal(calls.length, count)
    for (const call of calls) assert.equal(runInNewContext(call, context()), 400, call)
  })

  test(`${project} prints the app's rating offset in its paper`, () => {
    const expression = source('paper/generate.mjs').match(/\.def\('Offset', String\(([^)]*)\)\)/)?.[1]
    assert.ok(expression, 'the generator defines the offset')
    assert.equal(runInNewContext(expression, context()), 400)
  })
}
