import assert from 'node:assert/strict'
import test from 'node:test'
import { chess } from '../../bridge/lib/chess.mjs'
import { gradeMoment } from './grade.mjs'

const { evalFor } = await chess('src/core/score/index.ts')
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function gradeEval(after, text = evalFor(after, 'w')) {
  return gradeMoment({
    fenBefore: start, mover: 'w', playerColor: 'w',
    uci: 'd2d4', san: 'd4', bestUci: 'e2e4', bestSan: 'e4',
    before: after, after,
    texts: { cardShows: 'comment', commentFor: `The eval moved to ${text}.` },
  })
}

test('the grader reads the entire signed or zero centipawn evaluation', () => {
  for (const cp of [120, -120, 0]) {
    const after = { cp, mate: null }
    const grade = gradeEval(after)
    assert.equal(grade.faithful, 1, `cp ${cp}`)
    const claim = grade.claims.find((c) => c.type === 'eval')
    assert.equal(claim.verdict, 'true')
    assert.equal(claim.text, `The eval moved to ${evalFor(after, 'w')}.`)
  }
})

test('mate evaluations still read in full', () => {
  for (const mate of [3, -3]) {
    const grade = gradeEval({ cp: null, mate })
    assert.equal(grade.faithful, 1)
    assert.equal(grade.claims.find((c) => c.type === 'eval').verdict, 'true')
  }
})

test('a wrong decimal or mate evaluation still fails', () => {
  for (const [after, text] of [
    [{ cp: 120, mate: null }, '+1.3'],
    [{ cp: -120, mate: null }, '+1.2'],
    [{ cp: 0, mate: null }, '+0.1'],
    [{ cp: null, mate: 3 }, 'M4'],
  ]) {
    const grade = gradeEval(after, text)
    assert.equal(grade.faithful, 0)
    assert.equal(grade.claims.find((c) => c.type === 'eval').verdict, 'false')
  }
})
