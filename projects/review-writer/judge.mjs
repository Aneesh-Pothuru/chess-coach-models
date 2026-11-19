// The rule's blind judge. `build` writes the comparisons a judge reads: for each
// moment, a writer's text against today's text twice, once in each order, plus
// the controls: today's text against itself, and a decoy as long as the writer's
// text that restates the facts and explains nothing, against today's text, in
// both orders. Sides are labelled A and B only, and the items are shuffled with a
// fixed seed. `score` reads the judge's answers back and writes the preference
// rate over decided comparisons, pooled over both orders, with a 95% bootstrap
// interval over games, the rate in each batch with a t interval over batches (one
// judge call reads a batch, and calls lean differently), and the controls.
//
//   node projects/review-writer/judge.mjs build --writer gemma-4-26b-a4b --texts <file.jsonl> --name <name> [--limit N] [--batch 50] [--facts <moments.jsonl,...>]
//   node projects/review-writer/judge.mjs score --name <name>
//
// --facts adds moments in facts.mjs's shape from other files, such as coach-eval's
// puzzle moments. The bootstrap resamples games, or puzzles: a moment's id less its
// last ":index".
//
// A judge reads one batch file at a time and writes, beside it, answers-<k>.json:
// [{"key": "...", "choice": "A" | "B" | "same"}, ...].
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../bridge/lib/lab.mjs'
import { PROJECT, momentId, readFacts, readJsonl, todayText } from './lib.mjs'

export const JUDGE_INSTRUCTIONS = [
  'You are judging explanations in a chess training app. Each item shows two explanations, A and B, of the same moment in a game, written for the player who made the move, a club player rated about 1350.',
  'For each item, pick the explanation that player would understand better and could use better in their next games: clearer about what went wrong and what to do instead, with nothing that would confuse them.',
  'Judge only clarity and usefulness to that player. Do not reward length, do not try to check the chess yourself, and answer "same" when neither is better.',
].join(' ')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const hash = (s) => createHash('sha256').update(s).digest()
const coin = (s) => hash(s)[0] < 128

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

const dir = privateDir(PROJECT)
const mode = process.argv[2]
const name = arg('name')
if (!name || (mode !== 'build' && mode !== 'score')) throw new Error('usage: judge.mjs build|score --name <name> [...]')
const out = join(dir, `judge-${name}`)

if (mode === 'build') {
  const writer = arg('writer')
  const textsPath = arg('texts')
  if (!writer || !textsPath) throw new Error('build needs --writer and --texts')
  const limit = Number(arg('limit', '0'))
  const batch = Number(arg('batch', '50'))
  const extra = (arg('facts') ?? '').split(',').filter(Boolean).flatMap((path) => readJsonl(path))
  const facts = new Map([...readFacts(dir), ...extra].map((m) => [momentId(m), m]))
  let texts = readJsonl(textsPath).filter((t) => t.writer === writer)
  texts.sort((a, b) => (hash(`${PROJECT}:judge:${a.id}`).toString('hex') < hash(`${PROJECT}:judge:${b.id}`).toString('hex') ? -1 : 1))
  if (limit) texts = texts.slice(0, limit)
  const items = []
  const add = (kind, id, first, second, firstIs, secondIs, order) =>
    items.push({ key: `${kind}|${id}|${order}`, kind, id, order, A: first, B: second, sides: { A: firstIs, B: secondIs } })
  texts.forEach((t, k) => {
    const m = facts.get(t.id)
    const today = todayText(m)
    const forward = coin(`${PROJECT}:order:${t.id}`)
    add('pair', t.id, forward ? t.text : today, forward ? today : t.text, forward ? 'writer' : 'today', forward ? 'today' : 'writer', 1)
    add('pair', t.id, forward ? today : t.text, forward ? t.text : today, forward ? 'today' : 'writer', forward ? 'writer' : 'today', 2)
    if (k % 10 === 0) add('same', t.id, today, today, 'today', 'today', 1)
    if (k % 10 === 5) {
      const decoy = decoyOf(m, t.text.split(/\s+/).length)
      add('decoy', t.id, decoy, today, 'decoy', 'today', 1)
      add('decoy', t.id, today, decoy, 'today', 'decoy', 2)
    }
  })
  items.sort((a, b) => (hash(`${PROJECT}:shuffle:${a.key}`).toString('hex') < hash(`${PROJECT}:shuffle:${b.key}`).toString('hex') ? -1 : 1))
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'key.json'), JSON.stringify({ writer, texts: textsPath, items: items.map(({ key, kind, id, order, sides }) => ({ key, kind, id, order, sides })) }, null, 1))
  for (let b = 0; b * batch < items.length; b++) {
    const part = items.slice(b * batch, (b + 1) * batch).map(({ key, A, B }) => ({ key, A, B }))
    writeFileSync(join(out, `batch-${b}.json`), JSON.stringify({ instructions: JUDGE_INSTRUCTIONS, items: part }, null, 1))
  }
  console.log(JSON.stringify({ name, writer, moments: texts.length, items: items.length, batches: Math.ceil(items.length / batch), dir: out }))
} else {
  const key = JSON.parse(readFileSync(join(out, 'key.json'), 'utf8'))
  const answers = new Map()
  for (const f of readdirSync(out).filter((f) => /^answers-\d+\.json$/.test(f))) {
    for (const a of JSON.parse(readFileSync(join(out, f), 'utf8'))) answers.set(a.key, a.choice)
  }
  const winner = (item) => {
    const c = answers.get(item.key)
    if (c !== 'A' && c !== 'B') return c === 'same' ? 'same' : null
    return item.sides[c]
  }
  const pairs = key.items.filter((i) => i.kind === 'pair').map((i) => ({ ...i, game: i.id.slice(0, i.id.lastIndexOf(':')), won: winner(i) })).filter((i) => i.won)
  const decided = pairs.filter((i) => i.won !== 'same')
  const rate = (rows) => (rows.length ? rows.filter((i) => i.won === 'writer').length / rows.length : null)
  const games = [...new Set(decided.map((i) => i.game))]
  const byGame = new Map(games.map((g) => [g, decided.filter((i) => i.game === g)]))
  let seed = 12345
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const boots = []
  for (let r = 0; r < 2000; r++) {
    const rows = []
    for (let k = 0; k < games.length; k++) rows.push(...byGame.get(games[Math.floor(rand() * games.length)]))
    boots.push(rate(rows))
  }
  boots.sort((a, b) => a - b)
  // Each batch is read by one judge call, and calls differ in how they lean, so the
  // rate is also taken per batch, with a t interval over batches.
  const batchOf = new Map()
  for (const f of readdirSync(out).filter((f) => /^batch-\d+\.json$/.test(f))) {
    const b = Number(f.match(/\d+/)[0])
    for (const it of JSON.parse(readFileSync(join(out, f), 'utf8')).items) batchOf.set(it.key, b)
  }
  const batchRates = [...new Set(decided.map((i) => batchOf.get(i.key)))].sort((a, b) => a - b).map((b) => rate(decided.filter((i) => batchOf.get(i.key) === b)))
  const T975 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086]
  const batchMean = batchRates.reduce((s, r) => s + r, 0) / batchRates.length
  const batchSd = Math.sqrt(batchRates.reduce((s, r) => s + (r - batchMean) ** 2, 0) / Math.max(batchRates.length - 1, 1))
  const half = (T975[batchRates.length - 1] ?? 2) * batchSd / Math.sqrt(batchRates.length)
  const same = key.items.filter((i) => i.kind === 'same').map(winner).filter(Boolean)
  const decoys = key.items.filter((i) => i.kind === 'decoy').map(winner).filter((w) => w && w !== 'same')
  const summary = {
    name,
    writer: key.writer,
    answered: answers.size,
    of: key.items.length,
    comparisons: pairs.length,
    decided: decided.length,
    writerPreferred: decided.filter((i) => i.won === 'writer').length,
    preferenceRate: rate(decided),
    interval95: [boots[Math.floor(0.025 * boots.length)], boots[Math.floor(0.975 * boots.length)]],
    batchRates,
    batchInterval95: batchRates.length > 1 ? [batchMean - half, batchMean + half] : null,
    sameControl: { items: same.length, calledSame: same.filter((w) => w === 'same').length },
    decoyControl: { decided: decoys.length, decoyWins: decoys.filter((w) => w === 'decoy').length, todayWins: decoys.filter((w) => w === 'today').length },
  }
  writeFileSync(join(out, 'score.json'), JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary))
}
