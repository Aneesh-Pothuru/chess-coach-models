// The coaching task's truth check, in code, with review-writer's reading of a text
// (truth.mjs). In a coaching text, every move, square and number it names must be in
// the coaching sheet the writer was given (coach-prompts.mjs); every piece it places on
// a square must stand there in a position the sheet's lines pass through, with the
// owner it gives; a line may be said to start only with a move a line in the sheet
// starts with; and a mate or a tactic it names (fork, pin, skewer, discovered attack,
// trapped piece, sacrifice, deflection, decoy, double check, smothered or back-rank mate,
// promotion) must be one the sheet names.
//
//   bridge/run.sh projects/coach-eval/coach-check.mjs --sheets <sheets.jsonl,...> --texts <texts.jsonl> --name <name>
//
// Writes private/coach-eval/coach-check-<name>.jsonl (one row a text) and .json (pass
// rates and median length by writer).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../bridge/lib/chess.mjs'
import { MATE, MOVE, NUMBER, NUMBER_WORDS, OWNED, PIECE_ON, SQUARE, TACTICS, bare, verdictOf, walk } from '../review-writer/truth.mjs'
import { coachSheetOf } from './coach-prompts.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const DIR = privateDir('coach-eval')

export const COACH_TACTICS = {
  ...TACTICS,
  sacrifice: /\bsacrific(?:e|es|ed|ing)\b/i,
  deflection: /\bdeflect(?:s|ed|ing|ion)?\b/i,
  decoy: /\b(?:decoy|decoys|lure|lures|lured|luring|attraction)\b/i,
  doubleCheck: /\bdouble[- ]check(?:s)?\b/i,
  smothered: /\bsmother(?:s|ed|ing)?\b/i,
  backRank: /\bback[- ]rank\b/i,
  promotion: /\bpromot(?:e|es|ed|ing|ion)\b/i,
  removingTheDefender: /\bremov(?:e|es|ed|ing) the defender\b/i,
}

const flip = (fen) => {
  const f = fen.split(' ')
  f[1] = f[1] === 'w' ? 'b' : 'w'
  f[3] = '-'
  return f.join(' ')
}

/** Everything a coaching sheet lets a text name, and the positions it is about. */
export function coachVocabularyOf(s) {
  const given = coachSheetOf(s)
  const joined = JSON.stringify(given)
  const moves = new Set([...joined.matchAll(MOVE)].map((x) => bare(x[0])))
  const squares = new Set([...joined.matchAll(SQUARE)].map((x) => x[0]))
  for (const m of moves) for (const sq of m.match(/[a-h][1-8]/g) ?? []) squares.add(sq)
  const numbers = new Set([...joined.matchAll(NUMBER)].map((x) => Number(x[0])))
  for (const [word, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`, 'i').test(joined)) numbers.add(n)
  const positions = [...walk(s.fen, [])]
  const lines = []
  for (const c of given.candidates_that_fail) {
    const line = [c.move, ...c.the_line_after_it.map((p) => p.move)]
    positions.push(...walk(s.fen, line))
    lines.push(line, line.slice(1))
  }
  const better = given.better_move.the_line.map((p) => p.move)
  positions.push(...walk(s.fen, better))
  lines.push(better)
  if (s.their_threat?.line?.length) {
    positions.push(...walk(flip(s.fen), s.their_threat.line))
    lines.push(s.their_threat.line)
  }
  const starts = new Set(lines.flatMap((l) => l.slice(0, 2)).map(bare))
  const stated = new Set([...joined.matchAll(PIECE_ON)].map((x) => `${x[1].toLowerCase()}@${x[2]}`))
  const ownerOf = (word) => (word.toLowerCase() === 'your' ? 'your' : 'their')
  const owned = new Set([...joined.matchAll(OWNED)].map((x) => `${ownerOf(x[1])}|${x[2].toLowerCase()}@${x[3]}`))
  const tactics = new Set(Object.entries(COACH_TACTICS).filter(([, re]) => re.test(joined)).map(([name]) => name))
  return { moves, squares, numbers, positions, stated, mate: MATE.test(joined), mover: s.you_play === 'White' ? 'w' : 'b', near: positions, starts, tactics, owned }
}

if (process.argv[1]?.endsWith('coach-check.mjs')) {
  const sheets = new Map((arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip).map((s) => [s.id, s]))
  const texts = readJsonl(arg('texts'))
  const name = arg('name')
  if (!name) throw new Error('usage: coach-check.mjs --sheets <a.jsonl,...> --texts <texts.jsonl> --name <name>')
  const words = (t) => t.split(/\s+/).filter(Boolean).length
  const rows = []
  const byWriter = {}
  for (const t of texts) {
    const s = sheets.get(t.id)
    if (!s) throw new Error(`no coaching sheet for ${t.id}`)
    const misses = verdictOf(t.text ?? '', coachVocabularyOf(s), COACH_TACTICS)
    rows.push({ id: t.id, writer: t.writer, pass: misses.length === 0, misses, words: words(t.text ?? '') })
    const w = (byWriter[t.writer] ??= { texts: 0, passed: 0, words: [] })
    w.texts++
    w.passed += misses.length === 0 ? 1 : 0
    w.words.push(words(t.text ?? ''))
  }
  for (const w of Object.values(byWriter)) {
    w.passRate = w.texts ? Math.round((w.passed / w.texts) * 10000) / 10000 : null
    const sorted = [...w.words].sort((a, b) => a - b)
    w.medianWords = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null
    delete w.words
  }
  writeFileSync(join(DIR, `coach-check-${name}.jsonl`), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  writeFileSync(join(DIR, `coach-check-${name}.json`), JSON.stringify({ name, texts: rows.length, byWriter }, null, 2) + '\n')
  console.log(JSON.stringify({ name, texts: rows.length, byWriter }))
}
