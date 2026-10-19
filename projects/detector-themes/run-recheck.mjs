// Run the byte-identical round-two scorer at the shipped pin, in separate paths.
import fs from 'node:fs'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const project = 'projects/detector-themes'
const expectedPin = '3a377486e8ae214f86f1e948f69231248f79f8a0'
const set = process.argv[2]
const assert = (ok, why) => { if (!ok) throw new Error(why) }
assert(process.argv.length === 3 && ['app', 'heldout'].includes(set), 'usage: run-recheck.mjs app|heldout')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const read = (path) => fs.readFileSync(join(root, path))
const json = (path) => JSON.parse(read(path))
const pin = json('bridge/chess.json')
const historical = json(`${project}/results/round2/result.json`)
const design = json(`${project}/results/round2/combined-design.json`)
assert(pin.commit === expectedPin, 'recheck must use the requested PR 127 merge')
const oldPin = JSON.parse(execFileSync('git', ['show', `${historical.frozenCommit}:bridge/chess.json`], { cwd: root }))
assert(pin.repo === oldPin.repo && pin.records === oldPin.records, 'repo or records changed with the app pin')
assert(historical.app === oldPin.commit && design.app === oldPin.commit, 'historical experiment identity differs')
const env = { ...process.env, CHESS_CACHE: join(root, 'private/detector-themes/app-cache') }
delete env.CHESS_DIR
delete env.CANDIDATE
const app = execFileSync('nice', ['-n', '10', join(root, 'bridge/checkout.sh')], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
assert(execFileSync('git', ['-C', app, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === pin.commit, 'checkout HEAD differs')
execFileSync('git', ['-C', app, 'diff', '--quiet', '--', 'src'], { stdio: 'inherit' })
const theme = fs.readFileSync(join(app, 'src/services/knowledge/detectors/theme.ts'))
assert(theme.equals(read(`${project}/candidates/best-deflection-trapped/theme.ts`)), 'PR 127 theme differs from the measured combined candidate')
const sample = json(`${project}/results/round2/sample.json`)
const sampleBytes = read(sample.data)
assert(hash(sampleBytes) === sample.data_sha256, 'held-out sample bytes changed')
const pool = JSON.parse(fs.readFileSync(join(app, 'src/data/puzzles.json')))
const poolRows = Array.isArray(pool) ? pool : Object.values(pool).flat()
const datasets = { app: [...new Map(poolRows.map((row) => [row.id, row])).values()], heldout: JSON.parse(sampleBytes) }
const dataIdentity = {}
for (const name of ['app', 'heldout']) {
  const baseline = json(`${project}/results/round2/score-${name}.json`)
  const datasetSha256 = hash(JSON.stringify(datasets[name]))
  assert(datasetSha256 === baseline.datasetSha256 && datasets[name].length === baseline.puzzles, `${name}: shipped data differs; do not silently compare different sets`)
  dataIdentity[name] = { puzzles: datasets[name].length, datasetSha256 }
}

const mirror = join(root, 'private/detector-themes/rechecks', pin.commit, 'lab')
const output = join(root, project, 'results/round2', pin.commit)
function writeOnce(path, bytes) {
  fs.mkdirSync(dirname(path), { recursive: true })
  if (fs.existsSync(path)) assert(fs.readFileSync(path).equals(Buffer.from(bytes)), `existing recheck artifact differs: ${relative(root, path)}`)
  else fs.writeFileSync(path, bytes, { flag: 'wx' })
}
function checkedLink(path, target) {
  fs.mkdirSync(dirname(path), { recursive: true })
  if (!fs.existsSync(path)) fs.symlinkSync(target, path)
  assert(fs.lstatSync(path).isSymbolicLink() && fs.realpathSync(path) === fs.realpathSync(target), `wrong recheck link: ${relative(root, path)}`)
}
fs.mkdirSync(output, { recursive: true })
checkedLink(join(mirror, sample.data), join(root, sample.data))
checkedLink(join(mirror, project, 'results/round2'), output)
const copies = [`${project}/score.mts`, 'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs']
const copiedSha256 = {}
for (const path of copies) {
  const bytes = read(path)
  if (path.endsWith('/score.mts')) assert(hash(bytes) === design.files[path], 'round-two scorer is no longer frozen')
  writeOnce(join(mirror, path), bytes)
  copiedSha256[path] = hash(bytes)
}
const run = {
  project: 'detector-themes', round: 2, kind: 'shipped-recheck', app: pin.commit,
  records: pin.records, referenceApp: historical.app, candidate: null,
  mirror: relative(root, mirror), output: relative(root, output),
  sample: { path: sample.data, sha256: sample.data_sha256 }, datasets: dataIdentity,
  copiedSha256, runnerSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
  themeSha256: hash(theme),
}
writeOnce(join(output, 'run.json'), JSON.stringify(run, null, 2) + '\n')
env.CHESS_DIR = app
function score(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', join(root, 'bridge/run.sh'), join(mirror, project, 'score.mts'), set, '--round2', ...args], { cwd: root, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal }))
  })
}
const workers = await Promise.allSettled([score(['--shard', '0/2']), score(['--shard', '1/2'])])
assert(workers.every((r) => r.status === 'fulfilled' && r.value.code === 0), 'a recheck shard failed; complete cached work remains resumable')
for (const path of copies) assert(hash(fs.readFileSync(join(mirror, path))) === copiedSha256[path], 'a mirrored source changed during scoring')
const merged = await score(['--merge', '2'])
assert(merged.code === 0, 'recheck merge failed')
console.log(`completed ${set} recheck at ${pin.commit}; historical outputs unchanged`)
