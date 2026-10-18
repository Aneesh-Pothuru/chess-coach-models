// Apply the committed amendments to completed legacy availability journals.
// This stage never calls describeMove, phaseOf, or replays an archived game.
import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { LAB_DIR } from '../../bridge/lib/chess.mjs'
import { ORIGINAL_RULES, LEGACY_NOTE_RULES, sparseMoves, amendAvailability } from './detect.mjs'
import { APP, scannerVersion, emptyCounts, finishRecord, validateRecord, addCounts, jsonLines, shaFile, completeBytes, atomicJson, journalPath, backfillPath, prepareJournal, loadConfig, runPool } from './positions.mjs'

export function migrateRecord(legacy, expectedIndex, provenance) {
  const started = performance.now()
  if (legacy.gameIndex !== expectedIndex || !Array.isArray(legacy.positionAvailability) || legacy.positionAvailability.length !== legacy.counts.positions || legacy.counts.games !== 1) throw new Error('legacy journal has missing or out-of-order per-position readings')
  const timing = emptyCounts().timing
  for (const field of ['seconds', 'describeMoveSeconds', 'worstPieceSeconds', 'splitsSeconds']) {
    if (!Number.isFinite(legacy.counts.timing[field]) || legacy.counts.timing[field] < 0) throw new Error('legacy timing is missing')
    timing[field] = legacy.counts.timing[field]
  }
  timing.backfilledGames = 1
  timing.backfilledPositions = legacy.positionAvailability.length
  let previousPly = -1
  const positionAvailability = legacy.positionAvailability.map((position) => {
    if (position.game !== legacy.game || position.gameIndex !== legacy.gameIndex || position.month !== legacy.month || position.ply <= previousPly) throw new Error('legacy position identity or order differs')
    previousPly = position.ply
    for (const [field, rules] of [['literalRuleMoves', ORIGINAL_RULES], ['alternativeRuleMoves', LEGACY_NOTE_RULES]]) {
      if (!position[field] || Array.isArray(position[field])) throw new Error('legacy position is missing its saved definition')
      for (const [rule, moves] of Object.entries(position[field])) if (!rules.includes(rule) || !Array.isArray(moves) || !moves.length || new Set(moves).size !== moves.length) throw new Error('invalid legacy per-position rule moves')
    }
    const { literalRuleMoves, alternativeRuleMoves, ...base } = position
    const amended = amendAvailability(position.fen, literalRuleMoves, alternativeRuleMoves)
    timing.tradeReaderSeconds += amended.tradeReaderMs / 1000
    timing.tradeReaderCalls += amended.tradeReaderCalls
    timing.noteSideSeconds += amended.noteSideMs / 1000
    timing.describeMoveCallsReused += position.legalMoves
    return { ...base, ruleMoves: sparseMoves(amended.ruleMoves), audit: amended.audit }
  })
  if (timing.describeMoveCallsReused !== legacy.counts.describeMoveCalls || timing.describeMoveCallsReused !== legacy.counts.legalMoves) throw new Error('legacy move-call counts differ from saved positions')
  const record = finishRecord({ game: legacy.game, gameIndex: legacy.gameIndex, month: legacy.month, plies: legacy.counts.plies, positionAvailability, timing, priorRows: [...(legacy.rows ?? []), ...(legacy.alternativeRows ?? [])], migration: provenance })
  record.counts.timing.backfillSeconds = (performance.now() - started) / 1000
  record.counts.timing.seconds += record.counts.timing.backfillSeconds
  validateRecord(record, expectedIndex)
  return record
}

export function provenanceFor(config, source) {
  return { manifestSha256: config.migrationManifestSha256, legacyScannerVersion: config.migrationManifest.legacyScannerVersion, legacyJournalSha256: source.sha256 }
}

export async function backfillWorker(config, shard, shards) {
  const started = performance.now()
  const month = config.migrationManifest.months[config.month]
  const source = month?.journals.find((journal) => journal.shard === shard)
  if (month && (month.shards !== shards || !source || month.inputSha256 !== config.inputSha256)) throw new Error('migration month/shard does not match input')
  const { journal, wanted } = prepareJournal(config, shard, shards)
  const counts = emptyCounts()
  let built = 0
  let resumed = 0
  let existingGames = 0
  let archived
  let completeLength
  if (source) {
    archived = resolve(LAB_DIR, source.path)
    const privateRoot = resolve(LAB_DIR, 'private/rules-of-thumb') + sep
    if (!archived.startsWith(privateRoot) || archived === resolve(journal)) throw new Error('legacy archive must be a separate private project file')
    if (await shaFile(archived) !== source.sha256) throw new Error('legacy archive differs from committed hash')
    completeLength = completeBytes(archived)
    if (statSync(archived).size - completeLength !== source.partialTrailingBytes) throw new Error('legacy partial-tail byte count differs')
  }
  const provenance = source ? provenanceFor(config, source) : null
  const current = jsonLines(journal, false)[Symbol.asyncIterator]()
  try {
    // Validate the whole live journal, but only the migrated prefix contributes
    // to the backfill manifest. Fresh games may already follow after a resume.
    let item = await current.next()
    const originals = source ? jsonLines(archived, false, completeLength) : (async function* () {})()
    let legacyCount = 0
    for await (const legacy of originals) {
      const expectedIndex = shard + legacyCount * shards
      if (legacy.gameIndex !== expectedIndex || legacy.month !== config.month) throw new Error('legacy journal index or month differs')
      let record
      if (!item.done) {
        record = item.value
        validateRecord(record, expectedIndex)
        if (record.game !== legacy.game || JSON.stringify(record.migration) !== JSON.stringify(provenance)) throw new Error('resumed backfill lacks matching legacy provenance')
        resumed++
        existingGames++
        item = await current.next()
      } else {
        record = migrateRecord(legacy, expectedIndex, provenance)
        appendFileSync(journal, JSON.stringify(record) + '\n')
        built++
      }
      addCounts(counts, record.counts)
      legacyCount++
      if ((built + resumed) % 100 === 0) {
        atomicJson(`${backfillPath(config, shard, shards)}.progress.json`, { ...wanted, complete: false, gamesBuiltThisInvocation: built, gamesResumed: resumed, invocationSeconds: (performance.now() - started) / 1000, ...counts })
        process.stderr.write(`backfill ${config.month} shard ${shard}/${shards}: ${built} new games, ${resumed} resumed\n`)
      }
    }
    if (legacyCount !== (source?.games ?? 0) || counts.positions !== (source?.positions ?? 0)) throw new Error('legacy complete record counts differ from migration manifest')
    while (!item.done) {
      validateRecord(item.value, shard + existingGames * shards)
      if (item.value.migration) throw new Error('unexpected migrated record beyond archived prefix')
      existingGames++
      item = await current.next()
    }
  } finally { await current.return?.() }
  const summary = { ...wanted, scannerVersion: scannerVersion(), complete: true, inputGames: config.inputGames, migrationManifestSha256: config.migrationManifestSha256, legacyScannerVersion: config.migrationManifest.legacyScannerVersion, legacyJournalSha256: source?.sha256 ?? null, sourceGames: source?.games ?? 0, sourcePositions: source?.positions ?? 0, built, resumed, invocationSeconds: (performance.now() - started) / 1000, ...counts }
  atomicJson(backfillPath(config, shard, shards), summary)
  return summary
}

export function mergeBackfill(config, shards, wallSeconds) {
  const counts = emptyCounts()
  const journalSha256s = []
  for (let shard = 0; shard < shards; shard++) {
    const part = JSON.parse(readFileSync(backfillPath(config, shard, shards), 'utf8'))
    if (!part.complete || part.datasetKind !== 'amended' || part.scannerVersion !== scannerVersion() || part.inputSha256 !== config.inputSha256 || part.migrationManifestSha256 !== config.migrationManifestSha256 || part.shard !== shard || part.shards !== shards) throw new Error('incomplete or incompatible backfill shard')
    addCounts(counts, part)
    if (part.legacyJournalSha256) journalSha256s.push({ shard, sha256: part.legacyJournalSha256 })
  }
  const summary = { app: APP, complete: true, datasetKind: 'amended', run: config.run, month: config.month, inputSha256: config.inputSha256, migrationManifestSha256: config.migrationManifestSha256, scannerVersion: scannerVersion(), legacyScannerVersion: config.migrationManifest.legacyScannerVersion, legacyJournalSha256s: journalSha256s, shards, wallSeconds, ...counts }
  atomicJson(join(config.dir, `backfill-${config.month}.json`), summary)
  return summary
}
async function main() {
  const { config, pool, shard, shards } = await loadConfig()
  if (!config.migrationManifest) throw new Error('backfill requires the committed full-run migration manifest')
  if (shard !== null) { await backfillWorker(config, shard, shards); return }
  const started = performance.now()
  if (pool === 1) await backfillWorker(config, 0, 1)
  else await runPool(fileURLToPath(import.meta.url), config, pool)
  mergeBackfill(config, pool, (performance.now() - started) / 1000)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
