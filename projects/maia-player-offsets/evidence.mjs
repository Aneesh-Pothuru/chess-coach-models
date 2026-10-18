// Run the app's routine-review service in a fresh nice-10 process per game.
// The project-local adapter disables all per-game app caches and tablebases.
// Two workers, atomic private documents, resumable with a provenance lock.
//
//   bridge/run.sh projects/maia-player-offsets/evidence.mjs --benchmark
//   bridge/run.sh projects/maia-player-offsets/evidence.mjs --full
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { getPriority } from 'node:os'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'

const home = privateDir('maia-player-offsets')
const args = process.argv.slice(2)
if (args.length !== 1 || !['--benchmark', '--full'].includes(args[0])) throw new Error('usage: evidence.mjs --benchmark|--full')
const mode = args[0].slice(2)
const casesFile = join(home, mode === 'benchmark' ? 'benchmark-cases.json' : 'held-cases.json')
if (!existsSync(casesFile)) throw new Error('run prepare.mjs before evidence.mjs')
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
const prepared = read(join(home, 'prepare.json'))
const actualCommit = execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (actualCommit !== pin.commit || prepared.app !== pin.commit || prepared.records !== pin.records) throw new Error('evidence requires preparation and checkout at the pinned commits')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const runner = join(LAB_DIR, 'projects/maia-player-offsets/review-one.mts')
const evidenceRoot = join(home, 'evidence')
const routine = join(evidenceRoot, 'routine')
mkdirSync(routine, { recursive: true })
const manifest = {
  schema: 'maia-player-offsets-evidence/2', app: pin.commit, records: pin.records,
  profile: 'routine', runnerSha256: sha256(readFileSync(runner)),
  predecessorBuilderSha256: sha256(readFileSync(join(LAB_DIR, 'projects/accuracy-vs-chesscom/build-evidence.mjs'))),
  appCliSha256: sha256(readFileSync(join(CHESS_DIR, 'src/cli/commands/review.ts'))),
  heldCasesSha256: sha256(readFileSync(join(home, 'held-cases.json'))),
  benchmarkCasesSha256: sha256(readFileSync(join(home, 'benchmark-cases.json'))),
  gamesSha256: sha256(readFileSync(join(home, 'games.json'))),
  adapter: { archiveKeyCache: false, reviews: false, evalCache: false, tablebase: false, pool: 1, freshProcessPerGame: true },
  departure: 'The CLI keeps reviews even with --no-cache and enables tablebases. The same app archive conversion and review service are called directly with private output, review/eval/key caches disabled, and tablebases disabled.',
}
const manifestFile = join(evidenceRoot, 'manifest.json')
if (existsSync(manifestFile)) {
  if (JSON.stringify(read(manifestFile)) !== JSON.stringify(manifest)) throw new Error('evidence provenance or case selection changed; keep stale evidence separate before rebuilding')
} else {
  if (readdirSync(routine).length) throw new Error('existing routine evidence has no provenance manifest; keep it separate before rebuilding')
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n')
}
const selected = read(casesFile)
const coordinatorPriority = getPriority()
const timingFile = join(routine, '_timing.jsonl')
const startsFile = join(routine, '_starts.jsonl')
const readLines = (file) => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : []
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
const stop = () => { for (const pid of running) kill(pid); process.exit(130) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

async function one({ c, index }) {
  const log = openSync(join(home, `review-${mode}-${String(index).padStart(3, '0')}.log`), 'a')
  appendFileSync(startsFile, JSON.stringify({ id: c.id, mode, startedMs: Date.now(), coordinatorPriority, niceIncrement: 10 }) + '\n')
  const t0 = performance.now()
  const result = await new Promise((resolve) => {
    const child = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), runner,
      '--cases', casesFile, '--index', String(index), '--out', routine], {
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
if (failed) process.exitCode = 1
