// The fine-tuning set: for each train moment in the prompts files, the first of the
// teachers' texts (in the order given) that passed the truth check, as the answer
// to learn. A moment no teacher's text passed is left out. Each texts file needs
// check.mjs's rows for it, in the same order. Held-out moments are never read.
//
//   node models/coach-narrator/review-writer/sft.mjs --prompts <a.jsonl,...> --texts <t.jsonl,...> --checks <check-t.jsonl,...> --out <sft.jsonl>
import { writeFileSync } from 'node:fs'
import { readJsonl } from './lib.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const list = (name) => (arg(name) ?? '').split(',').filter(Boolean)
const prompts = list('prompts').flatMap((path) => readJsonl(path)).filter((p) => p.split === 'train')
const texts = list('texts')
const checks = list('checks')
const out = arg('out')
if (!prompts.length || !texts.length || texts.length !== checks.length || !out) {
  throw new Error('usage: sft.mjs --prompts <a.jsonl,...> --texts <t.jsonl,...> --checks <check-t.jsonl,...> --out <sft.jsonl>')
}

const teachers = texts.map((path, k) => {
  const passed = new Set(readJsonl(checks[k]).filter((r) => r.pass).map((r) => `${r.id}|${r.writer}`))
  return new Map(readJsonl(path).filter((t) => passed.has(`${t.id}|${t.writer}`) && t.text?.trim()).map((t) => [t.id, t]))
})
const rows = []
const byTeacher = {}
for (const p of prompts) {
  const t = teachers.map((m) => m.get(p.id)).find(Boolean)
  if (!t) continue
  rows.push({ id: p.id, teacher: t.writer, messages: p.messages, target: t.text.trim() })
  byTeacher[t.writer] = (byTeacher[t.writer] ?? 0) + 1
}
writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log(JSON.stringify({ prompts: prompts.length, examples: rows.length, byTeacher, out }))
