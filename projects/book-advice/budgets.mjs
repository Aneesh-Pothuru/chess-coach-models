// The app's engine budgets the tests name (check, grade, verify, best, plan),
// in nodes, at the app commit they measured, so the paper prints the budgets
// they ran at whatever the pin is when it is generated.
//
//   bridge/run.sh projects/book-advice/budgets.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'

const E = await chess('src/services/engine/index.ts')
const NAMES = ['check', 'grade', 'verify', 'best', 'plan']
const out = { app: CHESS_DIR.split('/').pop(), nodes: Object.fromEntries(NAMES.map((b) => [b, E.BUDGETS[b].node.nodes])) }
writeFileSync(join(resultsDir('book-advice'), 'budgets.json'), JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(out))
