// coach-eval's bare task: for each of review-writer's moments in a split, the
// position before the move, the move played, the player's side and rating, and
// the rubric, with no other facts. One line a moment with its id and the chat
// messages, in the shape review-writer's write.py reads. With --limit N, the
// moments come in review-writer's seeded sample order, so the bare and grounded
// tasks read the same moments.
//
//   node projects/coach-eval/prompts.mjs --split train [--limit N]
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { privateDir } from '../../bridge/lib/lab.mjs'
import { PROJECT as WRITER, momentId, readFacts } from '../review-writer/lib.mjs'
import { BARE_VERSION, PROJECT, bareMessagesOf } from './lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const split = arg('split')
if (split !== 'train' && split !== 'heldout') throw new Error('usage: prompts.mjs --split train|heldout [--limit N]')
const limit = Number(arg('limit', '0'))

const order = (m) => createHash('sha256').update(`${WRITER}:sample:${momentId(m)}`).digest('hex')
const moments = readFacts(privateDir(WRITER)).filter((m) => m.split === split).sort((a, b) => (order(a) < order(b) ? -1 : 1))
const chosen = limit ? moments.slice(0, limit) : moments
const out = join(privateDir(PROJECT), `bare-${split}${limit ? `-${limit}` : ''}-v${BARE_VERSION}.jsonl`)
writeFileSync(out, chosen.map((m) => JSON.stringify({ id: momentId(m), split, prompt: `bare-${BARE_VERSION}`, messages: bareMessagesOf(m) })).join('\n') + '\n')
console.error(`${chosen.length} of ${moments.length} ${split} moments written to ${out}`)
