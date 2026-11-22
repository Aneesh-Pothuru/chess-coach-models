// The puzzle moments' prompts for one split, in the shape review-writer's write.py
// reads: the grounded prompt (review-writer's system prompt and fact sheet) and
// coach-eval's bare prompt, one line a moment each. First merges puzzle-facts.mjs's
// output for both sets into private/coach-eval/puzzle-moments.jsonl, which
// review-writer's check.mjs reads with --facts. With --limit N, the first N moments
// in a seeded order (sha256 of the project, the words "puzzle-sample" and the
// moment's id). The course puzzles stay private, so these files do too.
//
//   node models/coach-narrator/coach-eval/puzzle-prompts.mjs --split train|heldout [--limit N]
import { createHash } from 'node:crypto'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../../bridge/lib/lab.mjs'
import { PROMPT_VERSION, messagesOf, momentId, readJsonl } from '../review-writer/lib.mjs'
import { BARE_VERSION, PROJECT, bareMessagesOf } from './lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const split = arg('split')
if (split !== 'train' && split !== 'heldout') throw new Error('usage: puzzle-prompts.mjs --split train|heldout [--limit N]')
const limit = Number(arg('limit', '0'))

const dir = privateDir(PROJECT)
const files = readdirSync(dir).filter((f) => /^puzzle-facts-(course|lichess)(-\d+of\d+)?\.jsonl$/.test(f)).sort()
const seen = new Set()
const moments = files.flatMap((f) => readJsonl(join(dir, f))).filter((m) => {
  const id = momentId(m)
  if (seen.has(id)) return false
  seen.add(id)
  return true
})
writeFileSync(join(dir, 'puzzle-moments.jsonl'), moments.map((m) => JSON.stringify(m)).join('\n') + '\n')

const order = (m) => createHash('sha256').update(`${PROJECT}:puzzle-sample:${momentId(m)}`).digest('hex')
const inSplit = moments.filter((m) => m.split === split).sort((a, b) => (order(a) < order(b) ? -1 : 1))
const chosen = limit ? inSplit.slice(0, limit) : inSplit
const tag = `${split}${limit ? `-${limit}` : ''}`
const lines = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
writeFileSync(join(dir, `puzzle-prompts-${tag}-v${PROMPT_VERSION}.jsonl`), lines(chosen.map((m) => ({ id: momentId(m), split, prompt: PROMPT_VERSION, messages: messagesOf(m) }))))
writeFileSync(join(dir, `puzzle-bare-${tag}-v${BARE_VERSION}.jsonl`), lines(chosen.map((m) => ({ id: momentId(m), split, prompt: `bare-${BARE_VERSION}`, messages: bareMessagesOf(m) }))))
const bySet = (rows) => rows.reduce((a, m) => ((a[m.month] = (a[m.month] ?? 0) + 1), a), {})
console.error(JSON.stringify({ moments: moments.length, bySet: bySet(moments), split, inSplit: inSplit.length, chosen: chosen.length, chosenBySet: bySet(chosen) }))
