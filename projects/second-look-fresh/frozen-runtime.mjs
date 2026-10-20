// Bind the unchanged study to its own app pin after the lab pin advances.
// This copies source files and checks paths. It runs no app or acquisition.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync,
  renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = 'projects/second-look-fresh'
const EXECUTION = 'private/second-look-fresh/second-acquisition/execution-root'
const BINDING = 'frozen-binding.json'
const FREEZE = `${PROJECT}/second-amendment-code.json`
const BRIDGE = ['bridge/run.sh', 'bridge/checkout.sh', 'bridge/candidate.sh',
  'bridge/lib/chess.mjs', 'bridge/lib/lab.mjs', 'bridge/lib/register.mjs',
  'bridge/lib/app-packages.mjs']
const SUPPORT = ['README.md', 'design-manifest.json', 'provenance.mjs',
  'amendment-manifest.json', 'amendment-code.json', 'amendment.mjs',
  'phase2-amended.sh', 'acquisition-report.mjs', 'replay-diagnostic.mjs',
  'execution.mjs']
const HELPERS = ['frozen-runtime.mjs', 'second-amendment.mjs',
  'second-probe-source.mjs', 'human-failure-diagnostic.mjs', 'quiet.py',
  'second-run.py', 'second-launch.py', 'run.py', 'generate-human-failure-diagnostic.mjs',
  'second-diagnostic.mjs', 'second-amendment-manifest.json']
const LINKS = {
  '.cache/chess': '.cache/chess',
  'private/second-look-fresh': 'private/second-look-fresh',
  [`${PROJECT}/results`]: `${PROJECT}/results`,
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const insist = (ok, message) => { if (!ok) throw new Error(`frozen runtime: ${message}`) }
const digest = value => /^[0-9a-f]{64}$/.test(value ?? '')
const within = (root, path) => path === root || path.startsWith(root + '/')

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
  const designPath = join(sourceRoot, PROJECT, 'design-manifest.json')
  const designBytes = regular(designPath, sourceRoot), design = JSON.parse(designBytes)
  insist(design.schema === 'second-look-fresh-design/1'
    && /^[0-9a-f]{40}$/.test(design.appCommit)
    && /^[0-9a-f]{40}$/.test(design.recordsCommit), 'invalid study design')
  const expected = ['rules.mjs', 'prepare.mjs', 'candidate.mjs', 'runtime.mjs',
    'build.mjs', 'probe.mjs', 'common.mjs', 'reference.mjs', 'analyze.mjs', 'phase2.sh']
    .map(name => `${PROJECT}/${name}`)
  expected.push('projects/accuracy-vs-chesscom/build-evidence.mjs')
  insist(JSON.stringify(Object.keys(design.files).sort()) === JSON.stringify(expected.sort()),
    'registered measurement source set differs')
  for (const [path, expectedSha] of Object.entries(design.files)) {
    insist(digest(expectedSha) && sha(regular(join(sourceRoot, cleanRelative(path)), sourceRoot)) === expectedSha,
      'a registered measurement source changed')
  }
  insist(design.protocol.path === `${PROJECT}/README.md`
    && design.protocol.start === '## The data\n'
    && design.protocol.end === '## What the app would take\n', 'original protocol boundaries differ')
  section(sourceRoot, design.protocol)
  const amendmentBytes = regular(join(sourceRoot, PROJECT, 'amendment-manifest.json'), sourceRoot)
  const amendment = JSON.parse(amendmentBytes)
  insist(amendment.schema === 'second-look-fresh-acquisition-amendment/1'
    && amendment.designSha256 === sha(designBytes), 'first amendment identity differs')
  insist(amendment.protocol.path === `${PROJECT}/README.md`
    && amendment.protocol.start === '## Acquisition amendment, approved before the comparison\n'
    && amendment.protocol.end === '## Caveats\n', 'first amendment boundaries differ')
  section(sourceRoot, amendment.protocol)
  const codeBytes = regular(join(sourceRoot, PROJECT, 'amendment-code.json'), sourceRoot)
  const code = JSON.parse(codeBytes)
  insist(code.schema === 'second-look-fresh-acquisition-code/1'
    && JSON.stringify(Object.keys(code.files).sort()) === JSON.stringify([
      `${PROJECT}/amendment.mjs`, `${PROJECT}/phase2-amended.sh`,
    ]), 'first amendment source set differs')
  for (const [path, expectedSha] of Object.entries(code.files))
    insist(digest(expectedSha) && sha(regular(join(sourceRoot, cleanRelative(path)), sourceRoot)) === expectedSha,
      'first amendment source changed')
  const labPin = read(join(sourceRoot, 'bridge/chess.json'))
  insist(labPin.repo === 'https://github.com/Aneesh-Pothuru/chess', 'app repository differs')
  const pin = { repo: labPin.repo, commit: design.appCommit, records: design.recordsCommit }
  return { design, code, pin, designSha256: sha(designBytes),
    firstAmendmentSha256: sha(amendmentBytes), firstAmendmentCodeSha256: sha(codeBytes) }
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

function linkedFiles(sourceRoot) {
  const paths = [`${PROJECT}/results/phase1.json`]
  const secondManifest = join(sourceRoot, PROJECT, 'second-amendment-manifest.json')
  if (existsSync(secondManifest)) {
    const manifest = read(secondManifest)
    const diagnostic = cleanRelative(manifest.diagnostic.path)
    insist(diagnostic.startsWith('results/') && diagnostic.endsWith('.json'),
      'diagnostic is not a project aggregate')
    paths.push(`${PROJECT}/${diagnostic}`)
    insist(sha(readFileSync(join(sourceRoot, PROJECT, diagnostic))) === manifest.diagnostic.sha256,
      'diagnostic digest differs')
    section(sourceRoot, manifest.protocol)
  }
  return Object.fromEntries(paths.sort().map(path => [path, sha(regular(join(sourceRoot, path), sourceRoot))]))
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

/**
 * Prepare before code freeze. Explicit helper refresh is permitted only before
 * the public second-amendment-code.json exists. The later code attestation is
 * copied separately to avoid hashing a manifest that itself hashes this binding.
 */
export function prepareFrozenRuntime({ helperPaths = [], refreshHelpers = false } = {}) {
  const { sourceRoot, executionRoot } = locations()
  insist(HERE === sourceRoot, 'prepare runs only from the original clone')
  const identity = sourceIdentity(sourceRoot)
  const candidateSha256 = checkCache(sourceRoot, identity)
  const frozen = existsSync(join(sourceRoot, FREEZE))
  insist(!refreshHelpers || !frozen, 'helper refresh is forbidden after code freeze')
  if (frozen) {
    insist(existsSync(join(executionRoot, BINDING)), 'cannot create a new binding after code freeze')
    copyAttestation(sourceRoot, executionRoot)
    return verifyFrozenRuntime()
  }
  if (existsSync(executionRoot))
    insist(!lstatSync(executionRoot).isSymbolicLink()
      && realpathSync(executionRoot) === executionRoot, 'execution root is not a real directory')
  else {
    const parent = dirname(executionRoot)
    mkdirSync(parent, { recursive: true })
    insist(within(sourceRoot, realpathSync(parent)), 'execution parent leaves this clone')
    mkdirSync(executionRoot)
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
  const frozenPaths = new Set([...Object.keys(identity.design.files), ...Object.keys(identity.code.files)])
  const extras = helperPaths.map(name => cleanRelative(name.includes('/') ? name : `${PROJECT}/${name}`))
  insist(extras.every(path => path.startsWith(PROJECT + '/') && !path.startsWith(`${PROJECT}/results/`)
    && path !== FREEZE), 'helper is outside the project source set')
  const paths = [...new Set([...frozenPaths, ...BRIDGE,
    ...SUPPORT.map(name => `${PROJECT}/${name}`),
    ...HELPERS.filter(name => existsSync(join(sourceRoot, PROJECT, name))).map(name => `${PROJECT}/${name}`),
    ...extras])].sort()
  const files = Object.fromEntries(paths.map(path => [path,
    copyFile(sourceRoot, executionRoot, path, refreshHelpers && !frozenPaths.has(path))]))
  const pinBytes = json(identity.pin), pinPath = join(executionRoot, 'bridge/chess.json')
  if (existsSync(pinPath)) insist(readFileSync(pinPath).equals(Buffer.from(pinBytes)), 'private study pin differs')
  else writeFileSync(pinPath, pinBytes, { flag: 'wx' })
  const binding = { schema: 'second-look-fresh-frozen-runtime/1',
    sourceRoot, executionRoot, pin: identity.pin, pinSha256: sha(pinBytes),
    designSha256: identity.designSha256,
    firstAmendmentSha256: identity.firstAmendmentSha256,
    firstAmendmentCodeSha256: identity.firstAmendmentCodeSha256,
    candidateSha256, files, linkedFiles: linkedFiles(sourceRoot), links: LINKS,
    permittedWork: ['observed-replay', 'reference', 'analysis', 'reporting'],
    forbiddenWork: ['phase2-driver', 'prepare', 'candidate-build', 'canonical-build', 'runtime-cache-relocation'] }
  const bindingPath = join(executionRoot, BINDING), bindingBytes = json(binding)
  if (existsSync(bindingPath) && !readFileSync(bindingPath).equals(Buffer.from(bindingBytes)))
    insist(refreshHelpers, 'existing binding differs; explicit pre-freeze refresh is required')
  if (!existsSync(bindingPath) || !readFileSync(bindingPath).equals(Buffer.from(bindingBytes))) {
    const temp = `${bindingPath}.${process.pid}.tmp`
    writeFileSync(temp, bindingBytes, { flag: 'wx' })
    renameSync(temp, bindingPath)
  }
  return verifyFrozenRuntime()
}

/** Read-only from either the original clone or the real copied module. */
export function verifyFrozenRuntime() {
  const { sourceRoot, executionRoot } = locations()
  insist(!lstatSync(executionRoot).isSymbolicLink() && realpathSync(executionRoot) === executionRoot,
    'execution root moved')
  const bindingBytes = regular(join(executionRoot, BINDING), executionRoot)
  const binding = JSON.parse(bindingBytes), identity = sourceIdentity(sourceRoot)
  insist(binding.schema === 'second-look-fresh-frozen-runtime/1'
    && binding.sourceRoot === sourceRoot && binding.executionRoot === executionRoot,
  'binding locations differ')
  insist(JSON.stringify(binding.pin) === JSON.stringify(identity.pin)
    && binding.designSha256 === identity.designSha256
    && binding.firstAmendmentSha256 === identity.firstAmendmentSha256
    && binding.firstAmendmentCodeSha256 === identity.firstAmendmentCodeSha256,
  'binding study identity differs')
  insist(binding.candidateSha256 === checkCache(sourceRoot, identity), 'bound candidate differs')
  const pinBytes = regular(join(executionRoot, 'bridge/chess.json'), executionRoot)
  insist(sha(pinBytes) === binding.pinSha256 && pinBytes.equals(Buffer.from(json(identity.pin))),
    'private study pin changed')
  insist(JSON.stringify(binding.links) === JSON.stringify(LINKS), 'bound link set differs')
  for (const [path, target] of Object.entries(LINKS)) {
    const source = join(sourceRoot, target), destination = join(executionRoot, path)
    insist(within(sourceRoot, realpathSync(source)) && lstatSync(destination).isSymbolicLink()
      && realpathSync(destination) === realpathSync(source), 'bound cache, data or results link changed')
  }
  for (const path of [...Object.keys(identity.design.files), ...Object.keys(identity.code.files),
    ...BRIDGE, ...SUPPORT.map(name => `${PROJECT}/${name}`), `${PROJECT}/frozen-runtime.mjs`])
    insist(binding.files[path], 'required source is missing from binding')
  for (const [path, expected] of Object.entries(binding.files)) {
    cleanRelative(path)
    insist((path.startsWith(PROJECT + '/') && !path.startsWith(`${PROJECT}/results/`))
      || BRIDGE.includes(path) || path === 'projects/accuracy-vs-chesscom/build-evidence.mjs',
    'unexpected copied source path')
    insist(digest(expected.sha256) && Number.isInteger(expected.mode), 'invalid copied source identity')
    for (const root of [sourceRoot, executionRoot])
      insist(sha(regular(join(root, path), root)) === expected.sha256
        && (statSync(join(root, path)).mode & 0o777) === expected.mode, 'copied source changed')
  }
  const linked = linkedFiles(sourceRoot)
  insist(JSON.stringify(binding.linkedFiles) === JSON.stringify(linked), 'linked immutable aggregate changed')
  for (const [path, expectedSha] of Object.entries(linked))
    insist(sha(readFileSync(join(executionRoot, path))) === expectedSha, 'linked aggregate differs')
  if (existsSync(join(sourceRoot, FREEZE))) {
    const bytes = regular(join(sourceRoot, FREEZE), sourceRoot)
    insist(regular(join(executionRoot, FREEZE), executionRoot).equals(bytes), 'code attestation copy differs')
    const freeze = JSON.parse(bytes)
    if (freeze.bindingSha256 != null)
      insist(freeze.bindingSha256 === sha(bindingBytes), 'code freeze binds a different runtime')
  }
  return { sourceRoot, executionRoot, bindingSha256: sha(bindingBytes), binding,
    pin: identity.pin, copiedFiles: Object.keys(binding.files).length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  insist(command === 'prepare' || command === 'verify', 'usage: frozen-runtime.mjs prepare|verify [--refresh-helpers]')
  const result = command === 'prepare'
    ? prepareFrozenRuntime({ refreshHelpers: process.argv.includes('--refresh-helpers') })
    : verifyFrozenRuntime()
  process.stdout.write(result.executionRoot + '\n')
}
