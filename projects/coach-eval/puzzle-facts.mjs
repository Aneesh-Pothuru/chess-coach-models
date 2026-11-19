// Puzzles as review moments, read with the app's own code. A puzzle is a position
// and a solution line: `--set course` reads private/coach-eval/course-puzzles/
// puzzles.json, collected from the owner's courses without their explanations and
// never committed; `--set lichess` reads lichess_puzzles.py's sample of the Lichess
// puzzle database.
// For each, the engine reads the position and the move after the solution's first
// move, and keeps the puzzle only when that move holds (it gives away less than the
// inaccuracy bar against the engine's own best). Maia-2 at the player's band names
// the moves a player at his level most likely plays there; the first of them that
// the engine grades an inaccuracy or worse becomes the moment's move played, and the
// solution's first move its better move, with the engine's line after it (a puzzle's
// own line stops at the winning capture). The moment then gets Game Review's facts: teachMove's
// lesson, the mistake's reading, the better move's purposes and the lesson chapter
// the screen would link. One line a moment, in review-writer's facts shape, under
// private/coach-eval/. Resumes where it stopped.
//
//   bridge/run.sh projects/coach-eval/puzzle-facts.mjs --set course|lichess [--limit N] [--shard i/n]
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Chess } from 'chess.js'
import { CHESS_DIR, chess, privateDir } from '../../bridge/lib/chess.mjs'
import { splitOf } from '../review-writer/lib.mjs'
import { PROJECT } from './lib.mjs'

const { createNodeEngine } = await chess('src/adapters/node/engine/index.ts')
const { position, child } = await chess('src/core/chess/index.ts')
const { teachMove, mistakeOf, movePurposes, phaseOf } = await chess('src/services/knowledge/index.ts')
const { classifyPly } = await chess('src/services/review/index.ts')
const { defaultMaiaElo, DEFAULT_LICHESS_OFFSET } = await chess('src/services/engine/index.ts')
const { momentLesson } = await chess('src/services/study/index.ts')
const { readChapters } = await chess('src/adapters/content/study.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const set = arg('set')
if (set !== 'course' && set !== 'lichess') throw new Error('usage: puzzle-facts.mjs --set course|lichess [--limit N] [--shard i/n]')
const limit = Number(arg('limit', '0'))
const [shard, shards] = arg('shard', '0/1').split('/').map(Number)
const PLAYER_CHESSCOM = 1100
const MAIA_CANDIDATES = 4
const BUDGET = 'deep'
const ERRORS = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

const dir = privateDir(PROJECT)
const puzzles = JSON.parse(readFileSync(join(dir, `${set}-puzzles`, 'puzzles.json'), 'utf8')).filter((p) => p.ok)
const suffix = shards > 1 ? `-${shard}of${shards}` : ''
const outPath = join(dir, `puzzle-facts-${set}${suffix}.jsonl`)
const logPath = join(dir, `puzzle-facts-${set}${suffix}.log.jsonl`)
const done = new Set(existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : [])

const study = buildStudyFromDisk(CHESS_DIR)
const chapters = readChapters(study.lessons)
const engine = createNodeEngine({ root: CHESS_DIR, tablebase: false, evalCache: false })
const band = defaultMaiaElo(PLAYER_CHESSCOM, DEFAULT_LICHESS_OFFSET)

function ucisOf(fen, sans) {
  const board = new Chess(fen)
  const out = []
  for (const san of sans) {
    try {
      const m = board.move(san)
      out.push(`${m.from}${m.to}${m.promotion ?? ''}`)
    } catch {
      break
    }
  }
  return out
}

const sanOf = (fen, uci) => {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return null
  }
}

async function momentOf(p) {
  const solution = ucisOf(p.start, p.main)
  if (solution.length === 0) return { skip: 'solution does not replay' }
  const start = position(p.start)
  const mover = p.start.split(' ')[1] === 'w' ? 'w' : 'b'
  const root = await engine.evaluate(start, BUDGET, { cache: 'bypass', priority: 'batch' })
  if (!root.score || !root.best) return { skip: 'no engine verdict' }
  const afterSolution = await engine.evaluate(child(start, solution[0]), BUDGET, { cache: 'bypass', priority: 'batch' })
  const held = classifyPly({ ply: 40, fenAfter: afterSolution.fen, uci: solution[0], bestUci: root.best, before: root.score, after: afterSolution.score, standardStart: false })
  if (ERRORS.has(held.cls)) return { skip: `the solution's first move grades ${held.cls}` }
  const bestPv = afterSolution.pv?.length ? [solution[0], ...afterSolution.pv] : solution
  const hp = await engine.humanPolicy(start, { bands: [band], opponentBand: band })
  if (hp === 'unavailable') throw new Error('Maia-2 is unavailable')
  const likely = Object.entries(hp.bands[0].policy).sort((a, b) => b[1] - a[1]).slice(0, MAIA_CANDIDATES)
  for (const [uci, prob] of likely) {
    if (uci === solution[0]) continue
    const after = await engine.evaluate(child(start, uci), BUDGET, { cache: 'bypass', priority: 'batch' })
    const graded = classifyPly({ ply: 40, fenAfter: after.fen, uci, bestUci: solution[0], before: root.score, after: after.score, standardStart: false })
    if (!ERRORS.has(graded.cls)) continue
    const replyPv = after.pv ?? []
    const lesson = teachMove({
      fenBefore: p.start, uci, bestUci: solution[0], bestPv, replyPv,
      cls: graded.cls, lossPct: graded.lossPct, bestScore: root.score, playedScore: after.score, playerMove: true,
    })
    if (!lesson) return { skip: 'no lesson' }
    const mistake = mistakeOf(p.start, uci, replyPv)
    const fix = movePurposes(p.start, solution[0], { pv: bestPv })
    const reply = replyPv.length ? movePurposes(after.fen, replyPv[0], { pv: replyPv }) : []
    const reading = { mistake: mistake ? { ...mistake, phase: phaseOf(p.start) } : null, fix, reply }
    const match = momentLesson(chapters, reading)
    const id = String(p.id).includes(':') ? String(p.id) : `${set}:${p.id}`
    return {
      moment: {
        game: id, split: splitOf(id), month: set, index: 0, ply: null, moveNumber: Number(p.start.split(' ')[5]) || null,
        mover, rating: PLAYER_CHESSCOM + DEFAULT_LICHESS_OFFSET, opponentRating: null, fen: p.start,
        played: { uci, san: sanOf(p.start, uci), maiaProbability: Math.round(prob * 1000) / 1000 },
        best: { uci: solution[0], san: sanOf(p.start, solution[0]), pv: bestPv, solution },
        cls: graded.cls, lossPct: graded.lossPct, before: root.score, after: after.score, phase: phaseOf(p.start), evidence: 'puzzle', motifs: [],
        reading: {
          mistake: mistake ? { kind: mistake.kind, idea: mistake.idea, ideas: mistake.ideas, piece: mistake.piece, square: mistake.square, points: mistake.points, line: mistake.line } : null,
          fix: fix.map((x) => ({ kind: x.kind, ideas: x.ideas, text: x.text, squares: x.squares })),
          reply: reply.map((x) => ({ kind: x.kind, ideas: x.ideas, text: x.text, squares: x.squares })),
        },
        link: match ? { title: match.title, idea: match.idea, why: null, via: match.via } : null,
        punish: null,
        lesson,
        source: { course: p.course, chapter: p.chapter, title: p.title, themes: p.themes ?? null, rating: p.rating ?? null },
      },
    }
  }
  return { skip: 'no likely move at his level is an error' }
}

let read = 0
let written = 0
const skipped = {}
try {
  for (const [k, p] of puzzles.entries()) {
    if (k % shards !== shard || done.has(p.id)) continue
    if (limit && read >= limit) break
    read++
    const r = await momentOf(p)
    if (r.moment) {
      appendFileSync(outPath, JSON.stringify(r.moment) + '\n')
      written++
    } else {
      skipped[r.skip] = (skipped[r.skip] ?? 0) + 1
    }
    appendFileSync(logPath, JSON.stringify({ id: p.id, kept: !!r.moment, skip: r.skip ?? null }) + '\n')
    if (read % 10 === 0) console.error(`shard ${shard}/${shards}: ${read} read, ${written} moments`)
  }
} finally {
  engine.dispose()
}
console.error(JSON.stringify({ shard: `${shard}/${shards}`, read, written, skipped }))
process.exit(0)
