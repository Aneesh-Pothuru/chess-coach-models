// The writers' prompts for one split: one line a moment with its id and the
// chat messages (lib.mjs's system prompt and the moment's fact sheet). With
// --limit N, the first N moments in a seeded order (sha256 of the project, the
// word "sample" and the moment's id), so a sample spreads over the games. The
// file holds public games only, so it can be read on Colab.
//
//   node models/coach-narrator/review-writer/prompts.mjs --split train [--limit N]
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../../bridge/lib/lab.mjs'
import { PROJECT, PROMPT_VERSION, messagesOf, momentId, readFacts } from './lib.mjs'

const order = (m) => createHash('sha256').update(`${PROJECT}:sample:${momentId(m)}`).digest('hex')

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const split = arg('split')
if (split !== 'train' && split !== 'heldout') throw new Error('usage: prompts.mjs --split train|heldout [--limit N]')
const limit = Number(arg('limit', '0'))

const dir = privateDir(PROJECT)
const moments = readFacts(dir).filter((m) => m.split === split).sort((a, b) => (order(a) < order(b) ? -1 : 1))
const chosen = limit ? moments.slice(0, limit) : moments
const out = join(dir, `prompts-${split}${limit ? `-${limit}` : ''}-v${PROMPT_VERSION}.jsonl`)
writeFileSync(out, chosen.map((m) => JSON.stringify({ id: momentId(m), split, prompt: PROMPT_VERSION, messages: messagesOf(m) })).join('\n') + '\n')
console.error(`${chosen.length} of ${moments.length} ${split} moments written to ${out}`)
