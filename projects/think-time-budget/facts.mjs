// Resumable app facts for the same players' fast and slow games.
//
// Run with nice -n 10 bridge/run.sh, at most two shards at once. Each chunk
// is committed atomically under private/think-time-budget/facts/. No error
// rate, think difference or value per minute is computed here.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createGunzip, createGzip } from 'node:zlib'
import { CHESS_DIR, LAB_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { asBlack, parseMovetext, routinePorts, rowOf, setBookExit } from '../think-time-rapid/games.mjs'
import { COLUMNS as PRIOR_COLUMNS, recordsOf } from '../think-time-rapid/moves.mjs'

// Include Node startup and module imports in the observed worker span. The
// bridge shell's checkout lookup happens before this process starts.
const processStartedEpochMs = Math.round(Date.now() - process.uptime() * 1000)
const { primaryFacts } = await chess('src/services/metrics/index.ts')
const { DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP } = await chess('src/services/method/index.ts')
const { RUSHED_SECONDS, CLOCK_BUCKETS, parseTimeControl, thinkTimes } = await chess('src/core/game/index.ts')
const { replayFens } = await chess('src/services/knowledge/index.ts')
const { DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const month = arg('month')
if (!/^\d{4}-\d{2}$/.test(month ?? '')) throw new Error('usage: facts.mjs --month YYYY-MM [--shard i/2] [--check N] [--per-budget N]')
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)
const check = Number(arg('check', '20')) // per budget, per shard
const perBudget = Number(arg('per-budget', '0')) // balanced benchmark only
const chunkSize = Number(arg('chunk-size', '250'))
assert(Number.isInteger(shard) && Number.isInteger(shards) && shards >= 1 && shards <= 2 && shard >= 0 && shard < shards)
assert([check, perBudget].every((x) => Number.isInteger(x) && x >= 0))
assert(Number.isInteger(chunkSize) && chunkSize > 0)
const dir = privateDir('think-time-budget')
const input = arg('input', join(dir, `eligible-${month}.jsonl.gz`))
assert(input.startsWith(`${dir}/`), 'game input must stay under this project private directory')
const pin = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8'))
const appCommit = execFileSync('git', ['-C', CHESS_DIR, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
assert.equal(appCommit, pin.commit, 'this phase measures the pinned app, not a candidate')
const dirty = execFileSync('git', ['-C', CHESS_DIR, 'status', '--porcelain', '--', 'src', 'tools/coach-review/lib'], { encoding: 'utf8' }).trim()
assert.equal(dirty, '', 'app instruments must be unchanged')

// Verify the app's public increment reader and clock rule. The production
// path uses these already; no app change or parallel clock implementation.
assert.deepEqual(parseTimeControl('600+0'), { base: 600, inc: 0 })
assert.deepEqual(parseTimeControl('900+10'), { base: 900, inc: 10 })
assert.deepEqual(thinkTimes([900, 900, 907, 890], parseTimeControl('900+10')), [null, null, 3, 20])
assert.deepEqual(thinkTimes([600, 600, 590, 575], parseTimeControl('600+0')), [null, null, 10, 25])
assert.deepEqual(thinkTimes([600, 600, 611, 599], parseTimeControl('600+10')), [null, null, null, 11])

const hash = (x) => createHash('sha256').update(x).digest('hex')
const codeHash = hash([
  fileURLToPath(import.meta.url),
  join(LAB_DIR, 'projects/think-time-rapid/games.mjs'),
  join(LAB_DIR, 'projects/think-time-rapid/moves.mjs'),
].map((p) => readFileSync(p)).join('\n'))
const inputHash = createHash('sha256')
for await (const chunk of createReadStream(input)) inputHash.update(chunk)
const inputSha256 = inputHash.digest('hex')
// A later frozen cohort must not collide with an earlier timing slice.
// Historical benchmark directories remain available to the cost report.
const outDir = join(dir, perBudget ? `benchmark-${perBudget}-${inputSha256.slice(0, 12)}` : 'facts')
mkdirSync(outDir, { recursive: true })
const identity = { appCommit, inputSha256, codeHash, month, shard, shards, check, perBudget, chunkSize }
const constants = { appCommit, RUSHED_SECONDS, DEEP_THINK_SECONDS, BOOK_END_SECONDS, LEVEL_CP,
  CLOCK_BUCKETS: CLOCK_BUCKETS.map((b) => ({ label: b.label, maxSeconds: Number.isFinite(b.maxSeconds) ? b.maxSeconds : null })),
  DEFAULT_LICHESS_OFFSET }
const constantsPath = join(dir, 'app-constants.json')
if (existsSync(constantsPath)) assert.deepEqual(JSON.parse(readFileSync(constantsPath, 'utf8')), constants, 'app constants changed')
else writeFileSync(constantsPath, JSON.stringify(constants, null, 2) + '\n')

// Additional metadata remains private. The prior row carries all move facts
// unchanged, including rows outside the final move set so that each player's
// first book-end move remains available to define the early candidate.
const COLUMNS = [...PRIOR_COLUMNS, 'player', 'opponent', 'month', 'budget', 'base', 'increment', 'meanRating']
const cell = (v) => v === null || v === undefined ? '' : v === true ? '1' : v === false ? '0' : String(v)
const csvLine = (rec) => COLUMNS.map((c) => {
  const s = cell(rec[c])
  return /[,"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}).join(',') + '\n'
const deps = routinePorts()
const checkedBudget = { fast: 0, slow: 0 }
const selectedBudget = { fast: 0, slow: 0 }
const totals = { gamesRead: 0, gamesSelected: 0, gamesBuilt: 0, timedMoves: 0, blackBuildsChecked: 0, clockMovesChecked: 0, chunksBuilt: 0, chunksResumed: 0,
  budgets: { fast: { games: 0, timedMoves: 0, blackBuildsChecked: 0 }, slow: { games: 0, timedMoves: 0, blackBuildsChecked: 0 } }, skipped: {} }
const add = (summary, resumed) => {
  for (const key of ['gamesBuilt', 'timedMoves', 'blackBuildsChecked', 'clockMovesChecked']) totals[key] += summary[key]
  for (const b of ['fast', 'slow']) for (const key of ['games', 'timedMoves', 'blackBuildsChecked']) totals.budgets[b][key] += summary.budgets[b][key]
  for (const [why, n] of Object.entries(summary.skipped)) totals.skipped[why] = (totals.skipped[why] ?? 0) + n
  for (const b of ['fast', 'slow']) checkedBudget[b] += summary.budgets[b].blackBuildsChecked
  totals[resumed ? 'chunksResumed' : 'chunksBuilt']++
}
const started = Date.now()
let buildSeconds = 0

async function buildChunk(games, index) {
  const stem = `moves-${month}-${shard}of${shards}-${String(index).padStart(6, '0')}`
  const output = join(outDir, `${stem}.csv.gz`)
  const metaPath = join(outDir, `${stem}.json`)
  const chunkHash = hash(JSON.stringify(games))
  if (existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
    assert.deepEqual(meta.identity, identity, 'input, options or code changed; use a fresh facts directory')
    assert.equal(meta.chunkHash, chunkHash, 'input chunk changed')
    assert(existsSync(output), 'chunk metadata without its data')
    add(meta, true)
    return
  }
  const t0 = Date.now()
  const summary = { identity, chunkHash, input: basename(input), chunk: index, gamesSelected: games.length,
    gamesBuilt: 0, timedMoves: 0, blackBuildsChecked: 0, clockMovesChecked: 0,
    budgets: { fast: { games: 0, timedMoves: 0, blackBuildsChecked: 0 }, slow: { games: 0, timedMoves: 0, blackBuildsChecked: 0 } }, skipped: {} }
  const skip = (why) => { summary.skipped[why] = (summary.skipped[why] ?? 0) + 1 }
  const gz = createGzip({ level: 6 })
  const out = createWriteStream(`${output}.partial`)
  const finished = new Promise((resolve, reject) => {
    out.on('finish', resolve); out.on('error', reject); gz.on('error', reject)
  })
  gz.pipe(out)
  gz.write(COLUMNS.join(',') + '\n')
  for (const game of games) {
    assert.equal(game.month, month)
    assert(['fast', 'slow'].includes(game.budget))
    const tc = parseTimeControl(game.tc)
    assert(tc && tc.base >= 600)
    assert(game.budget === 'fast' ? tc.base === 600 && tc.inc === 0 : tc.base + 40 * tc.inc >= 900)
    const moves = parseMovetext(game.movetext)
    // This brief is stricter than the predecessor: even a final mate needs
    // its supplied eval. The predecessor's unreadable() exempts that move.
    if (moves.some((m) => m.eval === null || !Number.isFinite(m.eval))) { skip('an eval missing'); continue }
    if (moves.some((m) => m.clock === null || !Number.isFinite(m.clock))) { skip('a clock missing'); continue }
    if (moves.length < 20) { skip('fewer than 20 plies'); continue }
    const white = primaryFacts(rowOf(game, moves, true), deps)
    if (!white || !white.replayed) { skip('does not replay'); continue }
    if (white.moves.some((m) => m.cls === null)) { skip('not classified'); continue }
    assert.equal(white.tcBase, tc.base)
    assert.equal(white.tcInc, tc.inc)
    setBookExit(white)
    const black = asBlack(white)
    const fens = replayFens(moves.slice(0, (white.bookExitPly ?? 0) + 2).map((m) => m.san))
    const whiteRecords = recordsOf(game, white, fens)
    const blackRecords = recordsOf(game, black, fens)
    const b = game.budget
    if (checkedBudget[b] + summary.budgets[b].blackBuildsChecked < check) {
      const real = primaryFacts(rowOf(game, moves, false), deps)
      assert(real && real.replayed, 'real Black build failed')
      setBookExit(real)
      assert.deepEqual(blackRecords, recordsOf(game, real, fens), 'flipped Black facts differ from a real Black build')
      summary.blackBuildsChecked++
      summary.budgets[b].blackBuildsChecked++
    }
    const appThinks = thinkTimes(moves.map((m) => m.clock), tc)
    for (const rec of [...whiteRecords, ...blackRecords]) {
      assert.equal(rec.think, appThinks[rec.ply], 'move record lost the increment')
      assert.equal(rec.clockBefore, moves[rec.ply - 2].clock, 'clock-before differs from the PGN')
      summary.clockMovesChecked++
    }
    summary.gamesBuilt++
    summary.budgets[b].games++
    for (const [side, recs] of [['white', whiteRecords], ['black', blackRecords]]) {
      if (!game[`${side}Eligible`]) continue
      const other = side === 'white' ? 'black' : 'white'
      assert(typeof game[`${side}Player`] === 'string' && game[`${side}Player`].length > 0)
      assert(Number.isFinite(game[`${side}MeanRating`]))
      for (const rec of recs) {
        const row = { ...rec, player: game[`${side}Player`], opponent: game[`${other}Player`], month, budget: b,
          base: tc.base, increment: tc.inc, meanRating: game[`${side}MeanRating`] }
        if (!gz.write(csvLine(row))) await new Promise((resolve) => gz.once('drain', resolve))
        summary.timedMoves++
        summary.budgets[b].timedMoves++
      }
    }
  }
  gz.end()
  await finished
  renameSync(`${output}.partial`, output)
  summary.seconds = (Date.now() - t0) / 1000
  writeFileSync(`${metaPath}.partial`, JSON.stringify(summary, null, 2) + '\n')
  renameSync(`${metaPath}.partial`, metaPath)
  buildSeconds += summary.seconds
  add(summary, false)
  process.stderr.write(`built chunk ${index}: ${summary.gamesBuilt} games, ${summary.timedMoves} timed moves, ${summary.seconds.toFixed(1)} s\n`)
}

const lines = createInterface({ input: createReadStream(input).pipe(createGunzip()), crlfDelay: Infinity })
let pending = []
let chunkIndex = 0
for await (const line of lines) {
  if (!line) continue
  const i = totals.gamesRead++
  if (i % shards !== shard) continue
  const game = JSON.parse(line)
  assert(['fast', 'slow'].includes(game.budget))
  if (perBudget && selectedBudget[game.budget] >= perBudget) continue
  selectedBudget[game.budget]++
  totals.gamesSelected++
  pending.push(game)
  if (pending.length >= chunkSize) { await buildChunk(pending, chunkIndex++); pending = [] }
  if (perBudget && Object.values(selectedBudget).every((n) => n >= perBudget)) break
}
if (pending.length) await buildChunk(pending, chunkIndex++)
const processEndedEpochMs = Date.now()
const summary = { identity, ...totals, balancedBenchmarkComplete: perBudget ? Object.values(selectedBudget).every((n) => n === perBudget) : null,
  selectedBudget, seconds: (processEndedEpochMs - started) / 1000, buildSeconds,
  processStartedEpochMs, processEndedEpochMs,
  workerElapsedSeconds: (processEndedEpochMs - processStartedEpochMs) / 1000 }
const summaryPath = join(outDir, `build-${month}-${shard}of${shards}.json`)
writeFileSync(`${summaryPath}.partial`, JSON.stringify(summary, null, 2) + '\n')
renameSync(`${summaryPath}.partial`, summaryPath)
process.stderr.write(JSON.stringify(summary) + '\n')
