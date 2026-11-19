// A coaching text written by code from a coaching sheet (coach-sheet.mjs), with no
// language model: what to notice, why the move played fails, the better move, and a
// habit, each line told as a chain of cause and effect from the sheet's own facts
// (which move forces which reply, the tactic each move carries out, what it wins).
// Every move, square and tactic it names is the sheet's, so it is true by construction;
// a language model may then reword it, held to the same truth check.
//
//   node projects/coach-eval/coach-text.mjs --sheets <sheets.jsonl,...> --out <texts.jsonl> [--writer coach-text]
import { readFileSync, writeFileSync } from 'node:fs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const VERDICT = { inaccuracy: 'an inaccuracy', mistake: 'a mistake', blunder: 'a blunder', miss: 'a missed chance' }
const MAX_STEPS = 4

// One habit for each idea a line can turn on, in the order a habit is looked for.
const HABITS = {
  'back-rank mate': 'When their king has no escape square on its back rank, look at every check along that rank before anything else.',
  'smothered mate': 'When their king is hemmed in by its own pieces, look for a knight check it cannot escape.',
  attraction: 'A check that forces the king to capture can drag it onto the square where your next move hits it, so count what follows the capture.',
  sacrifice: 'Before you rule out a check or capture that gives up material, follow the forced replies to the end: what you win back can be more.',
  fork: 'Look for checks and captures that land a piece where it attacks two things at once.',
  'double check': 'A move that gives check with two pieces at once leaves only a king move, so look for discovered checks.',
  promotion: 'Count how many moves each passed pawn needs to queen before you choose a plan.',
  mate: 'Look at every check first: forcing moves can end the game.',
  'discovered attack': 'When one of your pieces stands in front of another on a line to their king or queen, ask what moving it would uncover.',
  skewer: 'When a valuable piece stands in front of another on a line, look for a check or attack that makes it move.',
  pin: 'Ask which of their pieces cannot move without exposing something behind it.',
  deflection: 'Ask what each of their defenders guards, and whether a check or capture can drag it away.',
  'trapped piece': 'Check whether their pieces have safe squares to go to; a piece with none can be won.',
  'in-between move': 'Before you recapture by reflex, look for a check or a bigger threat first.',
  'loose piece': 'Before every move, check which pieces on both sides can be taken for free.',
}
const POINT = new Set(['back-rank mate', 'smothered mate', 'attraction', 'sacrifice', 'fork', 'double check', 'promotion', 'mate', "Anastasia's mate", 'epaulette mate', 'hook mate'])

/** How a forced reply reads in a sentence. */
function forcedText(p) {
  if (/only legal/.test(p.forced)) return `${p.move} is forced`
  const squares = /king has only (\d+) squares/.exec(p.forced)
  if (squares) return `the king has only ${squares[1]} squares and goes ${p.move}`
  const answers = /only (\d+) legal answers/.exec(p.forced)
  if (answers) return `${p.move} is one of only ${answers[1]} ways out of the check`
  return `${p.move} answers the check`
}

/**
 * A line told as cause and effect: the key moves (the point, checks, captures and forced
 * replies), at most MAX_STEPS of them, with the quiet moves between folded in.
 */
function chain(line, idea, also, skipFirst = false) {
  const steps = []
  let pending = []
  for (const [i, p] of line.entries()) {
    if (skipFirst && i === 0) continue
    const tactics = [...idea, ...also].filter((x) => x.ply === i + 1)
    const point = tactics.filter((x) => POINT.has(x.tactic))
    const told = point.length ? point : tactics.slice(0, 1)
    const key = told.length || p.forced || /[x+#=]/.test(p.move)
    if (!key) {
      pending.push(p.move)
      continue
    }
    const lead = pending.length ? `after ${pending.join(' ')}, ` : ''
    pending = []
    let s
    const does = p.does[0]?.replace(/^it /, '')
    if (told.length) s = told.map((t) => t.text).join(', and ')
    else if (p.forced && (/only legal/.test(p.forced) || !does)) s = forcedText(p) + (does && /only legal/.test(p.forced) ? ` and ${does}` : '')
    else if (does) s = `${p.move} ${does}`
    else s = `${p.by === 'you' ? 'you play' : 'they play'} ${p.move}`
    steps.push(lead + s)
    if (steps.length >= MAX_STEPS) break
  }
  return steps
}

const gainOf = (result) => (/^you mate|^you win|you promote/.test(result) ? 1 : /^they mate|^you lose|they promote/.test(result) ? -1 : 0)

/** The coaching text of a sheet, or null when the sheet holds nothing to coach. */
export function coachTextOf(s) {
  const played = s.candidates.find((c) => c.played)
  const better = s.better_move
  if (!better?.move) return null
  const sentences = []

  // What to notice: being in check, the threat, or what the better line turns on.
  const threat = s.what_to_notice.find((n) => n.startsWith('their threat'))
  const inCheck = s.what_to_notice.find((n) => n.startsWith('you are in check'))
  const loose = s.what_to_notice.find((n) => n.startsWith('their ') && /taken for free|cheaper|more times/.test(n))
  const boxed = s.what_to_notice.find((n) => /boxed in|no safe square/.test(n))
  const betterMates = /mate/.test(better.result)
  if (inCheck) sentences.push(`${cap(inCheck)}.`)
  else if (threat) sentences.push(`Look at their threat first: ${threat.replace(/^their threat, if it were their move: /, '')}.`)
  else if (boxed && betterMates) sentences.push(`${cap(boxed)}.`)
  else if (loose && better.line[0]?.does.some((d) => /wins|takes/.test(d))) sentences.push(`Notice that ${loose}.`)

  // Why the move played fails: what it loses, or what it misses.
  const w = played?.why_not
  if (played && w && gainOf(w.result) < 0) {
    const steps = chain(w.line, w.idea, w.also, true)
    const replyDoes = w.line[0]?.does?.[0]?.replace(/^it /, '')
    const replyTactic = [...w.idea, ...w.also].find((x) => x.ply === 1)
    const first = replyTactic ? replyTactic.text : `they answer ${w.reply}${replyDoes ? `, which ${replyDoes}` : ''}`
    sentences.push(`${played.move} was ${VERDICT[played.verdict] ?? 'not best'}: ${first}${steps.length ? `; ${steps.join('; ')}` : ''}.`)
    sentences.push(`${cap(w.result)}.`)
  } else if (played) {
    sentences.push(`${played.move} was ${VERDICT[played.verdict] ?? 'not best'}, because it misses ${better.move}.`)
  }

  // The better move, its line told as cause and effect.
  const firstDoes = [...better.idea, ...better.also].find((x) => x.ply === 1)?.text ?? (better.line[0]?.does?.[0] ? `${better.move} ${better.line[0].does[0].replace(/^it /, '')}` : null)
  const rest = chain(better.line, better.idea, better.also, true)
  sentences.push(`${better.move} was better${firstDoes ? `: ${firstDoes.replace(new RegExp(`^${better.move.replace(/[+#]/g, '\\$&')} `), 'it ')}` : ''}${rest.length ? `; ${rest.join('; ')}` : ''}.`)
  if (!/^no material/.test(better.result) || betterMates) sentences.push(`${cap(better.result)}.`)

  // A habit from the better line's ideas first, then the refutation's, then the threat.
  const order = [...better.idea, ...better.also, ...(w ? [...w.idea, ...w.also] : [])].map((x) => x.tactic)
  const tactic = order.find((t) => HABITS[t])
  const habit = tactic ? HABITS[tactic] : threat ? 'Before your own plan, ask what their last move threatens.' : 'Before every move, look at checks, captures and threats for both sides.'
  sentences.push(habit)
  return sentences.join(' ').replace(/\s+/g, ' ').trim()
}

if (process.argv[1]?.endsWith('coach-text.mjs')) {
  const writer = arg('writer', 'coach-text')
  const sheets = (arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip)
  const rows = sheets.map((s) => ({ id: s.id, writer, text: coachTextOf(s) ?? '' }))
  writeFileSync(arg('out'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
  const words = rows.map((r) => r.text.split(/\s+/).filter(Boolean).length).sort((a, b) => a - b)
  console.log(JSON.stringify({ texts: rows.length, empty: rows.filter((r) => !r.text).length, medianWords: words[Math.floor(words.length / 2)] }))
}
