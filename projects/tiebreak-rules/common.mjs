// Journal and process mechanics. Chess readings live in the supplied readers.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, truncateSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { spawn, spawnSync } from 'node:child_process'
import { getPriority } from 'node:os'
import { fileURLToPath } from 'node:url'
import { LAB_DIR, CHESS_DIR } from '../../bridge/lib/chess.mjs'
import { sansOf } from '../rules-of-thumb/positions.mjs'

export const PROJECT = join(LAB_DIR, 'projects/tiebreak-rules')
export const PRIVATE = join(LAB_DIR, 'private/tiebreak-rules/full')
export const APP = JSON.parse(readFileSync(join(PROJECT, 'app-pin.json'))).commit
export const MONTHS = ['2026-09', '2026-07', '2026-08']
export const MAIA_DIR = join(LAB_DIR, '.cache/chess/f4bd63f19b343f686fb97ea4cf70b211c0bddc0a/tools/coach-review/.cache/maia')
export const require = (ok, message) => { if (!ok) throw new Error(message) }
export const sha = value => createHash('sha256').update(value).digest('hex')
export const rowKey = row => row.key
export const readJson = path => JSON.parse(readFileSync(path))
export function atomic(path, value) {
  writeFileSync(`${path}.partial`, JSON.stringify(value, null, 2) + '\n')
  renameSync(`${path}.partial`, path)
}
export function addTimes(target, source = {}) {
  for (const [key, value] of Object.entries(source)) {
    require(Number.isFinite(value) && value >= 0, 'invalid timing/count')
    target[key] = (target[key] ?? 0) + value
  }
  return target
}
export function inBlackout(date = new Date()) {
  const s = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds()
  return s >= 13 * 3600 - 10 && s < 15.5 * 3600
}
export function guardWindow(date = new Date()) {
  if (inBlackout(date)) { const e = new Error('scheduled-blackout'); e.exitCode = 75; throw e }
}
export function configuration(args, stage) {
  const arg = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1] }
  const timing = args.includes('--timing'), month = arg('month', timing ? '2026-07' : '2026-09')
  const limit = timing ? Number(arg('limit', 300)) : null
  require(MONTHS.includes(month), 'invalid month')
  require(timing ? month === '2026-07' && Number.isInteger(limit) && limit >= 1 && limit <= 600 : !args.includes('--limit'), 'timing is a July slice of 1..600 games')
  require(args.includes('--reviewed') || timing && ['scan', 'positions'].includes(stage), 'owner review is required before scoring or a full scan')
  const run = timing ? `timing-july-${limit}` : 'full'
  return { timing, limit, month, run, uncommittedFreeze: timing && ['scan', 'positions'].includes(stage), dir: join(LAB_DIR, 'private/tiebreak-rules', run), arg }
}
let verified = null
let active = { timing: false, limit: null, run: 'full', dir: PRIVATE }
export function verifyRun(config = active) {
  const argv = [join(PROJECT, 'freeze.py'), ...(config.uncommittedFreeze ? ['--timing'] : [])]
  const command = getPriority() === 0 ? 'nice' : join(LAB_DIR, '.venv/bin/python')
  const args = getPriority() === 0 ? ['-n', '10', join(LAB_DIR, '.venv/bin/python'), ...argv] : argv
  const result = spawnSync(command, args, { encoding: 'utf8' })
  require(result.status === 0, `content freeze does not verify: ${result.stderr || result.stdout}`)
  verified = readJson(join(PROJECT, 'manifest.json')); active = config
  require(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', APP), 'wrong measured app')
  return verified
}
export function readLines(path) {
  require(verified, 'verify the content freeze before reading rows')
  const bytes = readFileSync(path)
  require(!bytes.length || bytes.at(-1) === 10, 'input journal has an incomplete tail')
  return bytes.toString().split('\n').filter(Boolean).map(JSON.parse)
}
export function normalizeGame(game, month, gameIndex) {
  require(typeof game.id === 'string' && game.id && !/[\0:]/.test(game.id), 'invalid game identity')
  require(typeof game.movetext === 'string', 'stream lacks its compact movetext')
  const sans = sansOf(game.movetext)
  require(Number.isInteger(game.plies) && game.plies >= 30 && sans.length === game.plies, 'stream move count differs')
  return { ...game, sans, game: game.id, gameIndex, month, key: `${month}:${game.id}`, datasetKind: 'tiebreak-rules' }
}
export function loadGames(month, config = active) {
  require(verified && MONTHS.includes(month), 'verified month required')
  const dir = join(LAB_DIR, 'private/rules-of-thumb/full')
  const meta = readJson(join(dir, `games-${month}.json`))
  const bytes = readFileSync(join(dir, `games-${month}.jsonl.gz`))
  require(meta.complete && meta.month === month && meta.kept === 30000 && sha(bytes) === meta.outputSha256, 'stream hash or coverage changed')
  const data = gunzipSync(bytes)
  require(data.at(-1) === 10, 'incomplete game stream')
  const lines = data.toString().trimEnd().split('\n')
  require(lines.length === meta.kept, 'game stream count differs')
  const rows = lines.slice(0, config.timing ? config.limit : lines.length)
    .map((line, gameIndex) => normalizeGame(JSON.parse(line), month, gameIndex))
  require(new Set(rows.map(rowKey)).size === rows.length, 'duplicate game')
  return rows
}
export function baseSignature(stage, month, config = active) {
  require(verified, 'unverified signature')
  const source = { scan: 'scan.mjs', positions: 'select.mjs', scored: 'score.mjs', timing: 'score.mjs' }[stage]
  require(source, 'unknown stage')
  return { schema: 1, datasetKind: 'tiebreak-rules', stage, month, run: config.run, app: APP,
    timing: config.timing, limit: config.limit,
    contentManifestSha256: sha(readFileSync(join(PROJECT, 'manifest.json'))),
    sourceInputsSha256: sha(readFileSync(join(PROJECT, 'input-manifest.json'))),
    sourceSha256: sha(readFileSync(join(PROJECT, source))) }
}
export function signature(stage, month, shard, rows, config = active) {
  const input = stage === 'scan' ? join(LAB_DIR, 'private/rules-of-thumb/full', `games-${month}.jsonl.gz`)
    : join(config.dir, `positions-${month}.jsonl`)
  return { ...baseSignature(stage, month, config), shard, shards: 2,
    inputSha256: sha(readFileSync(input)), keysSha256: sha(rows.map(rowKey).join('\n')) }
}
export function checkSignature(meta, sig) {
  for (const [key, value] of Object.entries(sig)) require(meta[key] === value, `journal provenance differs: ${key}`)
}
export function shardRows(rows, shard) {
  require([0, 1].includes(shard), 'invalid shard')
  return rows.filter((_, i) => i % 2 === shard)
}
export function resumeRows(path, previous, expected) {
  if (!existsSync(path)) { require(!previous || previous.rows === 0 && !previous.complete, 'missing journal'); return [] }
  const bytes = readFileSync(path)
  // A complete journal is immutable, including its last byte.
  if (previous?.complete) require(previous.outputSha256 === sha(bytes), 'completed journal changed')
  const end = bytes.lastIndexOf(10) + 1
  if (end < bytes.length) { require(!previous?.complete, 'completed journal has partial tail'); truncateSync(path, end) }
  const rows = bytes.subarray(0, end).toString().split('\n').filter(Boolean).map(JSON.parse)
  require(rows.length <= expected.length && rows.every((r, i) => r.key === expected[i].key && r.datasetKind === 'tiebreak-rules'), 'invalid journal prefix')
  require(!previous || previous.rows <= rows.length, 'journal is behind its checkpoint')
  if (previous?.complete) require(rows.length === expected.length && previous.rows === rows.length, 'completed coverage differs')
  return rows
}
export function loadPositions(month, config = active) {
  const path = join(config.dir, `positions-${month}.jsonl`), meta = readJson(join(config.dir, `positions-${month}.json`))
  checkSignature(meta, baseSignature('positions', month, config))
  const scanHashes = [0, 1].map(s => {
    const prefix = join(config.dir, `scan-${month}-${s}-of-2`), m = readJson(`${prefix}.json`)
    checkSignature(m, baseSignature('scan', month, config))
    require(m.complete && m.status === 'complete' && m.outputSha256 === sha(readFileSync(`${prefix}.jsonl`)), 'source scan changed')
    return m.outputSha256
  })
  require(meta.inputSha256 === sha(scanHashes.join('\n')), 'selection input differs')
  require(meta.complete && meta.status === 'complete' && meta.outputSha256 === sha(readFileSync(path)), 'position selection incomplete or changed')
  const rows = readLines(path)
  require(rows.length === meta.rows && meta.expectedRows === rows.length && new Set(rows.map(rowKey)).size === rows.length, 'position coverage differs')
  return rows
}
export function loadCompleted(stage, month, config = active) {
  require(['scan', 'scored', 'timing'].includes(stage), 'unknown completed stage')
  const inputs = stage === 'scan' ? loadGames(month, config) : loadPositions(month, config)
  const map = new Map()
  for (const shard of [0, 1]) {
    const expected = shardRows(inputs, shard), prefix = join(config.dir, `${stage}-${month}-${shard}-of-2`)
    const meta = readJson(`${prefix}.json`)
    checkSignature(meta, signature(stage, month, shard, expected, config))
    require(meta.complete && meta.status === 'complete' && meta.rows === expected.length && meta.expectedRows === expected.length && meta.outputSha256 === sha(readFileSync(`${prefix}.jsonl`)), 'completed journal differs')
    const rows = readLines(`${prefix}.jsonl`)
    require(rows.length === expected.length, 'completed row count differs')
    rows.forEach((row, i) => { require(row.key === expected[i].key && row.datasetKind === 'tiebreak-rules' && !map.has(row.key), 'completed row identity differs'); map.set(row.key, row) })
  }
  return inputs.map(r => map.get(r.key))
}
export async function runStage(stage, entry, readOne, createEngine) {
  const args = process.argv.slice(2), config = configuration(args, stage), { month, arg } = config
  require(getPriority() === (args.includes('--pool') ? 0 : 10), 'coordinator nice 0; each heavy worker nice 10')
  verifyRun(config); guardWindow()
  if (args.includes('--pool')) {
    require(arg('pool') === '2' && !args.includes('--shard'), 'exactly two shards required')
    const at = args.indexOf('--pool'), base = args.filter((_, i) => i !== at && i !== at + 1)
    const children = []; let stopping = false, blackout = false
    const stop = () => { stopping = true; for (const p of children) if (p.exitCode === null) p.kill('SIGTERM') }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    const results = await Promise.allSettled([0, 1].map(shard => new Promise((ok, fail) => {
      const p = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), entry, ...base, '--shard', `${shard}/2`], { stdio: 'inherit' })
      children.push(p); if (stopping) p.kill('SIGTERM')
      p.on('error', e => { stop(); fail(e) })
      p.on('exit', (code, signal) => { if (!code && !signal) ok(); else { blackout ||= code === 75; stop(); fail(new Error(`worker stopped: ${signal ?? code}`)) } })
    })))
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
    const failed = results.find(r => r.status === 'rejected')
    if (failed) { if (blackout) failed.reason.exitCode = 75; throw failed.reason }
    return
  }
  const [shard, shards] = arg('shard', '').split('/').map(Number)
  require(shards === 2 && [0, 1].includes(shard), 'explicit two-shard assignment required')
  const input = shardRows(stage === 'scan' ? loadGames(month, config) : loadPositions(month, config), shard)
  const outputStage = stage === 'scored' && config.timing ? 'timing' : stage
  mkdirSync(config.dir, { recursive: true })
  const prefix = join(config.dir, `${outputStage}-${month}-${shard}-of-2`), sig = signature(outputStage, month, shard, input, config)
  const previous = existsSync(`${prefix}.json`) ? readJson(`${prefix}.json`) : null
  if (previous) checkSignature(previous, sig)
  else require(!existsSync(`${prefix}.jsonl`), 'journal lacks a provenance checkpoint')
  const done = resumeRows(`${prefix}.jsonl`, previous, input)
  if (previous?.complete) return
  const started = performance.now(), totals = {}, failedAttemptTotals = { ...previous?.failedAttemptTotals }
  done.forEach(r => addTimes(totals, r.times))
  const before = (previous?.workerSeconds ?? 0) + done.slice(previous?.rows ?? 0).reduce((s, r) => s + (r.times?.rowSeconds ?? 0), 0)
  let stoppedJobs = previous?.stoppedJobs ?? 0, requested = null, failure = null, activeKey = null, engine = null
  const log = event => appendFileSync(`${prefix}.events.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')
  const guard = () => { guardWindow(); require(!requested, `stop requested: ${requested}`) }
  const onTerm = () => { requested = 'SIGTERM'; log({ event: 'stop-requested', signal: requested }) }
  const onInt = () => { requested = 'SIGINT'; log({ event: 'stop-requested', signal: requested }) }
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt)
  if (previous?.status === 'running') { stoppedJobs++; log({ event: 'interrupted-job-recovered' }) }
  const save = status => atomic(`${prefix}.json`, { ...sig, status, complete: status === 'complete', rows: done.length, expectedRows: input.length,
    totals, failedAttemptTotals, stoppedJobs, workerSeconds: before + (performance.now() - started) / 1000, updatedAt: new Date().toISOString(),
    ...(failure ? { stoppedReason: failure.message, pendingKey: activeKey } : {}),
    ...(status === 'complete' ? { outputSha256: sha(readFileSync(`${prefix}.jsonl`)) } : {}) })
  if (!existsSync(`${prefix}.jsonl`)) appendFileSync(`${prefix}.jsonl`, '')
  save('running'); log({ event: 'job-started', rows: done.length, expectedRows: input.length })
  try {
    guard(); engine = createEngine?.({ tablebasePath: join(config.dir, `tablebase-${month}-${shard}.json`) })
    for (const row of input.slice(done.length)) {
      guard(); activeKey = row.key
      const result = await readOne(row, engine, { timing: config.timing, guard, onEvent: log })
      require(result.key === row.key, 'reader changed identity')
      const output = { ...result, datasetKind: 'tiebreak-rules' }
      appendFileSync(`${prefix}.jsonl`, JSON.stringify(output) + '\n'); done.push(output); addTimes(totals, result.times); activeKey = null
      if (done.length % 25 === 0) { save('running'); console.error(JSON.stringify({ stage: outputStage, month, shard, rows: done.length })) }
    }
  } catch (error) { failure = error; stoppedJobs++; addTimes(failedAttemptTotals, error.times); log({ event: 'job-stopped', reason: error.message, key: activeKey, times: error.times ?? null }) }
  finally { engine?.dispose(); save(failure ? 'stopped' : 'complete'); process.off('SIGTERM', onTerm); process.off('SIGINT', onInt) }
  if (failure) throw failure
  log({ event: 'job-completed', rows: done.length, workerSeconds: before + (performance.now() - started) / 1000 })
}
export async function cli(stage, url, readOne, createEngine) {
  if (resolve(process.argv[1] ?? '') !== fileURLToPath(url)) return
  try { await runStage(stage, fileURLToPath(url), readOne, createEngine) }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1 }
}
