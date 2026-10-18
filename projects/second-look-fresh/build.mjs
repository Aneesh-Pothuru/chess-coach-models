// Run the predecessor's unchanged CLI builder, with explicit provenance and
// private output. Phase one never invokes this entry point.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHESS_DIR, LAB_DIR, privateDir } from '../../bridge/lib/chess.mjs'
import { privateRuntime } from './runtime.mjs'
import { RULE } from './rules.mjs'

const args = process.argv.slice(2)
if (args.length !== 5 || args[0] !== '--phase2' || args[1] !== '--variant' || args[3] !== '--profile') throw new Error('use --phase2 --variant baseline|candidate --profile phone|desktop|routine')
const arm = args[2], profile = args[4]
if (!['baseline', 'candidate'].includes(arm) || !RULE.profiles.includes(profile)) throw new Error('unknown arm or profile')
const root = privateDir('second-look-fresh')
const read = (p) => JSON.parse(readFileSync(p, 'utf8'))
const input = read(join(root, 'manifest.json'))
const candidate = read(join(root, 'candidate-manifest.json'))
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
if (input.appCommit !== pin.commit || candidate.appCommit !== pin.commit) throw new Error('stale preparation')
const gate = read(join(LAB_DIR, 'projects/second-look-fresh/results/phase1.json'))
if (!gate.determinism.passed || gate.casesSha256 !== input.casesSha256 || gate.candidateSha256 !== candidate.candidateSha256 || gate.appCommit !== pin.commit) throw new Error('current candidate and cases have not passed the determinism gate')
if (CHESS_DIR !== privateRuntime(arm)) throw new Error('wrong app checkout for this arm')
const saved = { appCommit: input.appCommit, recordsCommit: input.recordsCommit, casesSha256: input.casesSha256,
  engine: input.engine, nodeOptions: input.nodeOptions, profiles: RULE.profiles,
  candidateSha256: arm === 'candidate' ? candidate.candidateSha256 : null }
const dir = join(root, arm)
mkdirSync(dir, { recursive: true })
const manifest = join(dir, 'manifest.json')
const evidence = join(dir, 'evidence')
if (!existsSync(manifest) && existsSync(evidence) && readdirSync(evidence).length) throw new Error('existing evidence has no arm manifest; do not stamp it with new provenance')
if (existsSync(manifest) && JSON.stringify(read(manifest)) !== JSON.stringify(saved)) throw new Error('stale arm output; use a separate directory')
writeFileSync(manifest, JSON.stringify(saved, null, 2) + '\n')
const argv = [join(LAB_DIR, 'bridge/run.sh'), 'projects/accuracy-vs-chesscom/build-evidence.mjs',
  '--profile', profile, '--games', join(root, 'cases.json'), '--out', join(dir, 'evidence'),
  '--concurrency', profile === 'routine' ? '1' : '2', '--timeout-s', '3600']
const child = spawn('nice', ['-n', '10', ...argv], { cwd: LAB_DIR, env: process.env, stdio: 'inherit' })
child.once('error', e => { throw e })
child.once('close', code => { process.exitCode = code ?? 1 })
