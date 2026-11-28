// The coaching task's truth check, in code, with review-writer's reading of a text
// (truth.mjs). In a coaching text, every move, square and number it names must be in
// the coaching sheet the writer was given (coach-prompts.mjs); every piece it places on
// a square must stand there in a position the sheet's lines pass through, with the
// owner it gives; a line may be said to start only with a move a line in the sheet
// starts with; and a mate or a tactic it names (fork, pin, skewer, discovered attack,
// trapped piece, sacrifice, deflection, decoy, double check, smothered or back-rank mate,
// promotion) must be one the sheet names.
//
//   bridge/run.sh models/coach-narrator/coach-eval/coach-check.mjs --sheets <sheets.jsonl,...> --texts <texts.jsonl> --name <name>
//
// Writes private/coach-eval/coach-check-<name>.jsonl (one row a text) and .json (pass
// rates and median length by writer).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../../bridge/lib/chess.mjs'
import { MATE, MOVE, NUMBER, NUMBER_WORDS, OWNED, PIECE_ON, SQUARE, TACTICS, bare, sansOf, verdictOf, walk } from '../review-writer/truth.mjs'
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
  intermezzo: /\b(?:intermezzo|zwischenzug)\b/i,
}

const flip = (fen) => {
  const f = fen.split(' ')
  f[1] = f[1] === 'w' ? 'b' : 'w'
  f[3] = '-'
  return f.join(' ')
}

/**
 * Everything a coaching sheet lets a text name, and the positions it is about. `given`
 * is the facts the writer read, by default coaching prompt's trimmed sheet; the rewrite
 * task passes its own (coach-rewrite.mjs).
 */
export function coachVocabularyOf(s, given = coachSheetOf(s)) {
  const joined = JSON.stringify(given)
  const moves = new Set([...joined.matchAll(MOVE)].map((x) => bare(x[0])))
  const squares = new Set([...joined.matchAll(SQUARE)].map((x) => x[0]))
  for (const m of moves) for (const sq of m.match(/[a-h][1-8]/g) ?? []) squares.add(sq)
  const numbers = new Set([...joined.matchAll(NUMBER)].map((x) => Number(x[0])))
  for (const [word, n] of Object.entries(NUMBER_WORDS)) if (new RegExp(`\\b${word}\\b`, 'i').test(joined)) numbers.add(n)
  // One is what "a", "an" and "the only" say in the facts.
  numbers.add(1)
  // The positions a text may place pieces in: along every line the full sheet holds,
  // and along the app explanation's lines when the writer was given them.
  const positions = [...walk(s.fen, [])]
  const lines = []
  for (const c of s.candidates) {
    if (!c.why_not) continue
    const line = [c.move, ...c.why_not.line.map((p) => p.move)]
    positions.push(...walk(s.fen, line))
    lines.push(line, line.slice(1))
  }
  const better = s.better_move.line.map((p) => p.move)
  positions.push(...walk(s.fen, better))
  lines.push(better)
  if (s.their_threat?.line?.length) {
    positions.push(...walk(flip(s.fen), s.their_threat.line))
    lines.push(s.their_threat.line)
  }
  const app = given.app_explanation
  if (app) {
    // An app line may start with the moves that lead to it (the allowed line with the
    // move played, the better line with the better move) or after them.
    const from = (leads, line) => {
      const i = leads.findIndex((m) => bare(m) === bare(line[0] ?? ''))
      return i >= 0 ? [...leads.slice(0, i), ...line] : [...leads, ...line]
    }
    if (app.what_your_move_allowed) {
      const line = from([s.move_played, app.what_your_move_allowed.move], sansOf(app.what_your_move_allowed.line))
      positions.push(...walk(s.fen, line))
      lines.push(line, line.slice(1))
    }
    if (app.what_the_better_move_does) {
      const line = from([app.what_the_better_move_does.move], sansOf(app.what_the_better_move_does.line))
      positions.push(...walk(s.fen, line))
      lines.push(line)
    }
  }
  // The narration task's lines (coach-rewrite.mjs --task narrate).
  if (given.the_better_line) {
    const line = given.the_better_line.line.map((p) => p.move)
    positions.push(...walk(s.fen, line))
    lines.push(line)
  }
  if (given.the_line_your_move_allowed) {
    const line = [s.move_played, ...given.the_line_your_move_allowed.line.map((p) => p.move)]
    positions.push(...walk(s.fen, line))
    lines.push(line.slice(1))
  }
  // A narrated line's replies, each with whether the rules force it and where it goes,
  // and its mating moves.
  const replies = new Map()
  const mates = new Set()
  for (const story of [given.the_better_line, given.the_line_your_move_allowed]) {
    if (!story?.line?.length) continue
    for (const p of story.line) {
      if (p.move.endsWith('#')) mates.add(bare(p.move))
      if (p.by === story.line[0].by) continue
      replies.set(bare(p.move), { forced: (p.how_forced ?? '').startsWith('forced') || !!p.forced, to: bare(p.move).match(/[a-h][1-8]/g)?.pop() })
    }
  }
  const starts = new Set(lines.flatMap((l) => l.slice(0, 2)).map(bare))
  const stated = new Set([...joined.matchAll(PIECE_ON)].map((x) => `${x[1].toLowerCase()}@${x[2]}`))
  const ownerOf = (word) => (word.toLowerCase() === 'your' ? 'your' : 'their')
  const owned = new Set([...joined.matchAll(OWNED)].map((x) => `${ownerOf(x[1])}|${x[2].toLowerCase()}@${x[3]}`))
  const tactics = new Set(Object.entries(COACH_TACTICS).filter(([, re]) => re.test(joined)).map(([name]) => name))
  // Where the facts put each tactic: the moves its sentence names, or the move it is
  // listed under when it names none, and the squares those moves land on.
  const places = new Map()
  const place = (text, owner) => {
    const named = [...text.matchAll(MOVE)].map((x) => bare(x[0]))
    const at = named.length ? named : owner ? [bare(owner)] : []
    for (const [name, re] of Object.entries(COACH_TACTICS)) {
      if (!at.length || !re.test(text)) continue
      const p = places.get(name) ?? { moves: new Set(), squares: new Set() }
      for (const m of at) {
        p.moves.add(m)
        const to = m.match(/[a-h][1-8]/g)?.pop()
        if (to) p.squares.add(to)
      }
      places.set(name, p)
    }
  }
  const visit = (x, owner) => {
    if (typeof x === 'string') place(x, owner)
    else if (Array.isArray(x)) for (const y of x) visit(y, owner)
    else if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) if (k !== 'move') visit(y, typeof x.move === 'string' ? x.move : owner)
  }
  visit(given, null)
  const narration = !!(given.the_better_line || given.the_line_your_move_allowed)
  const exchangeCosts = []
  for (const story of [given.the_better_line, given.the_line_your_move_allowed, given.story_of_the_better_line, given.story_of_the_line_your_move_allowed]) {
    if (!story) continue
    for (const text of [story.how_it_ends, ...(story.the_point ?? [])]) {
      if (typeof text !== 'string') continue
      for (const m of text.matchAll(/\b(?:wins?|winning|gains?)\s+([^.,;]+?)\s+for\s+([^.,;]+)/gi)) {
        exchangeCosts.push({ gained: m[1].toLowerCase(), cost: m[2].toLowerCase() })
      }
    }
  }
  return { moves, squares, numbers, positions, stated, mate: MATE.test(joined), mover: s.you_play === 'White' ? 'w' : 'b', near: positions, starts, tactics, owned, places, replies, mates, narration, exchangeCosts }
}

const EXCHANGE_COST_WORDS = /\b(?:for|cost(?:s|ing)?|gives? up|giving up|sacrific(?:e|es|ed|ing)|trad(?:e|es|ed|ing)|exchang(?:e|es|ed|ing)|in return for)\b/i
const EXCHANGE_PIECES = ['queen', 'rook', 'bishop', 'knight', 'pawn', 'exchange']

/**
 * Flags a narration that claims to win a piece from an exchange ("wins two rooks")
 * while omitting what the facts say was given up for it ("for the queen").
 */
function omittedExchangeCosts(text, v) {
  if (!v.exchangeCosts?.length) return []
  const low = text.toLowerCase()
  const out = []
  for (const { gained, cost } of v.exchangeCosts) {
    const gainedPieces = EXCHANGE_PIECES.filter((p) => gained.includes(p))
    const costPieces = EXCHANGE_PIECES.filter((p) => cost.includes(p))
    if (!gainedPieces.length || !costPieces.length) continue
    const claimed = gainedPieces.some((p) => new RegExp(`\\b(?:wins?|winning|gains?)\\b[^.!?]{0,35}\\b${p}s?\\b`, 'i').test(low))
    if (claimed && !EXCHANGE_COST_WORDS.test(low) && !costPieces.some((p) => new RegExp(`\\b${p}s?\\b`, 'i').test(low))) {
      out.push(`claims winning ${gained.trim()} while omitting the exchange cost (${cost.trim()})`)
    }
  }
  return out
}

// A clause that says a reply had to be played.
const FORCED_CLAIM = /\b(?:forced|forces|forcing|must|has to|have to|only (?:legal )?(?:move|answer|response|reply)|no (?:other )?choice|because (?:it is|it's|of the) (?:a )?check)\b/i

/**
 * A narrated reply called forced that the facts do not force: a clause that claims it
 * and names the reply, the square it goes to, or (opening on "which" or "it") the move
 * the clause before named.
 */
function unforcedClaims(sentence, v) {
  if (!v.replies?.size) return []
  const out = []
  let before = []
  for (const clause of sentence.split(/,|;|\band\b|\bbut\b/)) {
    const named = [...clause.matchAll(MOVE)].map((x) => bare(x[0]))
    const squares = [...clause.matchAll(SQUARE)].map((x) => x[0])
    const moves = named.length ? named : /^\s*(?:which|that|it)\b/i.test(clause) ? before : []
    if (FORCED_CLAIM.test(clause)) {
      const hits = [...v.replies.entries()].filter(([m, r]) => moves.includes(m) || (r.to && squares.includes(r.to)))
      if (hits.length && hits.every(([, r]) => !r.forced)) out.push(`a reply called forced that the facts do not force: ${hits.map(([m]) => m).join(', ')}`)
    }
    if (named.length) before = named
  }
  return out
}

// A sentence that puts a tactic later in the line ("Re8+ sets up a fork") does not say
// which move carries it out.
const LATER = /\b(?:sets? up|setting up|leads? to|led to|leading to|prepares?|preparing|allows?|allowed|allowing|threat(?:s|en|ens|ened)?|for (?:a|the)|into (?:a|the)|with (?:a|the)|so that|then|next|after that|later|eventually|will|opens? up|paves?|a line (?:where|in which))\b/i

// A sentence that opens on "This move" or "It" goes on about the previous sentence's move.
const BACK = /^(?:this|that|it|which|the move|the check|the capture|the sacrifice)\b/i

const MATE_SHAPES = new Set(['backRank', 'smothered'])

/**
 * A tactic a sentence gives to the wrong move: the sentence names moves, and none of
 * them, nor any square it names, is where the facts put that tactic.
 */
function misplacedTactics(sentence, v, previous = '') {
  if (!v.places || LATER.test(sentence)) return []
  const named = [...sentence.matchAll(MOVE)].map((x) => bare(x[0]))
  if (!named.length) return []
  const moves = BACK.test(sentence.trim()) ? [...named, ...[...previous.matchAll(MOVE)].map((x) => bare(x[0]))] : named
  const squares = [...sentence.matchAll(SQUARE)].map((x) => x[0])
  const out = []
  for (const [name, re] of Object.entries(COACH_TACTICS)) {
    const p = v.places.get(name)
    if (!p || !re.test(sentence)) continue
    if (moves.some((m) => p.moves.has(m)) || squares.some((q) => p.squares.has(q))) continue
    // A mate's shape belongs to its mating move as well as to the move its fact names.
    if (MATE_SHAPES.has(name) && moves.some((m) => v.mates?.has(m))) continue
    out.push(`a ${name} placed at ${named.join(', ')}: the facts give it to ${[...p.moves].join(', ')}`)
  }
  return out
}

/**
 * A coaching text's misses. The closing sentence is the habit, advice to the player
 * rather than a claim about the position, so a tactic it names ("before you sacrifice
 * a piece") is not held to the sheet; its moves, squares and numbers still are. A
 * narration has no habit, so all of it is held to the facts, and a reply it calls
 * forced must be one the rules force.
 */
export function coachVerdictOf(text, v) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/)
  const claims = v.narration || sentences.length === 1 ? sentences : sentences.slice(0, -1)
  const plain = verdictOf(text, v, {})
  const tactics = verdictOf(claims.join(' '), v, COACH_TACTICS).filter((m) => m.startsWith('a ') && m.endsWith('the facts do not name') && !m.startsWith('a mate'))
  const placed = claims.flatMap((x, i) => misplacedTactics(x, v, sentences[i - 1] ?? ''))
  const unforced = v.narration ? sentences.flatMap((x) => unforcedClaims(x, v)) : []
  const costs = omittedExchangeCosts(claims.join(' '), v)
  return [...plain, ...tactics, ...placed, ...unforced, ...costs]
}

if (process.argv[1]?.endsWith('coach-check.mjs')) {
  const sheets = new Map((arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip).map((s) => [s.id, s]))
  const texts = readJsonl(arg('texts'))
  const name = arg('name')
  if (!name) throw new Error('usage: coach-check.mjs --sheets <a.jsonl,...> --texts <texts.jsonl> --name <name> [--prompts <prompts.jsonl,...>]')
  // With --prompts, each text is held to the facts its writer read in its prompt.
  const givenById = new Map((arg('prompts') ?? '').split(',').filter(Boolean).flatMap(readJsonl).map((p) => {
    const user = p.messages.find((m) => m.role === 'user').content
    return [p.id, JSON.parse(user.slice(user.indexOf('\n') + 1))]
  }))
  // A moment read without a sheet (coach-rewrite.mjs --split) is held to the facts its
  // prompt gave alone, from its position (--moments).
  const momentById = new Map((arg('moments') ?? '').split(',').filter(Boolean).flatMap(readJsonl).map((m) => [`${m.game}:${m.index}`, m]))
  const bareSheetOf = (m) => ({ fen: m.fen, you_play: m.mover === 'w' ? 'White' : 'Black', move_played: m.played.san, candidates: [], better_move: { line: [] }, their_threat: null })
  const words = (t) => t.split(/\s+/).filter(Boolean).length
  const rows = []
  const byWriter = {}
  for (const t of texts) {
    const s = sheets.get(t.id) ?? (momentById.has(t.id) && givenById.has(t.id) ? bareSheetOf(momentById.get(t.id)) : null)
    if (!s) throw new Error(`no coaching sheet for ${t.id}`)
    const misses = coachVerdictOf(t.text ?? '', givenById.has(t.id) ? coachVocabularyOf(s, givenById.get(t.id)) : coachVocabularyOf(s))
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
