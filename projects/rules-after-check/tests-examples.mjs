// Synthetic examples only. Never read study rows or call an engine or Maia.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { rowKey } from '../rules-of-thumb/score.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'
import { buildExamples, CHECK_APP, exampleCandidates, examplesForRule, HELDOUT,
  makeExample, RECORDS, renderExamples, RULES, SCORE_APP, verifyAnalysisInputs } from './examples.mjs'
const C = await chess('src/core/chess/index.ts')
const S = await chess('src/core/score/index.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const score = cp => ({ cp, mate: null })
const best = (uci = 'd2d4', cp = 0) => ({ best: uci, complete: true, partial: false, completion: 'complete', lines: [{ move: uci, pv: [uci], score: score(cp) }] })
const reading = (uci, cp = 0) => ({ best: uci, pv: [uci], score: score(cp), partial: false, completion: 'complete', status: 'exact', coherent: true })
function fixture(rule = 'active-king', id = 'synthetic') {
  const original = { month: HELDOUT, game: id, rule, fen: START, band: 1300,
    R: 'e2e4', N: 'd2d4', A: 'g1f3', sound: { R: false, N: true, A: true },
    evidence: { source: 'stockfish', best: best(), readings: {
      e2e4: reading('e2e4', -100), d2d4: reading('d2d4'), g1f3: reading('g1f3', -20) } } }
  const key = rowKey(original)
  const nullRow = { key, R0: 'c2c4', sound: { R0: false }, source: 'engine',
    evidence: { source: 'engine', best: best(), reading: reading('c2c4', -100) } }
  const checked = { key, quiet: true, safeMoves: ['b1c3', 'c2c4', 'd2d4', 'g1f3'], safeRuleMoves: ['b1c3', 'c2c4'] }
  const scored = { key, Rs: 'b1c3', Ns: 'd2d4', R0s: 'c2c4', sound: { Rs: true, Ns: true, R0s: false },
    evidence: { source: 'stockfish', best: best(), readings: { b1c3: reading('b1c3', -10) }, reuse: { d2d4: 'N', c2c4: 'R0' } } }
  return { original, nullRow, checked, scored }
}
const make = row => makeExample(row.original, row.nullRow, row.checked, row.scored)
let checks = 0
function test(name, fn) { try { fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error } }

test('new and reused candidates preserve the correct original referee and app conversion', () => {
  const row = fixture(), out = make(row)
  assert.equal(out.moves.Rs.san, 'Nc3')
  assert.equal(out.moves.Ns.san, 'd4')
  assert.equal(out.moves.R.san, 'e4')
  assert.equal(out.moves.A.san, 'Nf3')
  assert.equal(out.moves.Rs.evidenceSource, 'fresh')
  assert.equal(out.moves.Ns.evidenceSource, 'original')
  assert.equal(out.moves.Rs.winPercent, S.winPercentFor(score(-10), 'w'))
  assert.equal(out.moves.R.winPercent, S.winPercentFor(score(-100), 'w'))
  assert.equal(out.moves.R.sound, false)
  assert.equal(out.moves.Rs.sound, true)
  assert.equal(out.bestSource, 'fresh')
})
test('a null R0 reuse carries its null score and benchmark, not the fresh score', () => {
  const row = fixture()
  row.scored.Rs = 'c2c4'; row.scored.sound.Rs = false
  row.nullRow.evidence.best = best('d2d4', 100)
  const out = make(row)
  assert.equal(out.moves.Rs.evidenceSource, 'null')
  assert.equal(out.moves.Rs.winPercent, S.winPercentFor(score(-100), 'w'))
  assert.equal(out.moves.Rs.sound, false)
  assert.equal(out.bestSource, 'fresh')
})
test('with no new move the best is the original first line, even if null reuse has another best', () => {
  const row = fixture()
  row.scored.Rs = 'c2c4'; row.scored.sound.Rs = false
  row.scored.evidence.readings = {}
  row.nullRow.evidence.best = best('g1f3', 10)
  row.original.evidence.best.best = 'e2e4'
  row.scored.evidence.best = structuredClone(row.original.evidence.best)
  const out = make(row)
  assert.equal(out.bestSource, 'original')
  assert.equal(out.moves.best.uci, 'd2d4')
  assert.equal(out.moves.Rs.evidenceSource, 'null')
  row.scored.evidence.best = best('g1f3')
  assert.throws(() => make(row), /no-search/)
})
test('original aliases take precedence over null reuse and inconsistencies stop', () => {
  const row = fixture()
  row.nullRow.R0 = row.original.N
  row.nullRow.source = row.nullRow.evidence.source = 'stored-move'
  row.nullRow.sound.R0 = true
  assert.equal(make(row).moves.Ns.evidenceSource, 'original')
  row.scored.evidence.reuse.d2d4 = 'R0'
  assert.throws(() => make(row), /reuse source/)
})
test('incomplete, absent and wrong-root evidence cannot become an example', () => {
  for (const change of [
    row => { row.scored.evidence.readings.b1c3.partial = true },
    row => { row.scored.evidence.readings.b1c3.pv = ['a2a3']; row.scored.evidence.readings.b1c3.best = 'a2a3' },
    row => { row.scored.evidence.best.lines[0].pv = ['e2e4'] },
    row => { row.scored.sound.Rs = false },
    row => { row.original.sound.R = true },
    row => { delete row.scored.evidence.readings.b1c3 },
    row => { row.scored.key = 'synthetic-wrong-key' },
  ]) { const row = fixture(); change(row); assert.throws(() => make(row)) }
})
test('black mover percent follows the app POV', () => {
  const row = fixture()
  row.original.fen = START.replace(' w ', ' b ')
  const transform = uci => ({ e2e4: 'e7e5', d2d4: 'd7d5', g1f3: 'g8f6', c2c4: 'c7c5', b1c3: 'b8c6' })[uci]
  for (const label of ['R', 'N', 'A']) row.original[label] = transform(row.original[label])
  row.original.evidence.best = best('d7d5')
  row.original.evidence.readings = { e7e5: reading('e7e5', 100), d7d5: reading('d7d5'), g8f6: reading('g8f6', 20) }
  row.nullRow.R0 = 'c7c5'; row.nullRow.evidence.best = best('d7d5'); row.nullRow.evidence.reading = reading('c7c5', 100)
  row.checked.safeMoves = row.checked.safeMoves.map(transform); row.checked.safeRuleMoves = row.checked.safeRuleMoves.map(transform)
  row.scored.Rs = 'b8c6'; row.scored.Ns = 'd7d5'; row.scored.R0s = 'c7c5'
  row.scored.evidence = { source: 'stockfish', best: best('d7d5'), readings: { b8c6: reading('b8c6', 10) }, reuse: { d7d5: 'N', c7c5: 'R0' } }
  assert.equal(make(row).moves.R.winPercent, S.winPercentFor(score(100), 'b'))
})
function tbFixture() {
  const row = fixture(), fen = '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
  row.original.fen = fen
  const ucis = ['a1a2', 'a1b1', 'a1c1']
  const probe = { category: 'win', moves: ucis.map((uci, i) => ({ uci, san: C.uciToSan(fen, uci), category: ['loss', 'draw', 'win'][i], dtm: null })) }
  Object.assign(row.original, { R: ucis[0], N: ucis[1], A: ucis[2], sound: { R: true, N: false, A: false }, evidence: { source: 'tablebase', probe } })
  Object.assign(row.checked, { safeMoves: ucis, safeRuleMoves: [ucis[0]] })
  Object.assign(row.scored, { Rs: ucis[0], Ns: ucis[1], sound: { Rs: true, Ns: false }, evidence: { source: 'tablebase' } })
  return row
}
test('tablebase uses saved child outcomes, not a new probe or an engine', () => {
  const out = make(tbFixture())
  assert.equal(out.bestSource, 'tablebase')
  assert.equal(out.moves.Rs.winPercent, 100)
  assert.equal(out.moves.Ns.winPercent, 50)
  assert.equal(out.moves.A.winPercent, 0)
  assert.equal(out.moves.best.sound, true)
})
test('exact tablebase soundness preserves cursed outcomes and reports a best even if unsound', () => {
  const row = tbFixture()
  row.original.evidence.probe.category = 'cursed-win'
  row.original.evidence.probe.moves[0].category = 'blessed-loss'
  let out = make(row)
  assert.equal(out.moves.Rs.winPercent, 50)
  assert.equal(out.moves.Rs.sound, true)
  assert.equal(out.moves.Ns.sound, false)
  row.original.evidence.probe.category = 'draw'
  row.original.sound = { R: false, N: true, A: false }; row.scored.sound = { Rs: false, Ns: true }
  out = make(row)
  assert.equal(out.moves.best.sound, false)
})
test('missing tablebase categories or percentages stop instead of inventing a value', () => {
  const row = tbFixture()
  row.original.evidence.probe.category = 'syzygy-win'
  row.original.evidence.probe.moves[0].category = 'syzygy-loss'
  assert.throws(() => make(row), /win percent unavailable/)
  const missing = tbFixture(); missing.original.evidence.probe.moves.pop()
  assert.throws(() => make(missing), /lacks an example move/)
})
test('candidate filter and draw use quiet surviving-rule rows, distinct Rs/Ns and fixed seed', () => {
  const rows = Array.from({ length: 25 }, (_, i) => fixture('active-king', `synthetic-${i}`))
  rows[0].checked.quiet = false
  rows[1].checked.safeRuleMoves = []
  rows[2].scored.Rs = rows[2].scored.Ns
  const population = exampleCandidates(rows, 'active-king')
  assert.equal(population.length, 22)
  const expected = sampleWithoutReplacement(population, 8, 'active-king\0after-check').map(make)
  assert.deepEqual(examplesForRule(rows, 'active-king').map(({ number, ...row }) => row), expected)
  assert.throws(() => examplesForRule(population.slice(0, 7), 'active-king'), /fewer than eight/)
})
test('public examples whitelist fields and never copy private labels or keys', () => {
  const row = fixture(); row.original.privateName = 'synthetic-private-person'
  const out = make(row)
  assert.deepEqual(Object.keys(out).sort(), ['band', 'bestSource', 'fen', 'moves', 'referee'])
  assert.deepEqual(Object.keys(out.moves).sort(), ['A', 'N', 'Ns', 'R', 'Rs', 'best'])
  for (const move of Object.values(out.moves)) assert.deepEqual(Object.keys(move).sort(), ['evidenceSource', 'san', 'sound', 'uci', 'winPercent'])
  assert.doesNotMatch(JSON.stringify(out), /synthetic|private|game|person/)
})
function analysisFixture(passed = true) {
  const joined = [], rules = {}
  for (const rule of RULES) {
    const count = rule === 'cut-off-king' ? 4 : 300
    for (let i = 0; i < count; i++) joined.push(fixture(rule, `synthetic-${i}`))
    rules[rule] = { heldout: { primary: { positions: count } }, verdict: !passed ? null : count < 300 ? `not enough data (n=${count})` : 'does no better than the natural move', verdictReason: passed ? null : 'control failed' }
  }
  return { joined, analysis: { apps: { check: CHECK_APP, score: SCORE_APP, records: RECORDS }, data: { heldout: HELDOUT }, control: { passed }, rules } }
}
test('control failure produces zero examples, before sparse and per-rule verdict handling', () => {
  const { joined, analysis } = analysisFixture(false)
  const out = buildExamples(joined, analysis, {})
  assert.equal(out.summary.rules, 0); assert.equal(out.summary.positions, 0)
  assert.equal(out.excluded.length, 13)
  assert.ok(out.excluded.every(rule => rule.reason === 'control failed'))
  assert.match(renderExamples(out), /Control passed: no/)
})
test('every sufficient rule with a verdict gets exactly eight; sparse rules remain excluded', () => {
  const { joined, analysis } = analysisFixture()
  const out = buildExamples(joined, analysis, {})
  assert.equal(out.summary.rules, 12); assert.equal(out.summary.positions, 96)
  assert.equal(out.excluded[0].rule, 'cut-off-king')
  assert.deepEqual(out.summary.sound, { Rs: 96, Ns: 96, R: 0, N: 96, A: 96, best: 96 })
  assert.match(renderExamples(out), /96 examples/)
  assert.throws(() => buildExamples(joined.slice(1), analysis, {}), /population differs/)
  assert.throws(() => buildExamples([...joined, joined[0]], analysis, {}), /duplicate/)
  assert.throws(() => buildExamples(joined, { ...analysis, apps: { ...analysis.apps, score: 'wrong' } }, {}), /app mismatch/)
})
test('examples require the exact checked and scored rows used by the analysis', () => {
  const inputs = ['checked', 'scored'].flatMap(stage => [0, 1].map(shard => ({ stage, month: HELDOUT, shard, outputSha256: `${stage}-${shard}-synthetic-sha` })))
  const frozen = { inputs: { sha256: 'synthetic-inputs' }, rule: { sha256: 'synthetic-rule' } }
  const analysis = { provenance: { contentManifestSha256: 'synthetic-manifest', inputManifestSha256: 'synthetic-inputs', ruleReadmeSha256: 'synthetic-rule', completedInputs: inputs } }
  verifyAnalysisInputs(analysis, frozen, 'synthetic-manifest', inputs)
  assert.throws(() => verifyAnalysisInputs(analysis, frozen, 'wrong', inputs), /freeze mismatch/)
  assert.throws(() => verifyAnalysisInputs(analysis, frozen, 'synthetic-manifest', inputs.map((input, i) => i ? input : { ...input, outputSha256: 'wrong' })), /different completed/)
  assert.throws(() => verifyAnalysisInputs(analysis, frozen, 'synthetic-manifest', [inputs[0], inputs[0], inputs[2], inputs[3]]), /duplicate/)
})
console.log(JSON.stringify({ syntheticExamplesChecks: checks, realRowsRead: 0, realExamplesDrawn: 0, engineProcesses: 0, maiaModels: 0 }))
