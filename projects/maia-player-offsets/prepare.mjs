// Rebuild the predecessor's exact moves and halves, changing only its private
// output directory. Copy the frozen punish cases and count their overlap.
// No policy probabilities or outcomes are scored in this phase.
//
//   bridge/run.sh projects/maia-player-offsets/prepare.mjs
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR, chess, privateDir, records } from '../../bridge/lib/chess.mjs'

const FLOW = 'maia-player-offsets'
const home = privateDir(FLOW)
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const hash = (text) => createHash('sha256').update(text).digest('hex')
const write = (name, value) => writeFileSync(join(home, name), JSON.stringify(value, null, 2) + '\n')
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const pinFile = join(LAB_DIR, 'bridge/chess.json')
const pin = read(pinFile)
const recordRoot = records()
const commit = (root) => execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert(commit(CHESS_DIR) === pin.commit, 'prepare requires the pinned app checkout')
assert(commit(recordRoot) === pin.records, 'prepare requires the pinned records checkout')

const sourceFile = join(LAB_DIR, 'projects/maia-rating-offset/positions.mts')
const source = readFileSync(sourceFile, 'utf8')
const oldDirectory = "privateDir('maia-rating-offset')"
assert(source.split(oldDirectory).length === 2, 'expected one predecessor output-directory expression')
const redirected = source.replace(oldDirectory, `privateDir('${FLOW}')`)
const copy = join(home, 'rebuild-positions.mts')
writeFileSync(copy, redirected)
const started = performance.now()
const build = spawnSync('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), copy], {
  cwd: LAB_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
})
const seconds = (performance.now() - started) / 1000
writeFileSync(join(home, 'positions.stdout.log'), build.stdout ?? '')
writeFileSync(join(home, 'positions.stderr.log'), build.stderr ?? '')
assert(!build.error && build.status === 0, 'positions rebuild failed; see private positions logs')
const positionsCounts = JSON.parse(build.stdout)
const games = read(join(home, 'games.json'))
const { gameIdOf } = await chess('src/services/archive/index.ts')
const gameById = new Map(games.map((g) => [gameIdOf(String(g.id)), g]))
assert(gameById.size === games.length, 'duplicate archive games')
const casesFile = join(recordRoot, 'evals/accuracy-vs-chesscom/cases.json')
const eventsFile = join(recordRoot, 'evals/maia-punish/events.json')
const frozen = read(casesFile)
const cases = frozen.map((c) => ({
  id: String(c.id), game: c.game, playerColor: c.playerColor,
  myRating: c.myRating, oppRating: c.oppRating, plies: c.plies,
}))
assert(new Set(cases.map((c) => c.id)).size === cases.length, 'duplicate frozen cases')
assert(cases.every((c) => c.game === `cc:${c.id}`), 'frozen case identifiers do not use the expected archive namespace')
const overlap = { fit: 0, held: 0, unmatched: 0 }
let ratingMismatch = 0
let sideMismatch = 0
for (const c of cases) {
  const g = gameById.get(c.game)
  overlap[g?.half ?? 'unmatched']++
  if (!g) continue
  if (g.me !== c.playerColor) sideMismatch++
  const myRating = c.playerColor === 'w' ? g.white : g.black
  const oppRating = c.playerColor === 'w' ? g.black : g.white
  if (myRating !== c.myRating || oppRating !== c.oppRating) ratingMismatch++
}
assert(sideMismatch === 0 && ratingMismatch === 0, 'frozen case side or ratings differ from the pinned archive')
const held = cases.filter((c) => gameById.get(c.game)?.half === 'held')
const sorted = [...held].sort((a, b) => a.plies - b.plies || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
assert(sorted.length >= 2, 'need at least two matched held-out cases for the timing slice')
const benchmark = [0.25, 0.75].map((q) => sorted[Math.round(q * (sorted.length - 1))])
assert(new Set(benchmark.map((c) => c.id)).size === 2, 'timing quantiles did not select distinct cases')
write('cases.json', cases)
write('held-cases.json', held)
write('benchmark-cases.json', benchmark)

// Counts only: never read q, E1, E2 or the played-move probability here.
const events = read(eventsFile).events
const blank = () => ({ events: 0, exact: 0, games: new Set(), directions: {
  'player-err': { events: 0, exact: 0, games: new Set() },
  'opp-err': { events: 0, exact: 0, games: new Set() },
} })
const eventOverlap = { fit: blank(), held: blank(), unmatched: blank() }
for (const e of events) {
  const half = gameById.get(`cc:${e.game}`)?.half ?? 'unmatched'
  const row = eventOverlap[half]
  const direction = row.directions[e.dir]
  assert(direction, 'unknown recorded punish direction')
  for (const x of [row, direction]) {
    x.events++
    x.exact += Number(Boolean(e.inExact))
    x.games.add(String(e.game))
  }
}
for (const row of Object.values(eventOverlap)) {
  row.games = row.games.size
  for (const direction of Object.values(row.directions)) direction.games = direction.games.size
}
const report = {
  phase: 1,
  app: pin.commit,
  records: pin.records,
  sources: {
    positions: { file: 'projects/maia-rating-offset/positions.mts', sha256: hash(source) },
    redirectedPositions: { substitution: `${oldDirectory} -> privateDir('${FLOW}')`, sha256: hash(redirected) },
    pin: { file: 'bridge/chess.json', sha256: hash(readFileSync(pinFile)) },
    frozenCases: { file: 'evals/accuracy-vs-chesscom/cases.json', sha256: hash(readFileSync(casesFile)) },
    recordedEvents: { file: 'evals/maia-punish/events.json', sha256: hash(readFileSync(eventsFile)) },
  },
  positions: positionsCounts,
  positionsSeconds: seconds,
  frozenCases: { total: cases.length, overlap, ratingMismatch, sideMismatch },
  recordedEvents: eventOverlap,
  benchmark: { cases: benchmark.length, quantiles: [0.25, 0.75], plies: benchmark.map((c) => c.plies), heldPlies: held.reduce((n, c) => n + c.plies, 0) },
}
write('prepare.json', report)
console.log(JSON.stringify(report, null, 2))
