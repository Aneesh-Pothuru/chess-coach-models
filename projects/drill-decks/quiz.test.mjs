import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { chess } from '../../bridge/lib/chess.mjs'

// Exercise each script's real quiz reading with synthetic options and its
// actual app import. No deck, engine, private rows or output file is opened.
async function reading(file, start, end, context, result) {
  const filename = new URL(file, import.meta.url)
  const source = readFileSync(filename, 'utf8')
  const modulePath = source.match(/const S = await load\('([^']+)'\)/)?.[1]
  assert.ok(modulePath, 'the script names its app quiz instrument')
  assert.equal(source.split(start).length, 2)
  assert.equal(source.split(end).length, 2)
  const block = source.slice(source.indexOf(start), source.indexOf(end)).replace(/:\s*(?:any|number)\b/g, '')
  return runInNewContext(`${block}\n${result}`, { ...context, S: await chess(modulePath) }, { filename: filename.pathname })
}

const options = (second, best = 'Nd2') => [
  { move: best, line: '', eval: 100 },
  { move: 'h3', line: '', eval: second },
  { move: 'a3', line: '', eval: 0 },
]
const census = (opts) => reading('./census.mts', 'const quizRows =', 'const quiz =', {
  quizzes: [{ id: 'synthetic', phase: 'middlegame', played: 'h3', options: opts }],
}, 'quizRows[0]')
const threatQuiz = (opts) => reading('./threats.mts', '  if (quiet) {', '  rows.push({', {
  quiet: true, it: { options: opts }, quiz: null,
}, 'quiz')

test('the census uses the app quiz instrument, including its inclusive margin', async () => {
  assert.equal((await census(options(55))).right, 2)
  assert.equal((await census(options(54))).right, 1)
  assert.equal((await census(options(54))).plan, true)
})

test('quiet misses can supply a one-answer plan quiz by that same instrument', async () => {
  assert.equal(await threatQuiz(options(54)), true)
  assert.equal(await threatQuiz(options(55)), false)
  assert.equal(await threatQuiz(options(54, 'Nxd2')), false)
  assert.equal(await threatQuiz(options(-100).map((o, i) => i === 2 ? { ...o, eval: -101 } : o)), false)
})
