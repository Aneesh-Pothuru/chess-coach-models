// Game Review's lesson for each training puzzle, read from its coaching sheet's stored
// search (coach-sheet.mjs --puzzles) with the app's own code and no engine: the grade of
// the move played and the line that answers it, with the answer key carried on as the
// better line. Writes the moments in review-writer's facts shape, so the rewrite task
// can make the training puzzles' prompts (coach-rewrite.mjs).
//
//   bridge/run.sh models/coach-narrator/coach-eval/train-lessons.mjs --sheets <sheets.jsonl,...> --out <moments.jsonl> [--moments <moments.jsonl,...>]
import { readFileSync, writeFileSync } from 'node:fs'
import { chess } from '../../../bridge/lib/chess.mjs'
import { fenAfter } from './coach-lines.mjs'

const { teachMove } = await chess('src/services/knowledge/index.ts')
const { classifyPly } = await chess('src/services/review/index.ts')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const ERRORS = new Set(['inaccuracy', 'mistake', 'blunder', 'miss'])

/** A training sheet's moment with Game Review's lesson, or why it has none. */
export function lessonMoment(s) {
  const m = s.moment
  const search = s.search
  if (!m || !search) return { skip: 'no stored search' }
  const played = search.candidates.find((c) => c.uci === m.played.uci)
  if (!played) return { skip: 'the move played was not searched' }
  const key = m.best.solution
  const bestPv = [...key, ...(search.afterKey?.pv ?? [])]
  const graded = classifyPly({ ply: 40, fenAfter: fenAfter(m.fen, m.played.uci), uci: m.played.uci, bestUci: key[0], before: search.root.score, after: played.score, standardStart: false })
  if (!ERRORS.has(graded.cls)) return { skip: `the move played grades ${graded.cls}` }
  const lesson = teachMove({
    fenBefore: m.fen, uci: m.played.uci, bestUci: key[0], bestPv, replyPv: played.reply,
    cls: graded.cls, lossPct: graded.lossPct, bestScore: search.root.score, playedScore: played.score, playerMove: true,
  })
  if (!lesson) return { skip: 'no lesson' }
  return {
    moment: { ...m, best: { ...m.best, pv: bestPv }, cls: graded.cls, lossPct: graded.lossPct, before: search.root.score, after: played.score, evidence: 'puzzle', lesson },
  }
}

if (process.argv[1]?.endsWith('train-lessons.mjs')) {
  const sheets = (arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip)
  // A sheet that does not carry its moment takes it from --moments.
  const byId = new Map((arg('moments') ?? '').split(',').filter(Boolean).flatMap(readJsonl).map((m) => [`${m.game}:${m.index}`, m]))
  const kept = []
  const skipped = {}
  for (const s of sheets) {
    let r
    try {
      r = lessonMoment(s.moment ? s : { ...s, moment: byId.get(s.id) })
    } catch (e) {
      r = { skip: `error: ${String(e.message ?? e).slice(0, 80)}` }
    }
    if (r.moment) kept.push(r.moment)
    else skipped[r.skip] = (skipped[r.skip] ?? 0) + 1
  }
  writeFileSync(arg('out'), kept.map((m) => JSON.stringify(m)).join('\n') + '\n')
  console.log(JSON.stringify({ sheets: sheets.length, moments: kept.length, skipped }))
  process.exit(0)
}
