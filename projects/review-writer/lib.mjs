// What review-writer's scripts share: the split, the moments facts.mjs wrote,
// today's text as the screen shows it, the fact sheet a writer reads and the
// writer's prompt.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROJECT = 'review-writer'
export const PROFILE = 'phone'
export const MONTH = '2026-10'

export function splitOf(id) {
  return createHash('sha256').update(`${PROJECT}:${id}`).digest()[0] < 128 ? 'train' : 'heldout'
}

export const momentId = (m) => `${m.game}:${m.index}`

export function readJsonl(path) {
  return readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

export function readFacts(dir, month = MONTH) {
  const files = readdirSync(dir).filter((f) => f.startsWith(`facts-${month}`) && f.endsWith('.jsonl')).sort()
  const seen = new Set()
  return files.flatMap((f) => readJsonl(join(dir, f))).filter((m) => {
    const id = momentId(m)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/** Today's text in the order the screen shows it: the card's headline, the takeaway, the two sections and the difference. */
export function todayText(m) {
  const l = m.lesson
  const parts = [l.headline]
  if (l.takeaway) parts.push(l.takeaway)
  if (l.allowed) parts.push([`What ${m.played.san} allowed: ${l.allowed.san}`, ...l.allowed.points.map((p) => `- ${p}`)].join('\n'))
  if (l.better) parts.push([`What ${l.better.san} does instead`, ...l.better.points.map((p) => `- ${p}`)].join('\n'))
  if (l.difference.length) parts.push(['The difference', ...l.difference].join('\n'))
  return parts.join('\n\n')
}

const CLASS_WORDS = { inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder', miss: 'a miss' }

/**
 * The writer prompt's version: 1 gave the lesson's idea; 2 gives the player's side and
 * drops the idea, whose example belongs to the lesson's own position; 3 asks for
 * coach-eval's rubric in order (their reply and its cost, the target, the fix, a habit).
 */
export const PROMPT_VERSION = 3

/** The checked facts a writer is given, and nothing else. */
export function sheetOf(m) {
  const l = m.lesson
  return {
    you_play: m.mover === 'w' ? 'White' : 'Black',
    your_opponent_plays: m.mover === 'w' ? 'Black' : 'White',
    player_rating: m.rating,
    phase: m.phase,
    move_played: m.played.san,
    grade: CLASS_WORDS[m.cls] ?? m.cls,
    win_chance_given_away_percent: Math.round(m.lossPct),
    better_move: l.better?.san ?? m.best.san,
    better_move_points: l.better?.points ?? [],
    better_move_line: l.better?.line ?? null,
    reply_your_move_allowed: l.allowed?.san ?? null,
    reply_points: l.allowed?.points ?? [],
    reply_line: l.allowed?.line ?? null,
    what_your_move_does: l.yourMove,
    mistake: m.reading?.mistake
      ? { kind: m.reading.mistake.kind.replace(/-/g, ' '), material_points_lost: m.reading.mistake.points, square: m.reading.mistake.square }
      : null,
    better_move_purposes: (m.reading?.fix ?? []).map((p) => p.text),
    lesson: m.link ? { title: m.link.title, why_it_fits: m.link.why } : null,
    checked_sentences: [l.headline, ...l.difference, ...(l.takeaway ? [l.takeaway] : [])],
  }
}

export const SYSTEM = [
  'You are the coach inside a chess training app, explaining one of the player\'s mistakes from their own game.',
  'You are given a fact sheet. Every fact in it was checked by a chess engine and the app\'s board-reading code.',
  'Write the explanation the player reads in the game review: three to five short sentences, at most 90 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you".',
  'Cover these in order, as far as the sheet supports them:',
  '(1) what the move played allowed: your opponent\'s reply and what it does, and what it costs;',
  '(2) the target the play turns on, such as a loose piece, a piece that can be forked or pinned, or a weak square near a king, as the sheet names it;',
  '(3) the better move, and how it deals with that reply or what it does first;',
  '(4) one habit for next time that fits this moment, such as looking for checks, captures and threats first, counting a piece\'s attackers and defenders, or asking what your opponent\'s best reply is; when a lesson is given, name it by its title as the place to practise.',
  'The player plays the side in you_play; call the other side "your opponent" or "they", and never say White or Black did something unless it is the side the sheet gives.',
  'Use only the fact sheet. Name only moves, squares, pieces and numbers that appear in it, and never claim a check, a mate, a threat or a material gain the sheet does not state. Do not describe what the lesson\'s own examples contain.',
  'Do not mention the engine, percentages or evaluations. Do not use headings, lists or markdown. Write only the explanation.',
].join(' ')

export function messagesOf(m) {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Fact sheet:\n${JSON.stringify(sheetOf(m), null, 1)}` },
  ]
}
