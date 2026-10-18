// Generate the two replacements from the pin, then let the bridge build the
// candidate. Only the replacement recipe is public; generated app files and
// the local manifest stay under this project's private directory.
//
//   CHESS_DIR=$(node projects/second-look-fresh/candidate.mjs)
//
// stdout contains the candidate directory, and nothing else. No engine runs.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const NAME = 'second-look-fresh'
const APP = 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a'
const pin = JSON.parse(readFileSync(join(ROOT, 'bridge/chess.json'), 'utf8'))
if (pin.commit !== APP) throw new Error('candidate recipe is for a different app pin')
const app = join(ROOT, '.cache/chess', pin.commit)
if (!existsSync(join(app, '.git/bridge-ready'))) throw new Error('the pinned app must already be checked out; this script does not fetch it')
const privateRoot = join(ROOT, 'private', NAME)
const files = join(privateRoot, 'candidate-files')
mkdirSync(files, { recursive: true })
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
const replaceOnce = (text, before, after) => {
  if (text.split(before).length !== 2) throw new Error('candidate patch no longer has exactly one target')
  return text.replace(before, after)
}

const changes = [
  {
    path: 'src/services/review/ports.ts',
    sourceSha256: '9697ff529d33954108c47cb60865035ba2f37a5cd258ba2d5ba4fef787cb539e',
    patch: (text) => replaceOnce(text,
      'export interface ReviewEngine {\n',
      "export interface ReviewEngine {\n  newGame?: EngineService['newGame']\n"),
  },
  {
    path: 'src/services/review/pipeline/run.ts',
    sourceSha256: '688b4ce947ce43660c58674f62f789245ef79ee089cca3b7c17965d62e1d462b',
    patch: (text) => {
      text = replaceOnce(text,
        '  const { settings, pass2Budget, sweepBudget, tracker } = plan\n',
        "  if (!engine.newGame) throw new Error('second-look-fresh requires engine.newGame')\n  const { settings, pass2Budget, sweepBudget, tracker } = plan\n")
      text = replaceOnce(text,
        '    const ev = await gatherDeepEvidence(engine, positionAt(replay, i), played[i].uci, {\n',
        "    await engine.newGame('analyst')\n    const ev = await gatherDeepEvidence(engine, positionAt(replay, i), played[i].uci, {\n")
      return replaceOnce(text,
        '      const next = await gatherDeepEvidence(engine, positionAt(replay, i), played[i].uci, {\n',
        "      await engine.newGame('analyst')\n      const next = await gatherDeepEvidence(engine, positionAt(replay, i), played[i].uci, {\n")
    },
  },
]

const replacements = changes.map(({ path, sourceSha256, patch }) => {
  const source = readFileSync(join(app, path), 'utf8')
  if (sha256(source) !== sourceSha256) throw new Error(`pinned source changed: ${path}`)
  const changed = patch(source)
  const file = join(files, path.replaceAll('/', '__'))
  writeFileSync(file, changed)
  return { path, file, sourceSha256, candidateSha256: sha256(changed) }
})

// Avoid environment overrides redirecting this project's candidate outside
// the clone, or replacing a running candidate with an unpinned source.
const env = { ...process.env }
delete env.CHESS_DIR
delete env.CHESS_CACHE
const built = spawnSync(join(ROOT, 'bridge/candidate.sh'), [NAME, ...replacements.map((r) => `${r.path}=${r.file}`)], {
  cwd: ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
})
if (built.status !== 0) throw new Error(`bridge/candidate.sh failed: ${built.stderr.trim()}`)
const candidate = resolve(built.stdout.trim())
if (candidate !== join(ROOT, '.cache/chess/candidates', NAME)) throw new Error('bridge wrote an unexpected candidate path')
for (const r of replacements) {
  if (sha256(readFileSync(join(app, r.path))) !== r.sourceSha256) throw new Error(`bridge changed the pin: ${r.path}`)
  if (sha256(readFileSync(join(candidate, r.path))) !== r.candidateSha256) throw new Error(`candidate replacement differs: ${r.path}`)
}
const manifest = {
  schema: 'second-look-fresh-candidate/1',
  appCommit: pin.commit,
  recordsCommit: pin.records,
  name: NAME,
  recipeSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
  replacements: replacements.map(({ file: _file, ...r }) => r),
  reset: "engine.newGame('analyst') before the initial and adaptive second-look gatherDeepEvidence calls",
}
manifest.candidateSha256 = sha256(JSON.stringify(manifest))
writeFileSync(join(privateRoot, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${candidate}\n`)
