import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const filename = new URL('./score.mjs', import.meta.url)
const source = readFileSync(filename, 'utf8').replace(/^import[\s\S]*?from ['"][^'"\n]+['"]\n/gm, '')
const candidates = Array.from({ length: 8 }, (_, id) => ({ id, gi: id, fen: `synthetic-${id} w`, history: [id], breaks: ['c2c3'], played: 'd2d3' }))
const legal = ['a2a3', 'b2b3', 'c2c3', 'd2d3', 'e2e3'].map((u) => ({ from: u.slice(0, 2), to: u.slice(2) }))

// Run the actual scorer with synthetic input and mocked app/engine boundaries.
// The engine mock reports candidates 1 and 3 as forcing; no chess is evaluated.
async function run({ shards = 1, files = [], previous = [], state = { engines: 0 } } = {}) {
  const rows = []
  await runInNewContext(`(async () => { ${source} })()`, {
    appendFileSync: (_, line) => rows.push(JSON.parse(line)),
    readdirSync: () => files, join: (...parts) => parts.join('/'),
    Chess: class { moves() { return legal } }, CHESS_DIR: '/synthetic',
    chess: async (path) => {
      if (path.includes('adapters/node')) return { createNodeEngine: () => {
        state.engines++
        return {
          newGame: async () => {},
          bestMoves: async () => ({ lines: [{ move: 'e2e3', score: { exact: true }, eval: 0 }] }),
          scoreMove: async () => ({ score: { exact: true }, eval: 0 }), dispose: async () => {},
        }
      } }
      if (path.includes('services/engine')) return { acceptsAlternative: () => true, lostWp: () => 0 }
      if (path.includes('core/score')) return { isExactScore: (s) => s.exact, winPercentFor: () => 50 }
      return { START_FEN: '', position: (_, history) => ({ id: history[0] }), fenOf: (p) => `synthetic-${p.id} w` }
    },
    privateDir: () => '/synthetic', BUDGET: 'grade', PROJECT: 'structure-breaks', SEED: 20261019, WIN_LOW: 10, WIN_HIGH: 90,
    argOf: (name, fallback) => ({ '--who': 'strong', '--shard': `0/${shards}`, '--positions': '4' })[name] ?? fallback,
    quietMove: (fen) => ![1, 3].includes(Number(fen.split(' ')[0].split('-')[1])),
    randomOthers: () => ['a2a3', 'b2b3'],
    readJsonl: (file) => file.endsWith('candidates.jsonl') ? candidates : previous,
    seedOf: () => 0, shardOf: () => ({ i: 0, n: shards }), topOf: () => null,
    console: { error() {} }, process: { exit() {} },
  }, { filename: filename.pathname })
  return rows
}

test('the strong sample takes the first target successes in source order', async () => {
  const rows = await run()
  assert.deepEqual(rows.filter((r) => r.status === 'scored').map((r) => r.id), [0, 2, 4, 5])
})

test('the sequential strong scorer resumes without changing the source-order prefix', async () => {
  const previous = [{ id: 0, status: 'scored' }, { id: 1, status: 'forcing best' }, { id: 2, status: 'scored' }]
  const rows = await run({ previous, files: ['strong-0-of-1.jsonl'] })
  assert.deepEqual(rows.filter((r) => r.status === 'scored').map((r) => r.id), [4, 5])
})

test('strong shard quotas are refused before creating an engine', async () => {
  const state = { engines: 0 }
  await assert.rejects(run({ shards: 2, state }), /strong.*single shard.*source order/)
  assert.equal(state.engines, 0)
})

test('legacy multi-shard strong rows cannot be mixed with a sequential rerun', async () => {
  const state = { engines: 0 }
  await assert.rejects(run({ files: ['strong-0-of-4.jsonl'], state }), /archive.*multi-shard.*strong.*before/)
  assert.equal(state.engines, 0)
})
