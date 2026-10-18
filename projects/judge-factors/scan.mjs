import { appendFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { chess, privateDir } from '../../bridge/lib/chess.mjs'
import { DRILL_FACTORS, PROJECT, READINGS, WORST_PIECE_LEAN, argOf, mulberry32, readJsonl, seedOf, shardOf } from './lib.mjs'

const D = await chess('src/services/publishing/decks/evalDeck.ts')
const { LEAN_CP } = await chess('src/services/exercises/families/judge.ts')
const K = await chess('src/services/knowledge/index.ts')

const MIN_LEGAL_MOVES = 4
const month = argOf('--month')
if (!month) throw new Error('--month is required')
const { i: shard, n: shards } = shardOf(argOf('--shard', '0/1'))
const dir = privateDir(PROJECT)
const games = readJsonl(join(dir, `games-${month}.jsonl.gz`))
if (games.length === 0) throw new Error(`no games for ${month}`)
const out = join(dir, `positions-${month}-${shard}-of-${shards}.jsonl`)
if (existsSync(out)) rmSync(out)

const drops = { notPlayable: 0, materialNotLevel: 0, tactical: 0, noRead: 0, tooEarly: 0 }
let positions = 0
let qualifying = 0

function readingsOf(fen, game) {
  const mine = D.bestExchange(game)
  const flipped = K.flipTurn(fen)
  if (flipped === null) return { drop: 'notPlayable' }
  const theirs = D.bestExchange(new Chess(flipped))
  if (mine.mateInOne || theirs.mateInOne || (mine.bestCapture ?? 0) > D.EVAL_TACTIC_BAR || (theirs.bestCapture ?? 0) > D.EVAL_TACTIC_BAR) return { drop: 'tactical' }
  const read = D.factorsFor(fen, mine.bestCapture, theirs.bestCapture)
  if (!read) return { drop: 'noRead' }
  const facts = K.describePosition(fen)
  const w = facts.side.w.activity.worstPiece
  const b = facts.side.b.activity.worstPiece
  const worstPiece = w && b ? w.moves - b.moves : null
  return { factors: read.factors, worstPiece, mine: mine.bestCapture, theirs: theirs.bestCapture }
}

const leans = (reading, r) => {
  if (reading === 'worstPiece') return r.worstPiece !== null && Math.abs(r.worstPiece) >= WORST_PIECE_LEAN
  return Math.abs(r.factors[reading]) >= LEAN_CP
}

for (let gi = shard; gi < games.length; gi += shards) {
  const g = games[gi]
  const board = new Chess()
  const fens = [board.fen()]
  const ucis = []
  let ok = true
  for (const san of g.sans) {
    try {
      const m = board.move(san)
      ucis.push(m.from + m.to + (m.promotion ?? ''))
    } catch {
      ok = false
      break
    }
    fens.push(board.fen())
  }
  if (!ok) continue
  const candidates = Object.fromEntries(READINGS.map((r) => [r, []]))
  for (let ply = 0; ply < g.sans.length; ply++) {
    positions++
    if (ply < D.EVAL_PLY_FLOOR) {
      drops.tooEarly++
      continue
    }
    const fen = fens[ply]
    const game = new Chess(fen)
    if (game.isGameOver() || game.isCheck() || game.moves().length < MIN_LEGAL_MOVES) {
      drops.notPlayable++
      continue
    }
    if (D.evalMaterialCp(game) !== D.EVAL_MATERIAL_LEVEL_CP) {
      drops.materialNotLevel++
      continue
    }
    const r = readingsOf(fen, game)
    if (r.drop) {
      drops[r.drop]++
      continue
    }
    qualifying++
    const readings = { ...Object.fromEntries(DRILL_FACTORS.map((f) => [f, r.factors[f]])), worstPiece: r.worstPiece }
    for (const reading of READINGS) if (leans(reading, r)) candidates[reading].push({ ply, fen, readings, mine: r.mine, theirs: r.theirs })
  }
  const lines = []
  for (const reading of READINGS) {
    const list = candidates[reading]
    if (list.length === 0) continue
    const pick = list[Math.floor(mulberry32(seedOf(g.id, reading))() * list.length)]
    lines.push(
      JSON.stringify({
        month,
        gi,
        game: g.id,
        reading,
        ply: pick.ply,
        fen: pick.fen,
        ucis: ucis.slice(0, pick.ply),
        whiteElo: g.whiteElo,
        blackElo: g.blackElo,
        result: g.result,
        phase: K.phaseOf(pick.fen),
        readings: pick.readings,
        mine: pick.mine,
        theirs: pick.theirs,
        available: list.length,
      }),
    )
  }
  if (lines.length) appendFileSync(out, lines.join('\n') + '\n')
  if ((gi - shard) % (200 * shards) === 0) console.error(`${month} shard ${shard}/${shards}: game ${gi} of ${games.length}`)
}

writeFileSync(join(dir, `scan-${month}-${shard}-of-${shards}.json`), JSON.stringify({ month, shard, shards, positions, qualifying, drops }) + '\n')
console.error(`${month} shard ${shard}/${shards}: done, ${qualifying} qualifying of ${positions}`)
