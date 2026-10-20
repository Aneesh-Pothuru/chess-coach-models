// Bind the fourth acquisition without altering any preceding binding.
// The execution README is the original second binding's immutable copy.
// The public README is checked separately as two exact approved appends.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = 'projects/second-look-fresh'
const SECOND = 'private/second-look-fresh/second-acquisition'
const LEGACY = `${SECOND}/execution-root`
const EXECUTION = 'private/second-look-fresh/fourth-acquisition/execution-root'
const BINDING = 'frozen-binding.json'
const FREEZE = `${PROJECT}/fourth-amendment-code.json`
const BRIDGE = ['bridge/run.sh', 'bridge/checkout.sh', 'bridge/candidate.sh',
  'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs', 'bridge/lib/register.mjs',
  'bridge/lib/app-packages.mjs']
const HELPERS = ['fourth-runtime.mjs', 'fourth-amendment.mjs',
  'fourth-probe-source.mjs', 'fourth-sleep.mjs', 'fourth-run.py', 'fourth-launch.py', 'power.py',
  'fourth-power.py', 'fourth-quiet.py', 'fourth-register.mjs',
  'fourth-amendment-manifest.json', 'quiet.py', 'run.py',
  'suspension-diagnostic.mjs', 'second-report.mjs']
const THIRD_MARKER = '\n## Third acquisition amendment, approved before the comparison\n'
const FOURTH_MARKER = '\n## Fourth acquisition amendment, approved before the comparison\n'
const LINKS = {
  '.cache/chess': '.cache/chess',
  'private/second-look-fresh': 'private/second-look-fresh',
  [`${PROJECT}/results`]: `${PROJECT}/results`,
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const insist = (ok, message) => { if (!ok) throw new Error(`fourth runtime: ${message}`) }
const digest = value => /^[0-9a-f]{64}$/.test(value ?? '')
const within = (root, path) => path === root || path.startsWith(root + '/')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function cleanRelative(path) {
  insist(typeof path === 'string' && !isAbsolute(path) && path !== ''
    && !path.split('/').some(part => !part || part === '.' || part === '..'),
  'invalid relative path')
  return path
}

function locations() {
  if (existsSync(join(HERE, BINDING))) {
    const saved = read(join(HERE, BINDING))
    insist(typeof saved.sourceRoot === 'string' && isAbsolute(saved.sourceRoot),
      'binding has no original clone')
    const sourceRoot = realpathSync(saved.sourceRoot)
    insist(sourceRoot === saved.sourceRoot && HERE === join(sourceRoot, EXECUTION),
      'module is outside the bound execution directory')
    return { sourceRoot, executionRoot: HERE }
  }
  const sourceRoot = realpathSync(HERE)
  insist(sourceRoot === HERE && existsSync(join(sourceRoot, 'CLAUDE.md')),
    'prepare must run from this clone')
  return { sourceRoot, executionRoot: join(sourceRoot, EXECUTION) }
}

function regular(path, root) {
  insist(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
    'a copied source must be a real file')
  insist(within(root, realpathSync(path)), 'source or copy leaves its clone')
  return readFileSync(path)
}

function section(root, spec) {
  const text = readFileSync(join(root, cleanRelative(spec.path)), 'utf8')
  const start = text.indexOf(spec.start), end = text.indexOf(spec.end, start)
  insist(start >= 0 && end > start && digest(spec.sha256)
    && sha(text.slice(start, end)) === spec.sha256, 'a registered protocol section changed')
}

function sourceIdentity(sourceRoot) {
  const legacyRoot = join(sourceRoot, LEGACY)
  insist(realpathSync(legacyRoot) === legacyRoot && !lstatSync(legacyRoot).isSymbolicLink(),
    'preserved execution root moved')
  const stopBytes = regular(join(sourceRoot, SECOND, 'stopped-manifest.json'), sourceRoot)
  const stop = JSON.parse(stopBytes)
  const publicStop = read(join(sourceRoot, PROJECT, 'results/second-stopped-manifest.json'))
  insist(stop.schema === 'second-look-fresh-second-acquisition-stopped/1'
    && publicStop.stoppedManifestSha256 === sha(stopBytes), 'second stopped identity differs')
  for (const [path, expectedSha] of Object.entries(stop.files)) {
    const full = join(sourceRoot, cleanRelative(path))
    insist(within(sourceRoot, realpathSync(full)) && sha(readFileSync(full)) === expectedSha,
      'a stopped output changed')
  }
  // These inventories cover the second acquisition's fixed namespaces only.
  // The shared accepted routine directory may gain newly prescribed outputs.
  for (const [path, names] of Object.entries(stop.inventories)) {
    insist(cleanRelative(path).startsWith(SECOND + '/')
      && !path.startsWith(LEGACY + '/') && within(sourceRoot, realpathSync(join(sourceRoot, path)))
      && same(readdirSync(join(sourceRoot, path)).sort(), names), 'a stopped namespace changed')
  }
  const legacyBytes = regular(join(legacyRoot, BINDING), sourceRoot)
  const legacy = JSON.parse(legacyBytes)
  insist(legacy.schema === 'second-look-fresh-frozen-runtime/1'
    && sha(legacyBytes) === stop.frozenBindingSha256
    && legacy.sourceRoot === sourceRoot && legacy.executionRoot === legacyRoot
    && legacy.pin.commit === publicStop.appCommit && legacy.pin.records === publicStop.recordsCommit,
  'preserved binding identity differs')
  insist(same(legacy.links, LINKS), 'preserved link set differs')
  for (const [path, target] of Object.entries(LINKS)) {
    const original = join(sourceRoot, target), link = join(legacyRoot, path)
    insist(within(sourceRoot, realpathSync(original)) && lstatSync(link).isSymbolicLink()
      && realpathSync(link) === realpathSync(original), 'preserved link changed')
  }
  for (const [path, expected] of Object.entries(legacy.files)) {
    cleanRelative(path)
    const bytes = regular(join(legacyRoot, path), sourceRoot)
    insist(sha(bytes) === expected.sha256
      && (statSync(join(legacyRoot, path)).mode & 0o777) === expected.mode, 'preserved source changed')
    if (path !== `${PROJECT}/README.md`)
      insist(regular(join(sourceRoot, path), sourceRoot).equals(bytes)
        && (statSync(join(sourceRoot, path)).mode & 0o777) === expected.mode,
      'an original acquisition source changed')
  }
  const oldPinBytes = regular(join(legacyRoot, 'bridge/chess.json'), sourceRoot)
  insist(sha(oldPinBytes) === legacy.pinSha256
    && oldPinBytes.equals(Buffer.from(json(legacy.pin))), 'preserved private pin changed')
  const oldCodePath = `${PROJECT}/second-amendment-code.json`
  const oldCodeBytes = regular(join(sourceRoot, oldCodePath), sourceRoot)
  insist(oldCodeBytes.equals(regular(join(legacyRoot, oldCodePath), sourceRoot))
    && JSON.parse(oldCodeBytes).bindingSha256 === sha(legacyBytes), 'preserved code attestation changed')
  for (const [path, expectedSha] of Object.entries(legacy.linkedFiles))
    insist(sha(regular(join(sourceRoot, cleanRelative(path)), sourceRoot)) === expectedSha,
      'preserved linked aggregate changed')

  const designBytes = regular(join(legacyRoot, PROJECT, 'design-manifest.json'), sourceRoot)
  const design = JSON.parse(designBytes)
  const expected = ['rules.mjs', 'prepare.mjs', 'candidate.mjs', 'runtime.mjs',
    'build.mjs', 'probe.mjs', 'common.mjs', 'reference.mjs', 'analyze.mjs', 'phase2.sh']
    .map(name => `${PROJECT}/${name}`).concat('projects/accuracy-vs-chesscom/build-evidence.mjs')
  insist(design.schema === 'second-look-fresh-design/1' && sha(designBytes) === legacy.designSha256
    && design.appCommit === legacy.pin.commit && design.recordsCommit === legacy.pin.records
    && same(Object.keys(design.files).sort(), expected.sort()), 'registered study identity differs')
  for (const [path, expectedSha] of Object.entries(design.files))
    insist(digest(expectedSha) && legacy.files[path]?.sha256 === expectedSha,
      'registered source digest differs')
  section(legacyRoot, design.protocol)
  const amendmentBytes = regular(join(legacyRoot, PROJECT, 'amendment-manifest.json'), sourceRoot)
  const amendment = JSON.parse(amendmentBytes)
  insist(sha(amendmentBytes) === legacy.firstAmendmentSha256
    && amendment.designSha256 === sha(designBytes), 'first amendment identity differs')
  section(legacyRoot, amendment.protocol)
  const codeBytes = regular(join(legacyRoot, PROJECT, 'amendment-code.json'), sourceRoot)
  const code = JSON.parse(codeBytes)
  insist(sha(codeBytes) === legacy.firstAmendmentCodeSha256, 'first acquisition code differs')
  for (const [path, expectedSha] of Object.entries(code.files))
    insist(legacy.files[path]?.sha256 === expectedSha, 'first acquisition source differs')

  const thirdBytes = regular(join(sourceRoot, PROJECT, 'third-amendment-manifest.json'), sourceRoot)
  const third = JSON.parse(thirdBytes)
  insist(third.schema === 'second-look-fresh-third-acquisition-amendment/1'
    && third.appCommit === legacy.pin.commit && third.recordsCommit === legacy.pin.records
    && third.secondStoppedManifestSha256 === sha(stopBytes)
    && third.secondAmendmentSha256 === stop.amendmentSha256
    && third.frozenBindingSha256 === sha(legacyBytes), 'third amendment identity differs')
  for (const [path, expectedSha] of Object.entries(third.files))
    insist(digest(expectedSha) && sha(regular(join(sourceRoot, cleanRelative(path)), sourceRoot)) === expectedSha,
      'a third amendment source changed')
  const fourthBytes = regular(join(sourceRoot, PROJECT, 'fourth-amendment-manifest.json'), sourceRoot)
  const fourth = JSON.parse(fourthBytes)
  insist(fourth.schema === 'second-look-fresh-fourth-acquisition-amendment/1'
    && fourth.appCommit === legacy.pin.commit && fourth.recordsCommit === legacy.pin.records
    && fourth.thirdAmendmentSha256 === sha(thirdBytes)
    && fourth.secondStoppedManifestSha256 === sha(stopBytes), 'fourth amendment identity differs')
  const oldReadme = regular(join(legacyRoot, PROJECT, 'README.md'), sourceRoot)
  insist(third.preservedReadme.path === `${LEGACY}/${PROJECT}/README.md`
    && third.preservedReadme.sha256 === sha(oldReadme)
    && third.protocol.path === `${PROJECT}/README.md`
    && third.protocol.start === THIRD_MARKER && third.protocol.end === 'EOF', 'third README identity differs')
  insist(fourth.preservedReadme.path === 'private/second-look-fresh/fourth-acquisition/preserved-third-README.md',
    'third README snapshot path differs')
  const thirdReadme = regular(join(sourceRoot, fourth.preservedReadme.path), sourceRoot)
  const thirdAppend = thirdReadme.subarray(oldReadme.length)
  insist(sha(thirdReadme) === fourth.preservedReadme.sha256
    && thirdReadme.subarray(0, oldReadme.length).equals(oldReadme)
    && thirdAppend.toString().startsWith(THIRD_MARKER)
    && sha(thirdAppend) === third.protocol.sha256, 'preserved third README is not the approved append')
  const currentReadme = regular(join(sourceRoot, PROJECT, 'README.md'), sourceRoot)
  const fourthAppend = currentReadme.subarray(thirdReadme.length)
  insist(fourth.protocol.path === `${PROJECT}/README.md`
    && fourth.protocol.start === FOURTH_MARKER && fourth.protocol.end === 'EOF'
    && currentReadme.subarray(0, thirdReadme.length).equals(thirdReadme)
    && fourthAppend.toString().startsWith(FOURTH_MARKER)
    && sha(fourthAppend) === fourth.protocol.sha256, 'public README is not the exact fourth append')
  insist(third.diagnostic.path === 'results/suspension-diagnostic.json'
    && same(fourth.diagnostic, third.diagnostic)
    && sha(regular(join(sourceRoot, PROJECT, third.diagnostic.path), sourceRoot)) === third.diagnostic.sha256,
  'preserved suspension diagnosis differs')
  const legacyCopyFiles = { ...legacy.files, [oldCodePath]: {
    sha256: sha(oldCodeBytes), mode: statSync(join(legacyRoot, oldCodePath)).mode & 0o777 } }
  return { design, code, pin: legacy.pin, legacy, legacyCopyFiles, legacyRoot, fourthManifest: fourth,
    designSha256: sha(designBytes), firstAmendmentSha256: sha(amendmentBytes),
    firstAmendmentCodeSha256: sha(codeBytes), legacyBindingSha256: sha(legacyBytes),
    secondStoppedManifestSha256: sha(stopBytes), thirdAmendmentSha256: sha(thirdBytes),
    fourthAmendmentSha256: sha(fourthBytes), preservedThirdReadmeSha256: sha(thirdReadme),
    publicReadmeSha256: sha(currentReadme) }
}

function checkCache(sourceRoot, identity) {
  const cache = join(sourceRoot, '.cache/chess')
  for (const name of [identity.pin.commit, identity.pin.records, 'candidates/second-look-fresh']) {
    const path = join(cache, name)
    insist(within(sourceRoot, realpathSync(path)), 'an app or records cache leaves this clone')
  }
  for (const commit of [identity.pin.commit, identity.pin.records]) {
    const path = join(cache, commit)
    insist(existsSync(join(path, '.git/bridge-ready')), 'study cache is not ready; fetching is forbidden')
    const head = execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    insist(head === commit, 'cached app or records commit differs')
  }
  for (const name of [identity.pin.commit, 'candidates/second-look-fresh'])
    insist(within(sourceRoot, realpathSync(join(cache, name, 'node_modules'))),
      'app dependencies leave this clone')
  const candidate = read(join(sourceRoot, 'private/second-look-fresh/candidate-manifest.json'))
  const { candidateSha256, ...payload } = candidate
  insist(candidate.appCommit === identity.pin.commit && candidate.recordsCommit === identity.pin.records
    && candidateSha256 === sha(JSON.stringify(payload)), 'candidate identity differs')
  insist(candidate.recipeSha256 === identity.design.files[`${PROJECT}/candidate.mjs`],
    'candidate recipe differs')
  for (const replacement of candidate.replacements) {
    cleanRelative(replacement.path)
    insist(sha(readFileSync(join(cache, identity.pin.commit, replacement.path))) === replacement.sourceSha256
      && sha(readFileSync(join(cache, 'candidates/second-look-fresh', replacement.path))) === replacement.candidateSha256,
    'candidate replacement source differs')
  }
  return candidateSha256
}

function linkedFiles(sourceRoot, identity) {
  const paths = [...Object.keys(identity.legacy.linkedFiles),
    `${PROJECT}/results/second-stopped-manifest.json`,
    `${PROJECT}/${identity.fourthManifest.diagnostic.path}`]
  return Object.fromEntries([...new Set(paths)].sort().map(path =>
    [path, sha(regular(join(sourceRoot, path), sourceRoot))]))
}

function safeDestination(executionRoot, path) {
  let parent = dirname(path)
  while (!existsSync(parent)) parent = dirname(parent)
  insist(within(executionRoot, realpathSync(parent)), 'copy destination escapes execution directory')
  if (existsSync(path)) insist(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(),
    'copied source destination is not a real file')
}

function copyFile(sourceRoot, executionRoot, path, allowRefresh) {
  const source = join(sourceRoot, path), target = join(executionRoot, path)
  const bytes = regular(source, sourceRoot), mode = statSync(source).mode & 0o777
  safeDestination(executionRoot, target)
  if (existsSync(target) && !readFileSync(target).equals(bytes))
    insist(allowRefresh, 'an existing execution source differs; refresh is not allowed')
  if (existsSync(target) && (statSync(target).mode & 0o777) !== mode)
    insist(allowRefresh, 'an existing execution source mode differs')
  if (!existsSync(target) || !readFileSync(target).equals(bytes)) {
    mkdirSync(dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    writeFileSync(temp, bytes, { flag: 'wx', mode })
    renameSync(temp, target)
  }
  chmodSync(target, mode)
  return { sha256: sha(bytes), mode }
}

function copyAttestation(sourceRoot, executionRoot) {
  if (existsSync(join(sourceRoot, FREEZE))) copyFile(sourceRoot, executionRoot, FREEZE, false)
}

function historicalFiles(sourceRoot) {
  const files = {}, inventories = {}
  function walk(path) {
    const full = join(sourceRoot, path)
    insist(lstatSync(full).isDirectory() && !lstatSync(full).isSymbolicLink()
      && within(sourceRoot, realpathSync(full)), 'historical directory leaves this clone')
    const names = readdirSync(full).sort()
    inventories[path] = names
    for (const name of names) {
      const next = `${path}/${name}`
      if (lstatSync(join(sourceRoot, next)).isDirectory()) walk(next)
      else files[next] = sha(regular(join(sourceRoot, next), sourceRoot))
    }
  }
  walk('private/second-look-fresh/third-acquisition')
  for (const path of [`${PROJECT}/third-amendment-manifest.json`,
    `${PROJECT}/results/suspension-diagnostic.json`, `${PROJECT}/results/suspension-diagnostic.md`])
    files[path] = sha(regular(join(sourceRoot, path), sourceRoot))
  return { files, inventories }
}

function identityFields(identity) {
  return Object.fromEntries(['designSha256', 'firstAmendmentSha256', 'firstAmendmentCodeSha256',
    'legacyBindingSha256', 'secondStoppedManifestSha256', 'thirdAmendmentSha256',
    'fourthAmendmentSha256', 'preservedThirdReadmeSha256', 'publicReadmeSha256']
    .map(key => [key, identity[key]]))
}

function result(sourceRoot, executionRoot, binding, bindingBytes, identity) {
  return { sourceRoot, executionRoot, bindingSha256: sha(bindingBytes), binding,
    pin: identity.pin, copiedFiles: Object.keys(binding.files).length,
    fourthManifest: identity.fourthManifest, ...identityFields(identity) }
}

/** Copies only. No phase-one build, candidate build, old driver or search runs. */
export function prepareFourthRuntime({ helperPaths = [], refreshHelpers = false } = {}) {
  const { sourceRoot, executionRoot } = locations()
  insist(HERE === sourceRoot, 'prepare runs only from the original clone')
  const identity = sourceIdentity(sourceRoot)
  const candidateSha256 = checkCache(sourceRoot, identity)
  insist(candidateSha256 === identity.legacy.candidateSha256, 'preserved candidate changed')
  const frozen = existsSync(join(sourceRoot, FREEZE))
  insist(!refreshHelpers || !frozen, 'helper refresh is forbidden after code freeze')
  if (frozen) {
    insist(existsSync(join(executionRoot, BINDING)), 'cannot create a new binding after code freeze')
    copyAttestation(sourceRoot, executionRoot)
    return verifyFourthRuntime()
  }
  if (existsSync(executionRoot))
    insist(!lstatSync(executionRoot).isSymbolicLink()
      && realpathSync(executionRoot) === executionRoot, 'execution root is not a real directory')
  else {
    let ancestor = dirname(executionRoot)
    while (!existsSync(ancestor)) ancestor = dirname(ancestor)
    insist(within(sourceRoot, realpathSync(ancestor)), 'execution parent leaves this clone')
    mkdirSync(executionRoot, { recursive: true })
  }
  for (const [path, sourcePath] of Object.entries(LINKS)) {
    const target = join(sourceRoot, sourcePath)
    insist(within(sourceRoot, realpathSync(target)), 'a linked directory leaves this clone')
    const destination = join(executionRoot, path)
    if (existsSync(destination)) insist(lstatSync(destination).isSymbolicLink()
      && realpathSync(destination) === realpathSync(target), 'execution link differs')
    else {
      safeDestination(executionRoot, destination)
      mkdirSync(dirname(destination), { recursive: true })
      symlinkSync(target, destination, 'dir')
    }
  }
  const legacyPaths = new Set(Object.keys(identity.legacyCopyFiles))
  const extras = helperPaths.map(name => cleanRelative(name.includes('/') ? name : `${PROJECT}/${name}`))
  insist(extras.every(path => path.startsWith(PROJECT + '/') && !path.startsWith(`${PROJECT}/results/`)
    && path !== FREEZE), 'helper is outside the project source set')
  const paths = [...new Set([...legacyPaths,
    `${PROJECT}/third-amendment-manifest.json`,
    ...HELPERS.filter(name => existsSync(join(sourceRoot, PROJECT, name))).map(name => `${PROJECT}/${name}`),
    ...extras])].sort()
  const files = Object.fromEntries(paths.map(path => {
    const origin = legacyPaths.has(path) ? 'legacy' : 'current'
    const source = origin === 'legacy' ? identity.legacyRoot : sourceRoot
    return [path, { ...copyFile(source, executionRoot, path, refreshHelpers && origin === 'current'), origin }]
  }))
  const pinBytes = json(identity.pin), pinPath = join(executionRoot, 'bridge/chess.json')
  if (existsSync(pinPath)) insist(regular(pinPath, executionRoot).equals(Buffer.from(pinBytes)), 'private study pin differs')
  else writeFileSync(pinPath, pinBytes, { flag: 'wx' })
  const binding = { schema: 'second-look-fresh-fourth-runtime/1', sourceRoot, executionRoot,
    pin: identity.pin, pinSha256: sha(pinBytes), ...identityFields(identity), candidateSha256,
    executionReadme: { source: `${LEGACY}/${PROJECT}/README.md`,
      sha256: identity.legacy.files[`${PROJECT}/README.md`].sha256 },
    files, linkedFiles: linkedFiles(sourceRoot, identity), history: historicalFiles(sourceRoot), links: LINKS,
    permittedWork: ['observed-replay', 'reference', 'analysis', 'reporting'],
    forbiddenWork: ['old-phase2-driver', 'prepare-games', 'candidate-build', 'canonical-build', 'runtime-cache-relocation'] }
  const bindingPath = join(executionRoot, BINDING), bindingBytes = json(binding)
  if (existsSync(bindingPath) && !regular(bindingPath, executionRoot).equals(Buffer.from(bindingBytes)))
    insist(refreshHelpers, 'existing binding differs; explicit pre-freeze refresh is required')
  if (!existsSync(bindingPath) || !readFileSync(bindingPath).equals(Buffer.from(bindingBytes))) {
    const temp = `${bindingPath}.${process.pid}.tmp`
    writeFileSync(temp, bindingBytes, { flag: 'wx' })
    renameSync(temp, bindingPath)
  }
  return verifyFourthRuntime()
}

/** Read-only from the original clone or this fourth runtime's copied module. */
export function verifyFourthRuntime() {
  const { sourceRoot, executionRoot } = locations()
  insist(!lstatSync(executionRoot).isSymbolicLink() && realpathSync(executionRoot) === executionRoot,
    'execution root moved')
  const bindingBytes = regular(join(executionRoot, BINDING), executionRoot)
  const binding = JSON.parse(bindingBytes), identity = sourceIdentity(sourceRoot)
  insist(binding.schema === 'second-look-fresh-fourth-runtime/1'
    && binding.sourceRoot === sourceRoot && binding.executionRoot === executionRoot
    && same(binding.pin, identity.pin), 'binding locations or study pin differ')
  for (const [key, expected] of Object.entries(identityFields(identity)))
    insist(binding[key] === expected, 'bound protocol identity differs')
  insist(binding.candidateSha256 === checkCache(sourceRoot, identity)
    && binding.candidateSha256 === identity.legacy.candidateSha256, 'bound candidate differs')
  const pinBytes = regular(join(executionRoot, 'bridge/chess.json'), executionRoot)
  insist(sha(pinBytes) === binding.pinSha256 && pinBytes.equals(Buffer.from(json(identity.pin))),
    'private study pin changed')
  insist(same(binding.links, LINKS), 'bound link set differs')
  for (const [path, target] of Object.entries(LINKS)) {
    const source = join(sourceRoot, target), destination = join(executionRoot, path)
    insist(within(sourceRoot, realpathSync(source)) && lstatSync(destination).isSymbolicLink()
      && realpathSync(destination) === realpathSync(source), 'bound cache, data or results link changed')
  }
  for (const path of [...Object.keys(identity.legacyCopyFiles), `${PROJECT}/third-amendment-manifest.json`,
    `${PROJECT}/fourth-runtime.mjs`, `${PROJECT}/fourth-amendment-manifest.json`])
    insist(binding.files[path], 'required source is missing from binding')
  insist(same(binding.executionReadme, { source: `${LEGACY}/${PROJECT}/README.md`,
    sha256: identity.legacy.files[`${PROJECT}/README.md`].sha256 }), 'execution README origin differs')
  for (const [path, expected] of Object.entries(binding.files)) {
    cleanRelative(path)
    insist((path.startsWith(PROJECT + '/') && !path.startsWith(`${PROJECT}/results/`))
      || BRIDGE.includes(path) || path === 'projects/accuracy-vs-chesscom/build-evidence.mjs',
    'unexpected copied source path')
    const origin = Object.hasOwn(identity.legacyCopyFiles, path) ? 'legacy' : 'current'
    insist(expected.origin === origin && digest(expected.sha256) && Number.isInteger(expected.mode),
      'invalid copied source identity')
    if (origin === 'legacy') insist(expected.sha256 === identity.legacyCopyFiles[path].sha256,
      'registered copy digest differs')
    for (const root of [origin === 'legacy' ? identity.legacyRoot : sourceRoot, executionRoot])
      insist(sha(regular(join(root, path), root)) === expected.sha256
        && (statSync(join(root, path)).mode & 0o777) === expected.mode, 'copied source changed')
  }
  const linked = linkedFiles(sourceRoot, identity)
  insist(same(binding.linkedFiles, linked), 'linked immutable aggregate changed')
  for (const [path, expectedSha] of Object.entries(linked))
    insist(sha(readFileSync(join(executionRoot, path))) === expectedSha, 'linked aggregate differs')
  insist(same(binding.history, historicalFiles(sourceRoot)), 'a third-acquisition artifact changed')
  if (existsSync(join(sourceRoot, FREEZE))) {
    const bytes = regular(join(sourceRoot, FREEZE), sourceRoot)
    insist(regular(join(executionRoot, FREEZE), executionRoot).equals(bytes), 'code attestation copy differs')
    const freeze = JSON.parse(bytes)
    insist(freeze.schema === 'second-look-fresh-fourth-acquisition-code/1'
      && freeze.bindingSha256 === sha(bindingBytes)
      && freeze.amendmentSha256 === identity.fourthAmendmentSha256,
    'code freeze binds a different runtime or protocol')
  }
  return result(sourceRoot, executionRoot, binding, bindingBytes, identity)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  insist(command === 'prepare' || command === 'verify', 'usage: fourth-runtime.mjs prepare|verify [--refresh-helpers]')
  const out = command === 'prepare'
    ? prepareFourthRuntime({ refreshHelpers: process.argv.includes('--refresh-helpers') })
    : verifyFourthRuntime()
  process.stdout.write(out.executionRoot + '\n')
}
