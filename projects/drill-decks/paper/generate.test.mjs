import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const filename = new URL('./generate.mjs', import.meta.url)
const source = readFileSync(filename, 'utf8')
function block(start, end) {
  assert.equal(source.split(start).length, 2)
  assert.equal(source.split(end).length, 2)
  return source.slice(source.indexOf(start), source.indexOf(end))
}
const endgameClaims = block('const E = T.endgame', 'const HP = T.hangingPiece')
const exampleSelections = block("showMiss('Def'", "// The rule's own limit")
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}
const g = { def() { return this } }

test('the conversion paragraph requires the endgame word to feed conversion', () => {
  const check = (competency) => runInNewContext(endgameClaims, {
    T: { endgame: { items: 1, shape: { defensive: 1 }, competency } },
    g, claim, n: (o, k) => o[k] ?? 0,
  }, { filename: filename.pathname })
  assert.doesNotThrow(() => check('conv.technique'))
  assert.throws(() => check('calc.scan'), /paper's claim no longer holds:.*conversion/)
})

const win = (theme) => ({ theme, shape: 'attacking', best: 'wins', bestDelta: 3, playedDelta: 0 })
function select(rows) {
  const chosen = {}
  runInNewContext(exampleSelections, {
    PHASES: ['opening', 'middlegame', 'endgame'],
    showMiss(name, test, what) {
      if (name === 'Def') return
      const row = rows.find(test)
      if (!row) throw new Error(`no deck item is ${what}`)
      chosen[name] = row
      return row
    },
  }, { filename: filename.pathname })
  return chosen.Win
}

test('the win filed under conversion is an endgame even if another phase comes first', () => {
  assert.equal(select([win('middlegame'), win('endgame')]).theme, 'endgame')
})

test('a win under another phase cannot support the conversion example', () => {
  assert.throws(() => select([win('opening'), win('middlegame')]), /no deck item/)
})
