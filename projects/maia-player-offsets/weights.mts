// Fetch only the app's pinned and checksum-checked Maia weights into this clone.
import fs from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'
import { dir } from './io.mjs'
const { ensureMaiaWeights, maiaCacheDir, maiaWeightsFile, sha256Of } = await chess('src/adapters/node/engine/index.ts')
const { MAIA_MODEL } = await chess('src/services/engine/index.ts')
const cache = maiaCacheDir(CHESS_DIR), wasCached = fs.existsSync(maiaWeightsFile(cache))
const start = performance.now()
const file = await ensureMaiaWeights({ dir: cache })
const sha256 = await sha256Of(file)
if (sha256 !== MAIA_MODEL.sha256) throw new Error('weights checksum differs from pinned app')
const report = { wasCached, bytes: fs.statSync(file).size, sha256, seconds: (performance.now() - start) / 1000 }
fs.writeFileSync(join(dir, 'weights.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
