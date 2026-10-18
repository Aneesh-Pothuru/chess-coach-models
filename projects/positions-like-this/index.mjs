import { appendFileSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CLOCK_FLOOR,
  MIN_MEN,
  MONTH,
  PROJECT,
  argOf,
  clockBefore,
  gitCommit,
  heldOut,
  linesOf,
  menOf,
  normalBoard,
  normalUci,
  shardOf,
} from './lib.mjs'

const dir = privateDir(PROJECT)

if (process.argv.includes('--summary')) {
  const parts = readdirSync(dir)
    .filter((f) => /^index-\d+-of-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
  const add = (key) => parts.reduce((s, p) => s + p[key], 0)
  const merge = (key) =>
    parts.reduce((acc, p) => {
      for (const [k, v] of Object.entries(p[key])) acc[k] = (acc[k] ?? 0) + v
      return acc
    }, {})
  const summary = {
    app: parts[0].app,
    month: MONTH,
    shards: parts.length,
    games: add('games'),
    indexGames: add('indexGames'),
    heldOutGames: add('heldOutGames'),
    indexPositions: add('indexPositions'),
    heldOutPositions: add('heldOutPositions'),
    plies: add('plies'),
    speeds: merge('speeds'),
    skipped: merge('skipped'),
  }
  writeFileSync(join(resultsDir(PROJECT), 'index.json'), JSON.stringify(summary, null, 2) + '\n')
  console.error(JSON.stringify(summary))
  process.exit(0)
}

const C = await chess('src/core/chess/index.ts')
const K = await chess('src/services/knowledge/index.ts')
const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const tag = `${shard}-of-${shards}`
const source = join(dir, `strong-${MONTH}.jsonl.gz`)

const writer = (name) => {
  const file = join(dir, name)
  rmSync(file, { force: true })
  const lines = []
  return {
    write(line) {
      lines.push(line)
      if (lines.length >= 20000) this.flush()
    },
    flush() {
      if (lines.length) appendFileSync(file, lines.join(''))
      lines.length = 0
    },
  }
}
const index = writer(`index-${tag}.jsonl`)
const held = writer(`heldout-${tag}.jsonl`)

const skipped = {}
const skip = (why) => {
  skipped[why] = (skipped[why] ?? 0) + 1
}
const counts = { games: 0, indexGames: 0, heldOutGames: 0, indexPositions: 0, heldOutPositions: 0, plies: 0 }
const speeds = {}

let gi = -1
for await (const line of linesOf(source)) {
  gi++
  if (gi % shards !== shard) continue
  const g = JSON.parse(line)
  counts.games++
  const out = heldOut(g.id) ? held : index
  if (out === held) counts.heldOutGames++
  else counts.indexGames++
  speeds[g.speed] = (speeds[g.speed] ?? 0) + 1
  const base = Number(String(g.timeControl).split('+')[0])
  const replayed = C.replaySans(C.START_FEN, g.sans)
  if (replayed.ucis.length !== g.sans.length) skip('game: does not replay to the end')
  for (let ply = 0; ply < replayed.ucis.length; ply++) {
    counts.plies++
    const fen = replayed.fens[ply]
    if (ply > 0 && /[+#]$/.test(replayed.sans[ply - 1])) {
      skip('in check')
      continue
    }
    if (menOf(fen) < MIN_MEN) {
      skip('under eight men')
      continue
    }
    const clock = clockBefore(g.clocks, ply, base)
    if (clock === null) {
      skip('no clock')
      continue
    }
    if (clock < CLOCK_FLOOR) {
      skip('clock under the floor')
      continue
    }
    const phase = K.phaseOf(fen)
    if (phase === 'opening') {
      skip('opening')
      continue
    }
    const turn = fen.split(' ')[1]
    const board = normalBoard(fen)
    const move = normalUci(replayed.ucis[ply], turn)
    const piece = board[(move.charCodeAt(1) - 49) * 8 + (move.charCodeAt(0) - 97)]
    out.write(JSON.stringify([gi, ply, board, move, piece, phase === 'endgame' ? 'e' : 'm']) + '\n')
    if (out === held) counts.heldOutPositions++
    else counts.indexPositions++
  }
  if (counts.games % 20000 === 0) console.error(JSON.stringify({ shard: tag, ...counts }))
}

index.flush()
held.flush()
const summary = { app: { commit: gitCommit(CHESS_DIR) }, month: MONTH, shard: tag, ...counts, speeds, skipped }
writeFileSync(join(dir, `index-${tag}.json`), JSON.stringify(summary, null, 2) + '\n')
console.error(JSON.stringify(summary))
