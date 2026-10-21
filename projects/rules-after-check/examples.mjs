// Examples after the check. No engine or Maia calls; all scores are saved evidence.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chess, CHESS_DIR, LAB_DIR } from '../../bridge/lib/chess.mjs'
import { AMENDED_RULES, rowKey, sha, engineSound, tablebaseSound, validateScores } from '../rules-of-thumb/score.mjs'
import { sampleWithoutReplacement } from '../rules-of-thumb/null-common.mjs'

const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const { tablebaseWdl } = await chess('src/services/engine/results.ts')
export const CHECK_APP = '3437a711843006926c0804394b9087c5a55d4bcf'
export const SCORE_APP = 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a'
export const RECORDS = 'aed714ada579782ce73630596e59c8b65e74cb30'
export const RULES = AMENDED_RULES.filter(rule => !['lucena', 'philidor'].includes(rule))
export const HELDOUT = '2026-09'
export const EXAMPLES_PER_RULE = 8
const PROJECT = join(LAB_DIR, 'projects/rules-after-check')
const VERDICTS = ['holds after the check', 'misleads after the check', 'does no better than the natural move']
const ROLES = ['Rs', 'Ns', 'R', 'N', 'A', 'best']
const require = (condition, message) => { if (!condition) throw new Error(message) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function sanOf(fen, uci) {
  const san = C.uciToSan(fen, uci)
  require(typeof san === 'string' && san.length > 0, 'illegal example move')
  return san
}
function percent(value) {
  require(Number.isFinite(value) && value >= 0 && value <= 100, 'unavailable example win percent')
  return value
}
function firstLine(best) {
  const line = best?.lines?.[0]
  require(best?.complete && !best.partial && best.completion === 'complete' && S.isExactScore(line?.score), 'inexact referee best')
  require(line.move && line.pv?.[0] === line.move, 'referee first line disagrees with its principal variation')
  return line
}
function checkedSound(expected, actual) {
  require(typeof expected === 'boolean' && expected === actual, 'saved soundness disagrees with evidence')
  return expected
}
function engineMove(fen, uci, sound, reading, best, evidenceSource) {
  require(reading && (reading.best === uci || reading.pv?.[0] === uci), 'missing or wrong-root saved reading')
  validateScores(reading, best)
  firstLine(best)
  return { uci, san: sanOf(fen, uci), sound: checkedSound(sound, engineSound(reading, best, C.sideToMove(fen))),
    winPercent: percent(S.winPercentFor(reading.score, C.sideToMove(fen))), evidenceSource }
}
function tablebaseMove(fen, uci, probe, sound) {
  const move = probe?.moves.find(move => move.uci === uci)
  require(move, 'saved tablebase lacks an example move')
  const san = sanOf(fen, uci)
  require(san === move.san, 'saved tablebase SAN disagrees with the board')
  const childFen = C.fenOf(C.child(C.position(fen), uci))
  const wdl = tablebaseWdl(move, childFen, 'fifty-move')
  require(wdl !== null, 'tablebase win percent unavailable; no value is invented')
  const actual = tablebaseSound(probe, uci)
  return { uci, san, sound: sound === undefined ? actual : checkedSound(sound, actual),
    winPercent: percent(S.winPercentFor({ kind: 'tablebase', wdl }, C.sideToMove(fen))), evidenceSource: 'tablebase' }
}

/** Reused moves retain the referee that originally judged them. In particular
 * a null-run R0 may have a different best search from the phase-two row. */
function checkedMove(original, nullRow, scored, uci, sound) {
  const oldLabel = ['R', 'N', 'A'].find(label => original[label] === uci)
  const alias = oldLabel ?? (nullRow.R0 === uci ? 'R0' : null)
  const saved = scored.evidence
  if (alias) {
    require(saved.reuse?.[uci] === alias && !saved.readings?.[uci], 'saved reuse source mismatch')
    if (oldLabel) {
      checkedSound(sound, original.sound[oldLabel])
      return engineMove(original.fen, uci, sound, original.evidence.readings?.[uci], original.evidence.best, 'original')
    }
    require(nullRow.source === 'engine' && nullRow.evidence?.source === 'engine', 'null reuse lacks its own engine evidence')
    checkedSound(sound, nullRow.sound?.R0)
    return engineMove(original.fen, uci, sound, nullRow.evidence.reading, nullRow.evidence.best, 'null')
  }
  require(!saved.reuse?.[uci] && saved.readings?.[uci], 'new move lacks its fresh reading')
  return engineMove(original.fen, uci, sound, saved.readings[uci], saved.best, 'fresh')
}

/** Public fields are constructed explicitly: never copy a private row. */
export function makeExample(original, nullRow, checked, scored) {
  const key = rowKey(original)
  require([nullRow, checked, scored].every(row => row?.key === key), 'example input rows do not match')
  require(original.month === HELDOUT && RULES.includes(original.rule), 'ineligible example rule or month')
  require(checked.quiet === true && checked.safeRuleMoves?.length > 0, 'example is not quiet with a surviving rule move')
  require(scored.Rs && scored.Ns && scored.Rs !== scored.Ns, 'example needs distinct checked moves')
  require(checked.safeRuleMoves.includes(scored.Rs) && checked.safeMoves.includes(scored.Ns), 'checked example move did not pass the check')
  require(original.band === 1300 || original.band === 1500, 'invalid example band')
  const small = (original.fen.split(' ')[0].match(/[a-z]/gi) ?? []).length <= 7
  require(original.evidence?.source === (small ? 'tablebase' : 'stockfish') && scored.evidence?.source === original.evidence.source, 'example referee source mismatch')
  const ucis = { Rs: scored.Rs, Ns: scored.Ns, R: original.R, N: original.N, A: original.A }
  const sound = { Rs: scored.sound?.Rs, Ns: scored.sound?.Ns, R: original.sound?.R, N: original.sound?.N, A: original.sound?.A }
  const moves = {}
  let bestSource
  if (small) {
    const probe = original.evidence.probe
    const bestUci = E.bestUciFor(probe, 'fifty-move')
    require(bestUci, 'saved tablebase has no best move')
    for (const [label, uci] of Object.entries(ucis)) moves[label] = tablebaseMove(original.fen, uci, probe, sound[label])
    moves.best = tablebaseMove(original.fen, bestUci, probe)
    bestSource = 'tablebase'
  } else {
    for (const [label, uci] of Object.entries(ucis)) {
      moves[label] = ['R', 'N', 'A'].includes(label)
        ? engineMove(original.fen, uci, sound[label], original.evidence.readings?.[uci], original.evidence.best, 'original')
        : checkedMove(original, nullRow, scored, uci, sound[label])
    }
    const fresh = Object.keys(scored.evidence.readings ?? {}).length > 0
    const best = scored.evidence.best
    require(fresh || same(best, original.evidence.best), 'no-search example changed the original best')
    const line = firstLine(best)
    bestSource = fresh ? 'fresh' : 'original'
    moves.best = { uci: line.move, san: sanOf(original.fen, line.move),
      sound: E.acceptsAlternative(line.score, line.score, C.sideToMove(original.fen), E.ACCEPT_WINDOW_WP),
      winPercent: percent(S.winPercentFor(line.score, C.sideToMove(original.fen))), evidenceSource: bestSource }
  }
  return { fen: original.fen, band: original.band, referee: original.evidence.source, bestSource, moves }
}

export function exampleCandidates(joined, rule) {
  require(RULES.includes(rule), 'unknown example rule')
  return joined.filter(({ original, checked, scored }) => original.month === HELDOUT && original.rule === rule
    && checked.quiet === true && checked.safeRuleMoves?.length > 0 && scored.Rs && scored.Ns && scored.Rs !== scored.Ns)
}
export function examplesForRule(joined, rule) {
  const population = exampleCandidates(joined, rule)
  require(population.length >= EXAMPLES_PER_RULE, 'fewer than eight eligible examples for a rule with a verdict; review required')
  return sampleWithoutReplacement(population, EXAMPLES_PER_RULE, `${rule}\0after-check`)
    .map(({ original, nullRow, checked, scored }, i) => ({ number: i + 1, ...makeExample(original, nullRow, checked, scored) }))
}
export function summarizeExamples(examples) {
  return { positions: examples.length,
    referees: Object.fromEntries(['stockfish', 'tablebase'].map(source => [source, examples.filter(row => row.referee === source).length])),
    bestSources: Object.fromEntries(['original', 'fresh', 'tablebase'].map(source => [source, examples.filter(row => row.bestSource === source).length])),
    sound: Object.fromEntries(ROLES.map(label => [label, examples.filter(row => row.moves[label].sound).length])) }
}
export function buildExamples(joined, analysis, provenance) {
  require(analysis.apps?.check === CHECK_APP && analysis.apps?.score === SCORE_APP && analysis.apps?.records === RECORDS, 'example analysis app mismatch')
  require(analysis.data?.heldout === HELDOUT && typeof analysis.control?.passed === 'boolean', 'example analysis period or control mismatch')
  require(new Set(joined.map(row => rowKey(row.original))).size === joined.length, 'duplicate example input rows')
  const rules = {}, excluded = []
  for (const rule of RULES) {
    const result = analysis.rules?.[rule]
    require(result && Number.isInteger(result.heldout?.primary?.positions), 'missing rule analysis')
    const primary = joined.filter(({ original, checked }) => original.rule === rule && original.month === HELDOUT && checked.quiet === true && checked.safeRuleMoves?.length > 0)
    require(primary.length === result.heldout.primary.positions, 'examples primary population differs from analysis')
    if (!analysis.control.passed) {
      require(result.verdict === null && result.verdictReason === 'control failed', 'control-first verdict mismatch')
      excluded.push({ rule, reason: 'control failed', positions: primary.length })
      continue
    }
    if (primary.length < 300) {
      require(result.verdict === `not enough data (n=${primary.length})`, 'sparse verdict mismatch')
      excluded.push({ rule, reason: 'fewer than 300 held-out quiet positions with a surviving rule move', positions: primary.length })
      continue
    }
    require(VERDICTS.includes(result.verdict), 'missing registered verdict')
    const examples = examplesForRule(joined, rule)
    rules[rule] = { verdict: result.verdict, eligiblePositions: exampleCandidates(joined, rule).length,
      summary: summarizeExamples(examples), examples }
  }
  const all = Object.values(rules).flatMap(rule => rule.examples)
  return { schema: 1, apps: { check: CHECK_APP, score: SCORE_APP, records: RECORDS },
    data: { source: 'rules-of-thumb original Lichess rated standard 600+0 positions', license: 'CC0', heldout: HELDOUT },
    controlPassed: analysis.control.passed,
    selection: { positionsPerRule: EXAMPLES_PER_RULE, population: 'held-out quiet rows with surviving rule moves, Rs different from Ns, and a registered verdict',
      seed: 'rule id, NUL, after-check through detect.mjs seeded()', method: 'partial Fisher-Yates without replacement', order: 'original positions file order', outcomeSelection: false,
      insufficientCandidates: 'stop; do not replace positions or silently reduce the sample' },
    readings: { soundness: 'each saved judgment, checked against the evidence that produced it',
      winPercent: 'app winPercentFor for the original mover; tablebaseWdl of saved child categories for tablebase moves',
      best: 'fresh after-check exact first line when this position needed a search; original exact first line otherwise; app fifty-move bestUciFor for tablebases',
      reuse: 'R, N and played retain original evidence; a reused null R0 retains its null evidence; new Rs or Ns use fresh after-check evidence',
      differentSearches: 'identical SAN may carry different win% when separate saved searches supplied the candidate and best' },
    provenance, summary: { rules: Object.keys(rules).length, ...summarizeExamples(all) }, excluded, rules }
}
export function renderExamples(report) {
  const lines = ['# Held-out examples after the check', '', `Check app \`${report.apps.check}\`; referee app \`${report.apps.score}\`. Lichess positions, ${report.data.heldout}, CC0.`, '',
    `${report.summary.positions} examples from ${report.summary.rules} rules with a verdict. Each rule contributes ${report.selection.positionsPerRule} held-out quiet positions where Rs differs from Ns, drawn without replacement with its fixed seed.`, '',
    `Control passed: ${report.controlPassed ? 'yes' : 'no'}. No result chooses an example. Win% is the original mover's through the app. Tablebase win% is an outcome conversion, not a human probability.`, '',
    'The best is the fresh after-check first line when a new move was searched, or the original first line otherwise. Each reused move keeps its own saved referee; the Reading column names it. Identical moves can have different win% from separate searches.', '',
    '| Rule | Examples | Stockfish | Tablebase | Rs sound | Ns sound | R sound | N sound | Played sound | Best sound |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
  for (const [rule, value] of Object.entries(report.rules)) {
    const s = value.summary
    lines.push(`| ${rule} | ${s.positions} | ${s.referees.stockfish} | ${s.referees.tablebase} | ${ROLES.map(label => s.sound[label]).join(' | ')} |`)
  }
  lines.push('', ...report.excluded.map(row => `Excluded: ${row.rule}; ${row.reason} (n=${row.positions}).`), '')
  const names = { Rs: 'Rs', Ns: 'Ns', R: 'R', N: 'N', A: 'Played', best: 'Referee best' }
  for (const [rule, entry] of Object.entries(report.rules)) {
    lines.push(`## ${rule}`, '', `Verdict: ${entry.verdict}. Eligible example positions: ${entry.eligiblePositions}.`, '')
    for (const row of entry.examples) {
      lines.push(`### Example ${row.number}`, '', `Band ${row.band}. Referee: ${row.referee}.`, '', `FEN: \`${row.fen}\``, '',
        '| Move | SAN | Sound | Win% | Reading |', '|---|---|---|---:|---|')
      for (const [label, move] of Object.entries(row.moves)) lines.push(`| ${names[label]} | ${move.san} | ${move.sound ? 'yes' : 'no'} | ${move.winPercent.toFixed(2)} | ${move.evidenceSource} |`)
      lines.push('')
    }
  }
  return lines.join('\n') + '\n'
}

export function verifyAnalysisInputs(analysis, frozen, manifestSha, inputs) {
  const provenance = analysis.provenance
  require(provenance?.contentManifestSha256 === manifestSha
    && provenance.inputManifestSha256 === frozen.inputs.sha256
    && provenance.ruleReadmeSha256 === frozen.rule.sha256, 'example analysis freeze mismatch')
  const selected = provenance.completedInputs?.filter(input => input.month === HELDOUT)
  require(Array.isArray(selected) && selected.length === 4 && inputs.length === 4, 'example analysis completed inputs absent')
  const key = input => `${input.stage}:${input.month}:${input.shard}`
  const byKey = new Map(selected.map(input => [key(input), input]))
  require(byKey.size === 4 && new Set(inputs.map(key)).size === 4, 'duplicate example analysis inputs')
  for (const input of inputs) require(byKey.get(key(input))?.outputSha256 === input.outputSha256, 'example analysis used different completed rows')
}

async function main() {
  require(process.argv.slice(2).join(' ') === '--reviewed', 'examples require --reviewed')
  require(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', SCORE_APP), 'examples require the original referee app')
  const { verifyRun, loadJoined, loadCompleted } = await import('./common.mjs')
  const frozen = verifyRun() // Before reading any row. Phase one never calls this entry point.
  const started = performance.now()
  const source = loadJoined(HELDOUT), checked = loadCompleted('checked', HELDOUT), scored = loadCompleted('scored', HELDOUT)
  require(source.length === checked.length && source.length === scored.length, 'example input coverage differs')
  const joined = source.map((row, i) => ({ ...row, checked: checked[i], scored: scored[i] }))
  const analysisPath = join(PROJECT, 'results/rules.json'), analysisBytes = readFileSync(analysisPath)
  const manifestBytes = readFileSync(join(PROJECT, 'manifest.json'))
  const analysis = JSON.parse(analysisBytes), completedInputs = []
  for (const stage of ['checked', 'scored']) for (const shard of [0, 1]) {
    const prefix = join(LAB_DIR, 'private/rules-after-check/full', `${stage}-${HELDOUT}-${shard}-of-2`)
    const metadataBytes = readFileSync(`${prefix}.json`), metadata = JSON.parse(metadataBytes)
    const outputSha256 = sha(readFileSync(`${prefix}.jsonl`))
    require(outputSha256 === metadata.outputSha256, 'completed example rows changed during loading')
    completedInputs.push({ stage, month: HELDOUT, shard, outputSha256, manifestSha256: sha(metadataBytes) })
  }
  verifyAnalysisInputs(analysis, frozen, sha(manifestBytes), completedInputs)
  const report = buildExamples(joined, analysis, { manifestSha256: sha(manifestBytes), analysisSha256: sha(analysisBytes),
    generatorSha256: sha(readFileSync(fileURLToPath(import.meta.url))), completedInputs })
  const outputs = [['examples.json', JSON.stringify(report, null, 2) + '\n'], ['examples.md', renderExamples(report)]]
  for (const [name, data] of outputs) writeFileSync(join(PROJECT, `results/${name}.tmp`), data)
  for (const [name] of outputs) renameSync(join(PROJECT, `results/${name}.tmp`), join(PROJECT, `results/${name}`))
  console.log(JSON.stringify({ stage: 'examples', rules: report.summary.rules, positions: report.summary.positions, seconds: (performance.now() - started) / 1000 }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
