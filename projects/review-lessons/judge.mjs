// The judged fit of the README's rule: on the moments where B and C name
// different chapters, a model judge picks the chapter that teaches what the
// moment needed, blind and in both orders, with the same-chapter and decoy
// controls. Reads the rows measure.mjs wrote; keeps each verdict under
// private/review-lessons/judge/ and resumes; writes the counts, the bootstrap
// and the rule's verdict to results/.
//
//   JUDGE_MODEL=<model> bridge/run.sh projects/review-lessons/judge.mjs [--jobs N] [--only train|heldout] [--kind pair|same|decoy|via-<path>] [--dry]
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR, chess, privateDir, resultsDir } from '../../bridge/lib/chess.mjs'
import {
  CONTROLS,
  COVERAGE_SLACK,
  DECOY_BAR,
  DRAWS,
  JUDGE_HELDOUT,
  JUDGE_TRAIN,
  PROJECT,
  SAME_BAR,
  SEED,
  gitCommit,
  mulberry32,
  readJson,
  reviewPath,
  sample,
} from './lib.mjs'

const MODEL = process.env.JUDGE_MODEL
const dry = process.argv.includes('--dry')
if (!MODEL && !dry) throw new Error('set JUDGE_MODEL')
const jobsAt = process.argv.indexOf('--jobs')
const JOBS = jobsAt > 0 ? Number(process.argv[jobsAt + 1]) : 4
const onlyAt = process.argv.indexOf('--only')
const ONLY = onlyAt > 0 ? process.argv[onlyAt + 1] : null
const kindAt = process.argv.indexOf('--kind')
const KIND = kindAt > 0 ? process.argv[kindAt + 1] : null
const NARRATION_WORDS = 220
const CLEAN = join(LAB_DIR, 'projects', 'lesson-videos', 'bin', 'claude-clean.sh')

const { lessonFor } = await chess('src/services/review/index.ts')
const { buildStudyFromDisk } = await chess('src/adapters/node/study/index.ts')
const { tryBoard } = await chess('src/services/knowledge/index.ts')

const dir = privateDir(PROJECT)
const verdicts = join(dir, 'judge')
mkdirSync(verdicts, { recursive: true })
const study = buildStudyFromDisk(CHESS_DIR)
const lessons = new Map(study.lessons.map((d) => [d.id, d]))
const measured = readJson(join(resultsDir(PROJECT), 'measure.json'))
if (!measured || measured.app.commit !== gitCommit(CHESS_DIR)) throw new Error('measure.json is missing or measured another commit: run measure.mjs first')

const SYSTEM = [
  'You check which lesson chapter a chess coaching app should link from one moment of a player\'s game.',
  'The player is rated about 1100 in rapid games.',
  'The moment is described by the app\'s game review, whose facts come from a chess engine and board code: take them as true, and do not analyse the position yourself.',
  'Each chapter is one scene of a video lesson, given by its lesson\'s title, its own title and its narration.',
  'Pick the chapter that teaches what this moment needed: the kind of mistake he made, or the idea he missed.',
  'Answer "same" when both chapters fit equally well or equally badly.',
].join(' ')

const SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string', enum: ['A', 'B', 'same'] }, reason: { type: 'string' } },
  required: ['answer', 'reason'],
  additionalProperties: false,
}

function sanLine(fen, ucis, max = 8) {
  let board = tryBoard(fen)
  const out = []
  for (const uci of ucis.slice(0, max)) {
    const mv = board?.findUci(uci)
    if (!mv) break
    out.push(mv.san)
    board = board.child(mv)
  }
  return out.join(' ')
}

function chapterText(ref) {
  const doc = lessons.get(ref.lesson)
  const scene = doc?.script.find((s) => s.n === ref.chapter)
  if (!doc || !scene) throw new Error(`no chapter ${ref.lesson}:${ref.chapter}`)
  const words = scene.beats.map((b) => b.say).join(' ').split(/\s+/).filter(Boolean)
  const narration = words.length > NARRATION_WORDS ? `${words.slice(0, NARRATION_WORDS).join(' ')} …` : words.join(' ')
  return `Lesson: "${doc.title}". Chapter: "${scene.title}".\nNarration: ${narration}`
}

const docs = new Map()
function momentText(row) {
  if (!docs.has(row.game)) docs.set(row.game, readJson(reviewPath(dir, row.game)))
  const doc = docs.get(row.game)
  const r = doc.records[row.index]
  const fen = doc.fens[row.index]
  const lesson = lessonFor(doc, row.index)
  const reply = lesson.allowed?.line ?? ''
  return [
    `Position before his move (FEN): ${fen}`,
    `He played ${r.san} (graded a ${r.cls}). The engine preferred ${sanLine(fen, [r.bestUci])}.`,
    reply ? `The engine's line after his move: ${reply}` : null,
    `The review says: ${lesson.headline}`,
    ...lesson.difference.map((d) => `- ${d}`),
  ]
    .filter(Boolean)
    .join('\n')
}

function prompt(row, first, second) {
  return `Moment:\n${momentText(row)}\n\nChapter A:\n${chapterText(first)}\n\nChapter B:\n${chapterText(second)}\n\nWhich chapter teaches what this moment needed? Answer A, B or same, with a one-sentence reason.`
}

function ask(text) {
  return new Promise((resolve, reject) => {
    const args = [CLEAN, '/tmp', '--model', MODEL, '--output-format', 'stream-json', '--verbose', '--tools', '', '--max-turns', '3', '--system-prompt', SYSTEM, '--json-schema', JSON.stringify(SCHEMA), '--no-session-persistence']
    const child = spawn('bash', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', () => {})
    child.on('error', reject)
    child.on('close', () => {
      let result = null
      for (const line of out.split('\n')) {
        try {
          const ev = JSON.parse(line)
          if (ev.type === 'result') result = ev
        } catch {}
      }
      const answer = result?.structured_output?.answer
      if (!answer) return reject(new Error(`no answer: ${(result?.result ?? out).slice(0, 200)}`))
      resolve({ answer, reason: result.structured_output.reason ?? '', cost: result.total_cost_usd ?? 0 })
    })
    child.stdin.end(text)
  })
}

const chapterKey = (m) => `${m.lesson}:${m.chapter}`
const rowsOf = (name) => readJson(join(dir, `rows-${name}.json`))
const differ = (rows) => rows.filter((r) => r.b && r.c && chapterKey(r.b) !== chapterKey(r.c))

const allChapters = study.lessons.flatMap((d) => d.script.map((s) => ({ lesson: d.id, chapter: s.n })))
function decoyFor(row, rand) {
  const pool = allChapters.filter((c) => c.lesson !== row.c.lesson)
  return pool[Math.floor(rand() * pool.length)]
}

const items = []
for (const [name, n, seed] of [
  ['train', JUDGE_TRAIN, SEED],
  ['heldout', JUDGE_HELDOUT, SEED + 1],
]) {
  for (const row of sample(differ(rowsOf(name)), n, seed)) items.push({ kind: 'pair', split: name, row, b: row.b, c: row.c })
}
const named = rowsOf('heldout').filter((r) => r.c)
for (const row of sample(named, CONTROLS, SEED + 2)) items.push({ kind: 'same', split: 'heldout', row, b: row.c, c: row.c })
const rand = mulberry32(SEED + 3)
for (const row of sample(named, CONTROLS, SEED + 4)) items.push({ kind: 'decoy', split: 'heldout', row, b: decoyFor(row, rand), c: row.c })
const VIAS = ['mistake', 'fix', 'reply']
VIAS.forEach((via, i) => {
  const drawn = mulberry32(SEED + 10 + i)
  for (const row of sample(named.filter((r) => r.c.via === via), CONTROLS, SEED + 6 + i)) items.push({ kind: `via-${via}`, split: 'heldout', row, b: decoyFor(row, drawn), c: row.c })
})

const fileOf = (item, order) => join(verdicts, `${item.kind}-${item.split}-${item.row.game.replace(/^cc:/, '')}-${item.row.index}-${order}.json`)
const shownOf = (item, order) => (order === 'cb' ? [item.c, item.b] : [item.b, item.c])
const pairOf = (item, order) => shownOf(item, order).map(chapterKey).join(' / ')
const readVerdict = (item, order) => {
  const v = readJson(fileOf(item, order))
  return v && v.pair === pairOf(item, order) ? v : null
}
const calls = items.flatMap((item) => ['cb', 'bc'].map((order) => ({ item, order, file: fileOf(item, order) })))
const owed = calls.filter((c) => !readVerdict(c.item, c.order) && (!ONLY || c.item.split === ONLY) && (!KIND || c.item.kind === KIND))
console.error(`${items.length} items, ${calls.length} calls, ${owed.length} owed`)
if (dry) {
  const c = calls[0]
  console.log(prompt(c.item.row, c.item.c, c.item.b))
  process.exit(0)
}

let next = 0
let spent = 0
let failed = 0
async function worker() {
  while (next < owed.length) {
    const call = owed[next++]
    const [first, second] = shownOf(call.item, call.order)
    try {
      const v = await ask(prompt(call.item.row, first, second))
      spent += v.cost
      const winner = v.answer === 'same' ? 'same' : (v.answer === 'A') === (call.order === 'cb') ? 'c' : 'b'
      writeFileSync(call.file, JSON.stringify({ pair: pairOf(call.item, call.order), answer: v.answer, winner, reason: v.reason, cost: v.cost }))
    } catch (e) {
      failed++
      console.error(`${call.file}: ${e.message}`)
    }
  }
}
await Promise.all(Array.from({ length: JOBS }, worker))
console.error(`judged ${owed.length - failed}, failed ${failed}, about $${spent.toFixed(2)} at list price`)

function verdictOf(item) {
  const a = readVerdict(item, 'cb')
  const b = readVerdict(item, 'bc')
  if (!a || !b) return null
  const w = [a.winner, b.winner]
  const c = w.filter((x) => x === 'c').length
  const bb = w.filter((x) => x === 'b').length
  return c > 0 && bb === 0 ? 'win' : bb > 0 && c === 0 ? 'loss' : 'tie'
}

function bootstrap(scored, draws, seed) {
  const games = [...new Set(scored.map((s) => s.game))]
  const byGame = new Map(games.map((g) => [g, scored.filter((s) => s.game === g)]))
  const r = mulberry32(seed)
  const stats = []
  for (let i = 0; i < draws; i++) {
    let net = 0
    let n = 0
    for (let j = 0; j < games.length; j++) {
      for (const s of byGame.get(games[Math.floor(r() * games.length)])) {
        net += s.v === 'win' ? 1 : s.v === 'loss' ? -1 : 0
        n++
      }
    }
    stats.push(n ? net / n : 0)
  }
  stats.sort((x, y) => x - y)
  return [stats[Math.floor(draws * 0.025)], stats[Math.floor(draws * 0.975)]]
}

const out = { app: measured.app, judged: {}, controls: {}, paths: {}, rule: {} }
for (const name of ['train', 'heldout']) {
  const scored = items.filter((i) => i.kind === 'pair' && i.split === name).map((i) => ({ game: i.row.game, v: verdictOf(i) })).filter((s) => s.v)
  const count = (v) => scored.filter((s) => s.v === v).length
  const net = scored.length ? (count('win') - count('loss')) / scored.length : null
  const kinds = {}
  for (const i of items.filter((x) => x.kind === 'pair' && x.split === name)) {
    const v = verdictOf(i)
    if (!v) continue
    const k = i.row.mistake ? i.row.mistake.kind : 'none'
    kinds[k] ??= { win: 0, tie: 0, loss: 0 }
    kinds[k][v]++
  }
  out.judged[name] = { differ: measured.splits[name].differ, judged: scored.length, wins: count('win'), losses: count('loss'), ties: count('tie'), net, interval: scored.length ? bootstrap(scored, DRAWS, SEED + 5) : null, kinds }
}
const control = (kind) => {
  const vs = items.filter((i) => i.kind === kind).map(verdictOf).filter(Boolean)
  return { judged: vs.length, same: vs.filter((v) => v === 'tie').length, cWins: vs.filter((v) => v === 'win').length, cLosses: vs.filter((v) => v === 'loss').length }
}
out.controls = { same: control('same'), decoy: control('decoy') }
out.paths = Object.fromEntries(VIAS.map((via) => [via, control(`via-${via}`)]).map(([via, c]) => [via, { ...c, shown: c.cWins >= DECOY_BAR }]))
const h = out.judged.heldout
const ms = measured.splits.heldout
out.rule = {
  controlsHold: out.controls.same.same >= SAME_BAR && out.controls.decoy.cWins >= DECOY_BAR,
  heldoutWins: h.wins > h.losses && h.interval !== null && h.interval[0] > 0,
  coverage: ms.c.coverage >= ms.b.coverage - COVERAGE_SLACK,
  spread: ms.c.top.share <= ms.b.top.share,
  trainNotWorse: out.judged.train.wins >= out.judged.train.losses,
}
out.rule.kept = Object.values(out.rule).every(Boolean)
const res = resultsDir(PROJECT)
writeFileSync(join(res, 'judge.json'), `${JSON.stringify(out, null, 1)}\n`)
const pct = (x) => `${(x * 100).toFixed(1)}%`
const lines = [
  '# Review lessons: the judged fit and the rule',
  '',
  `Written by \`judge.mjs\` on the app at \`${out.app.commit}\`, from the rows \`measure.mjs\` wrote there (\`measure.md\`). The judge saw each pair blind, in both orders.`,
  '',
  '| | train | held out |',
  '|---|---|---|',
  `| moments where B and C differ | ${out.judged.train.differ} | ${h.differ} |`,
  `| judged | ${out.judged.train.judged} | ${h.judged} |`,
  `| C wins / ties / losses | ${out.judged.train.wins} / ${out.judged.train.ties} / ${out.judged.train.losses} | ${h.wins} / ${h.ties} / ${h.losses} |`,
  `| (wins - losses) / judged, 95% interval over games | ${out.judged.train.net === null ? 'n/a' : `${out.judged.train.net.toFixed(2)} [${out.judged.train.interval.map((x) => x.toFixed(2)).join(', ')}]`} | ${h.net === null ? 'n/a' : `${h.net.toFixed(2)} [${h.interval.map((x) => x.toFixed(2)).join(', ')}]`} |`,
  '',
  `Controls, held out: the same chapter on both sides read as the same in ${out.controls.same.same} of ${out.controls.same.judged} (bar ${SAME_BAR} of ${CONTROLS}); against a chapter drawn from another lesson, C won ${out.controls.decoy.cWins} of ${out.controls.decoy.judged} (bar ${DECOY_BAR}).`,
  '',
  `Coverage held out: C ${pct(ms.c.coverage)}, B ${pct(ms.b.coverage)}; the most named chapter takes ${pct(ms.c.top.share)} of C's named moments and ${pct(ms.b.top.share)} of B's.`,
  '',
  `Each path against a decoy, held out (not part of the rule; the Game Review links only from a path that reaches the bar of ${DECOY_BAR}): ` +
    VIAS.map((via) => `${via}, C won ${out.paths[via].cWins} of ${out.paths[via].judged} (${out.paths[via].same} same, ${out.paths[via].cLosses} lost)`).join('; ') +
    '.',
  '',
  '**The rule.** ' +
    [
      `controls ${out.rule.controlsHold ? 'hold' : 'fail'}`,
      `held-out wins over losses ${out.rule.heldoutWins ? 'beyond the noise' : 'not beyond the noise'}`,
      `coverage ${out.rule.coverage ? 'kept' : 'lower'}`,
      `spread ${out.rule.spread ? 'kept' : 'worse'}`,
      `train ${out.rule.trainNotWorse ? 'not worse' : 'worse'}`,
    ].join('; ') +
    `: C is ${out.rule.kept ? 'kept' : 'not kept'}.`,
]
writeFileSync(join(res, 'review-lessons.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
