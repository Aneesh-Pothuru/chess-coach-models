// The coaching task's rubric judge and claim audit, in the shape of rubric.mjs. `build`
// writes what a judge reads: for each moment, the coaching sheet the writers were
// given (coach-prompts.mjs) as the reference, and every writer's coaching text under a
// neutral label in a seeded order, with a decoy as long as the moment's median text
// that restates the sheet's lines and explains nothing. Only moments every texts file
// has a text for are read. `score` writes, for each writer, the share of texts meeting
// each criterion and the false and unsupported claims per text, with 95% bootstrap
// intervals over games (or puzzles), the paired difference in claims between every two
// writers, and the control: the decoy must meet the habit criterion at most one time
// in ten and the idea criterion less often than every writer, or the run reports no
// scores. With --prompts (the rewrite task's, coach-rewrite.mjs), the reference is the
// facts each writer read in its prompt, and the decoy restates the app's lines.
//
//   node projects/coach-eval/coach-rubric.mjs build --name <name> --sheets <a.jsonl,...> --texts <a.jsonl,b.jsonl,...> [--prompts <a.jsonl,...>] [--limit N] [--batch 10]
//   node projects/coach-eval/coach-rubric.mjs score --name <name>
//
// A judge reads one batch file at a time and writes, beside it, answers-<k>.json:
// [{"key": "<id>|T1", "notice": true, "refutation": true, "idea": false, "line": true,
//   "habit": true, "level": true, "false_claims": 0, "unsupported_claims": 1}, ...]
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../bridge/lib/lab.mjs'
import { coachSheetOf } from './coach-prompts.mjs'

export const COACH_CRITERIA = ['notice', 'refutation', 'idea', 'line', 'habit', 'level']

export const COACH_RUBRIC_INSTRUCTIONS = [
  'You are checking coaching explanations in a chess training app. Each item is one moment: a club player rated about the player_rating in the coaching sheet chose a move, and the explanation coaches the moment the way a puzzle book explains a position.',
  'The item gives the moment\'s coaching sheet, which a chess engine and the app\'s board code worked out, and several explanations labelled T1, T2 and so on, each by a different writer.',
  'Read each explanation on its own against the coaching sheet; do not compare them with each other, and do not work out the chess yourself: the coaching sheet is the reference.',
  'For each explanation answer six questions with true or false.',
  'notice: does it point the player to something in what_to_notice that matters for the better move, such as a loose piece, a boxed-in king, a check or the opponent\'s threat?',
  'refutation: does it show concretely why the move played fails: the opponent\'s reply, what that reply does, and what it wins or allows, as the sheet gives them?',
  'idea: does it name the better move and say what makes it work, giving the point of the line when the sheet gives one? Naming the better move without what it does is false.',
  'line: does it give the key moves of the better move\'s line (its checks, captures and the move that makes the point) in the right order and with the right side playing them?',
  'habit: does it close with one thing to do at the board next time that fits this moment? A slogan that does not fit the moment is false.',
  'level: is it in plain words such a player follows, with no engine numbers, in about 150 words or fewer?',
  'Then count false_claims, the statements about the moment that the coaching sheet contradicts (a wrong move, square, piece, side, amount of material, check, mate or tactic, or a fact given to the wrong move), and unsupported_claims, the chess statements the sheet neither states nor implies (such as a threat, a tactic or a line it does not contain). Advice to the player is not a claim.',
  'Answer with a JSON array holding one object per explanation: {"key", "notice", "refutation", "idea", "line", "habit", "level", "false_claims", "unsupported_claims"}.',
].join(' ')

export const REWRITE_RUBRIC_INSTRUCTIONS = [
  'You are checking coaching explanations in a chess training app. Each item is one moment: a club player rated about the player_rating in the facts chose a move, and the explanation coaches the moment the way a puzzle book explains a position.',
  'The item gives the moment\'s facts, which a chess engine and the app\'s board code worked out: the app\'s own explanation of the moment and the story of each of its lines (how forced each reply is by the rules, the tactic each move carries out, and how the line ends). It also gives several explanations labelled T1, T2 and so on, each by a different writer.',
  'Read each explanation on its own against the facts; do not compare them with each other, and do not work out the chess yourself: the facts are the reference.',
  'For each explanation answer six questions with true or false.',
  'notice: does it point the player first to what matters before the better move: their_threat when the facts give one, otherwise what the move played missed or allowed?',
  'refutation: does it show concretely why the move played fails: the opponent\'s reply, what that reply does, and what it wins or allows, as the facts give them?',
  'idea: does it name the better move and say what makes it work, giving the point of its line when the facts give one? Naming the better move without what it does is false.',
  'line: does it give the key moves of the better move\'s line (its checks, captures and the move that makes the point) in the right order and with the right side playing them, calling a reply forced only where the facts say so?',
  'habit: does it close with one thing to do at the board next time that fits this moment? A slogan that does not fit the moment is false.',
  'level: is it in plain words such a player follows, with no engine numbers, in about 150 words or fewer?',
  'Then count false_claims, the statements about the moment that the facts contradict (a wrong move, square, piece, side, amount of material, check, mate or tactic, or a fact given to the wrong move), and unsupported_claims, the chess statements the facts neither state nor imply (such as a threat, a tactic, a forced reply or a line they do not contain). Advice to the player is not a claim.',
  'Answer with a JSON array holding one object per explanation: {"key", "notice", "refutation", "idea", "line", "habit", "level", "false_claims", "unsupported_claims"}.',
].join(' ')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const hex = (s) => createHash('sha256').update(s).digest('hex')
const wordsOf = (text) => text.split(/\s+/).filter(Boolean).length
const groupOf = (id) => id.slice(0, id.lastIndexOf(':'))

/** A decoy: the sheet's moves and lines restated, with nothing explained. */
function decoyOf(given, words) {
  const facts = [`You played ${given.move_played}.`]
  for (const c of given.candidates_that_fail) facts.push(`After ${c.move}, the line went ${c.the_line_after_it.map((p) => p.move).join(' ')}.`)
  facts.push(`The better move was ${given.better_move.move}.`, `Its line went ${given.better_move.the_line.map((p) => p.move).join(' ')}.`)
  const out = []
  let i = 0
  while (out.join(' ').split(/\s+/).length < words && i < 40) out.push(facts[i++ % facts.length])
  return out.join(' ').split(/\s+/).slice(0, Math.max(words, 8)).join(' ')
}

/** The rewrite task's decoy: the app's lines restated, with nothing explained. */
function rewriteDecoyOf(given, words) {
  const app = given.app_explanation
  const facts = [`You played ${given.move_played}.`]
  if (app?.what_your_move_allowed?.line) facts.push(`After ${given.move_played}, the line went ${app.what_your_move_allowed.line}.`)
  if (app?.what_the_better_move_does) {
    facts.push(`The better move was ${app.what_the_better_move_does.move}.`)
    if (app.what_the_better_move_does.line) facts.push(`Its line went ${app.what_the_better_move_does.line}.`)
  }
  // The narration task's facts hold the lines alone.
  if (given.the_line_your_move_allowed) facts.push(`After ${given.move_played}, the line went ${given.the_line_your_move_allowed.line.map((p) => p.move).join(' ')}.`)
  if (given.the_better_line) facts.push(`The better line went ${given.the_better_line.line.map((p) => p.move).join(' ')}.`)
  const out = []
  let i = 0
  while (out.join(' ').split(/\s+/).length < words && i < 40) out.push(facts[i++ % facts.length])
  return out.join(' ').split(/\s+/).slice(0, Math.max(words, 8)).join(' ')
}

const mode = process.argv[2]
const name = arg('name')
if (!name || (mode !== 'build' && mode !== 'score')) throw new Error('usage: coach-rubric.mjs build|score --name <name> [...]')
const out = join(privateDir('coach-eval'), `coach-rubric-${name}`)

if (mode === 'build') {
  const sheets = new Map((arg('sheets') ?? '').split(',').filter(Boolean).flatMap(readJsonl).filter((s) => !s.skip).map((s) => [s.id, s]))
  const paths = (arg('texts') ?? '').split(',').filter(Boolean)
  if (!paths.length) throw new Error('build needs --texts')
  const limit = Number(arg('limit', '0'))
  const batch = Number(arg('batch', '10'))
  const givenById = new Map((arg('prompts') ?? '').split(',').filter(Boolean).flatMap(readJsonl).map((p) => {
    const user = p.messages.find((m) => m.role === 'user').content
    return [p.id, JSON.parse(user.slice(user.indexOf('\n') + 1))]
  }))
  const rewrite = givenById.size > 0
  const byId = new Map()
  for (const path of paths) {
    for (const t of readJsonl(path)) {
      const texts = byId.get(t.id) ?? byId.set(t.id, new Map()).get(t.id)
      texts.set(t.writer, t.text ?? '')
    }
  }
  const writers = [...new Set([...byId.values()].flatMap((m) => [...m.keys()]))].sort()
  let ids = [...byId.keys()].filter((id) => sheets.has(id) && (!rewrite || givenById.has(id)) && writers.every((w) => byId.get(id).has(w)))
  ids.sort((a, b) => (hex(`coach-eval:coach-rubric:${a}`) < hex(`coach-eval:coach-rubric:${b}`) ? -1 : 1))
  if (limit) ids = ids.slice(0, limit)
  const key = []
  const moments = ids.map((id) => {
    const given = rewrite ? givenById.get(id) : coachSheetOf(sheets.get(id))
    const texts = [...byId.get(id).entries()].map(([writer, text]) => ({ writer, text }))
    const lengths = texts.map((t) => wordsOf(t.text)).sort((a, b) => a - b)
    const words = lengths[Math.floor(lengths.length / 2)] ?? 100
    texts.push({ writer: 'decoy', text: rewrite ? rewriteDecoyOf(given, words) : decoyOf(given, words) })
    texts.sort((a, b) => (hex(`coach-eval:coach-rubric:order:${id}:${a.writer}`) < hex(`coach-eval:coach-rubric:order:${id}:${b.writer}`) ? -1 : 1))
    const labelled = texts.map((t, k) => {
      key.push({ key: `${id}|T${k + 1}`, id, writer: t.writer, words: wordsOf(t.text) })
      return { key: `${id}|T${k + 1}`, text: t.text }
    })
    return rewrite ? { id, facts: given, explanations: labelled } : { id, coaching_sheet: given, explanations: labelled }
  })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'key.json'), JSON.stringify({ texts: paths, writers, task: rewrite ? 'rewrite' : 'coach', moments: ids.length, items: key }, null, 1))
  for (let b = 0; b * batch < moments.length; b++) {
    writeFileSync(join(out, `batch-${b}.json`), JSON.stringify({ instructions: rewrite ? REWRITE_RUBRIC_INSTRUCTIONS : COACH_RUBRIC_INSTRUCTIONS, moments: moments.slice(b * batch, (b + 1) * batch) }, null, 1))
  }
  console.log(JSON.stringify({ name, writers, moments: ids.length, texts: key.length, batches: Math.ceil(moments.length / batch), dir: out }))
} else {
  const key = JSON.parse(readFileSync(join(out, 'key.json'), 'utf8'))
  const answers = new Map()
  for (const f of readdirSync(out).filter((f) => /^answers-\d+\.json$/.test(f))) {
    for (const a of JSON.parse(readFileSync(join(out, f), 'utf8'))) answers.set(a.key, a)
  }
  const rows = key.items.filter((i) => answers.has(i.key)).map((i) => ({ ...i, group: groupOf(i.id), a: answers.get(i.key) }))
  const claims = (r) => (Number(r.a.false_claims) || 0) + (Number(r.a.unsupported_claims) || 0)
  const measuresOf = (rs) => {
    const res = { texts: rs.length }
    for (const c of COACH_CRITERIA) res[c] = rs.length ? rs.filter((r) => r.a[c] === true).length / rs.length : null
    res.falseClaimsPerText = rs.length ? rs.reduce((s, r) => s + (Number(r.a.false_claims) || 0), 0) / rs.length : null
    res.unsupportedClaimsPerText = rs.length ? rs.reduce((s, r) => s + (Number(r.a.unsupported_claims) || 0), 0) / rs.length : null
    res.noFalseClaim = rs.length ? rs.filter((r) => !(Number(r.a.false_claims) > 0)).length / rs.length : null
    res.noClaim = rs.length ? rs.filter((r) => claims(r) === 0).length / rs.length : null
    return res
  }
  let seed = 12345
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const boot = (items, stat) => {
    const groups = [...new Set(items.map((r) => r.group))]
    const byGroup = new Map(groups.map((g) => [g, items.filter((r) => r.group === g)]))
    const boots = []
    for (let k = 0; k < 2000; k++) {
      const sample = []
      for (let j = 0; j < groups.length; j++) sample.push(...byGroup.get(groups[Math.floor(rand() * groups.length)]))
      boots.push(stat(sample))
    }
    boots.sort((a, b) => a - b)
    return [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]]
  }
  const byWriter = {}
  const writers = [...new Set(rows.map((r) => r.writer))].sort()
  for (const writer of writers) {
    const rs = rows.filter((r) => r.writer === writer)
    const m = measuresOf(rs)
    m.interval95 = Object.fromEntries([...COACH_CRITERIA, 'falseClaimsPerText', 'unsupportedClaimsPerText', 'noFalseClaim'].map((c) => [c, boot(rs, (s) => measuresOf(s)[c])]))
    m.medianWords = [...rs.map((r) => r.words)].sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? null
    byWriter[writer] = m
  }
  const paired = {}
  const real = writers.filter((w) => w !== 'decoy')
  for (const a of real) {
    for (const b of real) {
      if (a >= b) continue
      const ca = new Map(rows.filter((r) => r.writer === a).map((r) => [r.id, r]))
      const pairs = rows.filter((r) => r.writer === b && ca.has(r.id)).map((r) => ({ group: r.group, d: claims(ca.get(r.id)) - claims(r) }))
      const mean = (ps) => (ps.length ? ps.reduce((s, p) => s + p.d, 0) / ps.length : null)
      paired[`${a} minus ${b}`] = { moments: pairs.length, mean: mean(pairs), interval95: boot(pairs, mean) }
    }
  }
  const decoy = byWriter.decoy
  const controlPassed = !!(decoy && decoy.habit <= 0.1 && real.every((w) => decoy.idea < byWriter[w].idea))
  const summary = { name, answered: rows.length, of: key.items.length, moments: key.moments, control: { passed: controlPassed, decoy: decoy && { habit: decoy.habit, idea: decoy.idea } }, byWriter: controlPassed ? byWriter : null, paired: controlPassed ? paired : null }
  writeFileSync(join(out, 'score.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ ...summary, byWriter: controlPassed ? Object.fromEntries(Object.entries(byWriter).map(([w, m]) => [w, { ...m, interval95: undefined }])) : null }))
}
