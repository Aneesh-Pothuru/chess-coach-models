// The same frozen cases as build-cases.mjs --frozen, kept in this project's
// private directory. Read games by the CLI's own archive reader. No judgments.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { CHESS_DIR, chess, records, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'

const { nodeArchive, playerName } = await chess('src/adapters/node/archive/index.ts')
const { rowToGame } = await chess('src/services/archive/index.ts')
const { replayGame } = await chess('src/services/review/pipeline/replay.ts')
const { profileSettings } = await chess('src/services/review/profiles.ts')
const { ENGINE_BUILD, NODE_ANALYST_OPTIONS, ANALYST_OPTIONS, tablebaseCovers } = await chess('src/services/engine/index.ts')
const pin = JSON.parse(readFileSync('bridge/chess.json', 'utf8'))
if (!CHESS_DIR.endsWith('/' + pin.commit)) throw new Error('prepare needs the pinned baseline')
const out = privateDir('second-look-fresh')
const raw = readFileSync(join(records(), 'evals/accuracy-vs-chesscom/cases.json'), 'utf8')
const cases = JSON.parse(raw)
if (cases.length !== 60 || new Set(cases.map(c => c.id)).size !== 60) throw new Error('not the frozen sample')
const archive = nodeArchive({ root: CHESS_DIR, keyCache: false })
const username = playerName(CHESS_DIR)
const games = []
const counts = { games: cases.length, plies: 0, positions: 0, nonterminalPositions: 0, tablebasePositions: 0, partialGames: 0, minPlies: Infinity, maxPlies: 0, timeControls: {}, lengths: { short: 0, medium: 0, long: 0 } }
for (const [caseIndex, c] of cases.entries()) {
  const found = await archive.getGame(c.game, { completeness: 'any' })
  const row = found && await archive.getAnalysis(found.id)
  const game = row && rowToGame(row, username)
  if (!game) throw new Error(`case ordinal ${caseIndex + 1} is missing`)
  const replay = replayGame(game)
  if (replay.partial || replay.played.length !== c.plies) throw new Error(`case ordinal ${caseIndex + 1} does not fully replay`)
  games.push({ caseIndex, game })
  const n = replay.played.length
  counts.plies += n
  counts.positions += replay.fens.length
  counts.nonterminalPositions += replay.terminals.filter(t => !t).length
  counts.tablebasePositions += replay.fens.filter(tablebaseCovers).length
  counts.minPlies = Math.min(counts.minPlies, n)
  counts.maxPlies = Math.max(counts.maxPlies, n)
  counts.lengths[n <= 40 ? 'short' : n <= 80 ? 'medium' : 'long']++
  const tc = JSON.stringify(game.timeControl ?? null)
  counts.timeControls[tc] = (counts.timeControls[tc] ?? 0) + 1
}
writeFileSync(join(out, 'cases.json'), raw)
writeFileSync(join(out, 'sample.json'), JSON.stringify(cases.slice(0, 1), null, 2) + '\n')
writeFileSync(join(out, 'games.json'), JSON.stringify(games) + '\n')
const summary = { phase: 1, appCommit: pin.commit, recordsCommit: pin.records, data: 'accuracy-vs-chesscom frozen cases, both players, original order', casesSha256: createHash('sha256').update(raw).digest('hex'), engine: ENGINE_BUILD.id, nodeOptions: NODE_ANALYST_OPTIONS, deviceOptions: ANALYST_OPTIONS, counts, profiles: Object.fromEntries(['phone', 'desktop', 'routine'].map(p => [p, profileSettings(p)])) }
writeFileSync(join(out, 'manifest.json'), JSON.stringify(summary, null, 2) + '\n')
writeFileSync(join(resultsDir('second-look-fresh'), 'counts.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ appCommit: pin.commit, recordsCommit: pin.records, ...counts }))
