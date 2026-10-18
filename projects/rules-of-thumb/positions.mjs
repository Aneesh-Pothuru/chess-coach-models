// Scan every eligible pre-move position, draw once per game/rule, then cap
// those draws in input file order. Completed games are durable checkpoints.
import { appendFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync, readSync, statSync, truncateSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { createGunzip, createGzip } from 'node:zlib'
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { RULES, emptyRules, bandOf, availabilityOf, splitsOf, drawPosition, cappedRows, phaseOf, boardOf, replayFens } from './detect.mjs'

const APP = JSON.parse(readFileSync(join(LAB_DIR, 'bridge/chess.json'), 'utf8')).commit
const VERSION = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).update(readFileSync(new URL('./detect.mjs', import.meta.url))).digest('hex')
const freshAvailability = () => ({ positions: 0, rules: emptyRules() })
const emptyCounts = () => ({ games: 0, plies: 0, positions: 0, legalMoves: 0, describeMoveCalls: 0, availability: { all: freshAvailability(), byBand: { 1300: freshAvailability(), 1500: freshAvailability() } }, availableGames: emptyRules(), timing: { seconds: 0, describeMoveSeconds: 0, worstPieceSeconds: 0, splitsSeconds: 0 } })

/** Lichess's main line, retaining no comments or headers in position rows. */
export function sansOf(movetext) {
  return movetext.replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ').split(/\s+/).map((x) => x.replace(/^\d+\.+/, '').replace(/[?!]+$/, '')).filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*|\$\d+)$/.test(x))
}

export function buildGame(game, gameIndex, month) {
  const started = performance.now()
  if (!game.id || bandOf(game.whiteElo) === null || bandOf(game.blackElo) === null) throw new Error('invalid kept game metadata')
  const sans = game.moves ?? sansOf(game.movetext)
  const fens = replayFens(sans, game.initialFen)
  if (sans.length < 30 || fens.length !== sans.length + 1) throw new Error(`game at file index ${gameIndex} does not replay completely or has fewer than 30 plies`)
  const counts = emptyCounts()
  counts.games = 1
  counts.plies = sans.length
  const candidates = Object.fromEntries(RULES.map((r) => [r, []]))
  for (let ply = 0; ply < sans.length; ply++) {
    const fen = fens[ply]
    const phase = phaseOf(fen)
    if (phase !== 'middlegame' && phase !== 'endgame') continue
    const board = boardOf(fen)
    const actual = board.find(sans[ply])
    if (!actual) throw new Error(`cannot resolve played move at file index ${gameIndex}, ply ${ply}`)
    const white = board.turn === 'w'
    const band = bandOf(white ? game.whiteElo : game.blackElo)
    const opponentBand = bandOf(white ? game.blackElo : game.whiteElo)
    const availability = availabilityOf(fen)
    counts.positions++
    counts.legalMoves += availability.legalMoves
    counts.describeMoveCalls += availability.legalMoves
    counts.timing.describeMoveSeconds += availability.describeMoveMs / 1000
    counts.timing.worstPieceSeconds += availability.worstPieceMs / 1000
    counts.availability.all.positions++
    counts.availability.byBand[band].positions++
    const base = { game: game.id, gameIndex, month, band, opponentBand, fen, ply, A: actual.uci }
    for (const rule of RULES) {
      const ruleMoves = availability.ruleMoves[rule]
      if (!ruleMoves.length) continue
      counts.availability.all.rules[rule]++
      counts.availability.byBand[band].rules[rule]++
      candidates[rule].push({ ...base, rule, key: `${month}:${game.id}:${rule}`, ruleMoves })
    }
  }
  const rows = []
  for (const rule of RULES) {
    const chosen = drawPosition(game.id, rule, candidates[rule])
    if (!chosen) continue
    const splitStart = performance.now()
    chosen.splits = splitsOf(chosen.fen)
    counts.timing.splitsSeconds += (performance.now() - splitStart) / 1000
    counts.availableGames[rule]++
    rows.push(chosen)
  }
  counts.timing.seconds = (performance.now() - started) / 1000
  return { gameIndex, counts, rows }
}

function addCounts(total, part) {
  for (const k of ['games', 'plies', 'positions', 'legalMoves', 'describeMoveCalls']) total[k] += part[k]
  for (const k of Object.keys(total.timing)) total.timing[k] += part.timing[k]
  for (const rule of RULES) total.availableGames[rule] += part.availableGames[rule]
  for (const [dest, src] of [[total.availability.all, part.availability.all], ...[1300, 1500].map((b) => [total.availability.byBand[b], part.availability.byBand[b]])]) {
    dest.positions += src.positions
    for (const rule of RULES) dest.rules[rule] += src.rules[rule]
  }
}

async function* jsonLines(path, compressed = path.endsWith('.gz')) {
  const input = createReadStream(path)
  const lines = createInterface({ input: compressed ? input.pipe(createGunzip()) : input, crlfDelay: Infinity })
  for await (const line of lines) if (line) yield JSON.parse(line)
}

async function shaFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

// A killed write may leave a partial last line. Only newline-committed games
// are resumed; the last incomplete game is recomputed.
function trimPartialLine(path) {
  const length = statSync(path).size
  if (!length) return
  const fd = openSync(path, 'r')
  const tail = Buffer.alloc(Math.min(length, 65536))
  let end = length
  let keep = 0
  try {
    while (end > 0) {
      const size = Math.min(end, tail.length)
      const start = end - size
      readSync(fd, tail, 0, size, start)
      const newline = tail.subarray(0, size).lastIndexOf(10)
      if (newline >= 0) { keep = start + newline + 1; break }
      end = start
    }
  } finally { closeSync(fd) }
  if (keep !== length) truncateSync(path, keep)
}

async function worker(config, shard, shards) {
  const journal = join(config.dir, `availability-${config.month}-${shard}of${shards}.jsonl`)
  const metaPath = `${journal}.meta.json`
  const wanted = { app: APP, version: VERSION, inputSha256: config.inputSha256, month: config.month, run: config.run, shard, shards }
  if (existsSync(metaPath)) {
    if (JSON.stringify(JSON.parse(readFileSync(metaPath, 'utf8'))) !== JSON.stringify(wanted)) throw new Error('availability checkpoint metadata changed; use a new run directory after review')
  } else {
    if (existsSync(journal)) throw new Error('availability journal has no metadata')
    writeFileSync(metaPath, JSON.stringify(wanted) + '\n')
  }
  const done = new Set()
  if (existsSync(journal)) {
    trimPartialLine(journal)
    for await (const record of jsonLines(journal, false)) {
      if (done.has(record.gameIndex) || record.gameIndex % shards !== shard) throw new Error('invalid checkpoint order or duplicate')
      done.add(record.gameIndex)
    }
  }
  let index = 0
  let built = 0
  const started = performance.now()
  for await (const game of jsonLines(config.input)) {
    const gameIndex = index++
    if (gameIndex % shards !== shard || done.has(gameIndex)) continue
    const record = buildGame(game, gameIndex, config.month)
    appendFileSync(journal, JSON.stringify(record) + '\n')
    built++
    if (built % 10 === 0) process.stderr.write(`availability ${config.month} shard ${shard}/${shards}: ${built} new games, ${((performance.now() - started) / 1000).toFixed(1)} seconds\n`)
  }
  writeFileSync(`${journal}.complete.json`, JSON.stringify({ ...wanted, inputGames: index, complete: true, built, resumed: done.size, seconds: (performance.now() - started) / 1000 }) + '\n')
}

async function merge(config, shards, wallSeconds) {
  const streams = []
  for (let shard = 0; shard < shards; shard++) {
    const path = join(config.dir, `availability-${config.month}-${shard}of${shards}.jsonl`)
    const complete = JSON.parse(readFileSync(`${path}.complete.json`, 'utf8'))
    if (!complete.complete || complete.inputSha256 !== config.inputSha256 || complete.inputGames !== config.inputGames || complete.version !== VERSION) throw new Error('incomplete or incompatible availability shard')
    const iter = jsonLines(path, false)[Symbol.asyncIterator]()
    streams.push({ iter, item: await iter.next() })
  }
  const counts = emptyCounts()
  const kept = emptyRules()
  const output = join(config.dir, `positions-${config.month}.jsonl.gz`)
  const out = createWriteStream(`${output}.partial`)
  const gzip = createGzip({ level: 6 })
  gzip.pipe(out)
  let expectedIndex = 0
  while (streams.some((s) => !s.item.done)) {
    const next = streams.filter((s) => !s.item.done).sort((a, b) => a.item.value.gameIndex - b.item.value.gameIndex)[0]
    const record = next.item.value
    if (record.gameIndex !== expectedIndex++) throw new Error('missing or duplicate game in availability shards')
    addCounts(counts, record.counts)
    for (const row of cappedRows(record.rows, kept)) {
      if (!gzip.write(JSON.stringify(row) + '\n')) await new Promise((r) => gzip.once('drain', r))
    }
    next.item = await next.iter.next()
  }
  if (expectedIndex !== config.inputGames) throw new Error('availability shards did not scan all input games')
  gzip.end()
  await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); gzip.on('error', reject) })
  renameSync(`${output}.partial`, output)
  const summary = { app: APP, month: config.month, run: config.run, phase: config.run === 'slice' ? 'phase1' : 'phase2', complete: true, outputSha256: await shaFile(output), inputSha256: config.inputSha256, source: `games-${config.month}.jsonl.gz`, scannerVersion: VERSION, shards, capPerRule: 4000, sampling: 'FNV-1a then mulberry32; key game id + NUL + rule id; one uniform index in chronological eligible positions', ...counts, kept, keptPositions: Object.values(kept).reduce((a, b) => a + b, 0), wallSeconds }
  writeFileSync(join(config.dir, `positions-${config.month}.json`), JSON.stringify(summary, null, 2) + '\n')
  process.stderr.write(JSON.stringify({ app: APP, month: config.month, run: config.run, games: counts.games, positions: counts.positions, legalMoves: counts.legalMoves, keptPositions: summary.keptPositions, timing: counts.timing, wallSeconds }) + '\n')
}

async function main() {
  const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1] }
  const run = arg('run', 'slice')
  const month = arg('month', '2026-07')
  const fullApproved = process.argv.includes('--phase2-reviewed')
  if (!['slice', 'full'].includes(run)) throw new Error('--run must be slice or full')
  if (run === 'slice' && month !== '2026-07') throw new Error('phase 1 reads July only')
  if (run === 'full' && !fullApproved) throw new Error('full scan needs reviewer answers and --phase2-reviewed')
  if (!['2026-07', '2026-08', '2026-09'].includes(month)) throw new Error('month outside the fixed rule')
  if (resolve(CHESS_DIR) !== resolve(join(LAB_DIR, '.cache/chess', APP))) throw new Error('position scan requires the pinned checkout')
  const dir = join(privateDir('rules-of-thumb'), run)
  mkdirSync(dir, { recursive: true })
  const input = join(dir, `games-${month}.jsonl.gz`)
  const source = JSON.parse(readFileSync(join(dir, `games-${month}.json`), 'utf8'))
  if (!source.complete || source.app !== APP || source.run !== run || source.month !== month) throw new Error('input stream manifest is incomplete or incompatible')
  let inputGames = 0
  for await (const _ of jsonLines(input)) inputGames++
  if (source.kept !== inputGames) throw new Error('input stream manifest count differs from file')
  if (inputGames > (run === 'slice' ? 500 : 30000)) throw new Error('game count exceeds this run cap')
  const config = { run, month, dir, input, inputGames, inputSha256: await shaFile(input) }
  const pool = Number(arg('pool', '1'))
  const explicitShard = arg('shard', null)
  const maxPool = run === 'slice' ? 2 : 3
  if (!Number.isInteger(pool) || pool < 1 || pool > maxPool) throw new Error(`--pool must be 1 through ${maxPool}`)
  if (explicitShard) {
    const [shard, shards] = explicitShard.split('/').map(Number)
    if (!Number.isInteger(shards) || shards < 1 || shards > maxPool || !Number.isInteger(shard) || shard < 0 || shard >= shards) throw new Error('invalid --shard i/n')
    await worker(config, shard, shards)
    return
  }
  const started = performance.now()
  if (process.argv.includes('--merge')) {
    await merge(config, pool, 0)
    return
  }
  if (pool === 1) await worker(config, 0, 1)
  else await Promise.all(Array.from({ length: pool }, (_, shard) => new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), fileURLToPath(import.meta.url), '--run', run, '--month', month, '--shard', `${shard}/${pool}`, ...(fullApproved ? ['--phase2-reviewed'] : [])], { cwd: LAB_DIR, stdio: 'inherit', env: process.env })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`availability shard ${shard} exited ${code}`)))
  })))
  await merge(config, pool, (performance.now() - started) / 1000)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
