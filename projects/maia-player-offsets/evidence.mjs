// Run the app's routine-review service in a fresh nice-10 process per game.
// The project-local adapter disables all per-game app caches and tablebases.
// Two workers, atomic private documents, resumable with a provenance lock.
//
//   bridge/run.sh projects/maia-player-offsets/evidence.mjs --benchmark
//   bridge/run.sh projects/maia-player-offsets/evidence.mjs --full
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, statSync, truncateSync, unlinkSync, writeFileSync } from 'node:fs'
import { getPriority } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CHESS_DIR, LAB_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'

const home = privateDir('maia-player-offsets')
const args = process.argv.slice(2)
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const marker = (pid) => {
  try { return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null }
  catch { return null }
}
const alive = (pid) => {
  if (!Number.isInteger(pid) || pid < 2) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
const knownAlive = (pid, started) => alive(pid) && typeof started === 'string' && started.length > 0 && marker(pid) === started
const groupAlive = (pid) => {
  if (!Number.isInteger(pid) || pid < 2) return false
  try { process.kill(-pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}
const workerJournal = join(home, 'evidence-worker-groups.jsonl')
const runner = join(LAB_DIR, 'projects/maia-player-offsets/review-one.mts')
// The lightweight child records its group before importing any review code.
// A coordinator killed before registration cannot leave an unrecorded engine:
// the child checks that coordinator's identity after its journal append.
if (args[0] === '--worker') {
  if (args.length !== 2 || !resolve(args[1]).startsWith(join(home, 'evidence-worker-launches') + '/')) throw new Error('invalid private review launch')
  const launch = read(resolve(args[1]))
  const pid = Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim())
  const pidStarted = marker(pid)
  if (!Number.isInteger(pid) || pid < 2 || !pidStarted) throw new Error('cannot establish review worker group identity')
  appendFileSync(workerJournal, JSON.stringify({ pid, pidStarted, startedAt: new Date().toISOString(),
    coordinatorPid: launch.coordinatorPid, coordinatorStarted: launch.coordinatorStarted,
    executionId: launch.executionId, workerPid: process.pid, workerPriority: getPriority() }) + '\n')
  if (!knownAlive(launch.coordinatorPid, launch.coordinatorStarted)) process.exit(130)
  const ownerFile = join(home, 'evidence-coordinator.lock')
  if (!existsSync(ownerFile) || read(ownerFile).executionId !== launch.executionId) process.exit(130)
  process.argv = [process.argv[0], runner, '--cases', launch.casesFile, '--index', String(launch.index), '--out', launch.routine]
  await import(pathToFileURL(runner).href)
  process.exit(0)
}
if (args.length !== 1 || !['--benchmark', '--full'].includes(args[0])) throw new Error('usage: evidence.mjs --benchmark|--full')
const executionId = randomUUID(), coordinatorStarted = marker(process.pid)
if (!coordinatorStarted) throw new Error('cannot establish evidence coordinator identity')
const coordinatorLock = join(home, 'evidence-coordinator.lock')
if (existsSync(coordinatorLock)) {
  const old = read(coordinatorLock)
  if (knownAlive(old.pid, old.pidStarted)) throw new Error('another evidence coordinator is still running')
  if (alive(old.pid) && (!old.pidStarted || marker(old.pid) === null)) throw new Error('previous evidence coordinator identity is ambiguous')
  unlinkSync(coordinatorLock)
}
const lock = openSync(coordinatorLock, 'wx')
writeFileSync(lock, JSON.stringify({ pid: process.pid, pidStarted: coordinatorStarted, executionId }) + '\n')
closeSync(lock)
const release = () => { try { if (read(coordinatorLock).executionId === executionId) unlinkSync(coordinatorLock) } catch { /* already released */ } }
const mode = args[0].slice(2)
const casesFile = join(home, mode === 'benchmark' ? 'benchmark-cases.json' : 'held-cases.json')
if (!existsSync(casesFile)) throw new Error('run prepare.mjs before evidence.mjs')
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
const prepared = read(join(home, 'prepare.json'))
const actualCommit = execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (actualCommit !== pin.commit || prepared.app !== pin.commit || prepared.records !== pin.records) throw new Error('evidence requires preparation and checkout at the pinned commits')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const evidenceRoot = join(home, 'evidence')
const routine = join(evidenceRoot, 'routine')
mkdirSync(routine, { recursive: true })
const heldCases = read(join(home, 'held-cases.json'))
const frozenHeldCases = read(join(home, 'frozen-held-cases.json'))
const games = read(join(home, 'games.json'))
const { gameIdOf } = await chess('src/services/archive/index.ts')
const expectedHeld = games.filter((g) => g.half === 'held').map((g) => {
  const game = gameIdOf(String(g.id))
  return { id: game.slice(3), game, playerColor: g.me,
    myRating: g.me === 'w' ? g.white : g.black,
    oppRating: g.me === 'w' ? g.black : g.white, plies: g.plies }
})
const heldByGame = new Map(heldCases.map((c) => [c.game, c]))
if (heldByGame.size !== expectedHeld.length || heldCases.length !== expectedHeld.length || expectedHeld.some((c) => JSON.stringify(heldByGame.get(c.game)) !== JSON.stringify(c))) throw new Error('guard cases must cover every held-out game with unchanged attributes')
if (!frozenHeldCases.length || new Set(frozenHeldCases.map((c) => c.game)).size !== frozenHeldCases.length || frozenHeldCases.some((c) => JSON.stringify(heldByGame.get(c.game)) !== JSON.stringify(c))) throw new Error('historical frozen held cases are not an exact subset of the full guard')
const manifest = {
  schema: 'maia-player-offsets-evidence/3', app: pin.commit, records: pin.records,
  profile: 'routine', runnerSha256: sha256(readFileSync(runner)),
  predecessorBuilderSha256: sha256(readFileSync(join(LAB_DIR, 'projects/accuracy-vs-chesscom/build-evidence.mjs'))),
  appCliSha256: sha256(readFileSync(join(CHESS_DIR, 'src/cli/commands/review.ts'))),
  heldCasesSha256: sha256(readFileSync(join(home, 'held-cases.json'))),
  benchmarkCasesSha256: sha256(readFileSync(join(home, 'benchmark-cases.json'))),
  gamesSha256: sha256(readFileSync(join(home, 'games.json'))),
  adapter: { archiveKeyCache: false, reviews: false, evalCache: false, tablebase: false, pool: 1, freshProcessPerGame: true },
  departure: 'The CLI keeps reviews even with --no-cache and enables tablebases. The same app archive conversion and review service are called directly with private output, review/eval/key caches disabled, and tablebases disabled.',
  frozenHeldCasesSha256: sha256(readFileSync(join(home, 'frozen-held-cases.json'))),
  coverage: { selection: 'all-held-out-games', games: heldCases.length, sourceHalf: 'held', includesZeroCountGames: true },
}
const manifestFile = join(evidenceRoot, 'manifest.json')
if (existsSync(manifestFile)) {
  const previous = read(manifestFile)
  if (JSON.stringify(previous) !== JSON.stringify(manifest)) {
    // The only permitted migration widens the original frozen held-out guard
    // to every held-out game. All review inputs and instruments stay fixed.
    const { frozenHeldCasesSha256, coverage, ...expectedPrevious } = manifest
    expectedPrevious.schema = 'maia-player-offsets-evidence/2'
    expectedPrevious.heldCasesSha256 = frozenHeldCasesSha256
    if (previous.schema !== expectedPrevious.schema || JSON.stringify(previous) !== JSON.stringify(expectedPrevious) || frozenHeldCases.length >= heldCases.length) throw new Error('evidence provenance changed beyond the approved held-out coverage expansion')
    const backup = join(evidenceRoot, 'manifest-v2-frozen-held.json')
    const oldText = readFileSync(manifestFile, 'utf8')
    if (existsSync(backup) && readFileSync(backup, 'utf8') !== oldText) throw new Error('existing prior evidence manifest differs')
    if (!existsSync(backup)) writeFileSync(backup, oldText)
    const temporary = `${manifestFile}.tmp`
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + '\n')
    renameSync(temporary, manifestFile)
    console.error(`evidence coverage expanded from ${frozenHeldCases.length} to ${heldCases.length} held-out games; existing documents retained`)
  }
} else {
  if (readdirSync(routine).length) throw new Error('existing routine evidence has no provenance manifest; keep it separate before rebuilding')
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
}
const selected = read(casesFile)
const coordinatorPriority = getPriority()
const timingFile = join(routine, '_timing.jsonl')
const startsFile = join(routine, '_starts.jsonl')
const readLines = (file) => {
  if (!existsSync(file)) return []
  const data = readFileSync(file, 'utf8'), end = data.lastIndexOf('\n') + 1
  // An interrupted journal append commits only through its final newline.
  if (end !== data.length) truncateSync(file, Buffer.byteLength(data.slice(0, end)))
  return data.slice(0, end).split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
// Only groups whose recorded leader identity still matches may be stopped.
// A live competing coordinator is never killed. A missing live identity is
// an error, not permission to signal a possibly unrelated process.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const staleWorkers = []
for (const group of readLines(workerJournal)) {
  if (!alive(group.pid)) {
    if (groupAlive(group.pid)) throw new Error('an old review process group survives without its verified leader; no new reviews started')
    continue
  }
  const currentMarker = marker(group.pid)
  if (!group.pidStarted || !currentMarker) throw new Error('a live review worker group has ambiguous identity')
  if (currentMarker !== group.pidStarted) continue
  if (knownAlive(group.coordinatorPid, group.coordinatorStarted)) throw new Error('review workers belong to a live evidence coordinator')
  if (alive(group.coordinatorPid) && (!group.coordinatorStarted || marker(group.coordinatorPid) === null)) throw new Error('a review worker coordinator has ambiguous identity')
  staleWorkers.push(group)
}
for (const group of staleWorkers) { try { process.kill(-group.pid, 'SIGTERM') } catch { /* already closed */ } }
for (let n = 0; n < 20 && staleWorkers.some((g) => knownAlive(g.pid, g.pidStarted)); n++) await wait(250)
for (const group of staleWorkers.filter((g) => knownAlive(g.pid, g.pidStarted))) { try { process.kill(-group.pid, 'SIGKILL') } catch { /* already closed */ } }
for (let n = 0; n < 20 && staleWorkers.some((g) => knownAlive(g.pid, g.pidStarted)); n++) await wait(250)
if (staleWorkers.some((g) => knownAlive(g.pid, g.pidStarted) || groupAlive(g.pid))) throw new Error('old review worker groups did not stop; no new reviews started')
const valid = (c) => {
  try {
    const doc = read(join(routine, `${c.id}.json`))
    return doc.schema === 'game-review/2' && doc.id === c.game && doc.playerColor === c.playerColor && doc.provenance?.profile === 'routine' && Array.isArray(doc.records) && doc.fens?.length === doc.records.length + 1
  } catch { return false }
}
const completed = () => selected.filter(valid).length
// A child may finish the atomic document before this coordinator can append
// its timing. Keep that completed work and recover a labelled estimate from
// the start written before spawn and the document's write time.
const timed = new Set(readLines(timingFile).map((r) => String(r.id)))
const lastStart = new Map(readLines(startsFile).map((r) => [String(r.id), r]))
let recoveredTimings = 0
for (const c of selected.filter(valid)) {
  if (timed.has(c.id)) continue
  const start = lastStart.get(c.id)
  if (!start || !Number.isFinite(start.startedMs)) throw new Error('a completed review has neither timing nor a start journal; its document is retained, but its timing cannot be recovered')
  const file = join(routine, `${c.id}.json`)
  const finishedMs = statSync(file).mtimeMs
  if (finishedMs < start.startedMs) throw new Error('a completed review predates its last journaled start; its timing cannot be recovered')
  const doc = read(file)
  appendFileSync(timingFile, JSON.stringify({
    id: c.id, profile: 'routine', seconds: (finishedMs - start.startedMs) / 1000,
    plies: doc.records.length, build: doc.provenance.build, at: new Date().toISOString(),
    recovered: true, timingBasis: 'start-journal-to-document-mtime; excludes post-write disposal and process exit',
    coordinatorPriority: start.coordinatorPriority, niceIncrement: start.niceIncrement,
  }) + '\n')
  recoveredTimings++
}
const completedBefore = completed()
const todo = selected.map((c, index) => ({ c, index })).filter(({ c }) => !valid(c))
const started = performance.now()
const startedAt = new Date().toISOString()
const TIMEOUT_S = 3600
let next = 0, written = 0, failed = 0
const running = new Set()
const kill = (pid) => { try { process.kill(-pid, 'SIGKILL') } catch { /* already gone */ } }
const stop = () => { for (const pid of running) kill(pid); release(); process.exit(130) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

async function one({ c, index }) {
  const log = openSync(join(home, `review-${mode}-${String(index).padStart(3, '0')}.log`), 'a')
  const launchDir = join(home, 'evidence-worker-launches')
  mkdirSync(launchDir, { recursive: true })
  const launchFile = join(launchDir, `${executionId}-${index}.json`)
  writeFileSync(launchFile, JSON.stringify({ coordinatorPid: process.pid, coordinatorStarted, executionId, casesFile, index, routine }) + '\n')
  appendFileSync(startsFile, JSON.stringify({ id: c.id, mode, startedMs: Date.now(), coordinatorPriority, niceIncrement: 10 }) + '\n')
  const t0 = performance.now()
  const result = await new Promise((resolve) => {
    const child = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), join(LAB_DIR, 'projects/maia-player-offsets/evidence.mjs'), '--worker', launchFile], {
      cwd: LAB_DIR, stdio: ['ignore', log, log], detached: true,
    })
    if (child.pid) running.add(child.pid)
    let timeout = false
    const timer = setTimeout(() => { timeout = true; if (child.pid) kill(child.pid) }, TIMEOUT_S * 1000)
    child.on('error', () => { clearTimeout(timer); if (child.pid) running.delete(child.pid); resolve({ status: null, failure_class: 'start_error' }) })
    child.on('close', (status) => { clearTimeout(timer); if (child.pid) running.delete(child.pid); resolve({ status, failure_class: timeout ? 'timeout' : 'review_error' }) })
  })
  closeSync(log)
  const seconds = (performance.now() - t0) / 1000
  if (result.status === 0 && valid(c)) {
    const doc = read(join(routine, `${c.id}.json`))
    appendFileSync(timingFile, JSON.stringify({ id: c.id, profile: 'routine', seconds, plies: doc.records.length, build: doc.provenance.build, at: new Date().toISOString(), recovered: false, timingBasis: 'spawn-to-child-close', coordinatorPriority, niceIncrement: 10 }) + '\n')
    written++
  } else {
    appendFileSync(join(routine, '_errors.jsonl'), JSON.stringify({ id: c.id, seconds, ...result, at: new Date().toISOString() }) + '\n')
    failed++
  }
}
const progress = () => console.error(`routine evidence ${mode}: ${completedBefore + written}/${selected.length} complete, ${failed} failed, ${Math.round((performance.now() - started) / 1000)} seconds elapsed; game details stay private`)
console.error(`routine evidence: ${completedBefore}/${selected.length} complete; coordinator priority ${coordinatorPriority}, two workers with nice increment 10; private stores; no tablebases`)
const tick = setInterval(progress, 30_000)
async function worker() { while (next < todo.length) await one(todo[next++]) }
await Promise.all(Array.from({ length: Math.min(2, todo.length) }, worker))
clearInterval(tick)
process.off('SIGINT', stop)
process.off('SIGTERM', stop)
progress()
const report = {
  mode, cases: selected.length, concurrency: 2, niceIncrement: 10, coordinatorPriority, timeoutSeconds: TIMEOUT_S,
  app: pin.commit, records: pin.records, completedBefore, completedAfter: completed(), written, failed,
  recoveredTimings, startedAt, finishedAt: new Date().toISOString(),
  seconds: (performance.now() - started) / 1000, status: failed ? 1 : 0,
  sources: manifest,
}
const reportFile = join(home, `evidence-${mode}.json`)
// Keep the original measured batch on a no-op resume. Every invocation is
// still appended below, including cache-only checks and timing recoveries.
if (todo.length || !existsSync(reportFile)) writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n')
appendFileSync(join(home, 'evidence-runs.jsonl'), JSON.stringify(report) + '\n')
console.log(JSON.stringify(report, null, 2))
release()
if (failed) process.exitCode = 1
