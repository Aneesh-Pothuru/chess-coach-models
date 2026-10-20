// Freeze the stopped acquisition's preserved bytes. No search or deciding
// metric is run. Existing outputs are checked and never replaced.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSecondReport, secondReportMarkdown } from './second-report.mjs'

const LAB = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const NEW = join(ROOT, 'second-acquisition')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const insist = (ok, message) => { if (!ok) throw new Error(`second stopped snapshot: ${message}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function exact(path, bytes) {
  if (existsSync(path)) insist(readFileSync(path).equals(Buffer.from(bytes)), 'an immutable snapshot differs')
  else writeFileSync(path, bytes, { flag: 'wx' })
}

function noWorkers() {
  execFileSync(join(LAB, '.venv/bin/python'), ['-c', [
    'import sys, importlib.util',
    "sys.path.insert(0, 'projects/second-look-fresh')",
    "s = importlib.util.spec_from_file_location('secondrun', 'projects/second-look-fresh/second-run.py')",
    'm = importlib.util.module_from_spec(s)',
    's.loader.exec_module(m)',
    'm.ensure_no_second_workers()',
  ].join('\n')], { cwd: LAB, stdio: 'pipe' })
}

export async function freezeSecondStop() {
  noWorkers()
  const { report, privateReport } = await collectSecondReport()
  insist(report.stoppedAtRegisteredAcquisitionGuard && !report.complete
    && report.furtherReplayAllowedUnderCurrentAmendment === false
    && report.referenceProcessesStarted === 0 && report.analysisProcessesStarted === 0
    && report.decidingOutputsAbsent && !report.decidingMetricsRead,
  'this is not a stopped acquisition before comparison')
  insist(readFileSync(join(PROJECT, 'results/second-acquisition.json'), 'utf8') === json(report)
    && readFileSync(join(PROJECT, 'results/second-acquisition.md'), 'utf8') === secondReportMarkdown(report)
    && readFileSync(join(ROOT, 'diagnostics/second-acquisition-report.json'), 'utf8') === json(privateReport),
  'generate the current descriptive report before freezing it')
  const files = { ...privateReport.inputs }, inventories = {}
  function capture(path) {
    insist(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()
      && realpathSync(path).startsWith(LAB + '/'), 'snapshot file is not local and regular')
    files[relative(LAB, path)] = sha(readFileSync(path))
  }
  function walk(path) {
    insist(lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(),
      'snapshot directory must be real')
    const names = readdirSync(path).sort()
    inventories[relative(LAB, path)] = names
    for (const name of names) {
      const child = join(path, name)
      if (lstatSync(child).isDirectory()) walk(child)
      else capture(child)
    }
  }
  // Deliberately do not traverse execution-root: its frozen symlinks lead back
  // into this acquisition. The binding and its checks already freeze that code.
  for (const name of ['replays', 'classifications', 'driver-attempts', 'quiet', 'run-log'])
    walk(join(NEW, name))
  for (const path of [join(NEW, 'manifest.json'), fileURLToPath(import.meta.url),
    join(PROJECT, 'results/second-acquisition.json'), join(PROJECT, 'results/second-acquisition.md'),
    join(ROOT, 'diagnostics/second-acquisition-report.json')]) capture(path)
  noWorkers()
  for (const [path, names] of Object.entries(inventories))
    insist(same(readdirSync(join(LAB, path)).sort(), names), 'acquisition inventory changed')
  for (const [path, digest] of Object.entries(files)) {
    insist(!path.startsWith('/') && !path.split('/').includes('..')
      && realpathSync(join(LAB, path)).startsWith(LAB + '/'), 'snapshot path leaves this clone')
    insist(sha(readFileSync(join(LAB, path))) === digest, 'acquisition bytes changed')
  }
  const manifest = {
    schema: 'second-look-fresh-second-acquisition-stopped/1',
    amendmentSha256: report.secondAmendmentSha256,
    acquisitionCodeSha256: report.secondAmendmentCodeSha256,
    frozenBindingSha256: report.frozenBindingSha256,
    firstStoppedManifestSha256: report.stoppedManifestSha256,
    reportSha256: sha(json(report)), inputSnapshotSha256: report.inputSnapshotSha256,
    acquisition: report.acquisition,
    files: Object.fromEntries(Object.entries(files).sort()),
    inventories: Object.fromEntries(Object.entries(inventories).sort()),
  }
  const bytes = json(manifest)
  exact(join(NEW, 'stopped-manifest.json'), bytes)
  const aggregate = {
    schema: 'second-look-fresh-second-acquisition-stopped-aggregate/1',
    appCommit: report.appCommit, recordsCommit: report.recordsCommit,
    games: report.games, casesSha256: report.casesSha256,
    candidateSha256: report.candidateSha256,
    amendmentSha256: report.secondAmendmentSha256,
    acquisitionCodeSha256: report.secondAmendmentCodeSha256,
    stoppedManifestSha256: sha(bytes), reportSha256: sha(json(report)),
    snapshotScriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    frozenFiles: Object.keys(files).length, frozenDirectories: Object.keys(inventories).length,
    acceptedGames: report.acquisition.acceptedGames,
    newProducedAttempts: report.acquisition.newProducedAttempts,
    newOutcomeCounts: report.acquisition.newOutcomeCounts,
    firstOutputsNotYetProduced: report.acquisition.firstOutputsNotYetProduced,
    decidingMetricsRead: false, referencesStarted: false, analysisStarted: false,
    furtherReplayAllowedUnderCurrentAmendment: false,
  }
  exact(join(PROJECT, 'results/second-stopped-manifest.json'), json(aggregate))
  return aggregate
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && process.argv[2] === '--freeze', 'use --freeze')
  console.log(JSON.stringify(await freezeSecondStop()))
}
