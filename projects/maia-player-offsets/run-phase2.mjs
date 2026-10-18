// Run only after the committed protocol content manifest has been reviewed.
// Launch this coordinator in an independent OS session with private log FDs.
// This coordinator is
// light: only its policy workers, review workers and final fit are nice 10.
// Stages are sequential. A resumed run uses the workers' existing caches.
//
//   bridge/run.sh projects/maia-player-offsets/run-phase2.mjs --run
//   bridge/run.sh projects/maia-player-offsets/run-phase2.mjs --status
//   bridge/run.sh projects/maia-player-offsets/run-phase2.mjs --migrate-pre-effects
import fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { getPriority } from 'node:os'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR } from '../../bridge/lib/chess.mjs'

const args = process.argv.slice(2)
if (args.length !== 1 || !['--run', '--status', '--migrate-pre-effects'].includes(args[0])) throw new Error('usage: run-phase2.mjs --run|--status|--migrate-pre-effects')
const migrating = args[0] === '--migrate-pre-effects'
const home = join(LAB_DIR, 'private/maia-player-offsets')
const project = join(LAB_DIR, 'projects/maia-player-offsets')
const stateFile = join(home, 'phase2-run.json'), lockFile = join(home, 'phase2-run.lock')
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const now = () => new Date().toISOString()
const secondsSince = date => date ? Math.max(0, (Date.now() - Date.parse(date)) / 1000) : 0
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const exists = file => fs.existsSync(file)
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const alive = pid => {
  if (!Number.isInteger(pid) || pid < 2) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
const groupAlive = pid => {
  if (!Number.isInteger(pid) || pid < 2) return false
  try { process.kill(-pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
const marker = pid => {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null }
  catch { return null }
}
const knownAlive = job => alive(job.pid) && job.pidStarted !== null && marker(job.pid) === job.pidStarted
const publicState = state => ({
  status: state?.status ?? 'not-started', stage: state?.currentStage ?? null,
  updatedAt: state?.updatedAt ?? null,
  stageWallSeconds: state?.status === 'running' && state.currentStage ? Math.round(secondsSince(state.stages[state.currentStage]?.activeSince)) : null,
  stages: Object.entries(state?.stages ?? {}).map(([name, s]) => ({
    stage: name, status: s.status, attempts: s.attempts.length,
    wallSeconds: Math.round(s.attempts.reduce((sum, a) => sum + (a.seconds ?? 0), 0)),
    ...(s.progress ? { progress: s.progress } : {}),
    ...(s.timing ? { timing: s.timing } : {}),
  })),
  jobs: (state?.jobs ?? []).map(j => ({ pid: j.pid, stage: j.stage, slot: j.slot, active: knownAlive(j), groupActive: groupAlive(j.pid), groupSurvives: j.groupSurvives === true })),
  ...(state?.failure ? { failure: { stage: state.failure.stage, transient: state.failure.transient, reason: state.failure.reason } } : {}),
})
if (args[0] === '--status') {
  console.log(JSON.stringify(publicState(exists(stateFile) ? read(stateFile) : null)))
  process.exit(0)
}

if (getPriority() !== 0) throw new Error('run the lightweight coordinator without nice; it starts heavy workers at nice 10')
fs.mkdirSync(home, { recursive: true })
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
if (execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== pin.commit) throw new Error('phase 2 requires the pinned app')
const sourceFiles = [
  'bridge/chess.json', 'bridge/run.sh', 'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs',
  'projects/maia-rating-offset/positions.mts', 'projects/accuracy-vs-chesscom/build-evidence.mjs',
  ...['run-phase2.mjs', 'prepare.mjs', 'design.mjs', 'io.mjs', 'policies.mts', 'weights.mts',
    'evidence.mjs', 'review-one.mts', 'events.mjs', 'fit.mjs', 'protocol.md'].map(f => `projects/maia-player-offsets/${f}`),
]
const protocolFile = 'projects/maia-player-offsets/protocol.md'
const protocolManifestFile = 'projects/maia-player-offsets/protocol-manifest.json'
const protocolManifest = read(join(LAB_DIR, protocolManifestFile))
const protocolManifestSha256 = digest(join(LAB_DIR, protocolManifestFile))
const contentHash = bytes => createHash('sha256').update(bytes).digest('hex')
const committedHash = file => contentHash(execFileSync('git', ['show', `HEAD:${file}`], { cwd: LAB_DIR, stdio: ['ignore', 'pipe', 'ignore'] }))
if (protocolManifest.schema !== 'maia-player-offsets-protocol/1' || protocolManifest.app !== pin.commit || protocolManifest.records !== pin.records ||
    protocolManifest.protocol?.file !== protocolFile || !protocolManifest.sources ||
    JSON.stringify(Object.keys(protocolManifest.sources).sort()) !== JSON.stringify([...sourceFiles].sort())) throw new Error('protocol manifest does not name the exact runtime source set')
if (committedHash(protocolManifestFile) !== protocolManifestSha256) throw new Error('protocol manifest must be committed before use')
for (const file of sourceFiles) {
  const expected = protocolManifest.sources[file]
  if (!/^[a-f0-9]{64}$/.test(expected) || digest(join(LAB_DIR, file)) !== expected || committedHash(file) !== expected) throw new Error('protocol source differs from its committed content hash')
}
if (protocolManifest.protocol.sha256 !== protocolManifest.sources[protocolFile]) throw new Error('protocol text hashes disagree')
const protocolSha256 = protocolManifest.protocol.sha256
const inputFiles = ['positions.jsonl', 'games.json', 'held-cases.json', 'benchmark-cases.json', 'prepare.json']
const snapshot = () => ({
  app: pin.commit, records: pin.records,
  protocolManifestSha256: digest(join(LAB_DIR, protocolManifestFile)),
  protocolSha256: digest(join(LAB_DIR, protocolFile)),
  sources: Object.fromEntries(sourceFiles.map(f => [f, digest(join(LAB_DIR, f))])),
  inputs: Object.fromEntries(inputFiles.map(f => [f, digest(join(home, f))])),
})
const bridge = join(LAB_DIR, 'bridge/run.sh')
const command = (script, argv = [], nice = true) => ({
  executable: nice ? 'nice' : bridge,
  argv: nice ? ['-n', '10', bridge, join(project, script), ...argv] : [join(project, script), ...argv],
})
const stages = [
  { name: 'move-policies', commands: [0, 1].map(k => command('policies.mts', ['--kind', 'move', '--shard', `${k}/2`])), policy: 'move',
    outputs: [0, 1].flatMap(k => [`move-policies-${k}-of-2.jsonl`, `move-policies-${k}-of-2.jsonl.meta.json`]) },
  { name: 'reviews', commands: [command('evidence.mjs', ['--full'], false)], outputs: ['evidence/manifest.json', 'evidence-full.json'] },
  { name: 'events', commands: [command('events.mjs')], outputs: ['punish-events.json'] },
  { name: 'punish-policies', commands: [0, 1].map(k => command('policies.mts', ['--kind', 'punish', '--shard', `${k}/2`])), policy: 'punish',
    outputs: [0, 1].flatMap(k => [`punish-policies-${k}-of-2.jsonl`, `punish-policies-${k}-of-2.jsonl.meta.json`]) },
  { name: 'fit', commands: [command('fit.mjs', ['--phase2'])], outputs: [], resultFiles: ['offsets.json', 'offsets.md'] },
]
const prior = exists(stateFile) ? read(stateFile) : null
const priorStateSha256 = prior ? digest(stateFile) : null
const current = snapshot()
if (!migrating && prior && (prior.schema !== 'maia-player-offsets-run/2' || JSON.stringify(prior.snapshot) !== JSON.stringify(current))) {
  throw new Error('phase-2 source or input fingerprint changed; review the change before starting a fresh run record')
}
const withoutBranchCommits = value => {
  if (Array.isArray(value)) return value.map(withoutBranchCommits)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['amendmentCommit', 'headAtStart'].includes(key)).map(([key, v]) => [key, withoutBranchCommits(v)]))
  return value
}
let migrated = null
if (migrating) {
  if (!prior || prior.schema !== 'maia-player-offsets-run/1') throw new Error('migration requires the legacy pre-effect run record')
  if (prior.stages?.fit?.attempts?.length !== 0 || ['offsets.json', 'offsets.md'].some(f => exists(join(project, 'results', f)))) throw new Error('migration is forbidden after any fit attempt or result')
  if (!['interrupted', 'failed', 'ready'].includes(prior.status)) throw new Error('stop the earlier run before migration')
  if (prior.snapshot?.app !== current.app || prior.snapshot?.records !== current.records || JSON.stringify(prior.snapshot.inputs) !== JSON.stringify(current.inputs)) throw new Error('migration may not change app pins or data inputs')
  const previousSources = prior.snapshot.sources, allowedChange = 'projects/maia-player-offsets/run-phase2.mjs'
  if (JSON.stringify(Object.keys(previousSources).sort()) !== JSON.stringify(sourceFiles.filter(f => f !== protocolFile).sort())) throw new Error('legacy source set is not the expected pre-effect source set')
  if (Object.entries(previousSources).some(([file, sha]) => file !== allowedChange && current.sources[file] !== sha)) throw new Error('migration changed an instrument or analysis source')
  migrated = withoutBranchCommits(prior)
  migrated.schema = 'maia-player-offsets-run/2'
  migrated.migrations ??= []
  migrated.migrations.push({ at: now(), kind: 'pre-effect-content-provenance-and-process-control',
    previousSources, previousInputs: prior.snapshot.inputs, changedSource: allowedChange,
    protocolManifestSha256, protocolSha256, noFitAttempts: true, noFitResults: true })
  migrated.snapshot = current
  for (const record of Object.values(migrated.stages)) for (const a of record.attempts) {
    if (Number.isFinite(a.seconds)) continue
    const measured = migrated.sessions.find(s => s.executionId === a.executionId && Number.isFinite(s.seconds) && s.seconds >= 0 && s.finishedAt)
    const end = measured ? Date.parse(measured.finishedAt) : NaN, start = Date.parse(a.startedAt)
    if (measured && Number.isFinite(end) && Number.isFinite(start) && end >= start && start >= Date.parse(measured.startedAt)) {
      a.finishedAt = measured.finishedAt; a.seconds = Math.min(measured.seconds, (end - start) / 1000)
      a.status = 'interrupted'; a.recovered = true
      a.timingBasis = 'recovered from the measured session finish, bounded by measured session duration; includes shutdown time'
    } else { a.status = 'interrupted-duration-unknown'; a.timingBasis = 'no measured session finish; duration remains unknown' }
  }
}
const executionId = randomUUID()
let state = migrated ?? prior ?? {
  schema: 'maia-player-offsets-run/2', createdAt: now(), snapshot: current,
  status: 'ready', currentStage: null, jobs: [],
  sessions: [],
  stages: Object.fromEntries(stages.map(s => [s.name, { status: 'pending', attempts: [] }])),
}
const save = () => {
  state.updatedAt = now()
  const tmp = `${stateFile}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n'); fs.renameSync(tmp, stateFile)
}
const unchanged = () => {
  if (JSON.stringify(snapshot()) !== JSON.stringify(state.snapshot)) throw new Error('phase-2 source or input changed during the run; no later stage will start')
}
let locked = false, stopping = false
const active = new Map()
const release = () => {
  if (!locked) return
  try { if (read(lockFile).executionId === executionId) fs.unlinkSync(lockFile) } catch { /* already released */ }
  locked = false
}
async function terminateJobs(jobs, stale = false) {
  const targets = jobs.filter(j => stale ? knownAlive(j) : active.has(j.pid))
  for (const j of targets) { try { process.kill(-j.pid, 'SIGTERM') } catch { /* already closed */ } }
  // Review's coordinator receives TERM first and cleans up its own worker
  // groups. Force only groups this supervisor created and still identifies.
  for (let n = 0; n < 20 && targets.some(j => knownAlive(j)); n++) await sleep(250)
  for (const j of targets.filter(knownAlive)) { try { process.kill(-j.pid, 'SIGKILL') } catch { /* already closed */ } }
}
async function acquire() {
  if (exists(lockFile)) {
    const old = read(lockFile)
    if (knownAlive(old)) throw new Error('another phase-2 coordinator is still running')
    if (alive(old.pid) && (!old.pidStarted || marker(old.pid) === null)) throw new Error('the old coordinator identity cannot be verified; inspect the private lock')
    const leftover = (state.jobs ?? []).filter(j => j.executionId === old.executionId)
    await terminateJobs(leftover, true)
    if (leftover.some(j => knownAlive(j) || groupAlive(j.pid))) throw new Error('previous workers are still shutting down; resume after they stop')
    await cleanReviewWorkers()
    fs.unlinkSync(lockFile)
  } else if ((state.jobs ?? []).some(j => knownAlive(j) || groupAlive(j.pid))) {
    throw new Error('recorded phase-2 workers remain active without a lock; do not start another pair')
  }
  await cleanReviewWorkers()
  const fd = fs.openSync(lockFile, 'wx')
  fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, pidStarted: marker(process.pid), executionId, startedAt: now() }) + '\n')
  fs.closeSync(fd); locked = true
  if (migrating && (digest(stateFile) !== priorStateSha256 || ['offsets.json', 'offsets.md'].some(f => exists(join(project, 'results', f))))) throw new Error('the pre-effect record changed while migration was acquiring its lock')
  state.jobs = []; state.executionId = executionId; save()
}
const safeProgress = (line, stage, slot) => {
  let value
  try { value = JSON.parse(line) } catch { return }
  if (!['move', 'punish'].includes(value.kind)) return
  const allowed = ['shard', 'rows', 'calls', 'seconds', 'bytes', 'written', 'remaining', 'resumedRows']
  const fields = Object.fromEntries(allowed.filter(k => Number.isFinite(value[k])).map(k => [k, value[k]]))
  if (!Object.keys(fields).length) return
  const progress = { kind: value.kind, ...fields }
  state.stages[stage].progress ??= {}
  state.stages[stage].progress[slot] = progress
  save()
  console.log(JSON.stringify({ stage, slot, ...progress }))
}
function launch(spec, stage, slot, attempt) {
  const logDir = join(home, 'phase2-logs', executionId)
  fs.mkdirSync(logDir, { recursive: true })
  const logFile = join(logDir, `${stage}-${slot}-attempt-${attempt}.log`)
  const log = fs.openSync(logFile, 'a')
  const startedAt = now()
  const child = spawn(spec.executable, spec.argv, { cwd: LAB_DIR, detached: true, stdio: ['ignore', log, log] })
  fs.closeSync(log)
  const job = { pid: child.pid ?? null, pidStarted: child.pid ? marker(child.pid) : null, executionId, stage, slot, startedAt, logFile, logOffset: 0, logPending: '' }
  if (child.pid) { active.set(child.pid, job); state.jobs.push(job); save() }
  let spawnError = false
  child.on('error', () => { spawnError = true })
  return new Promise(resolve => child.on('close', async (code, signal) => {
    try { readProgress(job) } catch { spawnError = true }
    // A killed launcher may leave its policy process in the same group.
    // Keep that group journaled until it disappears. After the leader exits
    // its identity cannot authorize a kill, so surviving children stop the
    // stage instead of allowing a retry to start another pair of workers.
    if (child.pid) { active.delete(child.pid); job.closedAt = now(); save() }
    for (let n = 0; n < 20 && groupAlive(child.pid); n++) await sleep(250)
    const groupSurvives = groupAlive(child.pid)
    if (child.pid) {
      if (groupSurvives) job.groupSurvives = true
      else state.jobs = state.jobs.filter(j => j.pid !== child.pid)
    }
    const result = { slot, code, signal, seconds: secondsSince(startedAt), spawnError, groupSurvives,
      transient: !spawnError && !groupSurvives && (['SIGINT', 'SIGTERM', 'SIGKILL', 'SIGHUP'].includes(signal) || [130, 137, 143].includes(code)),
      ok: !spawnError && !groupSurvives && code === 0 }
    save(); resolve(result)
  }))
}
function readProgress(job) {
  const size = fs.statSync(job.logFile).size
  if (size < job.logOffset) throw new Error('an active worker log was truncated')
  // Worker logs are private. Only the fixed aggregate JSON fields above are
  // echoed. A bounded tail prevents an error log from blocking supervision.
  if (size - job.logOffset > 65536) { job.logOffset = size - 65536; job.logPending = '' }
  const n = size - job.logOffset
  if (!n) return
  const fd = fs.openSync(job.logFile, 'r'), buffer = Buffer.alloc(n)
  fs.readSync(fd, buffer, 0, n, job.logOffset); fs.closeSync(fd)
  job.logOffset = size; job.logPending += buffer.toString('utf8')
  let at
  while ((at = job.logPending.indexOf('\n')) >= 0) {
    safeProgress(job.logPending.slice(0, at), job.stage, job.slot)
    job.logPending = job.logPending.slice(at + 1)
  }
  if (job.logPending.length > 65536) job.logPending = ''
}
function outputSignatures(stage) {
  const files = [...stage.outputs.map(f => join(home, f)), ...(stage.resultFiles ?? []).map(f => join(project, 'results', f))]
  return files.map(file => { const s = fs.statSync(file); return { file, bytes: s.size, modifiedMs: s.mtimeMs } })
}
async function policyTiming(kind) {
  const summary = { rows: 0, calls: 0, bytes: 0, timedRows: 0, untimedRows: 0,
    committedWorkerSeconds: 0, firstCalls: 0, firstSeconds: 0, maximumFirstSeconds: 0, warmSeconds: 0, warmCalls: 0 }
  for (const shard of [0, 1]) {
    const file = join(home, `${kind}-policies-${shard}-of-2.jsonl`)
    summary.bytes += fs.statSync(file).size
    const lines = createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
    for await (const line of lines) {
      const row = JSON.parse(line), n = row.pairs.length
      summary.rows++; summary.calls += n
      if (!row.timing) { summary.untimedRows++; continue }
      const { seconds, firstSeconds } = row.timing
      if (![seconds, firstSeconds].every(x => Number.isFinite(x) && x >= 0) || firstSeconds > seconds) throw new Error('invalid committed policy timing')
      summary.timedRows++; summary.committedWorkerSeconds += seconds
      summary.firstSeconds += firstSeconds; summary.maximumFirstSeconds = Math.max(summary.maximumFirstSeconds, firstSeconds)
      summary.firstCalls += Number(firstSeconds > 0)
      summary.warmSeconds += seconds - firstSeconds; summary.warmCalls += n - Number(firstSeconds > 0)
    }
  }
  return { ...summary, warmSecondsPerCall: summary.warmCalls ? summary.warmSeconds / summary.warmCalls : null,
    basis: 'committed row computation; excludes interrupted work, serialization, append and between-row overhead; each restart first call counted separately' }
}
const journalRows = file => {
  if (!exists(file)) return []
  const data = fs.readFileSync(file, 'utf8'), end = data.lastIndexOf('\n') + 1
  return data.slice(0, end).split('\n').filter(Boolean).map(JSON.parse)
}
async function cleanReviewWorkers() {
  const rows = journalRows(join(home, 'evidence-worker-groups.jsonl'))
  const groups = new Map(rows.map(r => [`${r.pid}/${r.pidStarted}`, r]))
  const stale = []
  for (const r of groups.values()) {
    if (!Number.isInteger(r.pid) || r.pid < 2 || !r.pidStarted || !Number.isInteger(r.coordinatorPid) || !r.coordinatorStarted) {
      throw new Error('review process journal has an unverifiable identity; no new workers will start')
    }
    if (!groupAlive(r.pid)) continue
    if (!alive(r.pid)) throw new Error('a journaled review group survives without its leader; inspect it before starting more workers')
    const currentMarker = marker(r.pid)
    if (currentMarker === null) throw new Error('a live review worker identity cannot be verified; no new workers will start')
    if (currentMarker !== r.pidStarted) continue // The PID was reused; this group is not ours.
    if (knownAlive({ pid: r.coordinatorPid, pidStarted: r.coordinatorStarted })) {
      throw new Error('another review coordinator still owns active workers; no new workers will start')
    }
    if (alive(r.coordinatorPid) && marker(r.coordinatorPid) === null) throw new Error('a live review coordinator identity cannot be verified; no new workers will start')
    stale.push(r)
  }
  await terminateJobs(stale, true)
  for (let n = 0; n < 20 && stale.some(r => groupAlive(r.pid)); n++) await sleep(250)
  if (stale.some(r => knownAlive(r) || groupAlive(r.pid))) throw new Error('orphaned review workers did not stop; no new workers will start')
}
function existingReviews() {
  const cases = read(join(home, 'held-cases.json')), ids = []
  for (const c of cases) {
    try {
      const doc = read(join(home, 'evidence/routine', `${c.id}.json`))
      if (doc.schema === 'game-review/2' && doc.id === c.game && doc.playerColor === c.playerColor &&
          doc.provenance?.profile === 'routine' && Array.isArray(doc.records) && doc.fens?.length === doc.records.length + 1) ids.push(String(c.id))
    } catch { /* incomplete or absent documents will be built by evidence */ }
  }
  return { selected: cases.length, ids }
}
function reviewTiming(record) {
  const cases = read(join(home, 'held-cases.json'))
  const selected = new Set(cases.map(c => String(c.id))), reused = new Set(record.reviewBefore.ids)
  const times = new Map(journalRows(join(home, 'evidence/routine/_timing.jsonl')).filter(t => selected.has(String(t.id))).map(t => [String(t.id), t]))
  const completed = existingReviews().ids.length
  if (completed !== cases.length || times.size !== cases.length) throw new Error('full review timing or evidence is incomplete')
  let workerSeconds = 0, newWorkerSeconds = 0, plies = 0, recoveredTimings = 0
  for (const [id, t] of times) {
    if (!Number.isFinite(t.seconds) || t.seconds < 0 || !Number.isInteger(t.plies)) throw new Error('invalid review timing')
    workerSeconds += t.seconds; plies += t.plies; recoveredTimings += Number(t.recovered === true)
    if (!reused.has(id)) newWorkerSeconds += t.seconds
  }
  const batch = read(join(home, 'evidence-full.json'))
  return { selected: cases.length, completed, reusedReviews: reused.size, newlyCompletedReviews: completed - reused.size,
    plies, workerSeconds, newWorkerSeconds, recoveredTimings,
    coordinatorPriority: batch.coordinatorPriority, workerNiceIncrement: batch.niceIncrement,
    basis: 'one latest completed timing per selected game; reused reviews counted separately; recovered timings retain the evidence journal basis' }
}
let session = null
function finishSession(status) {
  if (!session || session.finishedAt) return
  session.finishedAt = now(); session.seconds = secondsSince(session.startedAt); session.status = status
}
function writeRuntime() {
  const endedAt = state.finishedAt ?? now()
  const stageRows = stages.map(s => {
    const r = state.stages[s.name]
    return { stage: s.name, status: r.status, maximumHeavyWorkers: ['move-policies', 'reviews', 'punish-policies'].includes(s.name) ? 2 : 1,
      attempts: r.attempts.map(a => ({ number: a.number, startedAt: a.startedAt, finishedAt: a.finishedAt ?? null,
        status: a.status ?? 'interrupted', seconds: a.seconds ?? null,
        recovered: a.recovered === true, timingBasis: a.timingBasis ?? 'measured stage attempt wall time',
        results: (a.results ?? []).map(x => ({ slot: x.slot, code: x.code, signal: x.signal, seconds: x.seconds, transient: x.transient, groupSurvives: x.groupSurvives === true, ok: x.ok })) })),
      measuredAttemptWallSeconds: r.attempts.reduce((sum, a) => sum + (a.seconds ?? 0), 0),
      unmeasuredInterruptedAttempts: r.attempts.filter(a => !Number.isFinite(a.seconds)).length,
      ...(r.timing ? { timing: r.timing } : {}) }
  })
  const overallElapsedSeconds = Math.max(0, (Date.parse(endedAt) - Date.parse(state.createdAt)) / 1000)
  const measuredActiveSeconds = state.sessions.reduce((sum, s) => sum + (s.seconds ?? 0), 0)
  const report = { schema: 'maia-player-offsets-runtime/1', phase: 2, status: state.status,
    protocolManifestSha256: state.snapshot.protocolManifestSha256,
    protocolSha256: state.snapshot.protocolSha256,
    app: pin.commit, records: pin.records, sourceSha256: state.snapshot.sources,
    resultsSha256: state.status === 'complete' ? {
      offsetsJson: digest(join(project, 'results/offsets.json')),
      offsetsMd: digest(join(project, 'results/offsets.md')),
    } : null,
    inputSha256: { positions: state.snapshot.inputs['positions.jsonl'], games: state.snapshot.inputs['games.json'], heldCases: state.snapshot.inputs['held-cases.json'] },
    maximumHeavyWorkers: 2, workerNiceIncrement: 10, coordinatorPriority: 0,
    startedAt: state.createdAt, endedAt, overallElapsedSeconds, measuredActiveSeconds,
    gapsAndUnmeasuredSeconds: Math.max(0, overallElapsedSeconds - measuredActiveSeconds),
    measuredAttemptWallSeconds: stageRows.reduce((sum, s) => sum + s.measuredAttemptWallSeconds, 0),
    unmeasuredInterruptedSessions: state.sessions.filter(s => !Number.isFinite(s.seconds)).length,
    sessions: state.sessions.map(s => ({ startedAt: s.startedAt, finishedAt: s.finishedAt ?? null, status: s.status, seconds: s.seconds ?? null })),
    migrations: (state.migrations ?? []).map(m => ({ at: m.at, kind: m.kind, previousSources: m.previousSources,
      changedSource: m.changedSource, protocolManifestSha256: m.protocolManifestSha256, protocolSha256: m.protocolSha256,
      noFitAttempts: m.noFitAttempts, noFitResults: m.noFitResults })),
    stages: stageRows,
    notes: 'Supervisor wall time includes serial bookkeeping. Stage attempt wall times count concurrent workers once. Policy row timings sum worker computation and exclude discarded partial rows and append overhead. Overall span includes resume gaps; abruptly killed sessions have unknown duration and are shown separately. No game identifiers, positions, fitted values or outcome measures are read into this report.',
  }
  const out = join(project, 'results'); fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(join(out, 'runtime.json'), JSON.stringify(report, null, 2) + '\n')
  const f = x => x.toFixed(2)
  const md = [
    '# Maia player offsets: phase-2 runtime', '',
    `Written by run-phase2.mjs. Status: ${report.status}. Protocol manifest SHA-256 ${report.protocolManifestSha256}; frozen protocol SHA-256 ${report.protocolSha256}. App ${pin.commit}; records ${pin.records}.`, '',
    `At most ${report.maximumHeavyWorkers} heavy workers ran together, each with nice increment ${report.workerNiceIncrement} from a coordinator at priority ${report.coordinatorPriority}. Overall elapsed span: ${f(overallElapsedSeconds / 3600)} hours; measured active coordinator time: ${f(measuredActiveSeconds / 3600)} hours; gaps and unmeasured time: ${f(report.gapsAndUnmeasuredSeconds / 3600)} hours.`, '',
    '| Stage | Status | Attempts | Measured active wall seconds |', '|---|---|---:|---:|',
    ...stageRows.map(s => `| ${s.stage} | ${s.status} | ${s.attempts.length} | ${f(s.measuredAttemptWallSeconds)} |`), '',
    ...stageRows.filter(s => s.timing && s.stage.includes('policies')).map(s => `${s.stage}: ${s.timing.rows} positions, ${s.timing.calls} policy calls; ${f(s.timing.committedWorkerSeconds)} committed worker seconds, ${s.timing.firstCalls} first calls across restarts, ${s.timing.untimedRows} rows without durable timing.`), '',
    ...stageRows.filter(s => s.stage === 'reviews' && s.timing).map(s => `Reviews: ${s.timing.completed} selected games completed, ${s.timing.reusedReviews} reused and ${s.timing.newlyCompletedReviews} newly completed. New work took ${f(s.timing.newWorkerSeconds)} worker seconds; ${s.timing.recoveredTimings} timing records were recovered from journals.`), '',
    `${report.notes} The JSON retains code fingerprints, aggregate timings and every stage attempt, including failures.`, '',
  ]
  fs.writeFileSync(join(out, 'runtime.md'), md.join('\n'))
}
const shutdown = async () => {
  if (stopping) return
  stopping = true
  if (!locked) process.exit(130)
  state.status = 'interrupted'
  if (state.currentStage) state.stages[state.currentStage].status = 'interrupted'
  state.failure = { stage: state.currentStage, transient: true, reason: 'coordinator interrupted' }; save()
  await terminateJobs([...active.values()]); finishSession('interrupted'); save(); writeRuntime(); release(); process.exit(130)
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
let tick
try {
  await acquire()
  if (migrating) {
    unchanged(); save(); writeRuntime()
    console.log(JSON.stringify({ status: 'migrated-pre-effects', protocolManifestSha256, protocolSha256,
      preservedStages: Object.keys(state.stages).length, preservedAttempts: Object.values(state.stages).reduce((n, s) => n + s.attempts.length, 0) }))
  } else {
  if (state.status === 'complete') {
    const valid = stages.every(s => {
      try { return state.stages[s.name].status === 'complete' && JSON.stringify(state.stages[s.name].outputs) === JSON.stringify(outputSignatures(s)) }
      catch { return false }
    })
    if (!valid) { state.status = 'ready'; save() }
  }
  if (state.status === 'complete') { writeRuntime(); console.log(JSON.stringify(publicState(state))); process.exitCode = 0 }
  else {
    if (state.status === 'failed' && state.failure?.transient === false) throw new Error('the previous run stopped on a substantive failure; inspect its private logs before a reviewed restart')
    for (const s of state.sessions.filter(s => !s.finishedAt)) s.status = 'interrupted-duration-unknown'
    session = { executionId, startedAt: now(), status: 'running' }; state.sessions.push(session)
    state.status = 'running'; delete state.failure; save()
    tick = setInterval(() => {
      for (const job of active.values()) {
        try { readProgress(job) } catch { /* progress is optional; worker outcome and cache validation still decide completion */ }
      }
      console.log(JSON.stringify(publicState(state)))
    }, 30000)
    let redo = false
    for (const stage of stages) {
      unchanged()
      await cleanReviewWorkers()
      const record = state.stages[stage.name]
      if (!redo && record.status === 'complete') {
        try { if (JSON.stringify(record.outputs) === JSON.stringify(outputSignatures(stage))) continue } catch { /* missing output: rerun this stage */ }
      }
      redo = true
      state.currentStage = stage.name; record.status = 'running'; record.activeSince = now(); save()
      if (stage.name === 'reviews' && !record.reviewBefore) { record.reviewBefore = existingReviews(); save() }
      console.log(JSON.stringify({ stage: stage.name, status: 'starting', workers: stage.commands.length }))
      let success = false
      for (let retry = 0; retry < 2 && !success; retry++) {
        unchanged()
        await cleanReviewWorkers()
        const attempt = { startedAt: now(), executionId, number: record.attempts.length + 1 }
        record.attempts.push(attempt); save()
        let firstFailure = null, cleanup = Promise.resolve()
        const results = await Promise.all(stage.commands.map((spec, slot) => launch(spec, stage.name, slot, attempt.number).then(result => {
          if (!result.ok && !firstFailure) { firstFailure = result; cleanup = terminateJobs([...active.values()]) }
          return result
        })))
        await cleanup
        // A sibling may reveal a substantive failure after the first worker
        // was interrupted. Such a failure always blocks the retry.
        firstFailure = results.find(r => !r.ok && !r.transient) ?? firstFailure
        attempt.finishedAt = now(); attempt.seconds = secondsSince(attempt.startedAt); attempt.results = results
        unchanged()
        if (!firstFailure) { success = true; attempt.status = 'complete'; save(); break }
        attempt.status = 'failed'; save()
        if (stopping) throw new Error('run interrupted')
        if (!firstFailure.transient || retry === 1) {
          state.failure = { stage: stage.name, transient: firstFailure.transient,
            reason: firstFailure.groupSurvives ? 'a worker process group survived its leader; no retry or later stage will start' : firstFailure.transient ? 'interruption retries exhausted' : 'worker failed; details are in private logs' }
          throw new Error(state.failure.reason)
        }
        console.log(JSON.stringify({ stage: stage.name, status: 'retrying-interrupted-workers', retry: retry + 1 }))
      }
      if (stage.policy) record.timing = await policyTiming(stage.policy)
      if (stage.name === 'reviews') record.timing = reviewTiming(record)
      record.outputs = outputSignatures(stage); record.status = 'complete'; record.finishedAt = now(); record.activeSince = null
      save(); console.log(JSON.stringify({ stage: stage.name, status: 'complete', timing: record.timing ?? null }))
    }
    unchanged()
    state.status = 'complete'; state.currentStage = null; state.finishedAt = now(); delete state.failure; finishSession('complete'); save(); writeRuntime()
    console.log(JSON.stringify(publicState(state)))
  }
  }
} catch (e) {
  if (!stopping) {
    if (!locked) {
      fs.appendFileSync(join(home, 'phase2-supervisor-errors.log'), `${now()} ${e.stack ?? e.message}\n`)
      console.error('phase-2 coordinator could not acquire its lock; another run or unverifiable worker may still be active'); process.exitCode = 1
    }
    else if (migrating) {
      fs.appendFileSync(join(home, 'phase2-supervisor-errors.log'), `${now()} ${e.stack ?? e.message}\n`)
      console.error('pre-effect migration failed; no worker was started'); process.exitCode = 1
    } else {
      await terminateJobs([...active.values()])
      state.status = 'failed'
      if (state.currentStage) state.stages[state.currentStage].status = 'failed'
      state.failure ??= { stage: state.currentStage, transient: false, reason: 'supervisor validation failed; details are in its private log' }
      fs.appendFileSync(join(home, 'phase2-supervisor-errors.log'), `${now()} ${e.stack ?? e.message}\n`)
      finishSession('failed'); save(); writeRuntime()
      console.error(state.failure.reason)
      process.exitCode = 1
    }
  }
} finally {
  clearInterval(tick)
  process.off('SIGINT', shutdown); process.off('SIGTERM', shutdown)
  release()
}
