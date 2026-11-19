// Prints a coaching sheet's truth-check vocabulary (numbers, tactics, line starts) for
// one moment, to read why a text passes or fails.
//
//   bridge/run.sh projects/coach-eval/coach-vocab-peek.mjs <sheets.jsonl> <id>
import { readFileSync } from 'node:fs'
import { NUMBER, NUMBER_WORDS } from '../review-writer/truth.mjs'
import { coachVocabularyOf } from './coach-check.mjs'
import { coachSheetOf } from './coach-prompts.mjs'

const sheet = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((s) => s.id === process.argv[3])
const v = coachVocabularyOf(sheet)
console.log(JSON.stringify({ numbers: [...v.numbers], tactics: [...v.tactics], starts: [...v.starts], moves: [...v.moves].length, mate: v.mate }))
const joined = JSON.stringify(coachSheetOf(sheet))
for (const x of joined.matchAll(NUMBER)) console.log('number', x[0], 'in', joined.slice(Math.max(0, x.index - 30), x.index + 10))
for (const word of Object.keys(NUMBER_WORDS)) {
  const m = new RegExp(`\\b${word}\\b`, 'i').exec(joined)
  if (m) console.log('word', word, 'in', joined.slice(Math.max(0, m.index - 30), m.index + 15))
}
process.exit(0)
