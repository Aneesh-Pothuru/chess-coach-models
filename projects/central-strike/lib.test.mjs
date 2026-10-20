import assert from 'node:assert/strict'
import test from 'node:test'
import {
  above0,
  below0,
  bootStat,
  centralBreaks,
  flankBreaks,
  kingSquare,
  liftStat,
  otherKingInCentre,
  otherKingOnStart,
  queensOn,
  strongReading,
  verdictOf,
} from './lib.mjs'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const CASTLED_BLACK = 'rnbq1rk1/ppp1bppp/4pn2/3p4/3P1B2/4PN2/PPP2PPP/RN1QKB1R w KQ - 4 6'
const BLACK_KING_F8 = 'rnbq1k1r/ppp1bppp/4pn2/3p4/3P1B2/4PN2/PPP2PPP/RN1QKB1R w KQ - 4 6'
const NO_QUEENS = 'rnb1kbnr/ppp2ppp/8/3p4/3P4/8/PPP2PPP/RNB1KBNR w KQkq - 0 5'

test('reads where each king stands', () => {
  assert.equal(kingSquare(START, 'w'), 'e1')
  assert.equal(kingSquare(START, 'b'), 'e8')
  assert.equal(kingSquare(CASTLED_BLACK, 'b'), 'g8')
  assert.equal(kingSquare('8/8/8/8/8/8/8/8 w - - 0 1', 'w'), null)
})

test("the other king is the side not to move's, in the centre on the d-, e- and f-files", () => {
  assert.equal(otherKingInCentre(START), true)
  assert.equal(otherKingInCentre(CASTLED_BLACK), false)
  assert.equal(otherKingInCentre(BLACK_KING_F8), true)
  assert.equal(otherKingOnStart(START), true)
  assert.equal(otherKingOnStart(BLACK_KING_F8), false)
  assert.equal(otherKingInCentre(START.replace(' w ', ' b ')), true)
})

test('a central break lands on the d- or e-file', () => {
  const row = { breaks: ['e3e4', 'c3c4', 'd4d5', 'f2f4'] }
  assert.deepEqual(centralBreaks(row), ['e3e4', 'd4d5'])
  assert.deepEqual(flankBreaks(row), ['c3c4', 'f2f4'])
})

test('queens on means both queens on the board', () => {
  assert.equal(queensOn(START), true)
  assert.equal(queensOn(NO_QUEENS), false)
})

test('the lift is the centre mean minus the away mean, null when a side is empty', () => {
  const positions = [
    { centre: true, v: 1 },
    { centre: true, v: 0 },
    { centre: false, v: 0 },
    { centre: false, v: 0 },
  ]
  const lift = liftStat((p) => p.v, (p) => p.centre)
  assert.equal(lift(positions), 0.5)
  assert.equal(lift(positions.filter((p) => p.centre)), null)
})

test('the bootstrap resamples whole units and keeps the point estimate', () => {
  const units = [[{ v: 1 }], [{ v: 0 }], [{ v: 1 }, { v: 1 }]]
  const s = bootStat(units, (ps) => ps.reduce((a, p) => a + p.v, 0) / ps.length, 7, 200)
  assert.equal(s.value, 0.75)
  assert.ok(s.ci[0] <= 0.75 && s.ci[1] >= 0.75)
  assert.deepEqual(bootStat([], () => null, 7, 10), { value: null, ci: null })
})

const stat = (lo, hi) => ({ value: (lo + hi) / 2, ci: [lo, hi] })
const half = (lift, gain, games = { centre: 40, away: 60 }) => ({ lift, gain, games })
const pass = { referee: true, null: true }

test('the verdicts follow the README', () => {
  assert.equal(above0(stat(0.01, 0.2)), true)
  assert.equal(above0(stat(0, 0.2)), false)
  assert.equal(below0(stat(-0.2, -0.01)), true)
  const minGames = 30
  assert.equal(verdictOf({ controls: pass, minGames, halves: [half(stat(0.05, 0.2), stat(-0.1, 0.1)), half(stat(0.02, 0.3), stat(-0.2, 0.05))] }), 'the strike holds')
  assert.equal(
    verdictOf({ controls: pass, minGames, halves: [half(stat(0.05, 0.2), stat(-0.3, -0.1)), half(stat(0.02, 0.3), stat(-0.2, 0.05))] }),
    'the king marks the moment, but the break trails his move',
  )
  assert.equal(verdictOf({ controls: pass, minGames, halves: [half(stat(-0.2, -0.05), stat(-0.3, -0.1)), half(stat(-0.3, -0.02), stat(-0.2, 0.05))] }), 'the king misleads')
  assert.equal(verdictOf({ controls: pass, minGames, halves: [half(stat(0, 0.25), stat(-0.3, -0.1)), half(stat(0.05, 0.4), stat(-0.4, -0.1))] }), 'no signal')
  assert.equal(verdictOf({ controls: { referee: true, null: false }, minGames, halves: [half(stat(0.05, 0.2), null), half(stat(0.05, 0.2), null)] }), 'no verdict: a control failed')
  assert.equal(verdictOf({ controls: pass, minGames, halves: [half(stat(0.05, 0.2), null, { centre: 29, away: 60 }), half(stat(0.05, 0.2), null)] }), 'not enough data (n=29)')
})

test("strong players agree, disagree or are silent against his verdict's side", () => {
  assert.equal(strongReading(stat(0.01, 0.2), 'the strike holds'), 'agree')
  assert.equal(strongReading(stat(-0.2, -0.01), 'the king marks the moment, but the break trails his move'), 'disagree')
  assert.equal(strongReading(stat(-0.2, -0.01), 'the king misleads'), 'agree')
  assert.equal(strongReading(stat(-0.03, 0.15), 'no signal'), 'silent')
  assert.equal(strongReading(stat(0.01, 0.2), 'no signal'), 'lift above 0')
})
