// Shared orchestration only. No private row is read before verifyRun().
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getPriority } from 'node:os'
import { LAB_DIR, CHESS_DIR } from '../../bridge/lib/chess.mjs'
import { AMENDED_RULES, rowKey, sha, atomic, journal, addTimes, cumulativeSeconds } from '../rules-of-thumb/score.mjs'
export { rowKey, sha, atomic } from '../rules-of-thumb/score.mjs'
export const PROJECT = join(LAB_DIR, 'projects/rules-after-check')
export const PRIVATE = join(LAB_DIR, 'private/rules-after-check/full')
export const PINS = JSON.parse(readFileSync(join(PROJECT, 'app-pins.json')))
export const RULES = AMENDED_RULES.filter(rule => !['lucena', 'philidor'].includes(rule))
export const MONTHS = ['2026-09', '2026-07', '2026-08']
export const require = (ok, message) => { if (!ok) throw new Error(message) }
let verified = null
const joinedCache = new Map()
export function verifyRun() {
  const check = spawnSync(join(LAB_DIR, '.venv/bin/python'), [join(PROJECT, 'freeze.py')], { encoding: 'utf8' })
  require(check.status === 0, `committed freeze does not verify: ${check.stderr || check.stdout}`)
  verified = JSON.parse(readFileSync(join(PROJECT, 'manifest.json')))
  return verified
}
export function inBlackout(date = new Date()) {
  const seconds = date.getUTCHours() * 3600 + date.getUTCMinutes() * 60 + date.getUTCSeconds()
  return seconds >= 13 * 3600 - 10 && seconds < 15.5 * 3600
}
export function guardWindow(date = new Date()) {
  if (inBlackout(date)) { const e = new Error('scheduled-blackout'); e.exitCode = 75; throw e }
}
export function readLines(path) {
  require(verified, 'verify the committed inputs before reading a row')
  const bytes = readFileSync(path)
  require(!bytes.length || bytes.at(-1) === 10, 'an input journal has an incomplete tail')
  return bytes.toString().split('\n').filter(Boolean).map(JSON.parse)
}
export function joinRows(positions, originals, nulls) {
  const unique = rows => {
    const map = new Map(rows.map(r => [rowKey(r), r]))
    require(map.size === rows.length, 'duplicate source rows')
    return map
  }
  const old = unique(originals), nul = unique(nulls)
  require(old.size === positions.length && nul.size === positions.length, 'source coverage differs')
  unique(positions)
  return positions.map(position => {
    const original = old.get(rowKey(position)), nullRow = nul.get(rowKey(position))
    require(original && nullRow, 'source row absent')
    for (const field of ['fen', 'A', 'band', 'opponentBand', 'datasetKind']) require(original[field] === position[field], 'position and score differ')
    require(original.datasetKind === 'amended' && JSON.stringify(original.ruleMoves) === JSON.stringify(position.ruleMoves), 'source rule moves differ')
    require(nullRow.datasetKind === 'null-addition' && nullRow.key === rowKey(position), 'null identity differs')
    for (const field of ['R', 'N', 'A', 'band', 'opponentBand']) require(original[field] === nullRow[field], 'null source differs')
    for (const label of ['R', 'N', 'A']) require(typeof original.sound?.[label] === 'boolean' && original.sound[label] === nullRow.sound?.[label], 'null soundness differs')
    require(typeof nullRow.sound?.R0 === 'boolean', 'null soundness absent')
    return { original, nullRow }
  }).filter(({ original }) => RULES.includes(original.rule))
}
export function loadJoined(month) {
  require(verified && MONTHS.includes(month), 'verified month required')
  if (joinedCache.has(month)) return joinedCache.get(month)
  const old = join(LAB_DIR, 'private/rules-of-thumb/full')
  const nul = join(LAB_DIR, 'private/rules-of-thumb/null')
  const bytes = gunzipSync(readFileSync(join(old, `positions-${month}.jsonl.gz`)))
  require(!bytes.length || bytes.at(-1) === 10, 'incomplete original positions')
  const positions = bytes.toString().split('\n').filter(Boolean).map(JSON.parse)
  const originals = [0, 1].flatMap(s => readLines(join(old, `scored-${month}-${s}-of-2.jsonl`)))
  const nulls = [0, 1].flatMap(s => readLines(join(nul, `scored-${month}-${s}-of-2.jsonl`)))
  const rows = joinRows(positions, originals, nulls)
  joinedCache.set(month, rows)
  return rows
}
export function signature(stage, month, shard, rows) {
  require(verified, 'unverified run')
  const entry = stage === 'checked' ? 'board.mjs' : 'score.mjs'
  const result = { schema: 1, datasetKind: 'rules-after-check', stage, month, shard, shards: 2,
    boardApp: PINS.check, refereeApp: PINS.score, records: PINS.records, run: 'full',
    contentManifestSha256: sha(readFileSync(join(PROJECT, 'manifest.json'))),
    sourceInputsSha256: sha(readFileSync(join(PROJECT, 'input-manifest.json'))),
    sourceSha256: sha(readFileSync(join(PROJECT, entry))), keysSha256: sha(rows.map(rowKey).join('\n')) }
  if (stage === 'scored') result.boardInputSha256 = sha([0, 1].map(s => JSON.parse(readFileSync(join(PRIVATE, `checked-${month}-${s}-of-2.json`))).outputSha256).join('\n'))
  return result
}
export function loadCompleted(stage, month) {
  require(['checked', 'scored'].includes(stage), 'invalid completed stage')
  const originals = loadJoined(month).map(j => j.original)
  const byKey = new Map()
  for (const shard of [0, 1]) {
    const expected = originals.filter((_, i) => i % 2 === shard)
    const prefix = join(PRIVATE, `${stage}-${month}-${shard}-of-2`)
    const meta = JSON.parse(readFileSync(`${prefix}.json`)), bytes = readFileSync(`${prefix}.jsonl`)
    for (const [key, value] of Object.entries(signature(stage, month, shard, expected))) require(meta[key] === value, `completed provenance differs: ${key}`)
    require(meta.complete && meta.status === 'complete' && meta.rows === expected.length && meta.expectedRows === expected.length && meta.outputSha256 === sha(bytes), 'completed coverage or hash differs')
    const rows = readLines(`${prefix}.jsonl`)
    require(rows.length === expected.length, 'completed row count differs')
    rows.forEach((row, i) => {
      require(row.key === rowKey(expected[i]) && row.key === rowKey(row) && row.datasetKind === 'rules-after-check' && !byKey.has(row.key), 'completed row identity differs')
      byKey.set(row.key, row)
    })
  }
  return originals.map(row => byKey.get(rowKey(row)))
}
export async function runStage(stage, entry, readRow, makeEngine = null) {
  const args = process.argv.slice(2), arg = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1] }
  require(args.includes('--reviewed'), 'owner review is required before the first position is read')
  const month = arg('month', '2026-09')
  require(MONTHS.includes(month) && !args.includes('--limit'), 'fixed full month required')
  require(resolve(CHESS_DIR) === join(LAB_DIR, '.cache/chess', stage === 'checked' ? PINS.check : PINS.score), 'wrong app for this stage')
  require(getPriority() === (args.includes('--pool') ? 0 : 10), 'coordinators use nice 0; heavy workers use nice 10')
  verifyRun(); guardWindow()
  if (args.includes('--pool')) {
    require(arg('pool') === '2' && !args.includes('--shard'), 'exactly two workers required')
    const base = args.filter((_, i) => i !== args.indexOf('--pool') && i !== args.indexOf('--pool') + 1)
    const children = []; let stopping = false, blackout = false
    const stop = () => { stopping = true; for (const p of children) if (p.exitCode === null) p.kill('SIGTERM') }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    const results = await Promise.allSettled([0, 1].map(shard => new Promise((ok, fail) => {
      const p = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), entry, ...base, '--shard', `${shard}/2`], { stdio: 'inherit' })
      children.push(p); if (stopping) p.kill('SIGTERM')
      p.on('error', error => { stop(); fail(error) })
      p.on('exit', (code, signal) => { if (!code && !signal) ok(); else { blackout ||= code === 75; stop(); fail(new Error(`worker stopped: ${signal ?? code}`)) } })
    })))
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
    const failure = results.find(r => r.status === 'rejected')
    if (failure) { if (blackout) failure.reason.exitCode = 75; throw failure.reason }
    return
  }
  const [shard, shards] = arg('shard', '').split('/').map(Number)
  require(shards === 2 && (shard === 0 || shard === 1), 'explicit shard required')
  const joins = loadJoined(month)
  const checks = stage === 'scored' ? new Map(loadCompleted('checked', month).map(r => [r.key, r])) : null
  const inputs = joins.filter((_, i) => i % 2 === shard)
  const originals = inputs.map(j => j.original)
  mkdirSync(PRIVATE, { recursive: true })
  const prefix = join(PRIVATE, `${stage}-${month}-${shard}-of-2`)
  const sig = signature(stage, month, shard, originals)
  const previous = existsSync(`${prefix}.json`) ? JSON.parse(readFileSync(`${prefix}.json`)) : null
  if (previous) for (const [key, value] of Object.entries(sig)) require(previous[key] === value, `resume differs: ${key}`)
  else require(!existsSync(`${prefix}.jsonl`), 'journal without a manifest')
  if (previous?.complete) require(previous.outputSha256 === sha(readFileSync(`${prefix}.jsonl`)), 'completed journal changed')
  // Only this project's output journal may discard an interrupted final line.
  const doneRows = journal(`${prefix}.jsonl`)
  require(doneRows.length <= inputs.length && doneRows.every((r, i) => r.key === rowKey(originals[i]) && r.key === rowKey(r) && r.datasetKind === 'rules-after-check'), 'invalid resume prefix')
  if (previous?.complete) { require(doneRows.length === inputs.length && previous.outputSha256 === sha(readFileSync(`${prefix}.jsonl`)), 'completed journal changed'); return }
  const started = performance.now(), totals = {}, failedAttemptTotals = { ...previous?.failedAttemptTotals }
  for (const row of doneRows) addTimes(totals, row.times)
  const before = cumulativeSeconds(previous, doneRows)
  let stoppedJobs = previous?.stoppedJobs ?? 0, requested = null, activeKey = null, engine = null, failure = null
  const log = event => appendFileSync(`${prefix}.events.jsonl`, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n')
  if (previous?.status === 'running') { stoppedJobs++; log({ event: 'interrupted-job-recovered' }) }
  const onTerm = () => { requested = 'SIGTERM'; log({ event: 'stop-requested', signal: requested }) }
  const onInt = () => { requested = 'SIGINT'; log({ event: 'stop-requested', signal: requested }) }
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt)
  const save = status => atomic(`${prefix}.json`, { ...sig, status, complete: status === 'complete', rows: doneRows.length, expectedRows: inputs.length,
    totals, failedAttemptTotals, stoppedJobs, workerSeconds: before + (performance.now() - started) / 1000,
    updatedAt: new Date().toISOString(), ...(failure ? { stoppedReason: failure.message, pendingKey: activeKey } : {}),
    ...(status === 'complete' ? { outputSha256: sha(readFileSync(`${prefix}.jsonl`)) } : {}) })
  if (!existsSync(`${prefix}.jsonl`)) appendFileSync(`${prefix}.jsonl`, '')
  save('running')
  log({ event: 'job-started', rows: doneRows.length, expectedRows: inputs.length, resumed: doneRows.length > 0 })
  try {
    guardWindow()
    engine = makeEngine?.()
    for (const input of inputs.slice(doneRows.length)) {
      guardWindow(); require(!requested, `stop requested: ${requested}`)
      activeKey = rowKey(input.original)
      const result = await readRow(input.original, input.nullRow, checks?.get(activeKey), engine)
      appendFileSync(`${prefix}.jsonl`, JSON.stringify(result) + '\n'); doneRows.push(result); addTimes(totals, result.times); activeKey = null
      if (doneRows.length % 50 === 0) { save('running'); console.error(JSON.stringify({ stage, month, shard, rows: doneRows.length })) }
    }
  } catch (error) { failure = error; stoppedJobs++; addTimes(failedAttemptTotals, error.times); log({ event: 'job-stopped', reason: error.message, key: activeKey, times: error.times ?? null }) }
  finally { engine?.dispose(); save(failure ? 'stopped' : 'complete'); process.off('SIGTERM', onTerm); process.off('SIGINT', onInt) }
  if (failure) throw failure
  log({ event: 'job-completed', rows: doneRows.length, workerSeconds: before + (performance.now() - started) / 1000 })
}
export async function cli(stage, url, readRow, makeEngine) {
  if (resolve(process.argv[1] ?? '') !== fileURLToPath(url)) return
  try { await runStage(stage, fileURLToPath(url), readRow, makeEngine) }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1 }
}
