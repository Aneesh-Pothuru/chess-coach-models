// Fixed-budget, cleared-hash reference on the union of the three common-look
// sets. Phase two only. Each ply is atomic and resumable; shards own games.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess } from '../../bridge/lib/chess.mjs'
import { RULE, PROFILES, ROOT, assert, readJson, writeJson, loadInputs, loadDocuments, commonLooks, referenceIdentity, referencePath, validateReference } from './common.mjs'

const args = process.argv.slice(2)
assert(args.includes('--phase2'), 'reference.mjs requires --phase2; do not run in phase one')
let shard = 0, shards = 1
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--phase2') continue
  assert(args[i] === '--shard' && /^\d+\/[12]$/.test(args[i + 1] ?? ''), 'usage: reference.mjs --phase2 [--shard 0/2|1/2]')
  ;[shard, shards] = args[++i].split('/').map(Number)
}
assert(shard < shards, 'shard index out of range')
const inputs = loadInputs()
assert(CHESS_DIR.endsWith('/' + inputs.pin.commit), 'reference uses the pinned baseline engine')
const documents = loadDocuments(inputs, { timed: true })
const identity = referenceIdentity(inputs)
const manifestPath = join(ROOT, 'reference', 'manifest.json')
if (existsSync(manifestPath)) assert(readJson(manifestPath).signature === identity.signature, 'reference manifest changed; use a new private directory')
else writeJson(manifestPath, identity)
const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { replayGame, positionAt } = await chess('src/services/review/pipeline/replay.ts')
const { gatherDeepEvidence } = await chess('src/services/review/pipeline/evidence.ts')
const { isExactScore } = await chess('src/core/score/index.ts')
const complete = (e) => !!(e?.complete && e.lines?.length && e.lines.every(l => isExactScore(l.score)) && isExactScore(e.played))
const engine = createNodeEngine({ root: CHESS_DIR, pool: 1, evalCache: false, tablebase: false, human: false })
let built = 0, resumed = 0, unresolved = 0
try {
  for (let caseIndex = 0; caseIndex < inputs.cases.length; caseIndex++) {
    if (caseIndex % shards !== shard) continue
    const replay = replayGame(inputs.games[caseIndex].game)
    const indices = [...new Set(PROFILES.flatMap(p => commonLooks(documents[caseIndex], p)))].sort((a, b) => a - b)
    for (const index of indices) {
      const file = referencePath(inputs.cases[caseIndex].id, index)
      if (existsSync(file)) {
        const row = readJson(file)
        validateReference(row, identity, caseIndex, index)
        assert((row.status === 'complete') === complete(row.attempts.at(-1).evidence), 'saved reference completeness differs')
        resumed++
        unresolved += row.status === 'unresolved'
        continue
      }
      const attempts = []
      for (let attempt = 0; attempt < RULE.referenceAttempts; attempt++) {
        const started = performance.now()
        await engine.newGame('analyst')
        const resetMs = performance.now() - started
        const evidence = await gatherDeepEvidence(engine, positionAt(replay, index), replay.played[index].uci, {
          budget: { nodes: RULE.referenceNodes }, multiPv: RULE.referenceMultiPv,
          priority: 'batch', cache: 'refresh',
        })
        attempts.push({ resetMs, seconds: (performance.now() - started) / 1000, evidence })
        if (complete(evidence)) break
      }
      const status = complete(attempts.at(-1).evidence) ? 'complete' : 'unresolved'
      writeJson(file, { signature: identity.signature, caseIndex, index, status, attempts })
      built++
      unresolved += status === 'unresolved'
    }
    console.error(JSON.stringify({ shard: `${shard}/${shards}`, finishedGameOrdinal: caseIndex + 1, built, resumed, unresolved }))
  }
} finally { engine.dispose() }
