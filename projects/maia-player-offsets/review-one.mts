// One routine review, through the app's archive and review service. This is
// the CLI's game lookup/conversion and review call, with private storage and
// tablebases disabled; no app instrument is implemented here.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { CHESS_DIR, LAB_DIR, chess } from '../../bridge/lib/chess.mjs'

const args = process.argv.slice(2)
const option = (name: string) => { const i = args.indexOf(name); if (i < 0 || args[i + 1] === undefined) throw new Error(`missing ${name}`); return args[i + 1] }
const casesFile = resolve(option('--cases'))
const index = Number(option('--index'))
const out = resolve(option('--out'))
const home = join(LAB_DIR, 'private/maia-player-offsets')
if (!casesFile.startsWith(home + '/') || out !== join(home, 'evidence/routine')) throw new Error('review files must stay in this project private directory')
const cases = JSON.parse(readFileSync(casesFile, 'utf8'))
if (!Number.isInteger(index) || index < 0 || index >= cases.length) throw new Error('invalid case index')
const c = cases[index]
if (!/^\d+$/.test(c.id) || c.game !== `cc:${c.id}`) throw new Error('invalid case identifier')
const { nodeArchive, playerName } = await chess('src/adapters/node/archive/index.ts')
const { rowToGame } = await chess('src/services/archive/index.ts')
const { createNodeReview } = await chess('src/adapters/node/review/index.ts')
const archive = nodeArchive({ root: CHESS_DIR, keyCache: false })
const record = await archive.getGame(c.game, { completeness: 'any' })
const row = record ? await archive.getAnalysis(record.id) : null
if (!row) throw new Error('selected case has no analyzed archive row')
const game = rowToGame(row, playerName(CHESS_DIR))
if (!game || game.id !== c.game || game.me !== c.playerColor) throw new Error('archive game differs from selected case')
const node = createNodeReview({ root: CHESS_DIR, reviews: false, evalCache: false, tablebase: false, pool: 1 })
try {
  const doc = await node.service.review(game, { profile: 'routine', playerColor: game.me ?? 'w' }).result
  if (!doc || doc.schema !== 'game-review/2' || doc.id !== c.game || doc.provenance?.profile !== 'routine' || !Array.isArray(doc.records) || doc.fens?.length !== doc.records.length + 1) throw new Error('review did not produce a complete routine document')
  const file = join(out, `${c.id}.json`)
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(doc))
  renameSync(temporary, file)
  console.log(JSON.stringify({ complete: true, plies: doc.records.length }))
} finally {
  node.dispose()
}
process.exit(0)
