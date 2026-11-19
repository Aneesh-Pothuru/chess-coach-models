// Prints the flipped position and the engine's line in it for a FEN, to check the
// coaching sheet's threat reading.
//
//   bridge/run.sh projects/coach-eval/threat-peek.mjs "<fen>"
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position } = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
try {
  const flipped = K.flipTurn(process.argv[2])
  console.log('flipped', flipped)
  if (flipped) {
    const r = await engine.evaluate(position(flipped), 'sweep', { cache: 'bypass', priority: 'batch' })
    console.log('line', JSON.stringify({ score: r.score, pv: r.pv?.slice(0, 8) }))
  }
} finally {
  engine.dispose()
}
process.exit(0)
