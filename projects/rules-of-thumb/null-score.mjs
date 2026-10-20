// The post-verdict null comparison. Original journals are read-only.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chess, CHESS_DIR, privateDir, LAB_DIR } from '../../bridge/lib/chess.mjs'
import { addTimes, atomic, cumulativeSeconds, emptyTimes, engineSound, journal, pick,
  requireAmended, rowKey, sha, tablebaseSound, validateScores } from './score.mjs'
import { sampleWithoutReplacement } from './null-common.mjs'

const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const E = await chess('src/services/engine/index.ts')
const Node = await chess('src/adapters/node/engine/index.ts')
const PROJECT = join(LAB_DIR, 'projects/rules-of-thumb')
const ORIGINAL_APP = JSON.parse(readFileSync(join(PROJECT, 'phase2-manifest.json'))).app
const pieces = fen => (fen.split(' ')[0].match(/[a-z]/gi) ?? []).length
const timesOf = () => ({ ...emptyTimes(), storedProbeReads: 0, reusedMoves: 0, newSearches: 0 })

export function sampledMoves(row, legal) {
  if (!row.ruleMoves.length || new Set(row.ruleMoves).size !== row.ruleMoves.length
      || row.ruleMoves.some(uci => !legal.includes(uci))) throw new Error('invalid rule move set')
  return sampleWithoutReplacement([...legal].sort(), row.ruleMoves.length, `${rowKey(row)}\0null`)
}

export function storedSound(row, uci) {
  const aliases = ['R', 'N', 'A'].filter(label => row[label] === uci)
  if (!aliases.length) return null
  const values = aliases.map(label => row.sound[label])
  if (values.some(value => typeof value !== 'boolean' || value !== values[0])) throw new Error('inconsistent stored soundness')
  return values[0]
}

export function bestUci(best) {
  const uci = best?.lines?.[0]?.move
  if (typeof uci !== 'string' || !uci) throw new Error('missing referee best move')
  if (best.lines[0]?.pv?.[0] !== uci) throw new Error('referee move and principal variation differ')
  return uci
}

export async function readNullRow(eng, row) {
  requireAmended({ datasetKind: 'amended' }, [row])
  const board = K.tryBoard(row.fen)
  if (!board) throw new Error('invalid FEN')
  const legal = board.moves().map(m => `${m.from}${m.to}${m.promotion ?? ''}`)
  if (['R', 'N', 'A'].some(label => !legal.includes(row[label]) || typeof row.sound?.[label] !== 'boolean')) throw new Error('invalid original move or soundness')
  for (const uci of [row.R, row.N, row.A]) storedSound(row, uci)
  const sample = sampledMoves(row, legal)
  const small = pieces(row.fen) <= 7
  if (row.evidence?.source !== (small ? 'tablebase' : 'stockfish')) throw new Error('original referee source mismatch')
  const pos = C.position(row.fen)
  const times = { ...timesOf(), maiaCalls: 1, maiaBands: row.band === 1300 ? 1 : 2 }
  const rowStarted = performance.now()
  try {
    let started = performance.now()
    let human
    try { human = await eng.humanPolicy(pos, { bands: [...new Set([row.band, 1300])], opponentBand: row.opponentBand }) }
    finally { times.maiaSeconds += (performance.now() - started) / 1000 }
    if (human === 'unavailable') throw new Error('Maia unavailable')
    const policy = human.bands.find(b => b.band === row.band)?.policy
    if (pick(policy, row.ruleMoves) !== row.R || pick(policy, legal) !== row.N) throw new Error('Maia no longer reproduces original R and N')
    const R0 = pick(policy, sample)
    let soundR0, source, evidence, bestChanged
    if (small) {
      started = performance.now()
      times.storedProbeReads++
      try {
        soundR0 = tablebaseSound(row.evidence.probe, R0)
        // Check the reused probe against all recorded judgments too.
        for (const label of ['R', 'N', 'A']) {
          if (tablebaseSound(row.evidence.probe, row[label]) !== row.sound[label]) throw new Error('stored probe and original soundness differ')
        }
      } finally { times.tablebaseSeconds += (performance.now() - started) / 1000 }
      source = 'tablebase'
      evidence = { source, storedProbe: true }
    } else if (storedSound(row, R0) !== null) {
      soundR0 = storedSound(row, R0)
      times.reusedMoves++
      source = 'stored-move'
      evidence = { source, labels: ['R', 'N', 'A'].filter(label => row[label] === R0) }
    } else {
      source = 'engine'
      started = performance.now()
      try {
        const clearing = performance.now()
        try { times.newGameCalls++; await eng.newGame() }
        finally { times.newGameSeconds += (performance.now() - clearing) / 1000 }
        times.bestCalls++
        const best = await eng.bestMoves(pos, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
        times.scoreCalls++
        const reading = await eng.scoreMove(pos, R0, { budget: 'grade', priority: 'batch', cache: 'bypass' })
        validateScores(reading, best)
        if (reading.best !== R0 && reading.pv[0] !== R0) throw new Error('scoreMove did not score its requested root')
        soundR0 = engineSound(reading, best, row.fen.split(' ')[1])
        bestChanged = bestUci(best) !== bestUci(row.evidence.best)
        times.newSearches++
        evidence = { source, best, reading }
      } finally { times.engineSeconds += (performance.now() - started) / 1000 }
    }
    times.rowSeconds = (performance.now() - rowStarted) / 1000
    return { key: rowKey(row), datasetKind: 'null-addition', month: row.month, game: row.game, rule: row.rule,
      band: row.band, opponentBand: row.opponentBand, R: row.R, N: row.N, A: row.A, R0,
      k: row.ruleMoves.length, sampledMoves: sample, probabilityR0AtMoverBand: policy[R0],
      sound: { ...row.sound, R0: soundR0 }, source, ...(source === 'engine' ? { bestChanged } : {}), evidence, times }
  } catch (error) {
    times.rowSeconds = (performance.now() - rowStarted) / 1000
    error.times = times
    throw error
  }
}

export function readOriginalJournal(path) {
  const bytes = readFileSync(path)
  if (bytes.length && bytes.at(-1) !== 10) throw new Error('original score journal has an incomplete tail')
  return bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse)
}

export function checkJournal(rows, doneRows) {
  const expected = new Set(rows.map(rowKey))
  const done = new Set(doneRows.map(r => r.key))
  if (expected.size !== rows.length || done.size !== doneRows.length
      || doneRows.some(r => !expected.has(r.key) || r.key !== rowKey(r) || r.datasetKind !== 'null-addition')) throw new Error('duplicate or foreign null journal row')
  return done
}

async function main() {
  const args = process.argv.slice(2)
  const arg = (name, fallback) => { const at = args.indexOf(`--${name}`); return at < 0 ? fallback : args[at + 1] }
  const month = arg('month', '2026-09')
  if (!args.includes('--reviewed') || !['2026-09', '2026-07', '2026-08'].includes(month)) throw new Error('reviewed addition and valid month required')
  if (args.includes('--limit') || args.includes('--timing')) throw new Error('the addition uses every originally scored row')
  if (resolve(CHESS_DIR) !== join(LAB_DIR, '.cache/chess', ORIGINAL_APP)) throw new Error('original cached app required')
  if (E.BUDGETS.grade.node.nodes !== 250000 || E.ACCEPT_WINDOW_WP !== 3) throw new Error('fixed instruments changed')
  const verification = spawnSync(join(LAB_DIR, '.venv/bin/python'), [join(PROJECT, 'freeze_null.py')], { stdio: 'inherit' })
  if (verification.status !== 0) throw new Error('committed addition or frozen inputs do not verify')
  const pool = Number(arg('pool', 1))
  if (!Number.isInteger(pool) || pool < 1 || pool > 2) throw new Error('at most two heavy workers')
  if (pool > 1) {
    if (args.includes('--shard')) throw new Error('choose pool or shard')
    const base = args.filter((_, i) => i !== args.indexOf('--pool') && i !== args.indexOf('--pool') + 1)
    const children = []
    let stopping = false
    const stop = () => { stopping = true; for (const child of children) if (child.exitCode === null) child.kill('SIGTERM') }
    process.on('SIGINT', stop); process.on('SIGTERM', stop)
    const results = await Promise.allSettled(Array.from({ length: pool }, (_, i) => new Promise((ok, fail) => {
      // The driver and this coordinator do no heavy work and run at nice 0.
      // Each heavy worker, including its engine, inherits nice 10.
      const child = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), fileURLToPath(import.meta.url),
        ...base, '--shard', `${i}/${pool}`], { stdio: 'inherit' })
      children.push(child)
      if (stopping) child.kill('SIGTERM')
      child.on('error', error => { stop(); fail(error) })
      child.on('exit', (code, signal) => { if (code === 0) ok(); else { stop(); fail(new Error(`worker ${i} exited ${signal ?? code}`)) } })
    })))
    process.off('SIGINT', stop); process.off('SIGTERM', stop)
    const failure = results.find(result => result.status === 'rejected')
    if (failure) throw failure.reason
    return
  }
  const [shard, shards] = arg('shard', '0/2').split('/').map(Number)
  if (!Number.isInteger(shard) || shards !== 2 || shard < 0 || shard >= shards) throw new Error('the addition uses exactly two shards')
  const original = join(privateDir('rules-of-thumb'), 'full')
  const dir = join(privateDir('rules-of-thumb'), 'null')
  mkdirSync(dir, { recursive: true })
  const bytes = readFileSync(join(original, `positions-${month}.jsonl.gz`))
  const positions = gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
  const originals = [0, 1].flatMap(i => readOriginalJournal(join(original, `scored-${month}-${i}-of-2.jsonl`)))
  const byKey = new Map(originals.map(row => [rowKey(row), row]))
  if (byKey.size !== originals.length || originals.length !== positions.length) throw new Error('original score coverage differs')
  const rows = positions.filter((_, i) => i % shards === shard).map(position => {
    const row = byKey.get(rowKey(position))
    if (!row || ['fen', 'A', 'band', 'opponentBand', 'datasetKind'].some(k => row[k] !== position[k])
        || JSON.stringify(row.ruleMoves) !== JSON.stringify(position.ruleMoves)) throw new Error('original position and score differ')
    return row
  })
  requireAmended({ datasetKind: 'amended' }, rows)
  const prefix = `scored-${month}-${shard}-of-${shards}`
  const path = join(dir, `${prefix}.jsonl`), manifestPath = join(dir, `${prefix}.json`)
  const signature = { app: ORIGINAL_APP, inputSha256: sha(bytes), month, run: 'full', shard, shards,
    keysSha256: sha(rows.map(rowKey).join('\n')), scorerVersion: sha(readFileSync(fileURLToPath(import.meta.url))),
    datasetKind: 'null-addition', additionManifestSha256: sha(readFileSync(join(PROJECT, 'null-manifest.json'))),
    engineHash: 'newGame-before-each-new-referee-search' }
  let previous = null
  if (existsSync(manifestPath)) {
    previous = JSON.parse(readFileSync(manifestPath))
    for (const [key, value] of Object.entries(signature)) if (previous[key] !== value) throw new Error(`resume mismatch: ${key}`)
  } else if (existsSync(path)) throw new Error('null journal has no provenance manifest')
  const doneRows = journal(path)
  const done = checkJournal(rows, doneRows)
  const totals = timesOf()
  for (const row of doneRows) addTimes(totals, row.times)
  if (previous?.complete && done.size === rows.length) {
    if (previous.outputSha256 !== sha(readFileSync(path))) throw new Error('completed null journal changed')
    console.log(JSON.stringify({ month, shard, rows: done.size, complete: true, resumedWithoutWork: true }))
    return
  }
  const log = event => appendFileSync(join(dir, `${prefix}.events.jsonl`), JSON.stringify({ at: new Date().toISOString(), month, shard, shards, ...event }) + '\n')
  const beforeSeconds = cumulativeSeconds(previous, doneRows)
  const failedAttemptTotals = { ...timesOf(), ...previous?.failedAttemptTotals }
  let stoppedJobs = previous?.stoppedJobs ?? 0
  if (previous?.status === 'running') { stoppedJobs++; log({ event: 'interrupted-job-recovered', rows: done.size, previousCheckpointRows: previous.rows }) }
  const started = performance.now()
  let activeKey = null, stopRequested = null
  const onSignal = signal => { stopRequested ??= signal; log({ event: 'stop-requested', signal, key: activeKey }) }
  const onInt = () => onSignal('SIGINT'), onTerm = () => onSignal('SIGTERM')
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm)
  const saveProgress = (status, reason = null) => atomic(manifestPath, { ...signature, complete: status === 'complete', status,
    expectedRows: rows.length, rows: done.size, totals, failedAttemptTotals, stoppedJobs,
    budgetNodes: E.BUDGETS.grade.node.nodes, acceptWindowWp: E.ACCEPT_WINDOW_WP,
    workerSeconds: beforeSeconds + (performance.now() - started) / 1000,
    workerSecondsThisInvocation: (performance.now() - started) / 1000, updatedAt: new Date().toISOString(),
    ...(status === 'complete' ? { outputSha256: sha(existsSync(path) ? readFileSync(path) : '') } : {}),
    ...(reason ? { stoppedReason: reason, pendingKey: activeKey } : {}) })
  saveProgress('running')
  log({ event: 'job-started', rows: done.size, expectedRows: rows.length, resumed: done.size > 0 })
  let eng = null, failure = null
  try {
    eng = Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: false, evalCache: false })
    for (const row of rows) {
      if (done.has(rowKey(row))) continue
      if (stopRequested) throw new Error(`stop requested: ${stopRequested}`)
      activeKey = rowKey(row)
      const result = await readNullRow(eng, row)
      appendFileSync(path, JSON.stringify(result) + '\n')
      doneRows.push(result); done.add(rowKey(row)); addTimes(totals, result.times)
      activeKey = null
      if (done.size % 50 === 0) {
        saveProgress('running')
        console.error(JSON.stringify({ stage: 'null-score', month, shard, rows: done.size,
          workerSeconds: beforeSeconds + (performance.now() - started) / 1000 }))
      }
    }
  } catch (error) {
    failure = error; stoppedJobs++; addTimes(failedAttemptTotals, error.times)
    log({ event: 'job-stopped', key: activeKey, rows: done.size, reason: error.message, times: error.times ?? null })
  } finally {
    eng?.dispose()
    process.off('SIGINT', onInt); process.off('SIGTERM', onTerm)
    saveProgress(failure ? 'stopped' : 'complete', failure?.message)
  }
  if (failure) throw failure
  log({ event: 'job-completed', rows: done.size })
  console.log(JSON.stringify({ month, shard, rows: done.size, totals, workerSeconds: beforeSeconds + (performance.now() - started) / 1000 }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
