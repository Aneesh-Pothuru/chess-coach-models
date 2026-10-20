// Random held-out examples. Stored app evidence supplies every chess reading.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { gunzipSync } from 'node:zlib'
import { chess, CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { RULES } from './detect.mjs'
import { rowKey, sha, engineSound, tablebaseSound, validateScores } from './score.mjs'
import { sampleWithoutReplacement } from './null-common.mjs'

const C = await chess('src/core/chess/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const { tablebaseWdl } = await chess('src/services/engine/results.ts')
const PROJECT = join(LAB_DIR, 'projects/rules-of-thumb')
export const ORIGINAL_APP = 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a'
export const HELDOUT = '2026-09'
export const EXAMPLES_PER_RULE = 8
const VERDICTS = ['Teach it', 'It misleads', 'No better than the natural move']
const require = (condition, message) => { if (!condition) throw new Error(message) }

export function exampleCandidates(rows, rule) {
  require(RULES.includes(rule), 'unknown example rule')
  return rows.filter(row => row.month === HELDOUT && row.rule === rule && row.R !== row.N)
}

function sanOf(fen, uci) {
  const san = C.uciToSan(fen, uci)
  require(typeof san === 'string' && san.length > 0, 'example move is illegal')
  return san
}

function percent(value) {
  require(Number.isFinite(value) && value >= 0 && value <= 100, 'example win percent unavailable')
  return value
}

function tablebaseWinPercent(fen, move) {
  const childFen = C.fenOf(C.child(C.position(fen), move.uci))
  // The saved move's category describes this child position. The app maps
  // its side-to-move category to White WDL, including the fifty-move rule.
  const wdl = tablebaseWdl(move, childFen, 'fifty-move')
  require(wdl !== null, 'tablebase win percent unavailable; no score is invented')
  return percent(S.winPercentFor({ kind: 'tablebase', wdl }, C.sideToMove(fen)))
}

/** Whitelist output fields so a game id, row key, link or log cannot escape. */
export function exampleOf(row) {
  require(row.month === HELDOUT && RULES.includes(row.rule) && row.R !== row.N, 'ineligible example')
  require(row.band === 1300 || row.band === 1500, 'invalid example band')
  const mover = C.sideToMove(row.fen)
  const evidence = row.evidence
  let bestUci, readings
  if (evidence?.source === 'stockfish') {
    const best = evidence.best
    bestUci = best?.lines?.[0]?.move
    require(bestUci && best.lines[0].pv?.[0] === bestUci, 'stored first-line best move disagrees with its principal variation')
    readings = Object.fromEntries(Object.entries({ R: row.R, N: row.N, A: row.A }).map(([label, uci]) => {
      const reading = evidence.readings?.[uci]
      require(reading && (reading.best === uci || reading.pv?.[0] === uci), 'missing or wrong stored move reading')
      validateScores(reading, best)
      const sound = engineSound(reading, best, mover)
      require(typeof row.sound?.[label] === 'boolean' && row.sound[label] === sound, 'stored soundness disagrees with its evidence')
      return [label, { uci, san: sanOf(row.fen, uci), sound: row.sound[label],
        winPercent: percent(S.winPercentFor(reading.score, mover)) }]
    }))
    readings.best = { uci: bestUci, san: sanOf(row.fen, bestUci),
      sound: E.acceptsAlternative(best.lines[0].score, best.lines[0].score, mover, E.ACCEPT_WINDOW_WP),
      winPercent: percent(S.winPercentFor(best.lines[0].score, mover)) }
  } else if (evidence?.source === 'tablebase') {
    const probe = evidence.probe
    // This is the app's best selector used by fromTablebase, with the same
    // default policy as the original run's outcome comparison.
    bestUci = E.bestUciFor(probe, 'fifty-move')
    require(bestUci, 'stored tablebase has no best move')
    readings = Object.fromEntries(Object.entries({ R: row.R, N: row.N, A: row.A, best: bestUci }).map(([label, uci]) => {
      const move = probe.moves.find(move => move.uci === uci)
      require(move, 'stored tablebase lacks an example move')
      const sound = tablebaseSound(probe, uci)
      if (label !== 'best') require(typeof row.sound?.[label] === 'boolean' && row.sound[label] === sound, 'stored soundness disagrees with its evidence')
      const san = sanOf(row.fen, uci)
      require(move.san === san, 'stored tablebase SAN disagrees with the app board')
      return [label, { uci, san, sound, winPercent: tablebaseWinPercent(row.fen, move) }]
    }))
  } else throw new Error('unknown example referee source')
  return { fen: row.fen, band: row.band, referee: evidence.source, moves: readings }
}

export function examplesForRule(rows, rule, count = EXAMPLES_PER_RULE) {
  return sampleWithoutReplacement(exampleCandidates(rows, rule), count, rule)
    .map((row, index) => ({ number: index + 1, ...exampleOf(row) }))
}

export function summarizeExamples(examples) {
  return {
    positions: examples.length,
    referees: Object.fromEntries(['stockfish', 'tablebase'].map(source => [source, examples.filter(row => row.referee === source).length])),
    sound: Object.fromEntries(['R', 'N', 'A', 'best'].map(label => [label, examples.filter(row => row.moves[label].sound).length])),
  }
}

export function buildExamples(rows, analysis, provenance) {
  require(analysis.app === ORIGINAL_APP && analysis.data.heldout === HELDOUT, 'example source analysis mismatch')
  require(new Set(rows.map(rowKey)).size === rows.length, 'duplicate example input rows')
  const included = [], excluded = [], rules = {}
  for (const rule of RULES) {
    const prior = analysis.rules[rule]
    require(prior && Number.isInteger(prior.heldout?.positions), 'missing original rule result')
    const population = rows.filter(row => row.rule === rule && row.month === HELDOUT)
    require(population.length === prior.heldout.positions, 'example population does not match original analysis')
    if (prior.heldout.positions < 300) {
      require(prior.verdict.startsWith('not enough data'), 'sparse original verdict mismatch')
      excluded.push({ rule, reason: 'fewer than 300 held-out positions', positions: prior.heldout.positions })
      continue
    }
    require(VERDICTS.includes(prior.verdict), 'missing registered verdict')
    const examples = examplesForRule(rows, rule)
    rules[rule] = { verdict: prior.verdict, eligiblePositions: exampleCandidates(rows, rule).length,
      summary: summarizeExamples(examples), examples }
    included.push(rule)
  }
  const all = included.flatMap(rule => rules[rule].examples)
  return {
    schema: 1, app: ORIGINAL_APP, data: { source: 'Lichess rated standard 600+0', license: 'CC0', heldout: HELDOUT },
    selection: { positionsPerRule: EXAMPLES_PER_RULE, population: 'held-out rows with R different from N, for rules with a registered verdict',
      seed: "rule id through detect.mjs seeded()", method: 'partial Fisher-Yates without replacement',
      order: 'original positions file order', outcomeSelection: false },
    readings: {
      winPercent: "the original mover's side, through the app core/score winPercentFor",
      soundness: 'the original recorded soundness, checked against its stored referee evidence',
      bestStockfish: 'the first line of the original grade best search',
      bestTablebase: "app bestUciFor(stored probe, 'fifty-move')",
      tablebaseWinPercent: "app tablebaseWdl of the stored move category at the child FEN, then winPercentFor; unavailable conversions stop",
    },
    provenance, summary: { rules: included.length, ...summarizeExamples(all) }, excluded, rules,
  }
}

export function renderExamples(result) {
  const lines = ['# Held-out examples', '', `App \`${result.app}\`. Lichess standard rated 600+0, ${result.data.heldout}. Positions are CC0.`, '',
    `${result.summary.positions} positions: ${result.selection.positionsPerRule} for each of ${result.summary.rules} rules with a registered verdict. They are drawn without replacement among held-out rows where R differs from N, seeded by the rule id. No result is used to choose them.`, '',
    "Win% is from the original mover's side through the app's score conversion. Soundness is checked against the stored referee evidence. The best is the original Stockfish first line, or the app's fifty-move tablebase best. Tablebase win% is an outcome conversion; it is not a human win probability.", '',
    '| Rule | Examples | Stockfish | Tablebase | R sound | N sound | Played sound | Best sound |',
    '|---|---:|---:|---:|---:|---:|---:|---:|']
  for (const [rule, value] of Object.entries(result.rules)) {
    const s = value.summary
    lines.push(`| ${rule} | ${s.positions} | ${s.referees.stockfish} | ${s.referees.tablebase} | ${s.sound.R} | ${s.sound.N} | ${s.sound.A} | ${s.sound.best} |`)
  }
  lines.push('', `Excluded for fewer than 300 held-out positions: ${result.excluded.map(row => `${row.rule} (${row.positions})`).join(', ')}.`, '')
  const names = { R: 'R', N: 'N', A: 'Played', best: 'Referee best' }
  for (const [rule, value] of Object.entries(result.rules)) {
    lines.push(`## ${rule}`, '', `Registered verdict: ${value.verdict}. Eligible held-out positions: ${value.eligiblePositions}.`, '')
    for (const row of value.examples) {
      lines.push(`### Example ${row.number}`, '', `Band ${row.band}. Referee: ${row.referee}.`, '', `FEN: \`${row.fen}\``, '',
        '| Move | SAN | Sound | Win% |', '|---|---|---|---:|')
      for (const [label, move] of Object.entries(row.moves)) lines.push(`| ${names[label]} | ${move.san} | ${move.sound ? 'yes' : 'no'} | ${move.winPercent.toFixed(2)} |`)
      lines.push('')
    }
  }
  return lines.join('\n') + '\n'
}

function jsonLines(bytes) {
  require(bytes.length === 0 || bytes.at(-1) === 10, 'incomplete original score journal')
  return bytes.toString().split('\n').filter(Boolean).map(JSON.parse)
}

/** Read-only: restoring source order never repairs or rewrites phase two. */
export function loadHeldout(dir) {
  const bytes = readFileSync(join(dir, `positions-${HELDOUT}.jsonl.gz`))
  const positions = jsonLines(gunzipSync(bytes))
  const manifest = JSON.parse(readFileSync(join(dir, `positions-${HELDOUT}.json`)))
  require(manifest.complete && manifest.app === ORIGINAL_APP && manifest.outputSha256 === sha(bytes), 'original positions incomplete or changed')
  const byKey = new Map()
  const hashes = { positions: sha(bytes), positionManifest: sha(readFileSync(join(dir, `positions-${HELDOUT}.json`))), scored: [] }
  for (let shard = 0; shard < 2; shard++) {
    const prefix = `scored-${HELDOUT}-${shard}-of-2`
    const scoreBytes = readFileSync(join(dir, `${prefix}.jsonl`))
    const metaBytes = readFileSync(join(dir, `${prefix}.json`))
    const meta = JSON.parse(metaBytes)
    const expected = positions.filter((_, i) => i % 2 === shard)
    const scored = jsonLines(scoreBytes)
    require(meta.complete && meta.status === 'complete' && !meta.timing && meta.datasetKind === 'amended'
      && meta.app === ORIGINAL_APP && meta.month === HELDOUT && meta.run === 'full'
      && meta.shard === shard && meta.shards === 2 && meta.inputSha256 === sha(bytes)
      && meta.keysSha256 === sha(expected.map(rowKey).join('\n'))
      && meta.rows === expected.length && meta.expectedRows === expected.length && scored.length === expected.length,
    'original score coverage or provenance mismatch')
    const expectedByKey = new Map(expected.map(row => [rowKey(row), row]))
    for (const row of scored) {
      const key = rowKey(row), original = expectedByKey.get(key)
      require(original && !byKey.has(key), 'foreign or duplicate original score row')
      for (const field of ['fen', 'A', 'rule', 'band', 'opponentBand', 'datasetKind']) require(row[field] === original[field], 'original score source mismatch')
      require(JSON.stringify(row.ruleMoves) === JSON.stringify(original.ruleMoves), 'original rule moves changed')
      byKey.set(key, row)
    }
    hashes.scored.push({ shard, journalSha256: sha(scoreBytes), manifestSha256: sha(metaBytes) })
  }
  require(byKey.size === positions.length, 'original held-out score coverage incomplete')
  return { rows: positions.map(row => byKey.get(rowKey(row))), hashes }
}

async function main() {
  require(process.argv.slice(2).join(' ') === '--reviewed', 'example generation requires --reviewed')
  require(CHESS_DIR.split('/').pop() === ORIGINAL_APP, 'examples require the original measured app')
  const check = spawnSync(join(LAB_DIR, '.venv/bin/python'), [join(PROJECT, 'freeze_null.py')], { cwd: LAB_DIR, encoding: 'utf8' })
  require(check.status === 0, 'committed addition content hashes do not verify')
  const manifestBytes = readFileSync(join(PROJECT, 'null-manifest.json'))
  const analysisBytes = readFileSync(join(PROJECT, 'results/rules.json'))
  const { rows, hashes } = loadHeldout(join(privateDir('rules-of-thumb'), 'full'))
  const started = performance.now()
  const result = buildExamples(rows, JSON.parse(analysisBytes), {
    additionManifestSha256: sha(manifestBytes), originalAnalysisSha256: sha(analysisBytes),
    originalPhase2ManifestSha256: sha(readFileSync(join(PROJECT, 'phase2-manifest.json'))),
    generatorSha256: sha(readFileSync(fileURLToPath(import.meta.url))), inputs: hashes,
  })
  const outputs = [['examples.json', JSON.stringify(result, null, 2) + '\n'], ['examples.md', renderExamples(result)]]
  for (const [name, content] of outputs) writeFileSync(join(PROJECT, `results/${name}.tmp`), content)
  for (const [name] of outputs) renameSync(join(PROJECT, `results/${name}.tmp`), join(PROJECT, `results/${name}`))
  console.log(JSON.stringify({ stage: 'examples', positions: result.summary.positions, rules: result.summary.rules, seconds: (performance.now() - started) / 1000 }))
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
