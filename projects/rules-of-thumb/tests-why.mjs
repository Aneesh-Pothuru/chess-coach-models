// Synthetic positions only. No engine, Maia or real example is read.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { KINDS, flags, kindOf, readingOf, summarise } from './why.mjs'

const K = await chess('src/services/knowledge/index.ts')
const TRADE = '4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1'
const HANG = '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 1'
const FOOL = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'

let checks = 0
function test(name, fn) {
  try { fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}

test('an even trade does not count the capturing piece as lost', () => {
  const r = readingOf(K, TRADE, 'c3d5')
  assert.equal(r.capture, true)
  assert.equal(r.forcing, true)
  assert.equal(r.exchange, 0)
  assert.deepEqual(r.loose, [])
  assert.equal(r.losesMaterial, false)
  assert.equal(flags(r), false)
})

test('a piece moved where a pawn takes it loses material', () => {
  const r = readingOf(K, HANG, 'c3d5')
  assert.equal(r.capture, false)
  assert.equal(r.exchange, null)
  assert.deepEqual(r.loose, ['d5'])
  assert.equal(r.losesMaterial, true)
  assert.equal(kindOf(r, readingOf(K, HANG, 'c3e4')), 'loses material')
})

test('a move that allows mate reads as allowing mate before anything else', () => {
  const r = readingOf(K, FOOL, 'g2g4')
  assert.equal(r.verdict, 'allows-mate')
  assert.equal(flags(r), true)
  assert.equal(kindOf({ ...r, losesMaterial: true }, { forcing: true }), 'allows mate')
})

test('a sound-looking rule move is filed by what the natural move did', () => {
  const quiet = { verdict: 'safe', losesMaterial: false }
  assert.equal(kindOf(quiet, { forcing: true }), 'passes over a forcing move')
  assert.equal(kindOf(quiet, { forcing: false }), 'a quieter choice')
  assert.throws(() => readingOf(K, HANG, 'c3c5'), /illegal/)
})

test('the summary counts kinds only for unsound rule moves', () => {
  const R = (sound, losesMaterial, forcing = false) => ({ sound, verdict: 'safe', losesMaterial, forcing })
  const N = (forcing) => ({ verdict: 'safe', losesMaterial: false, forcing })
  const examples = [
    { R: R(false, true), N: N(false), kind: 'loses material' },
    { R: R(false, false), N: N(true), kind: 'passes over a forcing move' },
    { R: R(true, true, true), N: N(true), kind: null },
  ]
  const { all, byRule } = summarise({ a: { examples }, b: { examples: examples.slice(0, 1) } })
  assert.equal(all.examples, 4)
  assert.equal(all.ruleSound, 1)
  assert.equal(all.ruleUnsound, 3)
  assert.deepEqual(all.kinds, { [KINDS[0]]: 0, [KINDS[1]]: 2, [KINDS[2]]: 1, [KINDS[3]]: 0 })
  assert.equal(all.ruleFlagged, 3)
  assert.equal(all.ruleSoundFlagged, 1)
  assert.equal(all.naturalForcing, 2)
  assert.equal(all.ruleForcing, 1)
  assert.equal(byRule.b.ruleUnsound, 1)
})

console.log(JSON.stringify({ syntheticWhyChecks: checks, engineProcesses: 0, realExamplesRead: 0 }))
