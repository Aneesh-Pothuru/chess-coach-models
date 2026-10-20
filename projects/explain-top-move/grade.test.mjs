import assert from 'node:assert/strict'
import test from 'node:test'
import { chess } from '../../bridge/lib/chess.mjs'
import { gradeMoment } from './grade.mjs'

const { evalFor } = await chess('src/core/score/index.ts')
const { teachMove } = await chess('src/services/knowledge/index.ts')
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

function matedEitherWay(change = (lesson) => lesson) {
  const args = {
    fenBefore: '6k1/5p1p/5PpQ/8/8/8/7K/r7 b - - 0 1',
    uci: 'g6g5', bestUci: 'a1b1',
    bestPv: ['a1b1', 'h6g7'], replyPv: ['h6g7'],
    cls: 'inaccuracy', lossPct: 0,
    bestScore: { cp: null, mate: 1 }, playedScore: { cp: null, mate: 1 },
    playerMove: true,
  }
  // The app reads both legal lines to checkmate and supplies the entire lesson.
  const lesson = teachMove(args)
  assert.match(lesson.headline, /After Rb1, they mate in 1 too\./)
  return gradeMoment({
    ...args, san: 'g5', bestSan: 'Rb1', mover: 'b', playerColor: 'b',
    before: args.bestScore, after: args.playedScore,
    bestPvUci: args.bestPv, replyPvUci: args.replyPv,
    texts: { cardShows: 'lesson', lessonFor: change(lesson) },
  })
}

test('a mate after the better move is checked against that move', () => {
  const grade = matedEitherWay()
  assert.equal(grade.faithful, 1)
  assert.ok(grade.claims.some((c) => c.type === 'mate' && c.text === 'After Rb1, they mate in 1 too' && c.verdict === 'true'))
})

test('the better-move mate sentence still rejects a wrong count or move', () => {
  for (const text of ['After Rb1, they mate in 2 too.', 'After Rc1, they mate in 1 too.']) {
    const grade = matedEitherWay((lesson) => ({ ...lesson, headline: text, difference: [] }))
    assert.equal(grade.faithful, 0, text)
    assert.ok(grade.claims.some((c) => c.verdict === 'false' && (c.type === 'mate' || c.type === 'san')))
  }
})

function lessonCase({ fen, mover, uci, san, bestUci, bestSan, reply, replySan, points = [], difference = [] }) {
  return gradeMoment({
    fenBefore: fen, mover, playerColor: mover,
    uci, san, bestUci, bestSan,
    before: { cp: 0, mate: null }, after: { cp: 0, mate: null },
    bestPvUci: [bestUci], replyPvUci: [reply],
    texts: {
      cardShows: 'lesson',
      lessonFor: {
        headline: '', yourMove: [],
        allowed: { san: replySan, points, line: `${san} ${replySan}`, material: 0 },
        better: { san: bestSan, points: [], line: bestSan, material: 0 },
        difference, takeaway: null, grade: null,
      },
    },
  })
}

const verdicts = (grade, type) => grade.claims.filter((c) => c.type === type).map((c) => c.verdict)

// Black blocks the rook's check with Be7, and the rook pins the bishop there: it no longer guards h4.
const blocked = { fen: '4k3/8/5b2/8/8/5N2/8/4R1K1 b - - 0 1', mover: 'b', uci: 'f6e7', san: 'Be7', bestUci: 'e8f8', bestSan: 'Kf8', reply: 'f3h4', replySan: 'Nh4' }

test('a guard given up to a pin is checked against the pin', () => {
  const said = 'After Be7, your bishop no longer guards h4: the rook on e1 pins it to your king, and Nh4 follows.'
  assert.deepEqual(verdicts(lessonCase({ ...blocked, difference: [said] }), 'guard_given_up'), ['true'])
  for (const wrong of [
    said.replace('rook on e1', 'rook on e2'),
    said.replace('rook on e1', 'bishop on e1'),
    said.replace('guards h4', 'guards g5'),
    'After Be7, your bishop no longer guards h4, and Nh4 follows.',
  ]) assert.deepEqual(verdicts(lessonCase({ ...blocked, difference: [wrong] }), 'guard_given_up'), ['false'], wrong)
  const free = { ...blocked, fen: '3k4/8/5b2/8/8/5N2/8/4R1K1 b - - 0 1', bestUci: 'd8c7', bestSan: 'Kc7' }
  assert.deepEqual(verdicts(lessonCase({ ...free, difference: [said] }), 'guard_given_up'), ['false'])
})

// After h3 Ne4, the knight on d2 attacks e4 but the bishop on b4 pins it to the king on e1.
const pinned = { fen: '4k3/8/5n2/8/1b6/8/3N3P/4K3 w - - 0 1', mover: 'w', uci: 'h2h3', san: 'h3', bestUci: 'e1e2', bestSan: 'Ke2', reply: 'f6e4', replySan: 'Ne4' }

test('a reply safe from a pinned piece is checked against the pin', () => {
  const said = 'it is safe from your knight on d2: the bishop on b4 pins the knight to your king'
  assert.deepEqual(verdicts(lessonCase({ ...pinned, points: [said] }), 'pin_safe'), ['true'])
  for (const wrong of [
    said.replace('knight on d2', 'knight on c2'),
    said.replace('bishop on b4', 'rook on b4'),
    said.replace('bishop on b4', 'bishop on a5'),
    said.replace('pins the knight', 'pins the bishop'),
  ]) assert.deepEqual(verdicts(lessonCase({ ...pinned, points: [wrong] }), 'pin_safe'), ['false'], wrong)
  const free = { ...pinned, fen: '4k3/8/5n2/8/1b6/8/3N3P/5K2 w - - 0 1', bestUci: 'f1e2', bestSan: 'Ke2' }
  assert.deepEqual(verdicts(lessonCase({ ...free, points: [said] }), 'pin_safe'), ['false'])
})
