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

export async function readRow(eng, row, timing) {
  const pos = C.position(row.fen)
  const board = K.tryBoard(row.fen)
  if (!board) throw new Error('invalid FEN')
  const legal = board.moves().map(m => `${m.from}${m.to}${m.promotion ?? ''}`)
  if (!legal.includes(row.A) || row.ruleMoves.some(m => !legal.includes(m))) throw new Error('illegal candidate')
  const times = { maiaSeconds: 0, engineSeconds: 0, tablebaseSeconds: 0, maiaCalls: 1,
    maiaBands: row.band === 1300 ? 1 : 2, bestCalls: 0, scoreCalls: 0, tablebaseCalls: 0, tablebaseUnavailable: 0 }
  let start = performance.now()
  const h = await eng.humanPolicy(pos, { bands: [...new Set([row.band, 1300])], opponentBand: row.opponentBand })
  times.maiaSeconds += (performance.now() - start) / 1000
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
    const tb = await eng.tablebase(pos)
    times.tablebaseSeconds += (performance.now() - start) / 1000
    times.tablebaseCalls++
    times.tablebaseUnavailable += Number(tb === null)
    if (!timing) {
      sound = Object.fromEntries(Object.entries({ R, N, A: row.A }).map(([k, uci]) => [k, tablebaseSound(tb, uci)]))
      evidence = { source: 'tablebase', probe: tb }
    }
  } else {
    start = performance.now()
    const best = await eng.bestMoves(pos, { budget: 'grade', multiPv: 1, priority: 'batch', cache: 'bypass' })
    times.bestCalls++
    const readings = {}
    for (const uci of moves) {
      readings[uci] = await eng.scoreMove(pos, uci, { budget: 'grade', priority: 'batch', cache: 'bypass' })
      times.scoreCalls++
    }
    times.engineSeconds += (performance.now() - start) / 1000
    for (const [uci, r] of Object.entries(readings)) {
      validateScores(r, best)
      if (r.best !== uci && r.pv[0] !== uci) throw new Error('scoreMove did not score its requested root')
    }
    if (!timing) {
      sound = Object.fromEntries(Object.entries({ R, N, A: row.A }).map(([k, uci]) => [k, engineSound(readings[uci], best, row.fen.split(' ')[1])]))
      evidence = { source: 'stockfish', best, readings }
    }
  }
  // This branch is deliberately before soundness, adoption, win% and split derivation.
  if (timing) return { key: rowKey(row), times }
  const move = board.findUci(R)
  return { ...row, R, N, sound, probabilityRAtHisBand: h.bands.find(b => b.band === 1300).policy[R],
    probabilityRAtMoverBand: policy[R], splits: { ...row.splits, forcing: Boolean(move.captured) || board.child(move).inCheck() },
    evidence, times }
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
  if (!Number.isInteger(pool) || pool < 1 || pool > (timing ? 2 : 3)) throw new Error('worker limit exceeded')
  if (pool > 1) {
    if (args.includes('--shard')) throw new Error('choose pool or shard')
    const base = args.filter((_, i) => i !== args.indexOf('--pool') && i !== args.indexOf('--pool') + 1)
    await Promise.all(Array.from({ length: pool }, (_, i) => new Promise((ok, fail) => {
      const p = spawn('nice', ['-n', '10', join(LAB_DIR, 'bridge/run.sh'), fileURLToPath(import.meta.url), ...base, '--shard', `${i}/${pool}`], { stdio: 'inherit' })
      p.on('error', fail); p.on('exit', code => code === 0 ? ok() : fail(new Error(`worker ${i} exited ${code}`)))
    })))
    return
  }
  const [shard, shards] = arg('shard', '0/1').split('/').map(Number)
  if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards || shards > (timing ? 2 : 3)) throw new Error('invalid shard')
  const dir = join(privateDir('rules-of-thumb'), run)
  const input = join(dir, `positions-${month}.jsonl.gz`)
  const bytes = readFileSync(input)
  let rows = gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
  const positionManifest = JSON.parse(readFileSync(join(dir, `positions-${month}.json`)))
  if (!positionManifest.complete || positionManifest.app !== PIN || positionManifest.run !== run || positionManifest.month !== month || positionManifest.outputSha256 !== sha(bytes)) throw new Error('position build incomplete or provenance mismatch')
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
  if (!timing) signature.scorerVersion = sha(readFileSync(fileURLToPath(import.meta.url)))
  if (existsSync(manifestPath)) {
    const previous = JSON.parse(readFileSync(manifestPath))
    for (const [k, v] of Object.entries(signature)) if (previous[k] !== v) throw new Error(`resume mismatch: ${k}`)
  } else if (existsSync(path)) throw new Error('journal has no provenance manifest')
  const doneRows = journal(path)
  const done = new Set(doneRows.map(r => r.key ?? rowKey(r)))
  if (done.size !== doneRows.length || doneRows.some(r => !rows.some(x => rowKey(x) === (r.key ?? rowKey(r))))) throw new Error('duplicate or foreign journal row')
  atomic(manifestPath, { ...signature, complete: false, expectedRows: rows.length, rows: done.size })
  const tb = Node.nodeTablebase({ cacheFile: join(dir, `tablebase-${shard}-of-${shards}.json`) })
  const eng = Node.createNodeEngine({ root: CHESS_DIR, pool: 1, tablebase: tb, evalCache: false })
  const started = performance.now()
  try {
    for (const row of rows) {
      if (done.has(rowKey(row))) continue
      const result = await readRow(eng, row, timing)
      appendFileSync(path, JSON.stringify(result) + '\n')
      doneRows.push(result); done.add(rowKey(row))
      if (done.size % 10 === 0) console.error(JSON.stringify({ stage: timing ? 'timing' : 'score', month, shard, rows: done.size, seconds: (performance.now() - started) / 1000 }))
    }
  } finally { eng.dispose() }
  const totals = {}
  for (const r of doneRows) for (const [k, v] of Object.entries(r.times)) totals[k] = (totals[k] ?? 0) + v
  atomic(manifestPath, { ...signature, complete: done.size === rows.length, expectedRows: rows.length, rows: done.size, totals,
    budgetNodes: E.BUDGETS.grade.node.nodes, acceptWindowWp: E.ACCEPT_WINDOW_WP,
    data: 'Lichess rated standard 600+0, both ratings 1250..1649, July slice or fixed monthly scan',
    workerSecondsThisInvocation: (performance.now() - started) / 1000 })
  console.log(JSON.stringify({ month, shard, timing, rows: done.size, totals }))
}
if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main()
