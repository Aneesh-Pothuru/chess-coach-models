// The coaching task's prompts: a writer is given a moment's coaching sheet
// (coach-sheet.mjs) and asked to coach it the way a puzzle book explains a position:
// what to notice, why the natural move fails, the better move's idea and line, and a
// habit. The sheet the writer reads is trimmed to the facts a text may use, with no
// evaluations or percentages.
//
//   node models/coach-narrator/coach-eval/coach-prompts.mjs --sheets <sheets.jsonl,...> --out <prompts.jsonl>
import { readFileSync, writeFileSync } from 'node:fs'

export const COACH_PROMPT_VERSION = 3

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))

const VERDICT = { best: 'the best move', excellent: 'an excellent move', good: 'a good move', ok: 'a playable move', book: 'a book move', inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder', miss: 'a missed chance' }
const often = (share) => (share >= 0.4 ? 'most players at your level choose it' : share >= 0.15 ? 'many players at your level choose it' : share >= 0.05 ? 'some players at your level choose it' : 'few players at your level choose it')
const lineOf = (moves) => moves.map((p) => ({ move: p.move, by: p.by, ...(p.forced && COACH_PROMPT_VERSION >= 2 ? { how_forced: p.forced } : {}), ...(p.does.length ? { what_it_does: p.does } : {}) }))
const tactics = (xs) => xs.map((x) => (x.text.toLowerCase().includes(x.tactic.toLowerCase()) ? x.text : `${x.tactic}: ${x.text}`))

function failing(c) {
  const w = c.why_not
  return {
    move: c.move,
    ...(c.played ? { this_is_the_move_you_played: true } : {}),
    how_often: often(c.share_of_players_at_your_level),
    verdict: VERDICT[c.verdict] ?? c.verdict,
    what_it_does: c.what_it_does,
    their_reply: w.reply,
    the_line_after_it: lineOf(w.line),
    ...(w.idea.length ? { the_point_of_their_line: tactics(w.idea) } : {}),
    ...(w.also.length ? { what_else_their_line_does: tactics(w.also) } : {}),
    how_it_ends: w.result,
  }
}

/** The facts a writer is given: what to notice, the candidates that fail, and the better move. */
export function coachSheetOf(s) {
  const played = s.candidates.find((c) => c.played)
  const popular = s.candidates.filter((c) => !c.played && c.why_not && c.share_of_players_at_your_level >= 0.15).sort((a, b) => b.share_of_players_at_your_level - a.share_of_players_at_your_level)[0]
  const b = s.better_move
  return {
    you_play: s.you_play,
    your_opponent_plays: s.you_play === 'White' ? 'Black' : 'White',
    player_rating: s.level,
    move_played: s.move_played,
    what_to_notice: s.what_to_notice,
    candidates_that_fail: [played, popular].filter((c) => c?.why_not).map(failing),
    better_move: {
      move: b.move,
      how_often: often(s.candidates.find((c) => c.move === b.move)?.share_of_players_at_your_level ?? 0),
      the_line: lineOf(b.line),
      ...(b.idea.length ? { the_point_of_the_line: tactics(b.idea) } : {}),
      ...(b.also.length ? { what_else_the_line_does: tactics(b.also) } : {}),
      how_it_ends: b.result,
    },
  }
}

export const COACH_SYSTEM = [
  'You are the coach inside a chess training app. The player reached this position and chose a move; you explain the moment the way a good puzzle book explains a position, so the player learns to find such moves themselves.',
  'You are given a coaching sheet. Every fact in it was worked out by a chess engine, a model of how players at this level choose moves, and the app\'s board-reading code.',
  'Write five to eight short sentences, at most 150 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you". Cover these in order, as far as the sheet supports them:',
  '(1) what to notice first: the one or two things in what_to_notice that matter for the better move, such as a loose piece, a boxed-in king or a check you have;',
  '(2) why the natural move fails: for the move you played, and for another candidate in candidates_that_fail if there is one, give their reply and what it does, the key moves of the line after it, and how it ends;',
  '(3) the better move and its idea: name it, give the key moves of its line and what they do, name the point of the line when the sheet gives one, and say how it ends;',
  'The key moves of a line are its checks, its captures and the move that makes its point; leave out the others rather than list every move.',
  ...(COACH_PROMPT_VERSION >= 2 ? [
    COACH_PROMPT_VERSION >= 3
      ? 'Tell a line as a chain of cause and effect, the way a coach thinks it through at the board: which move forces which reply, and what that reply lets the next move do. When the sheet says how forced a reply is, say so in your own words, then say what the next move does, in the sheet\'s words for that move. Call a reply forced only when the sheet says so, and name a tactic only at the move the sheet names it for.'
      : 'Tell a line as a chain of cause and effect, the way a coach thinks it through at the board: which move forces which reply, and what that reply sets up. When the sheet says how forced a reply is, say so in your own words (for example that it is check and the king has to step aside), and then what that lets the next move do (for example that the knight now forks the king and queen). Call a reply forced only when the sheet says so.',
  ] : []),
  '(4) close with one habit for the board, in a sentence of its own: advice to the player, not a claim about the position.',
  'The player plays the side in you_play; call the other side "your opponent" or "they".',
  'Use only the coaching sheet. Name only moves, squares, pieces and numbers that appear in it. Call something a fork, pin, skewer, mate or any other tactic only where the sheet names that tactic for that move, and call it the point or the idea only if it is listed as the point. Keep every fact with the move the sheet gives it to. Never claim a check, a mate, a threat or a material gain the sheet does not state.',
  'Do not mention the engine, percentages, evaluations or how other players choose. Do not use headings, lists or markdown. Write only the explanation.',
].join(' ')

export function coachMessagesOf(sheet) {
  return [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'user', content: `Coaching sheet:\n${JSON.stringify(coachSheetOf(sheet), null, 1)}` },
  ]
}

if (process.argv[1]?.endsWith('coach-prompts.mjs')) {
  const sheets = (arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip)
  const rows = sheets.map((s) => ({ id: s.id, split: s.split ?? null, version: COACH_PROMPT_VERSION, messages: coachMessagesOf(s) }))
  writeFileSync(arg('out'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const chars = rows.map((r) => r.messages.reduce((n, m) => n + m.content.length, 0)).sort((a, b) => a - b)
  console.log(JSON.stringify({ prompts: rows.length, medianChars: chars[Math.floor(chars.length / 2)] ?? 0, version: COACH_PROMPT_VERSION }))
}
