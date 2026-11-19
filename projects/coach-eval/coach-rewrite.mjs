// The rewrite task's prompts: a writer is given the app's own explanation of a moment
// (Game Review's text in its parts, which a blind judge already rates well) and the
// forcing story of the explanation's own lines, read with the app's board code
// (coach-lines.mjs): how forced each reply is by the rules, the tactic each move carries
// out, and what changes hands. The writer rewrites the app's explanation short and clear,
// telling those lines as cause and effect. Coaching prompts 1 to 3 asked writers to build
// the explanation from a coaching sheet alone; their texts made many false claims and
// lost to today's text (results/coaching.md), so this task keeps the app's text as the
// base. The opponent's threat comes from the moment's coaching sheet (coach-sheet.mjs).
//
// Version 1 gave the threat whenever the sheet had one and asked the writer to say first
// that the move played did not meet it; the writer cannot tell, and often the move had.
// Version 2 gives the threat only when the opponent's reply carries it out, ends each
// line's story at its last move that matters, and asks for the headline's point first.
// Version 3 carries a line the app cut inside a trade on through the recapture, with the
// stored engine line that starts with it, so its story does not end a piece down.
//
// The narration task (--task narrate) asks for less: two or three sentences that tell
// the key line as cause and effect, shown after the app's headline, for the moments
// whose lines hold a chain worth telling (narratable); the app's text stays as it is.
// Its version 2 reads the lines as rewrite version 3 does.
//
//   bridge/run.sh projects/coach-eval/coach-rewrite.mjs [--sheets <sheets.jsonl,...> | --split train] --moments <moments.jsonl,...> --out <prompts.jsonl> [--task rewrite|narrate] [--version N]
import { readFileSync, writeFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { lineFacts } from './coach-lines.mjs'
import { gainOf } from './coach-text.mjs'

export const REWRITE_PROMPT_VERSION = 3
export const NARRATE_PROMPT_VERSION = 5

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const CLASS = { inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder', miss: 'a missed chance' }
const told = (xs) => xs.map((x) => (x.text.toLowerCase().includes(x.tactic.toLowerCase()) ? x.text : `${x.tactic}: ${x.text}`))
const bare = (san) => san.replace(/[+#!?]+$/, '')

/** A SAN line from a position, as UCI moves, up to the first move that does not play. */
function ucisOf(fen, sans) {
  const b = new Chess(fen)
  const out = []
  for (const san of sans) {
    try {
      const mv = b.move(san)
      out.push(`${mv.from}${mv.to}${mv.promotion ?? ''}`)
    } catch {
      break
    }
  }
  return out
}
const sansOf = (line) => (line ? line.split(/\s+/).filter((t) => t && !/^\d+\.+$/.test(t)) : [])

/** A line's moves up to its last one that matters: a capture, check or promotion, a forced reply or a tactic. */
function keyMoves(line) {
  let end = 1
  line.forEach((p, i) => {
    if (/[x+#=]/.test(p.move) || p.how_forced || p.tactic) end = i + 1
  })
  return line.slice(0, end)
}

/** The stored engine line that starts with the app's line and goes further, if any. */
const longerOf = (ucis, longer) => (longer && longer.length > ucis.length && ucis.every((u, i) => longer[i] === u) ? longer : null)

/**
 * One of the app's lines, told move by move: how forced each move is and the tactics at
 * it. From version 3 a longer engine line that starts with it carries it on through any
 * recapture, since the app cuts its lines and a cut can fall inside a trade.
 */
function told_line(fen, ucis, pov, before = null, lead = null, version = REWRITE_PROMPT_VERSION, longer = null) {
  if (!ucis.length) return null
  const ext = version >= 3 ? longerOf(ucis, longer) : null
  const f = ext ? lineFacts(fen, ext, pov, before, lead, false, false, ucis.length) : lineFacts(fen, ucis, pov, before, lead, false, true)
  const line = f.line.map((p, i) => {
    const at = told([...f.idea, ...f.also].filter((x) => x.ply === i + 1))
    return { move: p.move, by: p.by, ...(p.forced ? { how_forced: p.forced } : {}), ...(at.length ? { tactic: at } : {}) }
  })
  return {
    line: version >= 2 ? keyMoves(line) : line,
    ...(f.idea.length ? { the_point: told(f.idea) } : {}),
    how_it_ends: f.result,
  }
}

/** The facts a rewriter is given: the app's explanation and the forcing story of its lines. */
export function rewriteSheetOf(s, m, version = REWRITE_PROMPT_VERSION) {
  const l = m.lesson
  const pov = m.mover
  const notice = s?.what_to_notice?.find((n) => n.startsWith('their threat'))
  const threat = notice ? notice.replace(/^their threat, if it were their move: /, '') : null
  const better = l.better ? told_line(m.fen, ucisOf(m.fen, sansOf(l.better.line ?? l.better.san)), pov, null, null, version, m.best?.pv) : null
  const replyLine = s?.search?.candidates?.find((c) => c.uci === m.played.uci)?.reply
  let allowed = null
  if (l.allowed?.line) {
    const after = new Chess(m.fen)
    let playedOk = true
    try {
      after.move(m.played.san)
    } catch {
      playedOk = false
    }
    const sans = sansOf(l.allowed.line)
    if (playedOk) allowed = told_line(after.fen(), ucisOf(after.fen(), sans[0] === m.played.san ? sans.slice(1) : sans), pov, m.fen, m.played.uci, version, replyLine)
  }
  const reply = allowed?.line?.[0]?.move
  const carriedOut = !!(threat && s?.their_threat?.move && reply && bare(reply) === bare(s.their_threat.move))
  return {
    you_play: m.mover === 'w' ? 'White' : 'Black',
    your_opponent_plays: m.mover === 'w' ? 'Black' : 'White',
    player_rating: m.rating,
    move_played: m.played.san,
    grade: CLASS[m.cls] ?? m.cls,
    app_explanation: {
      headline: l.headline,
      what_your_move_allowed: l.allowed ? { move: l.allowed.san, what_it_does: l.allowed.points ?? [], line: l.allowed.line ?? null } : null,
      what_the_better_move_does: l.better ? { move: l.better.san, what_it_does: l.better.points ?? [], line: l.better.line ?? null } : null,
      difference: l.difference ?? [],
      takeaway: l.takeaway ?? null,
    },
    ...(version < 2 && threat ? { their_threat: threat } : {}),
    ...(version >= 2 && carriedOut ? { their_reply_carries_out_their_threat: threat } : {}),
    ...(allowed ? { story_of_the_line_your_move_allowed: allowed } : {}),
    ...(better ? { story_of_the_better_line: better } : {}),
  }
}

const REWRITE_RULES = [
  'The player plays the side in you_play; call the other side "your opponent" or "they".',
  'Use only the facts given. Name only moves, squares, pieces and numbers that appear in them. Call a reply forced only where how_forced says so, and name a tactic only at the move it is given for. Keep every fact with the move it belongs to. Never claim a check, a mate, a threat or a material gain the facts do not state.',
  'Do not mention the engine, percentages or evaluations. Do not use headings, lists or markdown. Write only the explanation.',
]

export const REWRITE_SYSTEMS = {
  1: [
    'You are the coach inside a chess training app, explaining one of the player\'s moves.',
    'You are given the app\'s own explanation of the moment and, for each of its lines, the story of that line: how forced each reply is by the rules, the tactic each move carries out, and what changes hands. Every fact was checked by a chess engine and the app\'s board-reading code.',
    'Rewrite the explanation for the player: four to six short sentences, at most 110 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you".',
    'Say what the move played allowed and what it costs, then what the better move does. Where a line\'s story marks how forced a reply is or names a tactic at a move, tell that part as a chain of cause and effect: which move forces which reply, and what that lets the next move do. Give only the key moves of a line: its checks, its captures and the move that makes its point.',
    'If their_threat is given and the move played did not meet it, say so first.',
    'Close with one habit for next time, in a sentence of its own: advice to the player, not a claim about the position.',
    ...REWRITE_RULES,
  ].join(' '),
  2: [
    'You are the coach inside a chess training app, explaining one of the player\'s moves.',
    'You are given the app\'s own explanation of the moment and, for its lines, the story of each: how forced each reply is by the rules, the tactic each move carries out, and how the line ends. Every fact was checked by a chess engine and the app\'s board-reading code.',
    'Rewrite the explanation for the player: three to five short sentences, at most 100 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you".',
    'Open with the point of the app\'s headline, in your own words.',
    'Tell the line that makes that point as a chain of cause and effect: which move forces which reply, and what that reply lets the next move do, ending with what it wins. Give only its key moves: checks, captures, forced replies and the move that makes the point.',
    'Say in one short sentence what the other line shows, what the move played allowed or missed, without listing its moves.',
    'If their_reply_carries_out_their_threat is given, say that the move played left their threat on; otherwise never say that a move met or missed a threat.',
    'Close with the app\'s takeaway as the habit, in a sentence of its own, shortened if needed.',
    ...REWRITE_RULES,
  ].join(' '),
}
REWRITE_SYSTEMS[3] = REWRITE_SYSTEMS[2]

export function rewriteMessagesOf(sheet, moment, version = REWRITE_PROMPT_VERSION) {
  return [
    { role: 'system', content: REWRITE_SYSTEMS[version] },
    { role: 'user', content: `Facts:\n${JSON.stringify(rewriteSheetOf(sheet, moment, version), null, 1)}` },
  ]
}

/**
 * A line worth telling as a chain: a later move by the line's own side carries a
 * tactic, or a forced reply lets the next move capture, check or promote.
 */
export function chainWorthTelling(story) {
  const line = story?.line ?? []
  if (line.length < 2) return false
  const side = line[0].by
  if (line.slice(1).some((p) => p.by === side && p.tactic)) return true
  return line.some((p, i) => p.how_forced && i + 1 < line.length && /[x+#=]/.test(line[i + 1].move))
}

/**
 * From narration version 3, only a set-up is told: the line's point (a point-tier
 * tactic, or mate) lands with a later move by the line's own side, within its first
 * SETUP_PLIES plies, and the story stops one ply after it, keeping how the line ends.
 * In games most lines' later tactics are side events of a long engine line, and a
 * blind judge preferred the app's text without them (results/coaching.md).
 *
 * Version 5 makes a sacrifice or an attraction the means, never the point: the story
 * runs to the fork, promotion or mate it clears the way for, and a line whose payoff
 * lies beyond reach is not told. It also tells a line only when it ends with a gain for
 * the side that plays it, so a best defence that still loses material is left out.
 */
const SETUP_PLIES = 6
const MEANS = /^(sacrifice|attraction):/

export function setUpOf(story, version = NARRATE_PROMPT_VERSION) {
  const line = story?.line ?? []
  if (line.length < 2) return null
  const side = line[0].by
  if (version >= 5 && gainOf(story.how_it_ends ?? '') !== (side === 'you' ? 1 : -1)) return null
  const points = new Set((story.the_point ?? []).filter((t) => version < 5 || !MEANS.test(t)))
  const isPoint = (p, i) => i > 0 && i < SETUP_PLIES && p.by === side && ((p.tactic ?? []).some((t) => points.has(t)) || /#$/.test(p.move))
  // Version 4 runs to the last point within reach, so a sacrifice that clears the way
  // is told with the fork or mate it sets up rather than stopping at the sacrifice.
  const at = version >= 4 ? line.findLastIndex(isPoint) : line.findIndex(isPoint)
  if (at < 0) return null
  return { ...story, line: line.slice(0, Math.min(at + 2, line.length)) }
}

/** The narration's facts: the lines whose chain is worth telling, or null when none is. */
export function narrateSheetOf(s, m, version = NARRATE_PROMPT_VERSION) {
  const r = rewriteSheetOf(s, m, version >= 2 ? 3 : 2)
  const pick = (story) => (version >= 3 ? setUpOf(story, version) : chainWorthTelling(story) ? story : null)
  const better = pick(r.story_of_the_better_line)
  const allowed = pick(r.story_of_the_line_your_move_allowed)
  if (!better && !allowed) return null
  return {
    you_play: r.you_play,
    your_opponent_plays: r.your_opponent_plays,
    player_rating: r.player_rating,
    move_played: r.move_played,
    headline: r.app_explanation.headline,
    ...(better ? { the_better_line: { move: r.app_explanation.what_the_better_move_does.move, ...better } } : {}),
    ...(allowed ? { the_line_your_move_allowed: { reply: r.app_explanation.what_your_move_allowed.move, ...allowed } } : {}),
  }
}

export const NARRATE_SYSTEMS = {
  1: [
    'You are the coach inside a chess training app. The app has already shown the player its explanation of one of their moves; you add the key line, told the way a coach thinks it through at the board.',
    'You are given the line or lines worth telling: each move with who plays it, how forced it is by the rules (how_forced), the tactic it carries out, and how the line ends. Every fact was checked by a chess engine and the app\'s board-reading code.',
    'Write two or three short sentences, at most 60 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you".',
    'If the_better_line is given, tell it as a chain of cause and effect: which move forces which reply, and what that reply lets the next move do, ending with what the line wins. If the_line_your_move_allowed is given, tell it the same way in one sentence: what their reply forces and what it wins.',
    'Give only the key moves: checks, captures, forced replies and the move that makes the point.',
    ...REWRITE_RULES.slice(0, 2),
    'Do not repeat the headline, give advice or a habit, or mention the engine, percentages or evaluations. Do not use headings, lists or markdown. Write only the sentences.',
  ].join(' '),
  3: [
    'You are the coach inside a chess training app. The app has already shown the player its explanation of one of their moves; you add the line that sets up its point, told the way a coach thinks it through at the board.',
    'You are given the line, move by move up to its point: who plays each move, how forced a reply is by the rules (how_forced, only where it is), the tactic a move carries out, and how the line ends. Every fact was checked by a chess engine and the app\'s board-reading code.',
    'Write one or two short sentences, at most 45 words, in plain words for a club player rated about the player_rating given, speaking to the player as "you".',
    'Tell the line as cause and effect: the first move and what it does, the reply, and then the move that makes the point and what it does, ending with how the line ends. Where how_forced is given for a reply, say in your own words that it is forced and why; where it is not, just name the reply, and never call it forced or say they must or have to play it.',
    'If the_line_your_move_allowed is given instead of the_better_line, tell it the same way from their side: their reply, your answer, and the move that makes their point.',
    ...REWRITE_RULES.slice(0, 2),
    'Do not repeat the headline, give advice or a habit, or mention the engine, percentages or evaluations. Do not use headings, lists or markdown. Write only the sentences.',
  ].join(' '),
}
NARRATE_SYSTEMS[2] = NARRATE_SYSTEMS[1]
NARRATE_SYSTEMS[4] = NARRATE_SYSTEMS[3]
NARRATE_SYSTEMS[5] = NARRATE_SYSTEMS[3]
export const NARRATE_SYSTEM = NARRATE_SYSTEMS[1]

export function narrateMessagesOf(sheet, moment, version = NARRATE_PROMPT_VERSION) {
  const facts = narrateSheetOf(sheet, moment, version)
  return facts
    ? [
        { role: 'system', content: NARRATE_SYSTEMS[version] },
        { role: 'user', content: `Facts:\n${JSON.stringify(facts, null, 1)}` },
      ]
    : null
}

/** A tactic's text without the name told() puts before a text that lacks it. */
const bareTactic = (t) => t.replace(/^[a-z][a-z -]*: (?=[A-Za-z0-9])/, '')

/**
 * The code's own telling of a set-up, for comparison with a writer's: each move with
 * the first tactic it carries out, each reply with how forced it is, and how the line ends.
 */
export function templateNarration(facts) {
  const story = facts.the_better_line ?? facts.the_line_your_move_allowed
  if (!story) return null
  const side = story.line[0].by
  const parts = story.line.map((p, i) => {
    if (p.by === side) return p.tactic?.length ? bareTactic(p.tactic[0]) : `${i === 0 ? '' : 'then '}${p.move}`.trim()
    return `after ${p.move}${p.how_forced ? ` (${p.how_forced})` : ''}`
  })
  const lead = facts.the_better_line ? '' : `After ${facts.move_played}, `
  const text = `${lead}${parts.join(', ')}, and ${story.how_it_ends}.`
  return text.charAt(0).toUpperCase() + text.slice(1)
}

if (process.argv[1]?.endsWith('coach-rewrite.mjs')) {
  const task = arg('task', 'rewrite')
  const version = Number(arg('version', task.startsWith('narrate') ? NARRATE_PROMPT_VERSION : REWRITE_PROMPT_VERSION))
  const moments = new Map((arg('moments') ?? '').split(',').filter(Boolean).flatMap(readJsonl).map((m) => [`${m.game}:${m.index}`, m]))
  const sheets = (arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip && moments.get(s.id)?.lesson)
  // With no sheets, every moment of --split with a lesson, read without a sheet: no
  // threat, and the allowed line only as far as the app gives it.
  const split = arg('split')
  const pairs = sheets.length
    ? sheets.map((s) => [s, moments.get(s.id)])
    : [...moments.values()].filter((m) => m.lesson && (!split || m.split === split)).map((m) => [null, m])
  if (task === 'narrate-code') {
    // The template's texts, in a writer's texts shape, for the narratable moments.
    const texts = pairs
      .map(([s, m]) => {
        const facts = narrateSheetOf(s, m, version)
        return facts ? { id: `${m.game}:${m.index}`, writer: 'narrate-code', text: templateNarration(facts) } : null
      })
      .filter(Boolean)
    writeFileSync(arg('out'), texts.map((t) => JSON.stringify(t)).join('\n') + '\n')
    console.log(JSON.stringify({ task, version, moments: pairs.length, texts: texts.length }))
    process.exit(0)
  }
  const rows = pairs
    .map(([s, m]) => {
      const messages = task === 'narrate' ? narrateMessagesOf(s, m, version) : rewriteMessagesOf(s, m, version)
      return messages ? { id: `${m.game}:${m.index}`, split: m.split ?? null, version: `${task}-${version}`, messages } : null
    })
    .filter(Boolean)
  writeFileSync(arg('out'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const chars = rows.map((r) => r.messages.reduce((n, msg) => n + msg.content.length, 0)).sort((a, b) => a - b)
  console.log(JSON.stringify({ task, version, moments: pairs.length, withSheets: sheets.length, prompts: rows.length, medianChars: chars[Math.floor(chars.length / 2)] ?? 0 }))
  process.exit(0)
}
