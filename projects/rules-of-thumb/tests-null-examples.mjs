// Synthetic examples only. No engine, Maia, real rows or real example draw.
import assert from 'node:assert/strict'
import { chess } from '../../bridge/lib/chess.mjs'
import { RULES } from './detect.mjs'
import { sampleWithoutReplacement } from './null-common.mjs'
import { buildExamples, exampleCandidates, exampleOf, examplesForRule, HELDOUT,
  ORIGINAL_APP, renderExamples, summarizeExamples } from './examples-null.mjs'

const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const { tablebaseWdl } = await chess('src/services/engine/results.ts')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const score = cp => ({ cp, mate: null })
const reading = (uci, cp) => ({ best: uci, pv: [uci], score: score(cp), partial: false,
  completion: 'complete', status: 'exact', coherent: true })
function engineRow(extra = {}) {
  return {
    game: 'synthetic-game', key: 'private-row-key-must-not-escape', month: HELDOUT,
    rule: 'active-king', fen: START, band: 1300, R: 'e2e4', N: 'd2d4', A: 'g1f3',
    sound: { R: false, N: true, A: true },
    evidence: {
      source: 'stockfish',
      best: { best: 'd2d4', complete: true, partial: false, completion: 'complete',
        lines: [{ move: 'd2d4', pv: ['d2d4'], score: score(0) }] },
      readings: { e2e4: reading('e2e4', -100), d2d4: reading('d2d4', 0), g1f3: reading('g1f3', -20) },
    },
    ...extra,
  }
}
function tablebaseRow(mover = 'w', extra = {}) {
  const fen = mover === 'w'
    ? '8/8/8/8/8/4k3/8/R3K3 w - - 0 1'
    : 'r3k3/8/4K3/8/8/8/8/8 b - - 0 1'
  const ucis = mover === 'w' ? ['a1a2', 'a1b1', 'a1c1'] : ['a8a7', 'a8b8', 'a8c8']
  const moves = ucis.map((uci, i) => ({ uci, san: C.uciToSan(fen, uci),
    category: ['loss', 'draw', 'win'][i], dtm: [-10, null, 10][i] }))
  return engineRow({ fen, R: ucis[0], N: ucis[1], A: ucis[2],
    sound: { R: true, N: false, A: false }, evidence: { source: 'tablebase', probe: { category: 'win', moves } }, ...extra })
}
let checks = 0
function test(name, fn) {
  try { fn(); checks++ } catch (error) { error.message = `${name}: ${error.message}`; throw error }
}

test('sampling is seeded, without replacement and does not mutate the input', () => {
  const input = Object.freeze(Array.from({ length: 80 }, (_, i) => i))
  const first = sampleWithoutReplacement(input, 8, 'active-king')
  assert.equal(first.length, 8)
  assert.equal(new Set(first).size, 8)
  assert.deepEqual(first, sampleWithoutReplacement(input, 8, 'active-king'))
  assert.notDeepEqual(first, sampleWithoutReplacement(input, 8, 'open-file'))
  assert.deepEqual([...input], Array.from({ length: 80 }, (_, i) => i))
  assert.throws(() => sampleWithoutReplacement(input, 81, 'active-king'))
})
test('only the named held-out rule with R different from N is eligible', () => {
  const source = [engineRow(), engineRow({ R: 'd2d4' }), engineRow({ month: '2026-07' }),
    engineRow({ rule: 'open-file' })]
  assert.deepEqual(exampleCandidates(source, 'active-king'), [source[0]])
  assert.throws(() => exampleCandidates(source, 'bishop-pair'), /unknown/)
})
test('example selection uses original input order and the rule id only', () => {
  const source = Array.from({ length: 30 }, (_, i) => engineRow({ band: i % 2 ? 1500 : 1300,
    game: `synthetic-${i}`, evidence: structuredClone(engineRow().evidence) }))
  const chosen = sampleWithoutReplacement(source, 8, 'active-king').map(exampleOf)
  assert.deepEqual(examplesForRule(source, 'active-king').map(({ number, ...row }) => row), chosen)
  assert.deepEqual(examplesForRule(source, 'active-king').map(row => row.number), [1, 2, 3, 4, 5, 6, 7, 8])
})
test('Stockfish examples use stored scores and app SAN and win percent', () => {
  const row = engineRow()
  const out = exampleOf(row)
  assert.equal(out.moves.R.san, 'e4')
  assert.equal(out.moves.N.san, 'd4')
  assert.equal(out.moves.A.san, 'Nf3')
  assert.equal(out.moves.best.san, 'd4')
  for (const label of ['R', 'N', 'A']) {
    assert.equal(out.moves[label].sound, row.sound[label])
    assert.equal(out.moves[label].winPercent, S.winPercentFor(row.evidence.readings[row[label]].score, 'w'))
  }
  assert.equal(out.moves.best.sound, true)
  assert.equal(out.moves.best.winPercent, 50)
})
test('black mover win percent uses the app POV conversion', () => {
  const row = engineRow({ fen: START.replace(' w ', ' b '), R: 'e7e5', N: 'd7d5', A: 'g8f6',
    sound: { R: false, N: true, A: true } })
  row.evidence.best.best = row.evidence.best.lines[0].move = 'd7d5'
  row.evidence.best.lines[0].pv = ['d7d5']
  row.evidence.readings = { e7e5: reading('e7e5', 100), d7d5: reading('d7d5', 0), g8f6: reading('g8f6', 20) }
  const out = exampleOf(row)
  assert.equal(out.moves.R.winPercent, S.winPercentFor(score(100), 'b'))
  assert.ok(out.moves.R.winPercent < 50)
  assert.equal(out.moves.R.sound, false)
})
test('incomplete or inconsistent stored evidence stops generation', () => {
  const variants = [
    row => { row.evidence.readings.e2e4.completion = 'deadline' },
    row => { row.evidence.readings.e2e4.status = 'bound' },
    row => { row.evidence.best.complete = false },
    row => { row.evidence.best.lines[0].pv = ['e2e4'] },
    row => { row.sound.R = true },
    row => { row.R = 'e2e5' },
    row => { delete row.evidence.readings.e2e4 },
  ]
  for (const change of variants) {
    const row = engineRow()
    change(row)
    assert.throws(() => exampleOf(row))
  }
})
test('referee best is the exact first line even if the raw final best differs', () => {
  const row = engineRow()
  row.evidence.best.best = 'e2e4'
  const out = exampleOf(row)
  assert.equal(out.moves.best.uci, 'd2d4')
  assert.equal(out.moves.best.winPercent, 50)
})
test('tablebase examples use stored child categories and the app best for both colors', () => {
  for (const color of ['w', 'b']) {
    const row = tablebaseRow(color), out = exampleOf(row)
    assert.equal(out.moves.best.uci, E.bestUciFor(row.evidence.probe, 'fifty-move'))
    assert.equal(out.moves.R.winPercent, 100)
    assert.equal(out.moves.N.winPercent, 50)
    assert.equal(out.moves.A.winPercent, 0)
    assert.equal(out.moves.R.sound, true)
    assert.equal(out.moves.N.sound, false)
    for (const label of ['R', 'N', 'A']) {
      const move = row.evidence.probe.moves.find(move => move.uci === row[label])
      const fen = C.fenOf(C.child(C.position(row.fen), move.uci))
      const wdl = tablebaseWdl(move, fen, 'fifty-move')
      assert.equal(out.moves[label].winPercent, S.winPercentFor({ kind: 'tablebase', wdl }, color))
    }
  }
})
test('cursed and blessed tablebase outcomes keep exact soundness while win percent is 50', () => {
  const row = tablebaseRow()
  row.evidence.probe.category = 'cursed-win'
  row.evidence.probe.moves[0].category = 'blessed-loss'
  const out = exampleOf(row)
  assert.equal(out.moves.R.sound, true)
  assert.equal(out.moves.N.sound, false)
  assert.equal(out.moves.R.winPercent, 50)
  assert.equal(out.moves.N.winPercent, 50)
})
test('the app-selected tablebase best reports exact soundness without requiring it to be true', () => {
  const row = tablebaseRow()
  row.evidence.probe.category = 'draw'
  row.sound = { R: false, N: true, A: false }
  const out = exampleOf(row)
  assert.equal(out.moves.best.uci, E.bestUciFor(row.evidence.probe, 'fifty-move'))
  assert.equal(out.moves.best.sound, false)
  assert.equal(out.moves.best.winPercent, 100)
})
test('unavailable tablebase percentages and missing or inconsistent moves stop', () => {
  const row = tablebaseRow()
  row.evidence.probe.category = 'syzygy-win'
  row.evidence.probe.moves[0].category = 'syzygy-loss'
  assert.throws(() => exampleOf(row), /win percent unavailable/)
  const missing = tablebaseRow()
  missing.evidence.probe.moves.pop()
  assert.throws(() => exampleOf(missing), /lacks an example move/)
  const wrongSan = tablebaseRow()
  wrongSan.evidence.probe.moves[0].san = 'synthetic-wrong-san'
  assert.throws(() => exampleOf(wrongSan), /SAN disagrees/)
  const wrongSound = tablebaseRow()
  wrongSound.sound.R = false
  assert.throws(() => exampleOf(wrongSound), /soundness disagrees/)
})
test('public examples use a strict schema that excludes private identifiers', () => {
  const out = exampleOf(engineRow({ player: 'synthetic-private-player', url: 'synthetic-private-url',
    arbitrary: { secret: 'synthetic-private-secret' } }))
  assert.deepEqual(Object.keys(out).sort(), ['band', 'fen', 'moves', 'referee'])
  assert.deepEqual(Object.keys(out.moves).sort(), ['A', 'N', 'R', 'best'])
  for (const move of Object.values(out.moves)) assert.deepEqual(Object.keys(move).sort(), ['san', 'sound', 'uci', 'winPercent'])
  assert.doesNotMatch(JSON.stringify(out), /synthetic|private|secret|game|player|url/)
})
test('full synthetic report leaves sparse rules out and has eight examples for every verdict', () => {
  const rows = [], rules = {}
  for (const rule of RULES) {
    const count = ['lucena', 'philidor'].includes(rule) ? 5 : 300
    rules[rule] = { heldout: { positions: count }, verdict: count < 300 ? `not enough data (n=${count})` : 'It misleads' }
    for (let i = 0; i < count; i++) rows.push(engineRow({ rule, game: `synthetic-${i}` }))
  }
  const analysis = { app: ORIGINAL_APP, data: { heldout: HELDOUT }, rules }
  const report = buildExamples(rows, analysis, { synthetic: true })
  assert.equal(report.summary.rules, 13)
  assert.equal(report.summary.positions, 104)
  assert.deepEqual(report.excluded.map(row => row.rule), ['lucena', 'philidor'])
  assert.deepEqual(report.summary.sound, { R: 0, N: 104, A: 104, best: 104 })
  assert.deepEqual(summarizeExamples(report.rules['active-king'].examples).sound, { R: 0, N: 8, A: 8, best: 8 })
  assert.match(renderExamples(report), /104 positions/)
  assert.doesNotMatch(JSON.stringify(report.rules), /synthetic-game|private-row-key/)
  assert.throws(() => buildExamples(rows.slice(1), analysis, {}), /population/)
  assert.throws(() => buildExamples([...rows, rows[0]], analysis, {}), /duplicate/)
  assert.throws(() => buildExamples(rows, { ...analysis, app: 'wrong' }, {}), /mismatch/)
})
console.log(JSON.stringify({ syntheticExampleChecks: checks, engineProcesses: 0, maiaModels: 0, realExamplesDrawn: 0 }))
