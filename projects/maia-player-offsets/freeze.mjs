// Freeze approved content before effects; never use a lab branch commit as provenance.
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const project = fileURLToPath(new URL('.', import.meta.url))
const root = resolve(project, '../..')
const read = path => JSON.parse(fs.readFileSync(path, 'utf8'))
const hash = path => createHash('sha256').update(fs.readFileSync(path)).digest('hex')
const statePath = resolve(root, 'private/maia-player-offsets/phase2-run.json')
if (fs.existsSync(statePath)) {
  const state = read(statePath)
  if (!['ready', 'interrupted', 'failed'].includes(state.status) || state.jobs.length || state.stages.fit.attempts.length)
    throw new Error('stop all work and freeze content before any fit attempt')
}
for (const file of ['offsets.json', 'offsets.md']) {
  if (fs.existsSync(resolve(project, 'results', file))) throw new Error('cannot freeze after a result exists')
}
const pin = read(resolve(root, 'bridge/chess.json'))
const phase1 = read(resolve(project, 'results/phase1.json'))
const protocolFile = 'projects/maia-player-offsets/protocol.md'
const protocolHash = hash(resolve(root, protocolFile))
if (protocolHash !== phase1.provenance.sourceHashes['projects/maia-player-offsets/README.md'])
  throw new Error('protocol text must match the approved all-held-games phase-1 report')
const sourceFiles = [
  'bridge/chess.json', 'bridge/run.sh', 'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs',
  'projects/maia-rating-offset/positions.mts', 'projects/accuracy-vs-chesscom/build-evidence.mjs',
  ...['run-phase2.mjs', 'prepare.mjs', 'design.mjs', 'io.mjs', 'policies.mts', 'weights.mts',
    'evidence.mjs', 'review-one.mts', 'events.mjs', 'fit.mjs', 'protocol.md'].map(f => `projects/maia-player-offsets/${f}`),
]
for (const file of ['design.mjs', 'fit.mjs', 'events.mjs', 'policies.mts', 'review-one.mts']) {
  const relative = `projects/maia-player-offsets/${file}`
  if (hash(resolve(root, relative)) !== phase1.provenance.sourceHashes[relative])
    throw new Error('a fixed instrument or analysis file changed after phase 1')
}
const manifest = {
  schema: 'maia-player-offsets-protocol/1', app: pin.commit, records: pin.records,
  protocol: { file: protocolFile, sha256: protocolHash },
  sources: Object.fromEntries(sourceFiles.map(file => [file, hash(resolve(root, file))])),
}
fs.writeFileSync(resolve(project, 'protocol-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('Wrote the protocol content manifest; commit it before migration or execution.')
