// Every eligible pre-move position is durable at a completed-game boundary.
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync, readSync, statSync, truncateSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { spawn, execFileSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { pipeline } from 'node:stream/promises'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { RULES, ORIGINAL_RULES, emptyRules, sparseMoves, bandOf, availabilityOf, splitsOf, drawPosition, cappedRows, phaseOf, boardOf, replayFens } from './detect.mjs'

export const APP = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8')).commit
export const scannerVersion = () => createHash('sha256').update(readFileSync(new URL('./positions.mjs', import.meta.url))).update(readFileSync(new URL('./detect.mjs', import.meta.url))).update(readFileSync(new URL('./backfill.mjs', import.meta.url))).digest('hex')
const freshAvailability = () => ({ positions: 0, rules: emptyRules() })
const comparison = () => ({ rules: Object.fromEntries(ORIGINAL_RULES.map((r) => [r, { originalGainPositions: 0, amendedPositions: 0, gainedPositions: 0, lostPositions: 0 }])), noteSideFilter: Object.fromEntries(['lucena', 'philidor'].map((r) => [r, { rawNotePositions: 0, sideFilteredPositions: 0, removedPositions: 0, rawNoteMoves: 0, sideFilteredMoves: 0 }])) })
export const emptyCounts = () => ({ games: 0, plies: 0, positions: 0, legalMoves: 0, describeMoveCalls: 0, availability: { all: freshAvailability(), byBand: { 1300: freshAvailability(), 1500: freshAvailability() } }, availableGames: emptyRules(), amendmentComparison: comparison(), timing: { seconds: 0, describeMoveSeconds: 0, worstPieceSeconds: 0, splitsSeconds: 0, tradeReaderSeconds: 0, tradeReaderCalls: 0, noteSideSeconds: 0, backfillSeconds: 0, backfilledGames: 0, backfilledPositions: 0, describeMoveCallsReused: 0, freshDescribeMoveCalls: 0, splitsRead: 0, splitsReused: 0 } })

export function sansOf(movetext) {
  return movetext.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').split(/\s+/).map((x) => x.replace(/^\d+\.+/, '').replace(/[?!]+$/, '')).filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/.test(x))
}

export function countPosition(counts, position) {
  counts.positions++
  counts.legalMoves += position.legalMoves
  for (const target of [counts.availability.all, counts.availability.byBand[position.band]]) {
    target.positions++
    for (const rule of RULES) if (position.ruleMoves[rule]?.length) target.rules[rule]++
  }
  for (const rule of ORIGINAL_RULES) {
    const old = position.audit.originalAvailable.includes(rule)
    const amended = Boolean(position.ruleMoves[rule]?.length)
    const target = counts.amendmentComparison.rules[rule]
    target.originalGainPositions += Number(old)
    target.amendedPositions += Number(amended)
    target.gainedPositions += Number(amended && !old)
    target.lostPositions += Number(old && !amended)
  }
  for (const rule of ['lucena', 'philidor']) {
    const src = position.audit.noteSideFilter[rule]
    const target = counts.amendmentComparison.noteSideFilter[rule]
    target.rawNotePositions += Number(src.rawMoves > 0)
    target.sideFilteredPositions += Number(src.keptMoves > 0)
    target.removedPositions += Number(src.rawMoves > 0 && src.keptMoves === 0)
    target.rawNoteMoves += src.rawMoves
    target.sideFilteredMoves += src.keptMoves
  }
}

/** Draw from all saved positions, then read only missing selected-row splits. */
export function finishRecord({ game, gameIndex, month, plies, positionAvailability, timing = {}, priorRows = [], migration }) {
  const counts = emptyCounts()
  counts.games = 1
  counts.plies = plies
  Object.assign(counts.timing, timing)
  const splitCache = new Map(priorRows.filter((r) => r.splits).map((r) => [`${r.ply}\0${r.fen}`, r.splits]))
  for (const position of positionAvailability) countPosition(counts, position)
  counts.describeMoveCalls = counts.legalMoves
  const rows = []
  for (const rule of RULES) {
    const chosen = drawPosition(game, rule, positionAvailability.filter((p) => p.ruleMoves[rule]?.length))
    if (!chosen) continue
    const { legalMoves, audit, ruleMoves, ...base } = chosen
    const splitKey = `${chosen.ply}\0${chosen.fen}`
    let splits = splitCache.get(splitKey)
    if (splits) counts.timing.splitsReused++
    else {
      const started = performance.now()
      splits = splitsOf(chosen.fen)
      counts.timing.splitsSeconds += (performance.now() - started) / 1000
      counts.timing.splitsRead++
      splitCache.set(splitKey, splits)
    }
    counts.availableGames[rule]++
    rows.push({ ...base, datasetKind: 'amended', rule, key: `${month}:${game}:${rule}`, ruleMoves: ruleMoves[rule], splits })
  }
  return { gameIndex, game, month, datasetKind: 'amended', ...(migration ? { migration } : {}), counts, positionAvailability, rows }
}

export function buildGame(game, gameIndex, month) {
  const started = performance.now()
  if (!game.id || bandOf(game.whiteElo) === null || bandOf(game.blackElo) === null) throw new Error('invalid kept game metadata')
  const sans = game.moves ?? sansOf(game.movetext)
  const fens = replayFens(sans, game.initialFen)
  if (sans.length < 30 || fens.length !== sans.length + 1) throw new Error(`game at file index ${gameIndex} does not replay completely or has fewer than 30 plies`)
  const timing = emptyCounts().timing
  const positionAvailability = []
  for (let ply = 0; ply < sans.length; ply++) {
    const fen = fens[ply]
    const phase = phaseOf(fen)
    if (phase !== 'middlegame' && phase !== 'endgame') continue
    const board = boardOf(fen)
    const actual = board.find(sans[ply])
    if (!actual) throw new Error(`cannot resolve played move at file index ${gameIndex}, ply ${ply}`)
    const white = board.turn === 'w'
    const availability = availabilityOf(fen)
    timing.describeMoveSeconds += availability.describeMoveMs / 1000
    timing.worstPieceSeconds += availability.worstPieceMs / 1000
    timing.tradeReaderSeconds += availability.tradeReaderMs / 1000
    timing.tradeReaderCalls += availability.tradeReaderCalls
    timing.noteSideSeconds += availability.noteSideMs / 1000
    timing.freshDescribeMoveCalls += availability.legalMoves
    positionAvailability.push({ game: game.id, gameIndex, month, band: bandOf(white ? game.whiteElo : game.blackElo), opponentBand: bandOf(white ? game.blackElo : game.whiteElo), fen, ply, A: actual.uci, legalMoves: availability.legalMoves, ruleMoves: sparseMoves(availability.ruleMoves), audit: availability.audit })
  }
  const record = finishRecord({ game: game.id, gameIndex, month, plies: sans.length, positionAvailability, timing })
  record.counts.timing.seconds = (performance.now() - started) / 1000
  return record
}

export function addCounts(total, part) {
  for (const k of ['games', 'plies', 'positions', 'legalMoves', 'describeMoveCalls']) total[k] += part[k]
  for (const k of Object.keys(total.timing)) total.timing[k] += part.timing[k]
  for (const rule of RULES) total.availableGames[rule] += part.availableGames[rule]
  for (const [dest, src] of [[total.availability.all, part.availability.all], ...[1300, 1500].map((b) => [total.availability.byBand[b], part.availability.byBand[b]])]) {
    dest.positions += src.positions
    for (const rule of RULES) dest.rules[rule] += src.rules[rule]
  }
  for (const section of ['rules', 'noteSideFilter']) for (const rule of Object.keys(total.amendmentComparison[section])) for (const field of Object.keys(total.amendmentComparison[section][rule])) total.amendmentComparison[section][rule][field] += part.amendmentComparison[section][rule][field]
}

export async function* jsonLines(path, compressed = path.endsWith('.gz'), end) {
  if (end === 0) return
  const input = createReadStream(path, end === undefined ? {} : { end: end - 1 })
  const lines = createInterface({ input: compressed ? input.pipe(createGunzip()) : input, crlfDelay: Infinity })
  try { for await (const line of lines) if (line) yield JSON.parse(line) }
  finally { lines.close(); input.destroy() }
}
export async function shaFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export function completeBytes(path) {
  const length = statSync(path).size
  if (!length) return 0
  const fd = openSync(path, 'r')
  const tail = Buffer.alloc(Math.min(length, 65536))
  let end = length
  try {
    while (end > 0) {
      const size = Math.min(end, tail.length)
      const start = end - size
      readSync(fd, tail, 0, size, start)
      const newline = tail.subarray(0, size).lastIndexOf(10)
      if (newline >= 0) return start + newline + 1
      end = start
    }
    return 0
  } finally { closeSync(fd) }
}
export function trimPartialLine(path) {
  const keep = completeBytes(path)
  if (keep !== statSync(path).size) truncateSync(path, keep)
}

export function validateRecord(record, expectedIndex) {
  if (record.gameIndex !== expectedIndex) throw new Error('missing, duplicate or out-of-order game in availability journal')
  if (record.datasetKind !== 'amended' || !Array.isArray(record.positionAvailability) || record.positionAvailability.length !== record.counts.positions) throw new Error('availability journal lacks amended per-position readings')
  let previousPly = -1
  const expectedCounts = emptyCounts()
  for (const position of record.positionAvailability) {
    if (position.ply <= previousPly || position.gameIndex !== record.gameIndex || position.game !== record.game || position.month !== record.month || ![1300, 1500].includes(position.band) || ![1300, 1500].includes(position.opponentBand)) throw new Error('invalid position order or identity in availability journal')
    previousPly = position.ply
    if (!position.ruleMoves || !position.audit || !Array.isArray(position.audit.originalAvailable) || !Array.isArray(position.audit.rawNoteAvailable) || !position.audit.noteSideFilter || !Number.isInteger(position.legalMoves) || position.legalMoves < 1) throw new Error('availability definition or audit is missing')
    for (const [rule, moves] of Object.entries(position.ruleMoves)) if (!RULES.includes(rule) || !Array.isArray(moves) || !moves.length || new Set(moves).size !== moves.length) throw new Error('invalid per-position rule moves')
    if (position.audit.originalAvailable.some((r) => !ORIGINAL_RULES.includes(r))) throw new Error('unknown original audit rule')
    countPosition(expectedCounts, position)
  }
  for (const field of ['positions', 'legalMoves', 'availability', 'amendmentComparison']) if (JSON.stringify(record.counts[field]) !== JSON.stringify(expectedCounts[field])) throw new Error(`saved counts differ from per-position ${field}`)
  if (!Array.isArray(record.rows) || new Set(record.rows.map((r) => r.rule)).size !== record.rows.length || record.rows.some((r) => !RULES.includes(r.rule))) throw new Error('duplicate or unknown game draws')
  for (const rule of RULES) {
    const drawn = drawPosition(record.game, rule, record.positionAvailability.filter((p) => p.ruleMoves[rule]?.length))
    const row = record.rows.find((r) => r.rule === rule)
    if (!drawn) { if (row) throw new Error('draw without available position'); continue }
    if (!row || row.datasetKind !== 'amended' || row.game !== record.game || row.month !== record.month || row.gameIndex !== record.gameIndex || row.ply !== drawn.ply || row.fen !== drawn.fen || row.A !== drawn.A || row.band !== drawn.band || row.opponentBand !== drawn.opponentBand || !row.splits || JSON.stringify(row.ruleMoves) !== JSON.stringify(drawn.ruleMoves[rule])) throw new Error('saved draw differs from per-position availability')
  }
}
export function atomicJson(path, value) {
  writeFileSync(`${path}.partial`, JSON.stringify(value, null, 2) + '\n')
  renameSync(`${path}.partial`, path)
}
export const journalPath = (config, shard, shards) => join(config.dir, `availability-${config.month}-${shard}of${shards}.jsonl`)
export const backfillPath = (config, shard, shards) => join(config.dir, `backfill-${config.month}-${shard}of${shards}.json`)
export const journalMetadata = (config, shard, shards) => ({ app: APP, version: scannerVersion(), datasetKind: 'amended', inputSha256: config.inputSha256, migrationManifestSha256: config.migrationManifestSha256 ?? null, month: config.month, run: config.run, shard, shards })
export function prepareJournal(config, shard, shards) {
  const journal = journalPath(config, shard, shards)
  const wanted = journalMetadata(config, shard, shards)
  const metaPath = `${journal}.meta.json`
  if (existsSync(metaPath)) {
    if (JSON.stringify(JSON.parse(readFileSync(metaPath, 'utf8'))) !== JSON.stringify(wanted)) throw new Error('availability checkpoint metadata changed; use a new run directory after review')
  } else {
    if (existsSync(journal)) throw new Error('availability journal has no metadata')
    writeFileSync(metaPath, JSON.stringify(wanted) + '\n')
  }
  if (!existsSync(journal)) writeFileSync(journal, '')
  trimPartialLine(journal)
  return { journal, wanted }
}

export async function worker(config, shard, shards) {
  if (config.migrationManifestSha256) {
    const backfill = JSON.parse(readFileSync(backfillPath(config, shard, shards), 'utf8'))
    if (!backfill.complete || backfill.migrationManifestSha256 !== config.migrationManifestSha256 || backfill.scannerVersion !== scannerVersion() || backfill.inputSha256 !== config.inputSha256 || backfill.datasetKind !== 'amended') throw new Error('matching completed backfill is required before scanning')
  }
  const { journal, wanted } = prepareJournal(config, shard, shards)
  const legacySource = config.migrationManifest?.months[config.month]?.journals.find((item) => item.shard === shard)
  let resumed = 0
  const progressCounts = emptyCounts()
  for await (const record of jsonLines(journal, false)) {
    validateRecord(record, shard + resumed * shards)
    if (resumed < (legacySource?.games ?? 0)) {
      if (record.migration?.manifestSha256 !== config.migrationManifestSha256 || record.migration?.legacyJournalSha256 !== legacySource.sha256 || record.migration?.legacyScannerVersion !== config.migrationManifest.legacyScannerVersion) throw new Error('required migrated prefix has wrong provenance')
    } else if (record.migration) throw new Error('unexpected migrated record beyond archived prefix')
    resumed++
    addCounts(progressCounts, record.counts)
  }
  if (resumed < (legacySource?.games ?? 0)) throw new Error('required migrated prefix is missing from availability journal')
  let index = 0
  let built = 0
  const started = performance.now()
  const progress = (complete) => atomicJson(`${journal}.progress.json`, { ...wanted, complete, inputGames: config.inputGames, gamesBuiltThisInvocation: built, gamesResumed: resumed, invocationSeconds: (performance.now() - started) / 1000, ...progressCounts })
  progress(false)
  for await (const game of jsonLines(config.input)) {
    const gameIndex = index++
    if (gameIndex % shards !== shard || gameIndex < shard + resumed * shards) continue
    const record = buildGame(game, gameIndex, config.month)
    validateRecord(record, shard + (resumed + built) * shards)
    appendFileSync(journal, JSON.stringify(record) + '\n')
    addCounts(progressCounts, record.counts)
    built++
    if (built % 100 === 0) {
      progress(false)
      process.stderr.write(`availability ${config.month} shard ${shard}/${shards}: ${built} new games, ${((performance.now() - started) / 1000).toFixed(1)} seconds\n`)
    }
  }
  if (index !== config.inputGames || progressCounts.games !== Math.max(0, Math.ceil((index - shard) / shards))) throw new Error('availability shard did not scan exactly its assigned games')
  progress(true)
  atomicJson(`${journal}.complete.json`, { ...wanted, inputGames: index, complete: true, journalSha256: await shaFile(journal), built, resumed, seconds: (performance.now() - started) / 1000 })
}

export async function merge(config, shards, wallSeconds) {
  const streams = []
  const journalSha256s = []
  for (let shard = 0; shard < shards; shard++) {
    const path = journalPath(config, shard, shards)
    const complete = JSON.parse(readFileSync(`${path}.complete.json`, 'utf8'))
    if (!complete.complete || complete.inputSha256 !== config.inputSha256 || complete.inputGames !== config.inputGames || complete.version !== scannerVersion() || complete.datasetKind !== 'amended' || complete.migrationManifestSha256 !== (config.migrationManifestSha256 ?? null)) throw new Error('incomplete or incompatible availability shard')
    const actualHash = await shaFile(path)
    if (complete.journalSha256 !== actualHash) throw new Error('availability journal content differs from its completed manifest')
    journalSha256s.push({ shard, sha256: actualHash })
    const iter = jsonLines(path, false)[Symbol.asyncIterator]()
    streams.push({ iter, item: await iter.next() })
  }
  const counts = emptyCounts()
  const kept = emptyRules()
  const output = join(config.dir, `positions-${config.month}.jsonl.gz`)
  const out = createWriteStream(`${output}.partial`)
  const gzip = createGzip({ level: 6 })
  const done = pipeline(gzip, out)
  // Attach rejection handling immediately, including while the journals stream.
  done.catch(() => {})
  let expectedIndex = 0
  try {
    while (streams.some((s) => !s.item.done)) {
      const next = streams.filter((s) => !s.item.done).sort((a, b) => a.item.value.gameIndex - b.item.value.gameIndex)[0]
      const record = next.item.value
      validateRecord(record, expectedIndex++)
      addCounts(counts, record.counts)
      for (const row of cappedRows(record.rows, kept)) if (!gzip.write(JSON.stringify(row) + '\n')) await new Promise((resolve, reject) => {
        const cleanup = () => { gzip.off('drain', onDrain); gzip.off('error', onError) }
        const onDrain = () => { cleanup(); resolve() }
        const onError = (error) => { cleanup(); reject(error) }
        gzip.once('drain', onDrain); gzip.once('error', onError)
      })
      next.item = await next.iter.next()
    }
    if (expectedIndex !== config.inputGames) throw new Error('availability shards did not scan all input games')
    gzip.end()
    await done
    renameSync(`${output}.partial`, output)
  } catch (error) { gzip.destroy(); out.destroy(); throw error }
  finally { await Promise.all(streams.map((s) => s.iter.return?.())) }
  const migration = config.migrationManifestSha256 ? { manifestSha256: config.migrationManifestSha256, legacyScannerVersion: config.migrationManifest.legacyScannerVersion, legacyJournalSha256s: (config.migrationManifest.months[config.month]?.journals ?? []).map(({ shard, sha256 }) => ({ shard, sha256 })), backfilledGames: counts.timing.backfilledGames, backfilledPositions: counts.timing.backfilledPositions } : null
  const summary = { app: APP, month: config.month, run: config.run, phase: config.run === 'slice' ? 'phase1' : 'phase2', complete: true, datasetKind: 'amended', inputSha256: config.inputSha256, source: `games-${config.month}.jsonl.gz`, scannerVersion: scannerVersion(), migration, journalSha256s, shards, capPerRule: 4000, sampling: 'FNV-1a then mulberry32; key game id + NUL + rule id; one uniform index in chronological eligible positions', wallSeconds, outputSha256: await shaFile(output), ...counts, kept, keptPositions: Object.values(kept).reduce((a, b) => a + b, 0) }
  atomicJson(join(config.dir, `positions-${config.month}.json`), summary)
  process.stderr.write(JSON.stringify({ app: APP, month: config.month, run: config.run, games: counts.games, positions: counts.positions, legalMoves: counts.legalMoves, keptPositions: summary.keptPositions, timing: counts.timing, wallSeconds }) + '\n')
}

export async function loadConfig() {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
  const run = arg('run', 'slice')
  const month = arg('month', '2026-07')
  if (!['slice', 'full'].includes(run)) throw new Error('--run must be slice or full')
  if (run === 'slice' && month !== '2026-07') throw new Error('phase 1 reads July only')
  if (run === 'full' && !process.argv.includes('--phase2-reviewed')) throw new Error('full scan needs --phase2-reviewed')
  if (!['2026-07', '2026-08', '2026-09'].includes(month)) throw new Error('month outside the fixed rule')
  if (resolve(CHESS_DIR) !== resolve(join(LAB_DIR, '.cache/chess', APP))) throw new Error('position scan requires the pinned checkout')
  const dir = join(privateDir('rules-of-thumb'), run)
  mkdirSync(dir, { recursive: true })
  const input = join(dir, `games-${month}.jsonl.gz`)
  const source = JSON.parse(readFileSync(join(dir, `games-${month}.json`), 'utf8'))
  if (!source.complete || source.app !== APP || source.run !== run || source.month !== month) throw new Error('input stream manifest is incomplete or incompatible')
  let inputGames = 0
  for await (const _ of jsonLines(input)) inputGames++
  if (source.kept !== inputGames || inputGames > (run === 'slice' ? 500 : 30000)) throw new Error('input count differs from manifest or exceeds run cap')
  const config = { run, month, dir, input, inputGames, inputSha256: await shaFile(input) }
  if (source.outputSha256 !== config.inputSha256) throw new Error('input stream content differs from its manifest')
  if (run === 'full') {
    const path = join(LAB_DIR, 'projects/rules-of-thumb/migration-manifest.json')
    const bytes = readFileSync(path)
    const committed = execFileSync('git', ['show', 'HEAD:projects/rules-of-thumb/migration-manifest.json'], { cwd: LAB_DIR })
    if (!bytes.equals(committed)) throw new Error('migration manifest must be committed unchanged')
    config.migrationManifest = JSON.parse(bytes)
    config.migrationManifestSha256 = createHash('sha256').update(bytes).digest('hex')
    if (config.migrationManifest.schema !== 1 || config.migrationManifest.app !== APP || (config.migrationManifest.months[month] && config.migrationManifest.months[month].inputSha256 !== config.inputSha256)) throw new Error('incompatible migration manifest')
  }
  const pool = Number(arg('pool', '1'))
  const explicitShard = arg('shard', null)
  if (!Number.isInteger(pool) || pool < 1 || pool > 2) throw new Error('--pool must be 1 or 2')
  const [shard, shards] = explicitShard ? explicitShard.split('/').map(Number) : [null, pool]
  if (!Number.isInteger(shards) || shards < 1 || shards > 2 || (explicitShard && (!Number.isInteger(shard) || shard < 0 || shard >= shards))) throw new Error('invalid --shard i/n')
  if (config.migrationManifest?.months[month] && config.migrationManifest.months[month].shards !== shards) throw new Error('migration requires the original shard count')
  return { config, pool, shard, shards }
}

/** A failed or interrupted shard stops its siblings; await every child exit. */
export async function runPool(script, config, pool) {
  const children = new Set()
  let failure
  const stop = (error) => { failure ??= error; for (const child of children) child.kill('SIGTERM') }
  const onTerm = () => stop(new Error('worker pool interrupted by SIGTERM'))
  const onInt = () => stop(new Error('worker pool interrupted by SIGINT'))
  process.on('SIGTERM', onTerm)
  process.on('SIGINT', onInt)
  try {
    const jobs = Array.from({ length: pool }, (_, shard) => new Promise((resolve, reject) => {
      const child = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), script, '--run', config.run, '--month', config.month, '--shard', `${shard}/${pool}`, ...(config.run === 'full' ? ['--phase2-reviewed'] : [])], { cwd: LAB_DIR, stdio: 'inherit', env: process.env })
      children.add(child)
      child.once('error', (error) => { children.delete(child); stop(error); reject(error) })
      child.once('exit', (code, signal) => {
        children.delete(child)
        if (code === 0 && !failure) resolve()
        else { const error = failure ?? new Error(`shard ${shard} exited ${code ?? signal}`); stop(error); reject(error) }
      })
    }))
    await Promise.allSettled(jobs)
    if (failure) throw failure
  } finally { process.off('SIGTERM', onTerm); process.off('SIGINT', onInt) }
}
async function main() {
  const { config, pool, shard, shards } = await loadConfig()
  if (shard !== null) { await worker(config, shard, shards); return }
  const started = performance.now()
  if (!process.argv.includes('--merge')) {
    if (pool === 1) await worker(config, 0, 1)
    else await runPool(fileURLToPath(import.meta.url), config, pool)
  }
  await merge(config, pool, (performance.now() - started) / 1000)
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
