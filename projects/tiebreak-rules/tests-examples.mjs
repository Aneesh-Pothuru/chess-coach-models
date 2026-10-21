// Saved readings on invented rows and boards; no engine, Maia or study input.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'
import { APP, HELDOUT, UNITS, makeExample, exampleCandidates, examplesForUnit, buildExamples, renderExamples, verifyAnalysisInputs } from './examples.mjs'
const C = await chess('src/core/chess/index.ts')
const S = await chess('src/core/score/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const cp = value => ({ cp: value, mate: null })
const best = (uci = 'd2d4', value = 0) => ({ best: uci, complete: true, partial: false, completion: 'complete', lines: [{ move: uci, pv: [uci], score: cp(value) }] })
const reading = (uci, value = 0) => ({ best: uci, pv: [uci], score: cp(value), partial: false, completion: 'complete', status: 'exact', coherent: true })
function fixture(id = 'synthetic', units = UNITS) {
  return { datasetKind: 'tiebreak-rules', key: `${HELDOUT}:${id}:8`, month: HELDOUT, game: id, gameIndex: 0, ply: 8,
    fen: START, mover: 'w', band: 1300, opponentBand: 1500, M1: 'd2d4', M2: 'e2e4', p1: .4, p2: .2, played: 'g1f3',
    units: units.map(unit => ({ unit, F: 'd2d4', B: 'e2e4', stratum: 'follow-first' })),
    sound: { d2d4: true, e2e4: false }, evidence: { source: 'stockfish', best: best(), readings: { d2d4: reading('d2d4'), e2e4: reading('e2e4', -100) } } }
}
function analysis(rows, passed = false) {
  return { datasetKind: 'tiebreak-rules', app: APP, data: { heldout: HELDOUT }, control: { passed },
    units: Object.fromEntries(UNITS.map(unit => [unit, { heldout: { positions: rows.filter(row => row.units.some(u => u.unit === unit)).length,
      oneSoundPositions: exampleCandidates(rows, unit).length } }])) }
}
let checks = 0
function test(name, f) { try { f(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error } }

test('saved engine evidence supplies SAN, soundness and mover win percent', () => {
  const out = makeExample(fixture(), 'tension')
  assert.equal(out.moves.F.san, 'd4'); assert.equal(out.moves.B.san, 'e4')
  assert.equal(out.moves.played.san, 'Nf3'); assert.equal(out.moves.best.san, 'd4')
  assert.equal(out.moves.F.sound, true); assert.equal(out.moves.B.sound, false)
  assert.equal(out.moves.B.winPercent, S.winPercentFor(cp(-100), 'w'))
  assert.deepEqual(Object.keys(out.moves.played).sort(), ['san', 'uci'])
  assert.deepEqual(Object.keys(out.moves.best).sort(), ['san', 'uci'])
})
test('first exact line supplies best even when raw best differs', () => {
  const r = fixture(); r.evidence.best.best = 'a2a3'
  assert.equal(makeExample(r, 'tension').moves.best.uci, 'd2d4')
})
test('black mover win percent uses app perspective', () => {
  const r = fixture(); r.fen = START.replace(' w ', ' b '); r.mover = 'b'
  Object.assign(r, { M1: 'd7d5', M2: 'e7e5', played: 'g8f6', sound: { d7d5: true, e7e5: false } })
  r.units = [{ unit: 'tension', F: r.M1, B: r.M2, stratum: 'follow-first' }]
  r.evidence = { source: 'stockfish', best: best('d7d5'), readings: { d7d5: reading('d7d5'), e7e5: reading('e7e5', 100) } }
  assert.equal(makeExample(r, 'tension').moves.B.winPercent, S.winPercentFor(cp(100), 'b'))
})
test('inexact, wrong-root, missing or inconsistent saved readings stop', () => {
  for (const change of [r => { r.evidence.readings.d2d4.partial = true }, r => { delete r.evidence.readings.d2d4 },
    r => { r.evidence.readings.d2d4.best = 'a2a3'; r.evidence.readings.d2d4.pv = ['a2a3'] },
    r => { r.evidence.best.lines[0].pv = ['a2a3'] }, r => { r.sound = { d2d4: false, e2e4: true } },
    r => { r.evidence.best.complete = false }]) {
    const r = fixture(); change(r); assert.throws(() => makeExample(r, 'tension'))
  }
})
function tablebase() {
  const r = fixture(), fen = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
  Object.assign(r, { fen, M1: 'a1a2', M2: 'a1b1', played: 'a1c1', sound: { a1a2: true, a1b1: false } })
  r.units = [{ unit: 'tension', F: r.M1, B: r.M2, stratum: 'follow-first' }]
  r.evidence = { source: 'tablebase', probe: { category: 'win', moves: ['a1a2', 'a1b1'].map((uci, i) => ({ uci, san: C.uciToSan(fen, uci), category: i ? 'draw' : 'loss', dtm: null })) } }
  return r
}
test('tablebase uses saved exact outcomes and does not need a played-move probe', () => {
  const out = makeExample(tablebase(), 'tension')
  assert.equal(out.moves.F.sound, true); assert.equal(out.moves.F.winPercent, 100)
  assert.equal(out.moves.B.sound, false); assert.equal(out.moves.B.winPercent, 50)
  assert.equal(out.moves.played.san, 'Rc1')
})
test('cursed and blessed outcomes stay distinct from draws despite identical win percentages', () => {
  const r = tablebase(); r.evidence.probe.category = 'cursed-win'; r.evidence.probe.moves[0].category = 'blessed-loss'
  const out = makeExample(r, 'tension')
  assert.equal(out.moves.F.winPercent, 50); assert.equal(out.moves.B.winPercent, 50)
  assert.equal(out.moves.F.sound, true); assert.equal(out.moves.B.sound, false)
})
test('missing tablebase outcome, SAN or percent stops', () => {
  for (const change of [r => { r.evidence.probe.moves.pop() }, r => { r.evidence.probe.moves[0].san = 'wrong' },
    r => { r.evidence.probe.category = 'syzygy-win'; r.evidence.probe.moves[0].category = 'syzygy-loss' }]) {
    const r = tablebase(); change(r); assert.throws(() => makeExample(r, 'tension'))
  }
})
test('draw uses exactly one sound candidate, original input order and registered seed', () => {
  const rows = Array.from({ length: 20 }, (_, i) => fixture(`synthetic-${i}`))
  rows[0].sound.e2e4 = true; rows[1].sound.d2d4 = false
  const candidates = exampleCandidates(rows, 'tension')
  assert.equal(candidates.length, 18)
  const expected = sampleWithoutReplacement(candidates, 6, 'tension\0examples').map(r => makeExample(r, 'tension'))
  assert.deepEqual(examplesForUnit(rows, 'tension').map(({ number, ...r }) => r), expected)
  assert.equal(new Set(examplesForUnit(rows, 'tension').map(r => r.number)).size, 6)
  assert.throws(() => examplesForUnit(candidates.slice(0, 5), 'tension'), /fewer than six/)
})
test('all eight units get six examples regardless of failed control and absent verdicts', () => {
  const rows = Array.from({ length: 8 }, (_, i) => fixture(`synthetic-${i}`))
  const out = buildExamples(rows, analysis(rows, false), {})
  assert.equal(out.summary.units, 8); assert.equal(out.summary.positions, 48)
  assert.equal(out.summary.soundF + out.summary.soundB, 48)
  assert.equal(out.units.hang.examples.length, 6); assert.equal(out.units['trades-level'].examples.length, 6)
  assert.equal(out.selection.controlGate, false); assert.equal(out.selection.verdictGate, false)
  assert.match(renderExamples(out), /independent of verdicts/)
})
test('no private fields escape whitelisted examples', () => {
  const r = fixture(); r.username = 'synthetic-private-user'; r.link = 'synthetic-private-link'
  const out = makeExample(r, 'tension')
  assert.deepEqual(Object.keys(out).sort(), ['band', 'fen', 'moves', 'referee', 'stratum'])
  assert.doesNotMatch(JSON.stringify(out), /synthetic|username|gameIndex|private-link/)
})
test('duplicate population, foreign month and report-count mismatch stop', () => {
  const rows = Array.from({ length: 6 }, (_, i) => fixture(`synthetic-${i}`)), a = analysis(rows)
  assert.throws(() => buildExamples([...rows, rows[0]], a, {}), /duplicate/)
  assert.throws(() => buildExamples(rows.slice(1), a, {}), /population differs/)
  const foreign = structuredClone(rows); foreign[0].month = '2026-07'
  assert.throws(() => buildExamples(foreign, a, {}), /another month/)
  const duplicate = structuredClone(rows); duplicate[1].game = duplicate[0].game
  assert.throws(() => exampleCandidates(duplicate, 'tension'), /duplicate kept/)
})
test('analysis bindings include selected positions and both scored shards', () => {
  const frozen = { inputs: { sha256: 'input' }, rule: { sha256: 'rule' }, files: { 'analyze.py': 'source' } }
  const positions = [{ month: HELDOUT, outputSha256: 'positions' }]
  const scores = [0, 1].map(shard => ({ stage: 'scored', month: HELDOUT, shard, outputSha256: `score${shard}` }))
  const a = { provenance: { contentManifestSha256: 'manifest', inputManifestSha256: 'input', ruleReadmeSha256: 'rule',
    analysisSha256: 'source', positionInputs: positions, completedInputs: scores } }
  verifyAnalysisInputs(a, frozen, 'manifest', positions, scores)
  assert.throws(() => verifyAnalysisInputs(a, frozen, 'changed', positions, scores), /freeze/)
  assert.throws(() => verifyAnalysisInputs(a, frozen, 'manifest', [{ ...positions[0], outputSha256: 'changed' }], scores), /position/)
  assert.throws(() => verifyAnalysisInputs(a, frozen, 'manifest', positions, [scores[0], scores[0]]), /hashes/)
})
console.log(JSON.stringify({ syntheticExampleChecks: checks, engineProcesses: 0, maiaModels: 0, realRows: 0 }))
