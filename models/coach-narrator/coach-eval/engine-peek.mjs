// Prints the app engine's root evaluation and best lines for a position, to check a
// coaching sheet's line against the engine directly.
//
//   bridge/run.sh models/coach-narrator/coach-eval/engine-peek.mjs "<fen>"
import { CHESS_DIR, chess } from '../../../bridge/lib/chess.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
try {
  const start = position(process.argv[2])
  const lines = async (label) => {
    const set = await engine.bestMoves(start, { budget: 'deep', multiPv: 3, cache: 'bypass', priority: 'batch' })
    console.log(label, 'complete', set.complete, 'depth', set.depth, 'lines', set.lines.length)
    for (const l of set.lines) console.log('  line', JSON.stringify({ score: l.score, pv: l.pv.slice(0, 6) }))
  }
  await lines('bestMoves first')
  const root = await engine.evaluate(start, 'deep', { cache: 'bypass', priority: 'batch' })
  console.log('evaluate', JSON.stringify({ score: root.score, best: root.best, pv: root.pv.slice(0, 6) }))
  await lines('bestMoves after evaluate')
  await lines('bestMoves again')
} finally {
  engine.dispose()
}
process.exit(0)
