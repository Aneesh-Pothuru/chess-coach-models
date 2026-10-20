// Reporting provenance. Content hashes survive a rebase of this lab branch.
// The app and records pins remain commit identities owned by those repositories.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const LAB = fileURLToPath(new URL('../../', import.meta.url))
const PROJECT = join(LAB, 'projects/second-look-fresh')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const insist = (ok, message) => { if (!ok) throw new Error(`provenance: ${message}`) }
const digest = value => /^[0-9a-f]{64}$/.test(value ?? '')

export function readDesign() {
  const bytes = readFileSync(join(PROJECT, 'design-manifest.json'))
  const manifest = JSON.parse(bytes)
  insist(manifest.schema === 'second-look-fresh-design/1', 'unknown content-manifest schema')
  return { manifest, designSha256: hash(bytes) }
}

export function verifyDesignCode() {
  const { manifest, designSha256 } = readDesign()
  const pin = JSON.parse(readFileSync(join(LAB, 'bridge/chess.json'), 'utf8'))
  insist(manifest.appCommit === pin.commit && manifest.recordsCommit === pin.records, 'app or records pin changed')
  const expected = ['rules.mjs', 'prepare.mjs', 'candidate.mjs', 'runtime.mjs', 'build.mjs',
    'probe.mjs', 'common.mjs', 'reference.mjs', 'analyze.mjs', 'phase2.sh']
    .map(name => `projects/second-look-fresh/${name}`)
  expected.push('projects/accuracy-vs-chesscom/build-evidence.mjs')
  insist(JSON.stringify(Object.keys(manifest.files).sort()) === JSON.stringify(expected.sort()), 'frozen source set differs')
  const measurementSourceHashes = Object.fromEntries(Object.entries(manifest.files).map(([path, expectedSha256]) => {
    insist(digest(expectedSha256), `invalid source digest: ${path}`)
    const actualSha256 = hash(readFileSync(join(LAB, path)))
    insist(actualSha256 === expectedSha256, `approved measurement source changed: ${path}`)
    return [path, { expectedSha256, actualSha256 }]
  }))
  const p = manifest.protocol
  insist(p.path === 'projects/second-look-fresh/README.md'
    && p.start === '## The data\n' && p.end === '## What the app would take\n' && digest(p.sha256), 'registered protocol boundaries differ')
  const readme = readFileSync(join(LAB, p.path), 'utf8')
  const start = readme.indexOf(p.start), end = readme.indexOf(p.end)
  insist(start >= 0 && end > start, 'registered protocol section is missing')
  const protocolSha256 = hash(readme.slice(start, end))
  insist(protocolSha256 === p.sha256, 'registered data, candidate, measures, estimator or rule changed')
  return { designSha256, measurementCodeUnchanged: true, measurementSourceHashes,
    protocolUnchanged: true, protocolSha256 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyDesignCode()
  console.log(JSON.stringify({ designSha256: result.designSha256,
    measurementCodeUnchanged: result.measurementCodeUnchanged, protocolUnchanged: result.protocolUnchanged }))
}
