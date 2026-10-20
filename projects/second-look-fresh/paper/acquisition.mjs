// Reporting checks and a table for the approved acquisition amendment.
// Importing this module reads no result or per-game evidence. The final paper
// calls the file checks only after acquisition-report.mjs has finished.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { esc } from '../../paper.mjs'
import { reconcileAcquisitionCoverage, summarizeAcquisitionCell } from '../acquisition-report.mjs'
import { checkFrozen, generatedSources } from '../amendment.mjs'
import { claim, validateAmendment, validateDesign } from './checks.mjs'

const LAB = fileURLToPath(new URL('../../../', import.meta.url))
const PROFILES = ['phone', 'desktop', 'routine']
const COUNTS = ['canonicalGames', 'savedPostTeachingDeep', 'savedPostTeachingGuardIncomplete',
  'savedAppCoveragePartial', 'observedGames', 'observedMissingGames', 'observedLooks',
  'observedGuardIncomplete']
const FULL_COUNTS = ['fullBatchObservedLooks', 'fullBatchObservedGuardIncomplete']
const DIGESTS = ['casesSha256', 'candidateSha256', 'designSha256', 'amendmentSha256',
  'acquisitionCodeSha256', 'originalAcquisitionManifestSha256',
  'completedAcquisitionManifestSha256', 'comparisonSha256', 'reportingScriptSha256']
const FLAGS = ['frozenAndArchivedUnchanged', 'firstOutputsRetained', 'exactReproductionPassed',
  'comparisonCoverageReconciled', 'noDecidingOutputsBeforeAmendment']
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b, label) => claim(JSON.stringify(a) === JSON.stringify(b), `acquisition: ${label}`)
const natural = (value, label) => claim(Number.isSafeInteger(value) && value >= 0,
  `acquisition: ${label} is a finite nonnegative integer`)
const digest = (value, label) => claim(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value),
  `acquisition: ${label} is a content hash`)
function keys(value, expected, label) {
  claim(value && typeof value === 'object' && !Array.isArray(value), `acquisition: ${label} is an object`)
  same(Object.keys(value).sort(), [...expected].sort(), `${label} has only the prescribed fields`)
}
const comparable = doc => ({
  positions: doc.positions, records: doc.records, provenance: doc.provenance, coverage: doc.coverage,
})

/** Pure checks, also usable with synthetic reports without opening study data. */
export function validateAcquisitionAggregates({ acquisition, compare, design, amendment }) {
  validateDesign(design, compare)
  validateAmendment(amendment, design)
  keys(acquisition, ['schema', 'appCommit', 'recordsCommit', 'games', ...DIGESTS,
    'frozenFiles', 'archivedFiles', ...FLAGS, 'rows'], 'report')
  same(acquisition.schema, 'second-look-fresh-acquisition-report/1', 'report schema')
  for (const key of ['appCommit', 'recordsCommit']) {
    claim(/^[0-9a-f]{40}$/.test(acquisition[key] ?? ''), `acquisition: ${key} names an external pin`)
    same(acquisition[key], compare[key], `${key} matches the comparison`)
  }
  for (const key of DIGESTS) digest(acquisition[key], key)
  for (const key of ['casesSha256', 'candidateSha256']) same(acquisition[key], compare[key], `${key} matches the comparison`)
  same(acquisition.designSha256, design.designSha256, 'registered design identity')
  same(acquisition.amendmentSha256, amendment.amendmentSha256, 'approved amendment identity')
  same(acquisition.originalAcquisitionManifestSha256,
    amendment.manifest.originalAcquisitionManifestSha256, 'original checkpoint identity')
  for (const key of FLAGS) same(acquisition[key], true, `${key} is established`)
  natural(acquisition.games, 'games')
  claim(acquisition.games > 0 && acquisition.games === compare.games
    && acquisition.games === amendment.manifest.replacement.games,
  'acquisition: every cell uses the prescribed full sample')
  natural(acquisition.frozenFiles, 'frozen files')
  natural(acquisition.archivedFiles, 'archived files')
  claim(Array.isArray(acquisition.rows) && acquisition.rows.length === 7,
    'acquisition: the table contains exactly the seven prescribed cells')
  const expected = [
    ...['baseline', 'candidate'].flatMap(arm => PROFILES
      .filter(profile => arm !== 'candidate' || profile !== 'routine')
      .map(profile => [arm, profile, 'frozen', true])),
    ['candidate', 'routine', 'original', false], ['candidate', 'routine', 'rebuilt', true],
  ]
  acquisition.rows.forEach((row, i) => {
    keys(row, ['arm', 'profile', 'acquisition', 'usedInComparison', ...COUNTS, ...FULL_COUNTS], `row ${i + 1}`)
    same([row.arm, row.profile, row.acquisition, row.usedInComparison], expected[i],
      `row ${i + 1} has the prescribed arm, profile, acquisition and use`)
    for (const key of COUNTS) natural(row[key], `row ${i + 1} ${key}`)
    same(row.canonicalGames, acquisition.games, `row ${i + 1} has all canonical games`)
    same(row.observedGames + row.observedMissingGames, row.canonicalGames,
      `row ${i + 1} observed and missing games reconcile`)
    claim(row.savedPostTeachingGuardIncomplete <= row.savedPostTeachingDeep
      && row.observedGuardIncomplete <= row.observedLooks,
    `acquisition: row ${i + 1} incomplete evidence is a subset of its own source`)
    const coverage = compare.coverage?.[row.profile]?.[row.arm]
    claim(coverage && Number.isSafeInteger(coverage.plies) && Number.isSafeInteger(coverage.positions)
      && row.savedPostTeachingDeep <= coverage.positions
      && row.savedAppCoveragePartial <= coverage.plies && row.observedLooks <= coverage.plies,
    `acquisition: row ${i + 1} evidence and partial-coverage counts fit the frozen positions`)
    if (!row.observedGames) same([row.observedLooks, row.observedGuardIncomplete], [0, 0],
      `row ${i + 1} absent replays contribute no observed looks`)
    if (row.observedMissingGames) {
      same(FULL_COUNTS.map(key => row[key]), [null, null],
        `row ${i + 1} missing traces leave full-batch counts unknown`)
    } else {
      for (const key of FULL_COUNTS) natural(row[key], `row ${i + 1} ${key}`)
      same([row.fullBatchObservedLooks, row.fullBatchObservedGuardIncomplete],
        [row.observedLooks, row.observedGuardIncomplete],
        `row ${i + 1} full-batch counts equal all observed looks`)
    }
  })
  reconcileAcquisitionCoverage(acquisition.rows, compare)
  const frozenRows = acquisition.rows.filter(row => row.acquisition === 'frozen')
  const original = acquisition.rows.find(row => row.acquisition === 'original')
  const rebuilt = acquisition.rows.find(row => row.acquisition === 'rebuilt')
  claim(original.observedMissingGames > 0,
    'acquisition: the original routine full-batch pre-teaching count remains unknown')
  same(acquisition.frozenFiles, frozenRows.length * acquisition.games * 2,
    'frozen files comprise canonical documents and observed replays for every frozen cell')
  same(acquisition.archivedFiles, original.canonicalGames + original.observedGames,
    'archived files comprise all original routine documents and its available observed replays')
  return { frozenRows, original, rebuilt }
}

/** Recompute every displayed count from one cell's saved evidence. The
 * caller supplies the pinned app's exact-score instrument, never a verdict. */
export function validateAcquisitionCellEvidence(row, documents, observed, isExactScore) {
  const recomputed = summarizeAcquisitionCell(documents, observed, isExactScore)
  for (const key of [...COUNTS, ...FULL_COUNTS]) {
    same(row[key], recomputed[key],
      `${row.arm}/${row.profile}/${row.acquisition} ${key} matches its saved evidence`)
  }
  return recomputed
}

/** Final-generation checks only. These read the saved files, never run an
 * engine, create a missing checkpoint or replace an acquisition output. */
export async function validateAcquisitionReport({ acquisition, compare, design, amendment, lab, privateRoot }) {
  const rows = validateAcquisitionAggregates({ acquisition, compare, design, amendment })
  same(resolve(lab), resolve(LAB), 'paper checks run in this clone')
  const root = join(resolve(lab), 'private/second-look-fresh')
  same(realpathSync(privateRoot), root, 'private acquisition root is local and unredirected')
  const project = join(resolve(lab), 'projects/second-look-fresh')
  const local = path => {
    const actual = realpathSync(path)
    claim(actual.startsWith(resolve(lab) + '/'), 'acquisition: every checked input stays in this clone')
    return actual
  }
  const bytes = path => readFileSync(local(path))
  const read = path => JSON.parse(bytes(path))
  const compareBytes = bytes(join(project, 'results/compare.json'))
  same(JSON.parse(compareBytes), compare, 'the caller supplied the current complete comparison')
  same(hash(compareBytes), acquisition.comparisonSha256, 'the report identifies the exact comparison bytes')
  const acquisitionBytes = bytes(join(project, 'results/acquisition.json'))
  same(JSON.parse(acquisitionBytes), acquisition, 'the caller supplied the current acquisition report')
  same(hash(bytes(join(project, 'acquisition-report.mjs'))), acquisition.reportingScriptSha256,
    'the acquisition reporting script is unchanged')
  same(hash(bytes(join(project, 'design-manifest.json'))), acquisition.designSha256,
    'the current design content manifest matches')
  same(hash(bytes(join(project, 'amendment-manifest.json'))), acquisition.amendmentSha256,
    'the current amendment content manifest matches')

  const checkpointBytes = bytes(join(root, 'diagnostics/original-acquisition-manifest.json'))
  same(hash(checkpointBytes), acquisition.originalAcquisitionManifestSha256, 'the original private checkpoint is unchanged')
  const checkpoint = JSON.parse(checkpointBytes)
  const archived = join(root, 'acquisition-original')
  same(bytes(join(archived, 'manifest.json')).toString(), checkpointBytes.toString(),
    'the archived checkpoint manifest retains the original bytes')
  // Preflight each frozen path before checkFrozen reads it, so an unexpected
  // file symlink cannot redirect this check into another clone.
  const frozenDirectories = new Map()
  for (const name of Object.keys(checkpoint.files)) {
    claim(!name.includes('..') && /^(baseline|candidate)\/(evidence|timed)\/(phone|desktop|routine)\/[^/]+\.json$/.test(name),
      'acquisition: checkpoint paths are confined to the prescribed cells')
    const base = /^candidate\/(?:evidence|timed)\/routine\//.test(name) ? archived : root
    local(join(base, name))
    const slash = name.lastIndexOf('/')
    const directory = join(base, name.slice(0, slash))
    const names = frozenDirectories.get(directory) ?? []
    names.push(name.slice(slash + 1))
    frozenDirectories.set(directory, names)
  }
  for (const [directory, names] of frozenDirectories) {
    same(readdirSync(local(directory)).filter(name => name.endsWith('.json')).sort(), names.sort(),
      'frozen and archived cells retain exactly their original output sets')
  }
  const frozen = checkFrozen()
  same(frozen.amendmentSha256, acquisition.amendmentSha256, 'the frozen-file check uses this amendment')
  same([frozen.frozenFiles, frozen.archivedFiles], [acquisition.frozenFiles, acquisition.archivedFiles],
    'all reported frozen and archived files still match')

  const codeBytes = bytes(join(project, 'amendment-code.json'))
  same(hash(codeBytes), acquisition.acquisitionCodeSha256, 'the acquisition code manifest matches')
  const code = JSON.parse(codeBytes)
  keys(code, ['schema', 'files', 'generated'], 'acquisition code manifest')
  same(code.schema, 'second-look-fresh-acquisition-code/1', 'acquisition code schema')
  keys(code.files, ['projects/second-look-fresh/amendment.mjs',
    'projects/second-look-fresh/phase2-amended.sh'], 'acquisition source files')
  for (const [path, expected] of Object.entries(code.files)) {
    digest(expected, 'acquisition source digest')
    same(hash(bytes(join(resolve(lab), path))), expected, 'the acquisition wrapper source is unchanged')
  }
  keys(code.generated, ['probeSha256', 'phase2Sha256'], 'generated acquisition source identities')
  const generated = generatedSources()
  for (const [key, source, path] of [
    ['probeSha256', generated.probe, 'amended-probe.mjs'],
    ['phase2Sha256', generated.shell, 'phase2-amended-body.sh'],
  ]) {
    digest(code.generated[key], key)
    same(hash(source), code.generated[key], 'the generated acquisition patch is unchanged')
    same(hash(bytes(join(root, path))), code.generated[key], 'the executed acquisition source matches its generator')
  }

  const amended = join(root, 'acquisition-amended')
  const completedBytes = bytes(join(amended, 'completed-manifest.json'))
  same(hash(completedBytes), acquisition.completedAcquisitionManifestSha256, 'the completed acquisition manifest matches')
  const completed = JSON.parse(completedBytes)
  keys(completed, ['schema', 'amendmentSha256', 'codeSha256', 'designSha256',
    'noDecidingOutputsBeforeAmendment', 'originalAcquisitionManifestSha256',
    'frozenFiles', 'archivedFiles', 'files'], 'completed acquisition manifest')
  const { files, ...metadata } = completed
  same(metadata, read(join(amended, 'manifest.json')), 'completion preserves the acquisition-start metadata')
  same(completed.schema, 'second-look-fresh-amended-acquisition/1', 'completed acquisition schema')
  for (const key of ['amendmentSha256', 'designSha256', 'originalAcquisitionManifestSha256',
    'frozenFiles', 'archivedFiles', 'noDecidingOutputsBeforeAmendment']) {
    same(completed[key], acquisition[key], `completed acquisition ${key} agrees`)
  }
  same(completed.codeSha256, acquisition.acquisitionCodeSha256, 'completion identifies the prescribed acquisition code')
  claim(files && typeof files === 'object' && !Array.isArray(files),
    'acquisition: completed output hashes exist')
  const groups = new Map()
  for (const [name, expected] of Object.entries(files)) {
    digest(expected, 'completed output digest')
    const match = /^(first-replays|candidate\/(?:evidence|timed)\/routine)\/([^/]+\.json)$/.exec(name)
    claim(match && !name.includes('..'), 'acquisition: completed outputs remain in the prescribed namespace')
    same(hash(bytes(join(amended, name))), expected, 'a completed first output has unchanged bytes')
    const group = groups.get(match[2]) ?? new Set()
    group.add(match[1])
    groups.set(match[2], group)
  }
  same(groups.size, acquisition.games, 'every prescribed game has amended outputs')
  const prefixes = ['first-replays', 'candidate/evidence/routine', 'candidate/timed/routine']
  for (const prefix of prefixes) {
    same(readdirSync(local(join(amended, prefix))).filter(name => name.endsWith('.json')).sort(),
      [...groups.keys()].sort(), 'the completed manifest covers the exact saved output set')
  }
  for (const [name, group] of groups) {
    same([...group].sort(), [...prefixes].sort(), 'each game has canonical, first and accepted output')
    const firstBytes = bytes(join(amended, 'first-replays', name))
    claim(firstBytes.equals(bytes(join(amended, 'candidate/timed/routine', name))),
      'acquisition: accepted replays retain their first produced bytes')
    const first = JSON.parse(firstBytes)
    const canonical = read(join(amended, 'candidate/evidence/routine', name))
    same(comparable(first.doc), comparable(canonical), 'the original exact-reproduction gate still passes')
    same(first.canonicalHash, hash(JSON.stringify(comparable(canonical))),
      'first replay identifies its canonical document')
  }

  // Import only the score-availability predicate. This performs no search,
  // classification or deciding comparison. It prevents bounded but altered
  // descriptive counts from passing solely because their report was hashed.
  const { CHESS_DIR, chess } = await import('../../../bridge/lib/chess.mjs')
  same(local(CHESS_DIR), join(resolve(lab), '.cache/chess', compare.appCommit),
    'evidence availability is read through the local pinned baseline app')
  const { isExactScore } = await chess('src/core/score/index.ts')
  claim(typeof isExactScore === 'function', 'acquisition: the app exact-score predicate is available')
  for (const row of acquisition.rows) {
    const base = row.acquisition === 'original' ? archived
      : row.acquisition === 'rebuilt' ? amended : root
    const evidenceDir = join(base, row.arm, 'evidence', row.profile)
    const timedDir = join(base, row.arm, 'timed', row.profile)
    const canonicalNames = readdirSync(local(evidenceDir)).filter(name => name.endsWith('.json')).sort()
    const observedNames = readdirSync(local(timedDir)).filter(name => name.endsWith('.json')).sort()
    const documents = canonicalNames.map(name => read(join(evidenceDir, name)))
    const byName = new Map(canonicalNames.map((name, index) => [name, documents[index]]))
    const observed = observedNames.map(name => {
      claim(byName.has(name), 'acquisition: every accepted replay belongs to its canonical batch')
      const replay = read(join(timedDir, name))
      same(comparable(replay.doc), comparable(byName.get(name)),
        'each evidence-count source retains exact canonical reproduction')
      return replay
    })
    validateAcquisitionCellEvidence(row, documents, observed, isExactScore)
  }
  return { ...rows, acquisitionSha256: hash(acquisitionBytes) }
}

const count = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : 'unknown'
const stack = lines => `\\shortstack[r]{${lines.join(' \\\\ ')}}`

/** Format only validated aggregates; missing original traces stay unknown. */
export function addAcquisitionTable(g, acquisition) {
  const label = { frozen: 'frozen', original: 'original', rebuilt: 'rebuilt' }
  const right = '>{\\raggedleft\\arraybackslash}X'
  const headers = [
    'arm / profile', 'batch',
    stack(['final deep', 'incomplete / all']),
    stack(['app', 'partial']),
    stack(['observed', 'games / all']),
    stack(['observed looks', 'incomplete / all']),
    stack(['full-batch', 'incomplete']),
  ]
  const rows = acquisition.rows.map(row => [
    esc(`${row.arm} / ${row.profile}`), label[row.acquisition],
    `${count(row.savedPostTeachingGuardIncomplete)} / ${count(row.savedPostTeachingDeep)}`,
    count(row.savedAppCoveragePartial),
    `${count(row.observedGames)} / ${count(row.canonicalGames)}`,
    `${count(row.observedGuardIncomplete)} / ${count(row.observedLooks)}`,
    count(row.fullBatchObservedGuardIncomplete),
  ])
  g.block('AcquisitionTable', [
    '{\\footnotesize', '\\setlength{\\tabcolsep}{3pt}',
    `\\begin{tabularx}{\\textwidth}{@{}ll${right}${right}${right}${right}${right}@{}}`,
    '\\toprule', `${headers.join(' & ')} \\\\`, '\\midrule',
    ...rows.map(row => `${row.join(' & ')} \\\\`),
    '\\bottomrule', '\\end{tabularx}',
    '\\par\\smallskip\\raggedright Final deep evidence is retained after teaching; observed looks use accepted pre-teaching replays. Both incomplete columns apply the registered evidence-availability condition. App partial is the separately reported \\texttt{coverage.partial} count. The original routine batch is superseded. Missing accepted replays leave full-batch pre-teaching counts unknown. The diagnostic is not study evidence.\\par',
    '}',
  ].join('\n'))
}
