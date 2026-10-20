// Acquisition only. Preserve the original outputs, freeze the other cells,
// and route the prescribed routine rebuild into its own private namespace.
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyDesignCode } from './provenance.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url))
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const OLD = join(ROOT, 'acquisition-original')
const NEW = join(ROOT, 'acquisition-amended')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const insist = (ok, message) => { if (!ok) throw new Error(`amendment: ${message}`) }
const jsonFiles = path => existsSync(path) ? readdirSync(path).filter(x => x.endsWith('.json')).sort() : []
const routine = name => /^candidate\/(?:evidence|timed)\/routine\//.test(name)
function atomic(path, bytes) {
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  writeFileSync(temp, bytes, { flag: 'wx' })
  renameSync(temp, path)
}
function exactFile(path, bytes) {
  if (existsSync(path)) insist(readFileSync(path).equals(Buffer.from(bytes)), 'saved acquisition source differs')
  else {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes, { flag: 'wx' })
  }
}

export function amendmentIdentity() {
  const design = verifyDesignCode()
  const bytes = readFileSync(join(PROJECT, 'amendment-manifest.json'))
  const manifest = JSON.parse(bytes)
  insist(manifest.schema === 'second-look-fresh-acquisition-amendment/1'
    && manifest.designSha256 === design.designSha256, 'amendment design identity differs')
  insist(JSON.stringify(manifest.replacement) === JSON.stringify({
    arm: 'candidate', profile: 'routine', games: 60,
    namespace: 'private/second-look-fresh/acquisition-amended',
  }), 'replacement cell differs')
  const p = manifest.protocol
  insist(p.path === 'projects/second-look-fresh/README.md'
    && p.start === '## Acquisition amendment, approved before the comparison\n'
    && p.end === '## Caveats\n', 'amendment section boundaries differ')
  const text = readFileSync(join(LAB, p.path), 'utf8')
  const start = text.indexOf(p.start), end = text.indexOf(p.end)
  insist(start >= 0 && end > start && sha(text.slice(start, end)) === p.sha256,
    'committed acquisition amendment changed')
  const checkpointBytes = readFileSync(join(ROOT, 'diagnostics/original-acquisition-manifest.json'))
  insist(sha(checkpointBytes) === manifest.originalAcquisitionManifestSha256,
    'original checkpoint manifest changed')
  const checkpoint = JSON.parse(checkpointBytes)
  insist(checkpoint.schema === 'second-look-fresh-acquisition-checkpoint/1'
    && checkpoint.designSha256 === design.designSha256, 'original checkpoint identity differs')
  return { manifest, amendmentSha256: sha(bytes), checkpoint, checkpointBytes, design }
}

export function checkFrozen({ initialized = true } = {}) {
  const identity = amendmentIdentity()
  let frozenFiles = 0, archivedFiles = 0
  for (const [name, digest] of Object.entries(identity.checkpoint.files)) {
    insist(!name.includes('..') && /^(baseline|candidate)\/(evidence|timed)\/(phone|desktop|routine)\/[^/]+\.json$/.test(name),
      'invalid checkpoint relative path')
    const archived = routine(name) && existsSync(join(OLD, name))
    const path = archived ? join(OLD, name) : join(ROOT, name)
    insist(!initialized || !routine(name) || archived, 'an original routine output was not archived')
    insist(sha(readFileSync(path)) === digest, 'a frozen or archived output changed')
    if (routine(name)) archivedFiles++
    else frozenFiles++
  }
  if (initialized) {
    for (const kind of ['evidence', 'timed']) {
      const active = join(ROOT, 'candidate', kind, 'routine')
      const target = join(NEW, 'candidate', kind, 'routine')
      insist(lstatSync(active).isSymbolicLink() && realpathSync(active) === realpathSync(target),
        'active routine path is not the amended namespace')
    }
  }
  return { ...identity, frozenFiles, archivedFiles }
}

function replaceOnce(source, old, replacement) {
  insist(source.split(old).length === 2, 'acquisition patch no longer has exactly one anchor')
  return source.replace(old, replacement)
}

export function generatedSources() {
  let probe = readFileSync(join(PROJECT, 'probe.mjs'), 'utf8')
  probe = replaceOnce(probe, 'const args = argsOf(process.argv.slice(2))',
    `const args = argsOf(process.argv.slice(2))
insist(args.all && args.phase2 && args.variant === 'candidate' && args.profile === 'routine' && !args.shard,
  'the first-output acquisition wrapper is only for the full amended candidate routine batch')`)
  const outLine = "    const out = join(project, 'timed', args.profile, `${c.id}.json`)"
  probe = replaceOnce(probe, outLine, outLine + `
    const firstFile = join(ROOT, 'acquisition-amended', 'first-replays', \`\${c.id}.json\`)
    if (existsSync(firstFile)) {
      const first = read(firstFile)
      insist(first.fingerprint === oneFingerprint && first.inputHash === oneInputHash
        && first.sourceHash === sourceHash && first.canonicalHash === canonicalHash
        && first.app === pin.commit && first.records === pin.records
        && first.caseIndex === one.caseIndex && first.summary.variant === args.variant
        && first.summary.profile === args.profile, 'saved first replay identity differs')
      insist(first.doc?.schema === 'game-review/2' && first.doc.records.length === c.plies
        && first.doc.provenance.profile === args.profile
        && hash(JSON.stringify(comparable(first.doc))) === canonicalHash,
        'saved first replay fails the original reproduction gate; another search is forbidden')
      if (!existsSync(out)) {
        mkdirSync(dirname(out), { recursive: true })
        writeFileSync(out, readFileSync(firstFile), { flag: 'wx' })
      }
      insist(readFileSync(firstFile).equals(readFileSync(out)), 'accepted timing differs from the first produced replay')
    } else insist(!existsSync(out), 'accepted timing has no first-output journal')`)
  const gate = '      insist(hash(JSON.stringify(comparable(doc))) === canonicalHash,'
  const summary = `      const summary = { variant: args.variant, profile: args.profile, plies: doc.records.length,
        seconds, looks: looks.length, verifySeconds: looks.reduce((s, x) => s + x.seconds, 0),
        verifyDepths: looks.map((x) => x.depth), calls: timing(calls), build: doc.provenance.build }
      atomic(out, { fingerprint: oneFingerprint, inputHash: oneInputHash, sourceHash,
        app: pin.commit, records: pin.records, caseIndex: one.caseIndex,
        canonicalHash, summary, looks, calls, doc })`
  insist(probe.split(summary).length === 2, 'full replay envelope anchor changed')
  const journal = summary.replace('const summary =', 'const firstSummary =')
    .replace('      atomic(out, {', '      const firstOutput = {')
    .replace('canonicalHash, summary, looks, calls, doc })',
      `canonicalHash, summary: firstSummary, looks, calls, doc }
      mkdirSync(dirname(firstFile), { recursive: true })
      writeFileSync(firstFile, JSON.stringify(firstOutput) + '\\n', { flag: 'wx' })`)
  probe = replaceOnce(probe, gate, journal + '\n' + gate)

  let shell = readFileSync(join(PROJECT, 'phase2.sh'), 'utf8')
  const routineCall = '  nice -n 10 bridge/run.sh projects/second-look-fresh/probe.mjs --all --phase2 --variant "$arm" --profile routine'
  shell = replaceOnce(shell, routineCall, `  if [ "$arm" = candidate ]; then
    nice -n 10 bridge/run.sh private/second-look-fresh/amended-probe.mjs --all --phase2 --variant "$arm" --profile routine
  else
${routineCall}
  fi`)
  const analysis = 'nice -n 10 bridge/run.sh projects/second-look-fresh/analyze.mjs --phase2'
  shell = replaceOnce(shell, analysis, 'node projects/second-look-fresh/amendment.mjs check-complete\n' + analysis)
  return { probe, shell }
}

function freezeCode(sources) {
  const files = Object.fromEntries(['amendment.mjs', 'phase2-amended.sh'].map(name =>
    [`projects/second-look-fresh/${name}`, sha(readFileSync(join(PROJECT, name)))]))
  const code = { schema: 'second-look-fresh-acquisition-code/1', files,
    generated: { probeSha256: sha(sources.probe), phase2Sha256: sha(sources.shell) } }
  exactFile(join(PROJECT, 'amendment-code.json'), JSON.stringify(code, null, 2) + '\n')
  exactFile(join(ROOT, 'amended-probe.mjs'), sources.probe)
  exactFile(join(ROOT, 'phase2-amended-body.sh'), sources.shell)
  return sha(readFileSync(join(PROJECT, 'amendment-code.json')))
}

function rejectPriorFailure() {
  const errors = join(NEW, 'candidate/evidence/routine/_errors.jsonl')
  insist(!existsSync(errors) || !readFileSync(errors, 'utf8').trim(),
    'the amended CLI logged a failure; inspect it rather than choose another attempt')
  const cases = read(join(ROOT, 'cases.json'))
  const firstDir = join(NEW, 'first-replays')
  for (const c of cases) {
    const first = join(firstDir, `${c.id}.json`)
    if (!existsSync(first)) continue
    const row = read(first)
    const canonical = read(join(NEW, 'candidate/evidence/routine', `${c.id}.json`))
    const comparable = doc => ({ positions: doc.positions, records: doc.records, provenance: doc.provenance, coverage: doc.coverage })
    insist(sha(JSON.stringify(comparable(row.doc))) === sha(JSON.stringify(comparable(canonical))),
      'a first produced replay failed equality; resumption cannot search it again')
  }
}

export function prepareAmendment() {
  const identity = checkFrozen({ initialized: false })
  if (!existsSync(join(NEW, 'manifest.json'))) {
    insist(!existsSync(join(PROJECT, 'results/compare.json'))
      && !existsSync(join(ROOT, 'analysis-per-game.json'))
      && !existsSync(join(ROOT, 'reference/manifest.json')),
    'the first amended acquisition must precede references and deciding outputs')
  }
  mkdirSync(OLD, { recursive: true })
  exactFile(join(OLD, 'manifest.json'), identity.checkpointBytes)
  for (const kind of ['evidence', 'timed']) {
    const active = join(ROOT, 'candidate', kind, 'routine')
    const archived = join(OLD, 'candidate', kind, 'routine')
    const target = join(NEW, 'candidate', kind, 'routine')
    if (!existsSync(archived)) {
      insist(existsSync(active) && !lstatSync(active).isSymbolicLink(), 'original routine directory missing')
      mkdirSync(dirname(archived), { recursive: true })
      renameSync(active, archived)
    }
    mkdirSync(target, { recursive: true })
    if (!existsSync(active)) symlinkSync(relative(dirname(active), target), active, 'dir')
  }
  const checked = checkFrozen()
  const codeSha256 = freezeCode(generatedSources())
  const metadata = { schema: 'second-look-fresh-amended-acquisition/1',
    amendmentSha256: identity.amendmentSha256, codeSha256,
    designSha256: identity.design.designSha256,
    noDecidingOutputsBeforeAmendment: true,
    originalAcquisitionManifestSha256: identity.manifest.originalAcquisitionManifestSha256,
    frozenFiles: checked.frozenFiles, archivedFiles: checked.archivedFiles }
  exactFile(join(NEW, 'manifest.json'), JSON.stringify(metadata, null, 2) + '\n')
  rejectPriorFailure()
  console.log('Amended acquisition prepared; frozen and archived output hashes match.')
}

export function checkComplete() {
  const identity = checkFrozen()
  const codeSha256 = freezeCode(generatedSources())
  const meta = read(join(NEW, 'manifest.json'))
  insist(meta.amendmentSha256 === identity.amendmentSha256 && meta.codeSha256 === codeSha256,
    'amended acquisition provenance differs')
  rejectPriorFailure()
  const cases = read(join(ROOT, 'cases.json'))
  for (const [kind, dir] of [['canonical', join(NEW, 'candidate/evidence/routine')],
    ['timed', join(NEW, 'candidate/timed/routine')], ['first', join(NEW, 'first-replays')]]) {
    insist(jsonFiles(dir).length === cases.length, `amended ${kind} batch is incomplete`)
  }
  const files = {}
  for (const c of cases) {
    const first = join(NEW, 'first-replays', `${c.id}.json`)
    const accepted = join(NEW, 'candidate/timed/routine', `${c.id}.json`)
    insist(readFileSync(first).equals(readFileSync(accepted)), 'accepted replay is not the first produced output')
    for (const path of [first, accepted, join(NEW, 'candidate/evidence/routine', `${c.id}.json`)]) {
      files[relative(NEW, path)] = sha(readFileSync(path))
    }
  }
  const final = { ...meta, files }
  exactFile(join(NEW, 'completed-manifest.json'), JSON.stringify(final, null, 2) + '\n')
  console.log('All first amended outputs are retained; frozen cells and equality gates pass.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  insist(process.argv.length === 3 && ['prepare', 'check-frozen', 'check-complete'].includes(command),
    'use prepare, check-frozen or check-complete')
  if (command === 'prepare') prepareAmendment()
  else if (command === 'check-complete') checkComplete()
  else {
    const { frozenFiles, archivedFiles } = checkFrozen()
    console.log(JSON.stringify({ frozenFiles, archivedFiles, unchanged: true }))
  }
}
