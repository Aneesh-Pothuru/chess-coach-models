// Publication only. Reads the completed reports; never searches or estimates.
// The acquisition README and manifests retain their original byte identities.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RULE } from './rules.mjs'

const PROJECT = fileURLToPath(new URL('.', import.meta.url))
const LAB = resolve(PROJECT, '../..')
const MANIFEST = join(PROJECT, 'publication-manifest.json')
const SNAPSHOT = join(PROJECT, 'publication/registered-README.md')
const SOURCE_CLAIMS = join(PROJECT, 'publication/source-claims.json')
const PRIVATE_REPORT = join(LAB, 'private/second-look-fresh/fourth-acquisition/diagnostics/acquisition-report.json')
const BINDING = join(LAB, 'private/second-look-fresh/fourth-acquisition/execution-root/frozen-binding.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const insist = (ok, message) => { if (!ok) throw new Error(`publication: ${message}`) }
const AMENDMENTS = ['amendment-manifest.json', 'second-amendment-manifest.json',
  'third-amendment-manifest.json', 'fourth-amendment-manifest.json']
const answerStart = '**The answer.**'
const answerEnd = '## The data\n'

function inside(path) {
  insist(realpathSync(path).startsWith(realpathSync(LAB) + '/'), 'input leaves this clone')
  return path
}

function region(text, start, end) {
  const a = text.indexOf(start), b = end === 'EOF' ? text.length : text.indexOf(end, a + start.length)
  insist(a >= 0 && b > a, 'registered section boundaries are missing')
  return text.slice(a, b)
}

// A one-time publication freeze, after the acquisition report has reproduced.
// Existing snapshots/manifests are never refreshed by this command.
async function freeze() {
  insist(!existsSync(MANIFEST) && !existsSync(SNAPSHOT) && !existsSync(SOURCE_CLAIMS), 'publication inputs are already frozen')
  const { collectFourthReport } = await import('./fourth-report.mjs')
  const { report, privateReport } = await collectFourthReport({ withComparison: true })
  insist(readFileSync(join(PROJECT, 'results/fourth-acquisition.json'), 'utf8') === json(report)
    && readFileSync(PRIVATE_REPORT, 'utf8') === json(privateReport), 'final acquisition audit does not reproduce')
  const binding = read(BINDING), readme = readFileSync(join(PROJECT, 'README.md'))
  insist(sha(readme) === binding.publicReadmeSha256, 'the completed acquisition README changed')
  const { validateSourceClaims } = await import('./paper/checks.mjs')
  const sourceClaims = validateSourceClaims({
    appDir: inside(join(LAB, '.cache/chess', report.appCommit)),
    candidateDir: inside(join(LAB, '.cache/chess/candidates/second-look-fresh')),
    candidateManifest: read(join(LAB, 'private/second-look-fresh/candidate-manifest.json')),
    recipePath: join(PROJECT, 'candidate.mjs'),
    pin: { commit: report.appCommit, records: report.recordsCommit },
  })
  const paths = readdirSync(PROJECT).filter(name => /\.(?:mjs|py|sh|json)$/.test(name)
    && !name.startsWith('publication')).map(name => join(PROJECT, name))
  paths.push(...readdirSync(join(PROJECT, 'results')).filter(name => /\.(?:json|md)$/.test(name))
    .map(name => join(PROJECT, 'results', name)))
  const design = read(join(PROJECT, 'design-manifest.json'))
  paths.push(...Object.keys(design.files).map(path => join(LAB, path)))
  const frozenFiles = Object.fromEntries([...new Set(paths)].sort().map(path =>
    [relative(LAB, path), sha(readFileSync(inside(path)))]))
  const manifest = { schema: 'second-look-fresh-publication/1',
    purpose: 'Publication freeze after the completed registered analysis; not a new acquisition amendment.',
    appCommit: report.appCommit, recordsCommit: report.recordsCommit,
    registeredReadme: { path: relative(LAB, SNAPSHOT), sha256: sha(readme) },
    sourceClaims: { path: relative(LAB, SOURCE_CLAIMS), sha256: sha(json(sourceClaims)) },
    acquisitionBindingSha256: sha(readFileSync(BINDING)),
    privateReportSha256: sha(readFileSync(PRIVATE_REPORT)),
    privateInputSnapshotSha256: report.inputSnapshotSha256,
    frozenFiles }
  mkdirSync(dirname(SNAPSHOT), { recursive: true })
  writeFileSync(SNAPSHOT, readme, { flag: 'wx' })
  writeFileSync(SOURCE_CLAIMS, json(sourceClaims), { flag: 'wx' })
  writeFileSync(MANIFEST, json(manifest), { flag: 'wx' })
  console.log('froze completed reports, acquisition sources and original README by content hash')
}

export function loadPublicationInputs() {
  const manifest = read(MANIFEST)
  insist(manifest.schema === 'second-look-fresh-publication/1', 'unknown publication schema')
  for (const [path, expected] of Object.entries(manifest.frozenFiles))
    insist(sha(readFileSync(inside(join(LAB, path)))) === expected, `frozen public input changed: ${path}`)
  const registeredReadme = readFileSync(inside(SNAPSHOT), 'utf8')
  insist(sha(registeredReadme) === manifest.registeredReadme.sha256, 'original acquisition README changed')
  const sourceClaims = read(SOURCE_CLAIMS)
  insist(sha(readFileSync(inside(SOURCE_CLAIMS))) === manifest.sourceClaims.sha256,
    'publication source-claim audit changed')
  const compare = read(join(PROJECT, 'results/compare.json'))
  const acquisition = read(join(PROJECT, 'results/fourth-acquisition.json'))
  const phase1 = read(join(PROJECT, 'results/phase1.json'))
  const design = read(join(PROJECT, 'design-manifest.json'))
  const amendments = AMENDMENTS.map(name => read(join(PROJECT, name)))
  const diagnostics = { human: read(join(PROJECT, 'results/human-failure-diagnostic.json')),
    suspension: read(join(PROJECT, 'results/suspension-diagnostic.json')) }
  const names = { compare: 'results/compare.json', acquisition: 'results/fourth-acquisition.json',
    phase1: 'results/phase1.json', design: 'design-manifest.json',
    firstAmendment: AMENDMENTS[0], secondAmendment: AMENDMENTS[1],
    thirdAmendment: AMENDMENTS[2], fourthAmendment: AMENDMENTS[3],
    humanDiagnostic: 'results/human-failure-diagnostic.json',
    suspensionDiagnostic: 'results/suspension-diagnostic.json' }
  const hashes = Object.fromEntries(Object.entries(names).map(([key, path]) =>
    [key, sha(readFileSync(join(PROJECT, path)))]))
  for (const report of [compare, acquisition, phase1, design])
    insist(report.appCommit === manifest.appCommit && report.recordsCommit === manifest.recordsCommit,
      'study pin differs across reports')
  for (const report of [compare, phase1]) insist(same(report.rule, RULE), 'registered rule differs')
  for (const key of ['candidateSha256', 'casesSha256'])
    insist(compare[key] === acquisition[key] && compare[key] === phase1[key], 'study data or candidate differs')
  insist(sourceClaims.appCommit === compare.appCommit && sourceClaims.candidateSha256 === compare.candidateSha256,
    'source-claim audit does not describe the measured candidate')
  for (const [path, digest] of Object.entries(design.files))
    insist(manifest.frozenFiles[path] === digest, 'measurement source differs from original registration')
  const protocol = design.protocol
  insist(sha(region(registeredReadme, protocol.start, protocol.end)) === protocol.sha256,
    'original registered design changed')
  for (const [i, amendment] of amendments.entries()) {
    const { start, end, sha256 } = amendment.protocol
    const effectiveEnd = i === 2 ? amendments[3].protocol.start : end
    insist(sha(region(registeredReadme, start, effectiveEnd)) === sha256, 'registered amendment changed')
  }
  insist(amendments[0].designSha256 === hashes.design
    && amendments[1].designSha256 === hashes.design
    && amendments[1].firstAmendmentSha256 === hashes.firstAmendment
    && amendments[2].secondAmendmentSha256 === hashes.secondAmendment
    && amendments[3].thirdAmendmentSha256 === hashes.thirdAmendment,
  'amendment chain differs')
  insist(acquisition.fourthAmendmentSha256 === hashes.fourthAmendment
    && acquisition.comparisonSha256 === hashes.compare
    && acquisition.inputSnapshotSha256 === manifest.privateInputSnapshotSha256
    && acquisition.frozenBindingSha256 === manifest.acquisitionBindingSha256,
  'final acquisition identities differ')
  for (const key of Object.keys(acquisition.comparison))
    insist(same(acquisition.comparison[key], compare[key]), 'copied comparison differs')
  insist(acquisition.complete && acquisition.decidingMetricsRead
    && acquisition.acquisition.acceptedGames === compare.games
    && compare.games === RULE.games && phase1.counts.games === compare.games
    && acquisition.driver.runs.every(run => run.state === 'finished-successfully' && run.exitCode === 0),
  'registered acquisition and analysis did not finish')
  return { compare, acquisition, phase1, rule: RULE, hashes, design, amendments, diagnostics,
    manifest, registeredReadme, sourceClaims }
}

const pct = value => (100 * value).toFixed(2).replace(/^-/, '−')
const signed = value => (value > 0 ? '+' : '') + pct(value)
const words = ['zero', 'one', 'two', 'three', 'four']

export function generatedAnswer(inputs = loadPublicationInputs()) {
  const { compare: c, acquisition: a, rule, amendments } = inputs
  const phone = c.gaps.phone, desktop = c.gaps.desktop, dq = c.quality.desktop
  insist(c.decision.disposition === 'do not keep: inconclusive' && !c.decision.narrows
    && !c.decision.agrees && !c.decision.qualityPasses && !c.decision.qualityWorse,
  'the written disposition no longer holds')
  insist(phone.narrows && !desktop.narrows && phone.deltaMiss.value < 0
    && phone.deltaMiss.corrected.hi < 0, 'the phone-only narrowing claim no longer holds')
  insist(rule.profiles.every(profile => c.quality[profile].status === 'unclear'
    && c.quality[profile].deltaError.corrected.lo <= rule.qualityMargin
    && c.quality[profile].deltaError.corrected.hi >= rule.qualityMargin), 'quality guards no longer all inconclusive')
  insist(dq.candidateError.value > dq.baselineError.value && dq.deltaError.corrected.lo > 0,
    'desktop reference-error increase no longer holds')
  insist(a.acquisition.acceptedGames === c.games && amendments.length === 4,
    'sample or amendment count differs')
  const amendmentLinks = [
    '[first](#acquisition-amendment-approved-before-the-comparison)',
    '[second](#second-acquisition-amendment-approved-before-the-comparison)',
    '[third](#third-acquisition-amendment-approved-before-the-comparison)',
    '[fourth](#fourth-acquisition-amendment-approved-before-the-comparison)',
  ]
  return `**The answer.** Do not keep: inconclusive; the app keeps its current second look.
The phone met the narrowing rule (miss share ${pct(phone.baseline.miss.value)}% → ${pct(phone.candidate.miss.value)}%,
change ${signed(phone.deltaMiss.value)} points, corrected interval ${pct(phone.deltaMiss.corrected.lo)} to ${pct(phone.deltaMiss.corrected.hi)}),
the desktop did not, and every quality guard was inconclusive against the
${words[100 * rule.qualityMargin]}-point margin, while the desktop's error against the reference rose from
${pct(dq.baselineError.value)}% to ${pct(dq.candidateError.value)}% (${signed(dq.deltaError.value)} points, corrected interval ${pct(dq.deltaError.corrected.lo)} to ${pct(dq.deltaError.corrected.hi)}).
The study used ${c.games} frozen games of one player. Acquisition needed
${words[amendments.length]} amendments (${amendmentLinks.join(', ')}),
each committed before any further replay and before any deciding metric
was computed or read. The device profiles are the app's Node build, not
measurements on real phones or desktops. The [results](results/compare.md),
[acquisition report](results/fourth-acquisition.md) and
[paper source](paper/paper.tex) give the completed record.

<!-- PUBLICATION_COMMANDS_START -->
The sections below preserve the registered protocol and historical stopped-stage
reports as written. Their original bytes are kept in
[the acquisition README](publication/registered-README.md). The frozen acquisition
launchers retain that earlier README identity; they are historical commands,
not publication rebuild commands. Publication changes no acquired output or
measurement source. Rebuild and check this answer, the lab table and the paper
from the committed aggregates with:

\`\`\`bash
node projects/second-look-fresh/publication.mjs --write
node projects/second-look-fresh/paper/generate.mjs
node projects/second-look-fresh/publication.mjs --check
node projects/second-look-fresh/publication.mjs --check-private
\`\`\`

The last command additionally checks the preserved private input hashes in this
clone; it is not needed to generate the public paper. No PDF compiler was
available for this publication, so the checked TeX source is provided.
<!-- PUBLICATION_COMMANDS_END -->

`
}

export function publishedReadme(inputs = loadPublicationInputs()) {
  const original = inputs.registeredReadme
  const a = original.indexOf(answerStart), b = original.indexOf(answerEnd, a)
  insist(a >= 0 && b > a, 'original answer boundaries differ')
  return original.slice(0, a) + generatedAnswer(inputs) + original.slice(b)
}

function tableRow(inputs) {
  generatedAnswer(inputs) // Refuse a stale narrative before updating the table.
  return '| [second-look-fresh](projects/second-look-fresh/) ([paper source](projects/second-look-fresh/paper/paper.tex)) | Does clearing the engine\'s memory before each second look bring the devices closer to the routine without worsening their judgments? | Nothing: do not keep, inconclusive. Only the phone meets the narrowing rule, and every quality guard is inconclusive; the current second look stays |'
}

function checkPrivate(inputs) {
  insist(sha(readFileSync(inside(PRIVATE_REPORT))) === inputs.manifest.privateReportSha256,
    'private final report changed')
  const report = read(PRIVATE_REPORT)
  insist(sha(JSON.stringify(report.inputs)) === inputs.manifest.privateInputSnapshotSha256,
    'private input snapshot differs')
  for (const [path, expected] of Object.entries(report.inputs))
    insist(sha(readFileSync(inside(join(LAB, path)))) === expected, 'a preserved private input changed')
  const binding = read(BINDING)
  insist(sha(readFileSync(inside(BINDING))) === inputs.manifest.acquisitionBindingSha256
    && binding.publicReadmeSha256 === inputs.manifest.registeredReadme.sha256,
  'original acquisition binding differs')
  console.log(`preserved acquisition input hashes pass (${Object.keys(report.inputs).length} files)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2]
  insist(process.argv.length === 3 && ['--freeze', '--write', '--check', '--check-private'].includes(mode),
    'use --freeze, --write, --check or --check-private')
  if (mode === '--freeze') await freeze()
  else {
    const inputs = loadPublicationInputs()
    if (mode === '--check-private') checkPrivate(inputs)
    else {
      const target = join(PROJECT, 'README.md'), rootPath = join(LAB, 'README.md')
      const expected = publishedReadme(inputs), root = readFileSync(rootPath, 'utf8')
      const rowPattern = /^\| \[second-look-fresh\].*$/gm
      insist([...root.matchAll(rowPattern)].length === 1, 'lab table must have exactly one project row')
      const updatedRoot = root.replace(rowPattern, tableRow(inputs))
      if (mode === '--write') {
        const current = readFileSync(target, 'utf8')
        const a = current.indexOf(answerStart), b = current.indexOf(answerEnd, a)
        insist(a >= 0 && b > a && current.slice(0, a)
          + region(inputs.registeredReadme, answerStart, answerEnd) + current.slice(b)
          === inputs.registeredReadme, 'unexpected README edit outside publication')
        writeFileSync(target, expected)
        writeFileSync(rootPath, updatedRoot)
        console.log('wrote generated README answer and lab table row')
      } else {
        insist(readFileSync(target, 'utf8') === expected && root === updatedRoot, 'generated publication text is stale')
        console.log('publication claims, frozen inputs, README answer and lab table pass')
      }
    }
  }
}
