// The readings on positions built by hand (bridge/run.sh projects/tiebreak-rules/tests-readings.mjs).
import assert from 'node:assert/strict'
import { K, RULE_UNITS, UNITS, developmentLead, entersScan, hangLabel, hangReading, inControlSituation, labelOf, quiet, split, topTwo, undeveloped, unitsOf } from './readings.mjs'

const read = fen => ({ board: K.boardOf(fen), facts: K.describePosition(fen) })
let passed = 0
const test = (name, fn) => { fn(); passed++; console.log(`ok ${name}`) }

test('the units', () => {
  assert.deepEqual(UNITS, ['tension', 'trades-ahead', 'trades-behind', 'bishop-for-knight', 'knight-for-bishop', 'bishop-colour', 'trades-level', 'hang'])
  assert.deepEqual(RULE_UNITS, UNITS.slice(0, 6))
})

test("the control's situation is a rule unit's, not the reference's alone", () => {
  assert.equal(inControlSituation({}), false)
  assert.equal(inControlSituation({ 'trades-level': {} }), false)
  assert.equal(inControlSituation({ 'trades-level': {}, tension: {} }), true)
  for (const unit of RULE_UNITS) assert.equal(inControlSituation({ [unit]: {} }), true, unit)
  const { board, facts } = read('r1bq1rk1/pp2bppp/3p1n2/2p1p3/2BnP3/2NPBN2/PPP2PPP/R2Q1RK1 w - - 0 10')
  const units = unitsOf(board, facts)
  assert.deepEqual(Object.keys(units).sort(), ['bishop-for-knight', 'trades-level'])
  assert.equal(inControlSituation(units), true)
  const { 'bishop-for-knight': _, ...referenceOnly } = units
  assert.equal(inControlSituation(referenceOnly), false)
})

test('a quiet Caro-Kann: the d5 pawn can take on e4 for an even trade', () => {
  const { board, facts } = read('rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq - 1 3')
  assert.equal(quiet(board, facts), true)
  const t = unitsOf(board, facts).tension
  assert.deepEqual(t.break, ['d5e4'])
  for (const uci of ['g8f6', 'e7e6', 'c8f5', 'g7g6']) assert.equal(labelOf(t, uci), 'follow')
  assert.equal(labelOf(t, 'd5d4'), null)
  assert.equal(labelOf(t, 'd5e4'), 'break')
})

test('a pawn that takes for a gain is no quiet position', () => {
  const { board, facts } = read('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
  assert.equal(quiet(board, facts), false)
})

test('development: undeveloped minor pieces and a king on its square', () => {
  const { board, facts } = read('rnbqkb1r/pp3ppp/3p4/2p1p3/2BnP3/2NPBN2/PPP2PPP/R2Q1RK1 w kq - 0 8')
  assert.equal(undeveloped(board, 'w'), 0)
  assert.equal(undeveloped(board, 'b'), 4)
  assert.equal(developmentLead(board, 'w'), 4)
  assert.equal(quiet(board, facts), true)
  const u = unitsOf(board, facts)
  assert.deepEqual(u['trades-ahead'].break, ['e3d4', 'f3d4'])
  assert.equal(labelOf(u['trades-ahead'], 'h2h3'), 'follow')
  assert.equal(labelOf(u['trades-ahead'], 'f3e5'), null)
  assert.equal(u['trades-behind'], undefined)
  assert.deepEqual(u['bishop-for-knight'].break, ['e3d4'])
  assert.equal(labelOf(u['bishop-for-knight'], 'f3d4'), null)
  assert.equal(labelOf(u['bishop-for-knight'], 'a2a3'), 'follow')
})

test('behind in development, the even trade follows the rule', () => {
  const { board, facts } = read('r2q1rk1/ppp1bppp/2npbn2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 8')
  assert.equal(developmentLead(board, 'w'), -2)
  const u = unitsOf(board, facts)
  assert.deepEqual(u['trades-behind'].follow, ['c4e6'])
  assert.equal(labelOf(u['trades-behind'], 'h2h3'), 'break')
  assert.equal(u['bishop-for-knight'], undefined)
  assert.equal(u['knight-for-bishop'], undefined)
})

test('level development is the reference unit', () => {
  const { board, facts } = read('r1bq1rk1/pp2bppp/3p1n2/2p1p3/2BnP3/2NPBN2/PPP2PPP/R2Q1RK1 w - - 0 10')
  assert.equal(quiet(board, facts), true)
  assert.equal(developmentLead(board, 'w'), 1)
  const u = unitsOf(board, facts)
  assert.deepEqual(u['trades-level'].break, ['e3d4', 'f3d4'])
  assert.equal(labelOf(u['trades-level'], 'a2a3'), 'follow')
  assert.equal(u['trades-ahead'], undefined)
})

test('a knight that takes a bishop for an even trade', () => {
  const { board, facts } = read('r2qkb1r/ppp2ppp/2npbn2/4p1N1/4P3/2N5/PPPP1PPP/R1BQKB1R w KQkq - 0 6')
  const u = unitsOf(board, facts)
  assert.deepEqual(u['knight-for-bishop'].follow, ['g5e6'])
  assert.equal(labelOf(u['knight-for-bishop'], 'd2d3'), 'break')
  assert.equal(u['bishop-for-knight'], undefined)
})

test("the bishop's colour: pushes to the other colour follow", () => {
  const { board, facts } = read('6k1/5ppp/8/8/8/3B4/PP3PPP/6K1 w - - 0 30')
  const u = unitsOf(board, facts)['bishop-colour']
  assert.equal(u.colour, 'light')
  for (const uci of ['a2a3', 'b2b4', 'f2f4', 'g2g3', 'h2h4']) assert.equal(labelOf(u, uci), 'follow', uci)
  for (const uci of ['a2a4', 'b2b3', 'f2f3', 'g2g4', 'h2h3']) assert.equal(labelOf(u, uci), 'break', uci)
  assert.equal(labelOf(u, 'd3e4'), null)
})

test('two bishops leave the colour rule out', () => {
  const { board, facts } = read('6k1/5ppp/8/8/8/3BB3/PP3PPP/6K1 w - - 0 30')
  assert.equal(unitsOf(board, facts)['bishop-colour'], undefined)
})

test('the control: a piece move that leaves the piece to be taken breaks it', () => {
  const { board, facts } = read('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')
  assert.equal(quiet(board, facts), true)
  const label = uci => hangLabel(board, board.findUci(uci))
  assert.equal(label('f1a6'), 'break')
  assert.equal(label('g1f3'), 'follow')
  assert.equal(label('f1c4'), 'follow')
  assert.equal(label('b1a3'), 'follow')
  assert.equal(label('f2f4'), null)
  assert.equal(label('d2d4'), 'follow')
  assert.deepEqual(hangReading(board, ['f1a6', 'g1f3', 'f2f4']), { unit: 'hang', follow: ['g1f3'], break: ['f1a6'] })
})

test('the scan skips early plies, a position right after a capture, and a check', () => {
  const { board, facts } = read('rnbqkbnr/pp2pppp/2p5/3p4/3PP3/2N5/PPP2PPP/R1BQKBNR b KQkq - 1 3')
  assert.equal(entersScan(board, facts, 7, 'Nc3'), false)
  assert.equal(entersScan(board, facts, 8, 'Nxc3'), false)
  assert.equal(entersScan(board, facts, 8, 'Nc3'), true)
  const checked = read('rnbqkbnr/ppp2ppp/3p4/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 3')
  assert.equal(entersScan(checked.board, checked.facts, 8, 'Bb5+'), false)
})

test('the two most natural moves and the split', () => {
  assert.deepEqual(topTwo({ a1a2: 0.2, b1b2: 0.5, c1c2: 0.2, d1d2: 0.1 }, ['a1a2', 'b1b2', 'c1c2', 'd1d2']), ['b1b2', 'a1a2'])
  assert.throws(() => topTwo({ a1a2: 0.5 }, ['a1a2', 'b1b2']), /incomplete/)
  assert.deepEqual(split('follow', 'break'), { F: 0, B: 1, stratum: 'follow-first' })
  assert.deepEqual(split('break', 'follow'), { F: 1, B: 0, stratum: 'break-first' })
  assert.equal(split('follow', 'follow'), null)
  assert.equal(split('break', null), null)
})

console.log(`${passed} passed`)
process.exit(0)
