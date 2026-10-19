import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('analyze.mjs', import.meta.url), 'utf8')
const appExpression = source.match(/const report = \{\s*app: ([^\n]+),\n/)?.[1]
assert.ok(appExpression, 'the report names its app provenance')

test('cached evidence keeps its recorded app when the checkout changes', () => {
  const app = { commit: 'measured-app', archive: 'synthetic-archive' }
  const reported = runInNewContext(`(${appExpression})`, {
    positionsSummary: { app },
    CHESS_DIR: 'new-checkout',
    gitCommit: () => 'new-checkout-commit',
  })
  assert.equal(reported, app, 'retain the source metadata, rather than relabel cached scores')
})
