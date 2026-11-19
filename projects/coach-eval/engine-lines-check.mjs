// Checks the app engine's multi-line search against its single-line search: for each
// position, whether the best line's moves after the first agree with the single-line
// search's, and when they differ, whether the multi-line continuation gives material
// away at once (its second move leaves a piece en prise that the single-line second
// move does not). It reads positions from moments files and prints counts.
//
//   bridge/run.sh projects/coach-eval/engine-lines-check.mjs --moments <a.jsonl,...> --limit 60
import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position, child } = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const moments = (arg('moments') ?? '').split(',').filter(Boolean).flatMap((p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
const limit = Number(arg('limit', '60'))
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const opts = { cache: 'bypass', priority: 'batch' }
const counts = { positions: 0, sameFirst: 0, sameSecond: 0, differ: 0, suspicious: 0 }
try {
  for (const m of moments.slice(0, limit)) {
    const start = position(m.fen)
    const single = await engine.evaluate(start, 'deep', opts)
    const multi = await engine.bestMoves(start, { budget: 'deep', multiPv: 3, ...opts })
    const line = multi.lines[0]
    counts.positions++
    if (!line?.pv?.length || !single.pv?.length || line.pv[0] !== single.pv[0]) continue
    counts.sameFirst++
    if (line.pv[1] === single.pv[1]) {
      counts.sameSecond++
      continue
    }
    counts.differ++
    const after1 = new Chess(m.fen)
    after1.move({ from: line.pv[0].slice(0, 2), to: line.pv[0].slice(2, 4), promotion: line.pv[0][4] })
    const replyTo = (uci) => {
      const b = new Chess(after1.fen())
      b.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
      return b.fen()
    }
    const mover = after1.turn()
    const loose = (fen) => K.hangingPieces(fen, mover).reduce((s, h) => s + ({ p: 1, n: 3, b: 3, r: 5, q: 9 }[h.piece] ?? 0), 0)
    const a = line.pv[1] ? loose(replyTo(line.pv[1])) : 0
    const b = single.pv[1] ? loose(replyTo(single.pv[1])) : 0
    const evalMulti = line.pv[1] ? await engine.evaluate(child(child(start, line.pv[0]), line.pv[1]), 'sweep', opts) : null
    const evalSingle = single.pv[1] ? await engine.evaluate(child(child(start, single.pv[0]), single.pv[1]), 'sweep', opts) : null
    const cp = (r) => (r?.score?.mate != null ? Math.sign(r.score.mate) * 10000 : r?.score?.cp ?? 0)
    const gap = Math.abs(cp(evalMulti) - cp(evalSingle))
    if (a > b + 2 || gap > 300) {
      counts.suspicious++
      console.log(JSON.stringify({ fen: m.fen, multi: line.pv.slice(0, 4), single: single.pv.slice(0, 4), looseAfterMulti: a, looseAfterSingle: b, scoreAfterMulti: evalMulti?.score, scoreAfterSingle: evalSingle?.score }))
    }
  }
} finally {
  engine.dispose()
}
console.log(JSON.stringify(counts))
process.exit(0)
