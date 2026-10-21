// Registered held-out examples. Only saved referee evidence is read.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chess, CHESS_DIR, LAB_DIR } from '../../bridge/lib/chess.mjs'
import { engineSound, tablebaseSound, validateScores, sha } from '../rules-of-thumb/score.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'
import { UNITS } from './readings.mjs'

const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const { tablebaseWdl } = await chess('src/services/engine/results.ts')
const PROJECT = join(LAB_DIR, 'projects/tiebreak-rules')
export const APP = JSON.parse(readFileSync(join(PROJECT, 'app-pin.json'))).commit
export const HELDOUT = '2026-09'
export const COUNT = 6
export { UNITS }
const require = (test, message) => { if (!test) throw new Error(message) }

function sanOf(fen, uci) {
  const san = C.uciToSan(fen, uci)
  require(typeof san === 'string' && san.length > 0, 'illegal example move')
  return san
}
function percent(value) {
  require(Number.isFinite(value) && value >= 0 && value <= 100, 'example win percent unavailable')
  return value
}
function firstLine(best) {
  const line = best?.lines?.[0]
  require(best?.complete && !best.partial && best.completion === 'complete' && S.isExactScore(line?.score), 'inexact referee best')
  require(line.move && line.pv?.[0] === line.move, 'referee first line disagrees with principal variation')
  return line
}
function confirmSound(saved, read) {
  require(typeof saved === 'boolean' && saved === read, 'saved soundness disagrees with referee evidence')
  return saved
}
function engineMove(row, uci) {
  const reading = row.evidence.readings?.[uci], best = row.evidence.best
  require(reading && (reading.best === uci || reading.pv?.[0] === uci), 'missing or wrong-root saved reading')
  validateScores(reading, best); firstLine(best)
  return { uci, san: sanOf(row.fen, uci), sound: confirmSound(row.sound[uci], engineSound(reading, best, C.sideToMove(row.fen))),
    winPercent: percent(S.winPercentFor(reading.score, C.sideToMove(row.fen))) }
}
function tablebaseMove(row, uci) {
  const probe = row.evidence.probe, move = probe?.moves.find(move => move.uci === uci)
  require(move, 'saved tablebase lacks a compared move')
  const san = sanOf(row.fen, uci)
  require(san === move.san, 'tablebase SAN differs from board')
  const child = C.fenOf(C.child(C.position(row.fen), uci))
  const wdl = tablebaseWdl(move, child, 'fifty-move')
  require(wdl !== null, 'tablebase win percent unavailable; do not invent a value')
  return { uci, san, sound: confirmSound(row.sound[uci], tablebaseSound(probe, uci)),
    winPercent: percent(S.winPercentFor({ kind: 'tablebase', wdl }, C.sideToMove(row.fen))) }
}

function keptUnit(row, unit) {
  require(row.datasetKind === 'tiebreak-rules' && row.month === HELDOUT, 'foreign example population')
  const selected = row.units.filter(item => item.unit === unit)
  require(selected.length <= 1, 'duplicate unit in occurrence')
  if (!selected.length) return null
  const item = selected[0]
  require(item.F !== item.B && [row.M1, row.M2].includes(item.F) && [row.M1, row.M2].includes(item.B), 'example differs from natural pair')
  require(item.stratum === (item.F === row.M1 ? 'follow-first' : 'break-first'), 'wrong example order')
  require(typeof row.sound?.[item.F] === 'boolean' && typeof row.sound?.[item.B] === 'boolean', 'missing example soundness')
  return item
}

/** Whitelist public fields: no game, key, file index, ply, link or journal trace. */
export function makeExample(row, unit) {
  require(UNITS.includes(unit), 'unregistered example unit')
  const item = keptUnit(row, unit)
  require(item && row.sound[item.F] !== row.sound[item.B], 'example needs exactly one sound move')
  require([1300, 1500].includes(row.band), 'invalid example band')
  const small = (row.fen.split(' ')[0].match(/[a-z]/gi) ?? []).length <= 7
  require(row.evidence?.source === (small ? 'tablebase' : 'stockfish'), 'example referee source mismatch')
  const read = small ? tablebaseMove : engineMove
  const bestUci = small ? E.bestUciFor(row.evidence.probe, 'fifty-move') : firstLine(row.evidence.best).move
  require(bestUci, 'saved referee has no best move')
  return { fen: row.fen, band: row.band, stratum: item.stratum, referee: row.evidence.source,
    moves: { F: read(row, item.F), B: read(row, item.B),
      played: { uci: row.played, san: sanOf(row.fen, row.played) }, best: { uci: bestUci, san: sanOf(row.fen, bestUci) } } }
}

export function exampleCandidates(rows, unit) {
  require(UNITS.includes(unit), 'unregistered example unit')
  const selected = [], games = new Set()
  for (const row of rows) {
    const item = keptUnit(row, unit)
    if (!item) continue
    require(!games.has(row.game), 'duplicate kept unit/game')
    games.add(row.game)
    if (row.sound[item.F] !== row.sound[item.B]) selected.push(row)
  }
  return selected
}
export function examplesForUnit(rows, unit) {
  const candidates = exampleCandidates(rows, unit)
  require(candidates.length >= COUNT, 'fewer than six one-sound examples for a unit; stop for review')
  return sampleWithoutReplacement(candidates, COUNT, `${unit}\0examples`)
    .map((row, i) => ({ number: i + 1, ...makeExample(row, unit) }))
}
export function summarizeExamples(rows) {
  return { positions: rows.length,
    referees: Object.fromEntries(['stockfish', 'tablebase'].map(source => [source, rows.filter(row => row.referee === source).length])),
    orders: Object.fromEntries(['follow-first', 'break-first'].map(order => [order, rows.filter(row => row.stratum === order).length])),
    soundF: rows.filter(row => row.moves.F.sound).length, soundB: rows.filter(row => row.moves.B.sound).length }
}
export function buildExamples(rows, analysis, provenance) {
  require(analysis.datasetKind === 'tiebreak-rules' && analysis.app === APP && analysis.data?.heldout === HELDOUT, 'example analysis provenance differs')
  require(new Set(rows.map(row => row.key)).size === rows.length, 'duplicate occurrence in example input')
  require(rows.every(row => row.month === HELDOUT), 'example inputs include another month')
  const units = {}
  for (const unit of UNITS) {
    const kept = rows.filter(row => keptUnit(row, unit))
    const candidates = exampleCandidates(rows, unit)
    const measured = analysis.units?.[unit]?.heldout
    require(measured && kept.length === measured.positions && candidates.length === measured.oneSoundPositions, 'example population differs from analysis')
    // The registered examples have no control, count or verdict gate.
    const examples = examplesForUnit(rows, unit)
    units[unit] = { keptPositions: kept.length, eligiblePositions: candidates.length, summary: summarizeExamples(examples), examples }
  }
  const all = Object.values(units).flatMap(item => item.examples)
  return { schema: 1, datasetKind: 'tiebreak-rules-examples', app: APP,
    data: { source: 'Lichess rated standard 600+0', license: 'CC0', heldout: HELDOUT },
    selection: { positionsPerUnit: COUNT, units: [...UNITS], population: 'held-out kept positions where exactly one of F and B is sound',
      method: 'partial Fisher-Yates without replacement', seed: 'unit id, NUL, examples through detect.mjs seeded()',
      order: 'original selected occurrence file order', verdictGate: false, controlGate: false,
      insufficientCandidates: 'stop; do not replace positions or reduce the sample' },
    readings: { soundness: 'saved F/B judgments checked against their stored referee evidence',
      winPercent: 'app winPercentFor for the original mover; saved child tablebaseWdl for tablebases',
      best: 'first exact Stockfish line, or app bestUciFor with fifty-move tablebase policy',
      played: 'SAN only; the played move was not scored', outcomeSelection: 'exactly one of F and B is sound, as registered' },
    provenance, summary: { units: UNITS.length, ...summarizeExamples(all) }, units }
}

export function verifyAnalysisInputs(analysis, frozen, manifestSha256, positions, scores) {
  const p = analysis.provenance
  require(p?.contentManifestSha256 === manifestSha256 && p.inputManifestSha256 === frozen.inputs.sha256
    && p.ruleReadmeSha256 === frozen.rule.sha256 && p.analysisSha256 === frozen.files['analyze.py'], 'analysis freeze differs')
  const selectedPositions = p.positionInputs?.filter(item => item.month === HELDOUT)
  require(selectedPositions?.length === 1 && positions.length === 1
    && positions[0].month === HELDOUT && selectedPositions[0].outputSha256 === positions[0].outputSha256, 'analysis position input differs')
  const selectedScores = p.completedInputs?.filter(item => item.month === HELDOUT)
  require(selectedScores?.length === 2 && scores.length === 2, 'analysis score inputs missing')
  const keys = array => new Map(array.map(item => [`${item.stage}:${item.month}:${item.shard}`, item.outputSha256]))
  const expected = keys(selectedScores), observed = keys(scores)
  require(expected.size === 2 && observed.size === 2 && [0, 1].every(shard => expected.get(`scored:${HELDOUT}:${shard}`)
    && expected.get(`scored:${HELDOUT}:${shard}`) === observed.get(`scored:${HELDOUT}:${shard}`)), 'analysis score hashes differ')
}

export function renderExamples(report) {
  const lines = ['# Held-out tie-break examples', '', `App \`${report.app}\`. Lichess positions, ${report.data.heldout}, CC0.`, '',
    `${report.summary.positions} examples: six for each of the eight units, including the reference and control. The draw is independent of verdicts and control success. Each candidate has exactly one sound move of F and B.`, '',
    "Win% is the app's conversion for the mover. Tablebase win% converts an outcome; it is not a human probability. The played move was not scored and is shown in SAN only. The best is the referee's first exact line or the saved tablebase's best move.", '',
    '| Unit | Examples | Stockfish | Tablebase | Follow first | Break first | F sound | B sound |', '|---|---:|---:|---:|---:|---:|---:|---:|']
  for (const [unit, entry] of Object.entries(report.units)) {
    const s = entry.summary
    lines.push(`| ${unit} | ${s.positions} | ${s.referees.stockfish} | ${s.referees.tablebase} | ${s.orders['follow-first']} | ${s.orders['break-first']} | ${s.soundF} | ${s.soundB} |`)
  }
  for (const [unit, entry] of Object.entries(report.units)) {
    lines.push('', `## ${unit}`, '', `${entry.eligiblePositions} one-sound candidates among ${entry.keptPositions} held-out positions.`, '')
    for (const row of entry.examples) {
      lines.push(`### Example ${row.number}`, '', `Band ${row.band}; ${row.stratum}; ${row.referee}.`, '', `FEN: \`${row.fen}\``, '',
        '| Move | SAN | Sound | Win% |', '|---|---|---|---:|')
      for (const label of ['F', 'B']) {
        const m = row.moves[label]
        lines.push(`| ${label} | ${m.san} | ${m.sound ? 'yes' : 'no'} | ${m.winPercent.toFixed(2)} |`)
      }
      lines.push(`| Played | ${row.moves.played.san} | not scored | — |`, `| Referee best | ${row.moves.best.san} | — | — |`, '')
    }
  }
  return lines.join('\n') + '\n'
}

async function main() {
  require(process.argv.slice(2).join(' ') === '--reviewed', 'examples require --reviewed before reading any study row')
  require(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', APP), 'examples require the registered app')
  const { verifyRun, loadPositions, loadCompleted } = await import('./common.mjs')
  const frozen = verifyRun()
  const started = performance.now()
  const source = loadPositions(HELDOUT), rows = loadCompleted('scored', HELDOUT)
  require(source.length === rows.length && source.every((row, i) => row.key === rows[i].key), 'example occurrence order differs')
  for (let i = 0; i < source.length; i++) require(Object.entries(source[i]).every(([key, value]) => key === 'times'
    || JSON.stringify(rows[i][key]) === JSON.stringify(value)), 'score changed example source readings')
  const directory = join(LAB_DIR, 'private/tiebreak-rules/full')
  const positionInputs = [{ month: HELDOUT, outputSha256: sha(readFileSync(join(directory, `positions-${HELDOUT}.jsonl`))) }]
  const completedInputs = [0, 1].map(shard => {
    const prefix = join(directory, `scored-${HELDOUT}-${shard}-of-2`), meta = JSON.parse(readFileSync(`${prefix}.json`))
    const outputSha256 = sha(readFileSync(`${prefix}.jsonl`))
    require(meta.outputSha256 === outputSha256, 'completed example scores changed during loading')
    return { stage: 'scored', month: HELDOUT, shard, outputSha256 }
  })
  const analysisBytes = readFileSync(join(PROJECT, 'results/rules.json')), analysis = JSON.parse(analysisBytes)
  const manifestSha256 = sha(readFileSync(join(PROJECT, 'manifest.json')))
  verifyAnalysisInputs(analysis, frozen, manifestSha256, positionInputs, completedInputs)
  const report = buildExamples(rows, analysis, { manifestSha256, analysisSha256: sha(analysisBytes),
    generatorSha256: sha(readFileSync(fileURLToPath(import.meta.url))), positionInputs, completedInputs })
  for (const [name, data] of [['examples.json', JSON.stringify(report, null, 2) + '\n'], ['examples.md', renderExamples(report)]]) {
    const path = join(PROJECT, 'results', name)
    writeFileSync(`${path}.tmp`, data); renameSync(`${path}.tmp`, path)
  }
  console.log(JSON.stringify({ stage: 'examples', units: report.summary.units, positions: report.summary.positions, seconds: (performance.now() - started) / 1000 }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
