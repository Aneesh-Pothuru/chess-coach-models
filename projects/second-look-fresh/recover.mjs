// Mark a run whose wrapper was killed without inventing its stop time.
// This changes logging metadata only; game checkpoints and app manifests stay
// untouched. The caller must first check that this project's workers stopped.
//   node projects/second-look-fresh/recover.mjs --interrupted LOG-run.json
import { readFileSync, writeFileSync, renameSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { verifyDesignCode } from './provenance.mjs'
import { readAmendment } from './execution.mjs'

const lab = fileURLToPath(new URL('../../', import.meta.url))
const root = join(lab, 'private/second-look-fresh/run-log')
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--interrupted'
  || basename(args[1]) !== args[1] || !args[1].endsWith('-run.json')) {
  throw new Error('use --interrupted with a run-log metadata basename')
}
for (const name of readdirSync(root).filter(name => name.endsWith('-launcher.json'))) {
  const launch = JSON.parse(readFileSync(join(root, name), 'utf8'))
  const found = spawnSync('ps', ['-p', String(launch.pid), '-o', 'pgid=,stat=,args='], { encoding: 'utf8' })
  const row = /^\s*(\d+)\s+(\S+)\s+([\s\S]*)$/.exec(found.stdout)
  let active = false
  if (found.status === 0 && row && Number(row[1]) === launch.processGroup && !row[2].startsWith('Z')) {
    const arguments_ = row[3].trim().split(/\s+/)
    if (arguments_.at(-1) === '--amended') arguments_.pop()
    const tail = arguments_.slice(-2).join(' ')
    active = tail === `${lab}projects/second-look-fresh/run.py --phase2`
    if (tail === 'projects/second-look-fresh/run.py --phase2') {
      const cwd = spawnSync('/usr/sbin/lsof', ['-a', '-p', String(launch.pid), '-d', 'cwd', '-Fn'],
        { encoding: 'utf8', timeout: 5000 })
      if (cwd.status !== 0) throw new Error('cannot verify the recorded wrapper working directory')
      active = cwd.stdout.split('\n').includes(`n${lab.slice(0, -1)}`)
    }
  }
  if (active) {
    throw new Error('a recorded detached wrapper is still running; do not recover or resume yet')
  }
}
const ps = spawnSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' })
if (ps.status !== 0) throw new Error('cannot check for surviving project workers')
const active = ps.stdout.split('\n').some(line => {
  const m = /^\s*(\d+)\s+(.*)$/.exec(line)
  return m && Number(m[1]) !== process.pid && m[2].includes(lab)
    && /(?:phase2(?:-amended(?:-body)?)?\.sh|second-look-fresh\/run\.py|src\/cli\/coach\.ts|maia[^\n]*worker|\/node_modules\/stockfish\/bin\/|second-look-fresh\/(?:build|probe|reference|amended-probe)\.mjs)/.test(m[2])
})
if (active) throw new Error('a project worker may still be running; do not recover or resume yet')
const path = join(root, args[1])
const meta = JSON.parse(readFileSync(path, 'utf8'))
if (meta.endedAt || Number.isInteger(meta.exitCode)) throw new Error('this wrapper already has a recorded end')
const rows = readFileSync(join(root, args[1].replace(/-run\.json$/, '-output.jsonl')), 'utf8')
  .split('\n').filter(Boolean).map(line => JSON.parse(line))
const last = rows.at(-1)
if (!last || !Number.isFinite(last.seconds) || !Number.isFinite(Date.parse(last.at))) throw new Error('no valid last output observation')
const originalCommand = ['bash', 'projects/second-look-fresh/phase2.sh', '--phase2']
const amendedCommand = ['bash', 'projects/second-look-fresh/phase2-amended.sh', '--phase2']
const amended = JSON.stringify(meta.command) === JSON.stringify(amendedCommand)
if (!amended && JSON.stringify(meta.command) !== JSON.stringify(originalCommand)) throw new Error('unexpected run command')
const command = amended ? amendedCommand : originalCommand
const { designSha256 } = verifyDesignCode()
if (meta.designSha256 && meta.designSha256 !== designSha256) throw new Error('run content identity differs')
const amendment = amended ? readAmendment() : null
if (amended ? meta.amendmentSha256 !== amendment.amendmentSha256
  || amendment.manifest.designSha256 !== designSha256 : meta.amendmentSha256 !== undefined) {
  throw new Error('run amendment identity differs')
}
// Reconstruct the envelope so legacy branch-based provenance is discarded.
// The frozen content manifest has just verified the actual approved sources.
const recovered = { schema: 'second-look-fresh-run/2', command, startedAt: meta.startedAt,
  designSha256, status: 'interrupted-end-unknown', observedThroughAt: last.at,
  observedSeconds: last.seconds, recoveredAt: new Date().toISOString(),
  recoveryReason: 'Session interruption; project worker check found none. Last output is a lower bound, not the stop time.' }
if (amended) recovered.amendmentSha256 = amendment.amendmentSha256
const temp = `${path}.${process.pid}.tmp`
writeFileSync(temp, JSON.stringify(recovered, null, 2) + '\n')
renameSync(temp, path)
console.log('Recovered interrupted logging metadata with content provenance and an unknown end time. No game checkpoint changed.')
