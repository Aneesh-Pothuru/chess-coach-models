// The fixed referee. --timing calls instruments but never computes a measure.
import { appendFileSync, existsSync, readFileSync, writeFileSync, renameSync, truncateSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chess, CHESS_DIR, privateDir, LAB_DIR } from '../../bridge/lib/chess.mjs'

const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const E = await chess('src/services/engine/index.ts')
const S = await chess('src/core/score/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')
const PIN = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'))).commit
export const TABLEBASE_RETRY_DELAYS_MS = [1000, 2000, 4000]
export const emptyTimes = () => ({ maiaSeconds: 0, engineSeconds: 0, tablebaseSeconds: 0, maiaCalls: 0,
  maiaBands: 0, bestCalls: 0, scoreCalls: 0, tablebaseCalls: 0, tablebaseUnavailable: 0,
  tablebaseRetries: 0, tablebaseRetrySeconds: 0, newGameCalls: 0, newGameSeconds: 0, rowSeconds: 0 })
export const rowKey = r => `${r.month}:${r.game}:${r.rule}`
export const sha = buffer => createHash('sha256').update(buffer).digest('hex')
export function atomic(path, data) {
  writeFileSync(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
}
export function journal(path) {
  if (!existsSync(path)) return []
  const data = readFileSync(path)
  const end = data.lastIndexOf(10) + 1
  if (end < data.length) truncateSync(path, end)
  return data.subarray(0, end).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
}
export function pick(policy, legal) {
  if (!policy || !legal.length || legal.some(m => !Number.isFinite(policy[m]) || policy[m] < 0)) throw new Error('incomplete Maia legal policy')
  return [...legal].sort((a, b) => policy[b] - policy[a] || (a < b ? -1 : a > b ? 1 : 0))[0]
}
const pieces = fen => (fen.split(' ')[0].match(/[a-z]/gi) ?? []).length
export function engineSound(played, best, mover) {
  validateScores(played, best)
  return E.acceptsAlternative(played.score, best.lines[0].score, mover, E.ACCEPT_WINDOW_WP)
}
export function validateScores(played, best) {
  if (played.partial || played.completion !== 'complete' || played.status !== 'exact' || !played.coherent || !S.isExactScore(played.score)) throw new Error('inexact move score')
  if (!best.complete || best.partial || best.completion !== 'complete' || !S.isExactScore(best.lines[0]?.score)) throw new Error('inexact best score')
}
export function tablebaseSound(probe, uci) {
  const outcome = E.outcomeForPlayer(probe, true)
  const move = probe?.moves.find(m => m.uci === uci)
  const after = move && E.moveOutcomeForMover(move)
  if (outcome == null || after == null) throw new Error('missing tablebase outcome; row remains pending')
  return after === outcome
}

export function requireLiteral(manifest, rows) {
  if (manifest.datasetKind !== 'literal' || rows.some(row => row.datasetKind !== 'literal')) throw new Error('scorer accepts only the literal registered population')
}

export function addTimes(totals, times) {
  for (const [key, value] of Object.entries(times ?? {})) {
    if (!Number.isFinite(value) || value < 0) throw new Error('invalid timing value')
    totals[key] = (totals[key] ?? 0) + value
  }
  return totals
}

// A hard-killed process may have committed rows after its last manifest.
// Recover their elapsed row time without counting earlier checkpoints twice.
export function cumulativeSeconds(previous, doneRows) {
  const known = previous?.workerSeconds ?? previous?.workerSecondsThisInvocation ?? 0
  const committed = previous?.rows ?? 0
  return known + doneRows.slice(committed).reduce((sum, row) => sum + (row.times?.rowSeconds ?? 0), 0)
}

/** Retry failed probes at covered positions. The adapter labels HTTP 4xx as
 * unsupported, including transient 429 responses. reset('tablebase') clears
 * the app's negative cache, while successful Node disk entries remain.
 * Uncovered positions and missing outcomes are never engine fallbacks. */
export async function probeWithRetry(eng, pos, times, options = {}) {
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const onEvent = options.onEvent ?? (() => {})
  const covered = E.tablebaseCovers(C.fenOf(pos))
  for (let attempt = 0; ; attempt++) {
    times.tablebaseCalls++
    const probe = await eng.tablebase(pos)
    if (probe !== null) {
      if (attempt) onEvent({ event: 'tablebase-recovered', attempts: attempt + 1 })
      return probe
    }
    times.tablebaseUnavailable++
    const status = eng.status().tablebase
    const failureKind = covered ? `covered-probe-${status}` : 'position-outside-tablebase-coverage'
    if (!covered || attempt >= TABLEBASE_RETRY_DELAYS_MS.length) {
      onEvent({ event: 'tablebase-unavailable', status, failureKind, attempts: attempt + 1, exhausted: covered })
      return null
    }
    const delayMs = TABLEBASE_RETRY_DELAYS_MS[attempt]
    times.tablebaseRetries++
    onEvent({ event: 'tablebase-retry', status, failureKind, failedAttempt: attempt + 1, nextAttempt: attempt + 2, delayMs })
    const started = performance.now()
    await sleep(delayMs)
    times.tablebaseRetrySeconds += (performance.now() - started) / 1000
    eng.reset('tablebase')
  }
}

export async function readRow(eng, row, timing, options = {}) {
  if (!timing && row.datasetKind !== 'literal') throw new Error('scorer accepts only literal position rows')
  const pos = C.position(row.fen)
  const board = K.tryBoard(row.fen)
  if (!board) throw new Error('invalid FEN')
  const legal = board.moves().map(m => `${m.from}${m.to}${m.promotion ?? ''}`)
  if (!legal.includes(row.A) || row.ruleMoves.some(m => !legal.includes(m))) throw new Error('illegal candidate')
  const times = { ...emptyTimes(), maiaCalls: 1, maiaBands: row.band === 1300 ? 1 : 2 }
  const rowStarted = performance.now()
  try {
  let start = performance.now()
  let h
  try { h = await eng.humanPolicy(pos, { bands: [...new Set([row.band, 1300])], opponentBand: row.opponentBand }) }
  finally { times.maiaSeconds += (performance.now() - start) / 1000 }
  if (h === 'unavailable') throw new Error('Maia unavailable')
  const policy = h.bands.find(b => b.band === row.band)?.policy
  const hisPolicy = h.bands.find(b => b.band === 1300)?.policy
  pick(hisPolicy, legal)
  const R = pick(policy, row.ruleMoves)
  const N = pick(policy, legal)
  const moves = [...new Set([R, N, row.A])]
  let sound, evidence
  if (pieces(row.fen) <= 7) {
    start = performance.now()
    let tb
    try { tb = await probeWithRetry(eng, pos, times, options) }
    finally { times.tablebaseSeconds += (performance.now() - start) / 1000 }
    if (!timing) {
      sound = Object.fromEntries(Object.entries({ R, N, A: row.A }).map(([k, uci]) => [k, tablebaseSound(tb, uci)]))
      evidence = { source: 'tablebase', probe: tb }
    }
  } else {
    start = performance.now()
    try {
    // The app awaits ucinewgame and readyok. Clear once per position, then
    // search its best and distinct R/N/A in a deterministic sequence.
    const clearing = performance.now()
    try { times.newGameCalls++; await eng.newGame() }
    finally { times.newGameSeconds += (performance.now() - clearing) / 1000 }
    times.bestCalls++
    const best = await eng.bestMoves(pos, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
    const readings = {}
    for (const uci of moves) {
      times.scoreCalls++
      readings[uci] = await eng.scoreMove(pos, uci, { budget: 'grade', priority: 'batch', cache: 'bypass' })
    }
    for (const [uci, r] of Object.entries(readings)) {
      validateScores(r, best)
      if (r.best !== uci && r.pv[0] !== uci) throw new Error('scoreMove did not score its requested root')
    }
    if (!timing) {
      sound = Object.fromEntries(Object.entries({ R, N, A: row.A }).map(([k, uci]) => [k, engineSound(readings[uci], best, row.fen.split(' ')[1])]))
      evidence = { source: 'stockfish', best, readings }
    }
    } finally { times.engineSeconds += (performance.now() - start) / 1000 }
  }
  // This branch is deliberately before soundness, adoption, win% and split derivation.
  times.rowSeconds = (performance.now() - rowStarted) / 1000
  if (timing) return { key: rowKey(row), times }
  const move = board.findUci(R)
  return { ...row, R, N, sound, probabilityRAtHisBand: h.bands.find(b => b.band === 1300).policy[R],
    probabilityRAtMoverBand: policy[R], splits: { ...row.splits, forcing: Boolean(move.captured) || board.child(move).inCheck() },
    evidence, times }
  } catch (error) {
    times.rowSeconds = (performance.now() - rowStarted) / 1000
    error.times = times
    throw error
  }
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1] }
  const timing = args.includes('--timing')
  const run = arg('run', timing ? 'slice' : 'full')
  const month = arg('month', '2026-07')
  if (!['slice', 'full'].includes(run) || !['2026-07', '2026-08', '2026-09'].includes(month)) throw new Error('invalid run or month')
  if (timing && (run !== 'slice' || month !== '2026-07')) throw new Error('timing is July slice only')
  if (!timing && (run !== 'full' || !args.includes('--phase2-reviewed'))) throw new Error('scoring awaits phase 2 review')
  if (CHESS_DIR.split('/').pop() !== PIN || PIN !== 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a') throw new Error('fixed app pin required')
  if (E.BUDGETS.grade.node.nodes !== 250000 || E.ACCEPT_WINDOW_WP !== 3) throw new Error('fixed instruments changed')
  const pool = Number(arg('pool', 1))
  if (!Number.isInteger(pool) || pool < 1 || pool > 2) throw new Error('worker limit exceeded: at most two heavy workers')
  if (pool > 1) {
    if (args.includes('--shard')) throw new Error('choose pool or shard')
    const base = args.filter((_, i) => i !== args.indexOf('--pool') && i !== args.indexOf('--pool') + 1)
    const children = []
    let stopping = false
    const stopOthers = () => { stopping = true; for (const child of children) if (child.exitCode === null) child.kill('SIGTERM') }
    process.on('SIGINT', stopOthers); process.on('SIGTERM', stopOthers)
    const results = await Promise.allSettled(Array.from({ length: pool }, (_, i) => new Promise((ok, fail) => {
      const p = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), fileURLToPath(import.meta.url), ...base, '--shard', `${i}/${pool}`], { stdio: 'inherit' })
      children.push(p)
      if (stopping) p.kill('SIGTERM')
      p.on('error', error => { stopOthers(); fail(error) })
      p.on('exit', (code, signal) => {
        if (code === 0) ok()
        else { stopOthers(); fail(new Error(`worker ${i} exited ${signal ?? code}`)) }
      })
    })))
    process.off('SIGINT', stopOthers); process.off('SIGTERM', stopOthers)
    const failure = results.find(result => result.status === 'rejected')
    if (failure) throw failure.reason
    return
  }
  const [shard, shards] = arg('shard', '0/1').split('/').map(Number)
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards || shards > 2) throw new Error('invalid shard; at most two heavy workers')
  const dir = join(privateDir('rules-of-thumb'), run)
  const input = join(dir, `positions-${month}.jsonl.gz`)
  const bytes = readFileSync(input)
  let rows = gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
  const positionManifest = JSON.parse(readFileSync(join(dir, `positions-${month}.json`)))
  if (!positionManifest.complete || positionManifest.app !== PIN || positionManifest.run !== run || positionManifest.month !== month || positionManifest.outputSha256 !== sha(bytes)) throw new Error('position build incomplete or provenance mismatch')
  if (!timing) requireLiteral(positionManifest, rows)
  if (timing) {
    const limit = Number(arg('limit', 60))
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('timing limit must be 1..100')
    const count = Math.min(limit, rows.length)
    rows = Array.from({ length: count }, (_, i) => rows[Math.floor(i * rows.length / count)])
  } else if (args.includes('--limit')) throw new Error('full scoring has no sample limit')
  rows = rows.filter((_, i) => i % shards === shard)
  const prefix = `${timing ? 'timing' : 'scored'}-${month}-${shard}-of-${shards}`
  const path = join(dir, `${prefix}.jsonl`), manifestPath = join(dir, `${prefix}.json`)
  const signature = { app: PIN, inputSha256: sha(bytes), timing, month, run, shard, shards, keysSha256: sha(rows.map(rowKey).join('\n')) }
  if (!timing) Object.assign(signature, { scorerVersion: sha(readFileSync(fileURLToPath(import.meta.url))), datasetKind: 'literal', scannerVersion: positionManifest.scannerVersion,
    engineHash: 'newGame-before-each-position' })
  let previous = null
  if (existsSync(manifestPath)) {
    previous = JSON.parse(readFileSync(manifestPath))
    for (const [k, v] of Object.entries(signature)) if (previous[k] !== v) throw new Error(`resume mismatch: ${k}`)
  } else if (existsSync(path)) throw new Error('journal has no provenance manifest')
  const doneRows = journal(path)
  const done = new Set(doneRows.map(r => r.key ?? rowKey(r)))
  const expected = new Set(rows.map(rowKey))
  if (expected.size !== rows.length || done.size !== doneRows.length || doneRows.some(r => !expected.has(r.key ?? rowKey(r)))) throw new Error('duplicate or foreign journal row')
  if (!timing) requireLiteral(signature, doneRows)
  const totals = emptyTimes()
  for (const row of doneRows) addTimes(totals, row.times)
  // A no-op resume preserves the completed run's timings and status.
  if (previous?.complete && done.size === rows.length) {
    console.log(JSON.stringify({ month, shard, timing, rows: done.size, totals, complete: true, resumedWithoutWork: true, workerSeconds: previous.workerSeconds ?? previous.workerSecondsThisInvocation }))
    return
  }
  const eventPath = join(dir, `${prefix}.events.jsonl`)
  const log = event => appendFileSync(eventPath, JSON.stringify({ at: new Date().toISOString(), month, shard, shards, timing, ...event }) + '\n')
  const beforeSeconds = cumulativeSeconds(previous, doneRows)
  const failedAttemptTotals = { ...emptyTimes(), ...previous?.failedAttemptTotals }
  let stoppedJobs = previous?.stoppedJobs ?? 0
  if (previous?.status === 'running') { stoppedJobs++; log({ event: 'interrupted-job-recovered', rows: done.size, previousCheckpointRows: previous.rows }) }
  const started = performance.now()
  let activeKey = null
  let stopRequested = null
  const onSignal = signal => { stopRequested ??= signal; log({ event: 'stop-requested', signal, key: activeKey }) }
  const onInt = () => onSignal('SIGINT'), onTerm = () => onSignal('SIGTERM')
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm)
  const saveProgress = (status, reason = null) => atomic(manifestPath, { ...signature, complete: status === 'complete', status,
    expectedRows: rows.length, rows: done.size, totals, failedAttemptTotals, stoppedJobs,
    budgetNodes: E.BUDGETS.grade.node.nodes, acceptWindowWp: E.ACCEPT_WINDOW_WP,
    data: 'Lichess rated standard 600+0, both ratings 1250..1649, July slice or fixed monthly scan',
    workerSeconds: beforeSeconds + (performance.now() - started) / 1000,
    workerSecondsThisInvocation: (performance.now() - started) / 1000,
    updatedAt: new Date().toISOString(), ...(reason ? { stoppedReason: reason, pendingKey: activeKey } : {}) })
  saveProgress('running')
  log({ event: 'job-started', rows: done.size, expectedRows: rows.length, resumed: done.size > 0 })
  let eng = null
  let failure = null
  try {
    const tb = Node.nodeTablebase({ cacheFile: join(dir, `tablebase-${shard}-of-${shards}.json`) })
    eng = Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: tb, evalCache: false })
    for (const row of rows) {
      if (done.has(rowKey(row))) continue
      if (stopRequested) throw new Error(`stop requested: ${stopRequested}`)
      activeKey = rowKey(row)
      const result = await readRow(eng, row, timing, { onEvent: event => log({ ...event, key: activeKey }) })
      appendFileSync(path, JSON.stringify(result) + '\n')
      doneRows.push(result); done.add(rowKey(row))
      addTimes(totals, result.times)
      activeKey = null
      if (done.size % 50 === 0) {
        saveProgress('running')
        console.error(JSON.stringify({ stage: timing ? 'timing' : 'score', month, shard, rows: done.size, workerSeconds: beforeSeconds + (performance.now() - started) / 1000 }))
      }
    }
  } catch (error) {
    failure = error
    stoppedJobs++
    addTimes(failedAttemptTotals, error.times)
    log({ event: 'job-stopped', key: activeKey, rows: done.size, reason: error.message, times: error.times ?? null })
  } finally {
    eng?.dispose()
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm)
    saveProgress(failure ? 'stopped' : 'complete', failure?.message)
  }
  if (failure) throw failure
  log({ event: 'job-completed', rows: done.size, workerSeconds: beforeSeconds + (performance.now() - started) / 1000 })
  console.log(JSON.stringify({ month, shard, timing, rows: done.size, totals, workerSeconds: beforeSeconds + (performance.now() - started) / 1000 }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
