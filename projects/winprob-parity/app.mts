// The app's win% for the evaluations parity.py sends on stdin:
// {"cp": [...], "mate": [...]} in, the same keys out as White's win%, 0-100.
import { readFileSync } from 'node:fs'
import { chess } from '../../bridge/lib/chess.mjs'

const { winPercent } = await chess('src/core/score/index.ts')
const input = JSON.parse(readFileSync(0, 'utf8')) as { cp: number[]; mate: number[] }

process.stdout.write(
  JSON.stringify({
    cp: input.cp.map((cp) => winPercent({ kind: 'cp', cp })),
    mate: input.mate.map((mate) => winPercent({ kind: 'mate', mate })),
  }),
)
