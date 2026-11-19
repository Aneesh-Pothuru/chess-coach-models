// coach-eval's rubric judge. `build` writes what a judge reads: for each moment in
// the sample, its fact sheet (review-writer's sheetOf) as the reference, and every
// text being read for it under a neutral label (T1, T2, ...) in a seeded order,
// blind to who wrote it. The texts are each texts file's (a file whose name has
// "bare" in it holds bare-task texts), today's text, and a decoy as long as the
// moment's median text that restates the facts and explains nothing. Only moments
// every file has a text for are read. `score` reads the answers back and writes,
// for each writer and task, the share of texts meeting each criterion and the false
// and unsupported claims per text, with 95% bootstrap intervals over games (or
// puzzles), and the control: the decoy must meet the fix and the habit criteria
// less often than today's text, or the run reports no scores.
//
//   node projects/coach-eval/rubric.mjs build --name <name> --texts <a.jsonl,b.jsonl,...> [--facts <moments.jsonl,...>] [--limit N] [--batch 8]
//   node projects/coach-eval/rubric.mjs score --name <name>
//
// A judge reads one batch file at a time and writes, beside it, answers-<k>.json:
// [{"key": "<id>|T1", "stakes": true, "target": true, "reply": false, "fix": true,
//   "habit": true, "level": true, "false_claims": 0, "unsupported_claims": 1}, ...]
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { privateDir } from '../../bridge/lib/lab.mjs'
import { PROJECT as WRITER, momentId, readFacts, readJsonl, sheetOf, todayText } from '../review-writer/lib.mjs'
import { PROJECT } from './lib.mjs'

export const CRITERIA = ['stakes', 'target', 'reply', 'fix', 'habit', 'level']

export const RUBRIC_INSTRUCTIONS = [
  'You are checking explanations in a chess training app. Each item is one moment: a club player rated about the player_rating in the fact sheet made a move that was an error.',
  'The item gives the moment\'s fact sheet, which a chess engine and the app\'s board code checked, and several explanations of the moment labelled T1, T2 and so on, each by a different writer.',
  'Read each explanation on its own against the fact sheet; do not compare them with each other, and do not work out the chess yourself: the fact sheet is the reference.',
  'For each explanation answer six questions with true or false.',
  'stakes: does it say what the error costs, in material or in what it allows, such as a mate or a lost piece?',
  'target: does it name the concrete thing the play turns on, such as a piece with no more defenders than attackers, a piece that can be forked, pinned, skewered or trapped, a defender with two jobs, or a weak square or line near a king?',
  'reply: does it name the opponent\'s strongest answer to the move played and say what that answer does?',
  'fix: does it say how the better move deals with that answer, or what it does first that the move played did not? Naming the better move without the problem it solves is false.',
  'habit: does it give one thing to do at the board next time that fits this moment, such as counting material, looking for loose pieces, looking at checks, captures and threats before quiet moves, asking what the opponent\'s best reply is, or counting attackers against defenders? A slogan that does not fit the moment is false.',
  'level: is it in plain words such a player follows, with no engine numbers unless they help, in about 90 words or fewer?',
  'Then count false_claims, the statements about the moment that the fact sheet contradicts (a wrong move, square, piece, side, amount of material, check or mate), and unsupported_claims, the chess statements the fact sheet neither states nor implies (such as a threat, a tactic or a line it does not contain).',
  'Answer with a JSON array holding one object per explanation: {"key", "stakes", "target", "reply", "fix", "habit", "level", "false_claims", "unsupported_claims"}.',
].join(' ')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const hex = (s) => createHash('sha256').update(s).digest('hex')
const wordsOf = (text) => text.split(/\s+/).filter(Boolean).length
const groupOf = (id) => id.slice(0, id.lastIndexOf(':'))

function decoyOf(m, words) {
  const l = m.lesson
  const facts = [
    `You played ${m.played.san}.`,
    `The better move was ${l.better?.san ?? m.best.san}.`,
    l.allowed ? `After ${m.played.san}, they could answer ${l.allowed.san}.` : '',
    l.better?.line ? `The line after ${l.better.san} was ${l.better.line}.` : '',
    l.allowed?.line ? `The line after ${m.played.san} was ${l.allowed.line}.` : '',
    `The move was graded ${m.cls}.`,
  ].filter(Boolean)
  const out = []
  let i = 0
  while (out.join(' ').split(/\s+/).length < words && i < 40) out.push(facts[i++ % facts.length])
  return out.join(' ').split(/\s+/).slice(0, Math.max(words, 8)).join(' ')
}

const mode = process.argv[2]
const name = arg('name')
if (!name || (mode !== 'build' && mode !== 'score')) throw new Error('usage: rubric.mjs build|score --name <name> [...]')
const out = join(privateDir(PROJECT), `rubric-${name}`)

if (mode === 'build') {
  const paths = (arg('texts') ?? '').split(',').filter(Boolean)
  if (!paths.length) throw new Error('build needs --texts')
  const limit = Number(arg('limit', '0'))
  const batch = Number(arg('batch', '8'))
  const extra = (arg('facts') ?? '').split(',').filter(Boolean).flatMap((path) => readJsonl(path))
  const facts = new Map([...readFacts(privateDir(WRITER)), ...extra].map((m) => [momentId(m), m]))
  const byId = new Map()
  for (const path of paths) {
    const task = /bare/.test(basename(path)) ? 'bare' : 'grounded'
    for (const t of readJsonl(path)) {
      const texts = byId.get(t.id) ?? byId.set(t.id, new Map()).get(t.id)
      texts.set(`${task}/${t.writer}`, t.text ?? '')
    }
  }
  const writers = [...new Set([...byId.values()].flatMap((m) => [...m.keys()]))].sort()
  let ids = [...byId.keys()].filter((id) => facts.has(id) && writers.every((w) => byId.get(id).has(w)))
  ids.sort((a, b) => (hex(`${PROJECT}:rubric:${a}`) < hex(`${PROJECT}:rubric:${b}`) ? -1 : 1))
  if (limit) ids = ids.slice(0, limit)
  const key = []
  const moments = ids.map((id) => {
    const m = facts.get(id)
    const texts = [...byId.get(id).entries()].map(([writer, text]) => ({ writer, text }))
    const lengths = texts.map((t) => wordsOf(t.text)).sort((a, b) => a - b)
    texts.push({ writer: 'today', text: todayText(m) }, { writer: 'decoy', text: decoyOf(m, lengths[Math.floor(lengths.length / 2)] ?? 60) })
    texts.sort((a, b) => (hex(`${PROJECT}:rubric:order:${id}:${a.writer}`) < hex(`${PROJECT}:rubric:order:${id}:${b.writer}`) ? -1 : 1))
    const labelled = texts.map((t, k) => {
      key.push({ key: `${id}|T${k + 1}`, id, writer: t.writer, words: wordsOf(t.text) })
      return { key: `${id}|T${k + 1}`, text: t.text }
    })
    return { id, fact_sheet: sheetOf(m), explanations: labelled }
  })
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'key.json'), JSON.stringify({ texts: paths, writers, moments: ids.length, items: key }, null, 1))
  for (let b = 0; b * batch < moments.length; b++) {
    writeFileSync(join(out, `batch-${b}.json`), JSON.stringify({ instructions: RUBRIC_INSTRUCTIONS, moments: moments.slice(b * batch, (b + 1) * batch) }, null, 1))
  }
  console.log(JSON.stringify({ name, writers, moments: ids.length, texts: key.length, batches: Math.ceil(moments.length / batch), dir: out }))
} else {
  const key = JSON.parse(readFileSync(join(out, 'key.json'), 'utf8'))
  const answers = new Map()
  for (const f of readdirSync(out).filter((f) => /^answers-\d+\.json$/.test(f))) {
    for (const a of JSON.parse(readFileSync(join(out, f), 'utf8'))) answers.set(a.key, a)
  }
  const rows = key.items.filter((i) => answers.has(i.key)).map((i) => ({ ...i, group: groupOf(i.id), a: answers.get(i.key) }))
  const measuresOf = (rs) => {
    const res = { texts: rs.length }
    for (const c of CRITERIA) res[c] = rs.length ? rs.filter((r) => r.a[c] === true).length / rs.length : null
    res.falseClaimsPerText = rs.length ? rs.reduce((s, r) => s + (Number(r.a.false_claims) || 0), 0) / rs.length : null
    res.unsupportedClaimsPerText = rs.length ? rs.reduce((s, r) => s + (Number(r.a.unsupported_claims) || 0), 0) / rs.length : null
    res.noFalseClaim = rs.length ? rs.filter((r) => !(Number(r.a.false_claims) > 0)).length / rs.length : null
    return res
  }
  let seed = 12345
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const intervalOf = (rs, measure) => {
    const groups = [...new Set(rs.map((r) => r.group))]
    const byGroup = new Map(groups.map((g) => [g, rs.filter((r) => r.group === g)]))
    const boots = []
    for (let k = 0; k < 2000; k++) {
      const sample = []
      for (let j = 0; j < groups.length; j++) sample.push(...byGroup.get(groups[Math.floor(rand() * groups.length)]))
      boots.push(measuresOf(sample)[measure])
    }
    boots.sort((a, b) => a - b)
    return [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]]
  }
  const byWriter = {}
  for (const writer of [...new Set(rows.map((r) => r.writer))].sort()) {
    const rs = rows.filter((r) => r.writer === writer)
    const m = measuresOf(rs)
    m.interval95 = Object.fromEntries([...CRITERIA, 'falseClaimsPerText', 'noFalseClaim'].map((c) => [c, intervalOf(rs, c)]))
    m.medianWords = [...rs.map((r) => r.words)].sort((a, b) => a - b)[Math.floor(rs.length / 2)] ?? null
    byWriter[writer] = m
  }
  const today = byWriter.today
  const decoy = byWriter.decoy
  const controlPassed = !!(today && decoy && decoy.fix < today.fix && decoy.habit < today.habit)
  const summary = { name, answered: rows.length, of: key.items.length, moments: key.moments, control: { passed: controlPassed, today: today && { fix: today.fix, habit: today.habit }, decoy: decoy && { fix: decoy.fix, habit: decoy.habit } }, byWriter: controlPassed ? byWriter : null }
  writeFileSync(join(out, 'score.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify({ ...summary, byWriter: controlPassed ? Object.fromEntries(Object.entries(byWriter).map(([w, m]) => [w, { ...m, interval95: undefined }])) : null }))
}
