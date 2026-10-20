// Preserved-acquisition diagnosis only. No engine, move classification,
// comparison estimate or reference search runs here.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectSecondReport, secondReportMarkdown, utcIntervalSeconds } from './second-report.mjs'

const LAB = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const SECOND = join(ROOT, 'second-acquisition')
const DIAGNOSTICS = join(ROOT, 'third-acquisition/diagnostics')
const BOUND = join(SECOND, 'execution-root')
const THIRD_MARKER = '\n## Third acquisition amendment, approved before the comparison\n'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => JSON.parse(readFileSync(path))
const json = value => JSON.stringify(value, null, 2) + '\n'
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const insist = (ok, why) => { if (!ok) throw new Error(`suspension diagnosis: ${why}`) }
const safe = path => {
  insist(!path.startsWith('/') && !path.split('/').includes('..'), 'unsafe preserved path')
  const full = join(LAB, path)
  insist(realpathSync(full).startsWith(LAB + '/'), 'preserved input leaves this clone')
  return full
}
const reading = evidence => evidence ? Object.fromEntries(Object.entries(evidence)
  .filter(([key]) => !['history', 'stability'].includes(key))) : null
const differentKeys = (a, b) => [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])]
  .filter(key => !same(a?.[key], b?.[key])).sort()

const APP_SOURCES = [
  'src/adapters/node/engine/index.ts', 'src/adapters/node/engine/transport.ts',
  'src/services/engine/service.ts', 'src/services/engine/uci/session.ts',
  'src/services/engine/uci/search.ts', 'src/services/review/pipeline/run.ts',
  'src/services/review/pipeline/evidence.ts', 'src/services/review/pipeline/rebuild.ts',
  'src/services/review/pipeline/document.ts', 'src/services/review/accuracy.ts',
  'src/services/review/moments.ts',
]

function verifyReadme(binding) {
  const path = 'projects/second-look-fresh/README.md'
  const original = readFileSync(join(BOUND, path))
  const current = readFileSync(join(LAB, path))
  insist(sha(original) === binding.files[path].sha256, 'bound original README changed')
  const thirdPath = join(PROJECT, 'third-amendment-manifest.json')
  if (!existsSync(thirdPath)) {
    insist(current.equals(original), 'README changed before the third amendment manifest exists')
    return { appended: false }
  }
  const third = read(thirdPath)
  insist(third.schema === 'second-look-fresh-third-acquisition-amendment/1'
    && third.appCommit === binding.pin.commit && third.recordsCommit === binding.pin.records
    && third.protocol?.path === path && third.protocol.start === THIRD_MARKER
    && third.protocol.end === 'EOF'
    && third.preservedReadme?.path === 'private/second-look-fresh/second-acquisition/execution-root/projects/second-look-fresh/README.md'
    && third.preservedReadme.sha256 === sha(original), 'third amendment prefix identity differs')
  const appended = current.subarray(original.length)
  insist(current.subarray(0, original.length).equals(original)
    && appended.toString().startsWith(THIRD_MARKER)
    && sha(appended) === third.protocol.sha256, 'README is not the exact approved append')
  for (const [path, digest] of Object.entries(third.files))
    insist(sha(readFileSync(safe(path))) === digest, 'third amendment source changed')
  insist(third.files['projects/second-look-fresh/suspension-diagnostic.mjs']
    === sha(readFileSync(fileURLToPath(import.meta.url))), 'diagnostic source is not frozen')
  return { appended: true, third }
}

function verifyBoundRuntime(binding, bindingBytes) {
  const within = path => realpathSync(path).startsWith(LAB + '/')
  const regular = path => {
    insist(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()
      && within(path), 'a bound source is not a regular file within this clone')
    return readFileSync(path)
  }
  insist(binding.schema === 'second-look-fresh-frozen-runtime/1'
    && realpathSync(LAB) === LAB && realpathSync(BOUND) === BOUND
    && !lstatSync(BOUND).isSymbolicLink(), 'execution roots changed')
  for (const [path, expected] of Object.entries(binding.files)) {
    for (const root of [LAB, BOUND]) {
      const full = join(root, path), bytes = regular(full)
      insist((statSync(full).mode & 0o777) === expected.mode, 'bound source mode changed')
      if (root !== LAB || path !== 'projects/second-look-fresh/README.md')
        insist(sha(bytes) === expected.sha256, 'bound source bytes changed')
    }
  }
  const pinBytes = regular(join(BOUND, 'bridge/chess.json'))
  insist(sha(pinBytes) === binding.pinSha256 && pinBytes.equals(Buffer.from(json(binding.pin))),
    'private bridge pin changed')
  const links = { '.cache/chess': '.cache/chess',
    'private/second-look-fresh': 'private/second-look-fresh',
    'projects/second-look-fresh/results': 'projects/second-look-fresh/results' }
  insist(same(binding.links, links), 'bound link set changed')
  for (const [path, target] of Object.entries(links)) {
    const source = join(LAB, target), destination = join(BOUND, path)
    insist(within(source) && lstatSync(destination).isSymbolicLink()
      && realpathSync(destination) === realpathSync(source), 'bound link target changed')
  }
  for (const [path, digest] of Object.entries(binding.linkedFiles))
    insist(sha(regular(join(LAB, path))) === digest
      && sha(readFileSync(join(BOUND, path))) === digest, 'linked aggregate changed')
  const attestationPath = 'projects/second-look-fresh/second-amendment-code.json'
  const attestationBytes = regular(join(LAB, attestationPath))
  insist(attestationBytes.equals(regular(join(BOUND, attestationPath)))
    && read(join(LAB, attestationPath)).bindingSha256 === sha(bindingBytes),
  'code attestation copy or binding changed')
  const designBytes = regular(join(PROJECT, 'design-manifest.json'))
  const design = JSON.parse(designBytes)
  insist(sha(designBytes) === binding.designSha256
    && sha(regular(join(PROJECT, 'amendment-manifest.json'))) === binding.firstAmendmentSha256
    && sha(regular(join(PROJECT, 'amendment-code.json'))) === binding.firstAmendmentCodeSha256,
  'bound study identity changed')
  const cache = join(LAB, '.cache/chess')
  for (const name of [binding.pin.commit, binding.pin.records, 'candidates/second-look-fresh'])
    insist(within(join(cache, name)), 'cached dependency leaves this clone')
  for (const commit of [binding.pin.commit, binding.pin.records]) {
    const path = join(cache, commit)
    insist(existsSync(join(path, '.git/bridge-ready'))
      && execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() === commit,
    'cached app or records HEAD changed')
  }
  for (const name of [binding.pin.commit, 'candidates/second-look-fresh'])
    insist(within(join(cache, name, 'node_modules')), 'cached dependencies leave this clone')
  const candidate = read(join(ROOT, 'candidate-manifest.json'))
  const { candidateSha256, ...payload } = candidate
  insist(candidateSha256 === binding.candidateSha256 && candidateSha256 === sha(JSON.stringify(payload))
    && candidate.appCommit === binding.pin.commit && candidate.recordsCommit === binding.pin.records
    && candidate.recipeSha256 === design.files['projects/second-look-fresh/candidate.mjs'],
  'bound candidate identity changed')
  for (const replacement of candidate.replacements)
    insist(sha(readFileSync(join(cache, binding.pin.commit, replacement.path))) === replacement.sourceSha256
      && sha(readFileSync(join(cache, 'candidates/second-look-fresh', replacement.path))) === replacement.candidateSha256,
    'candidate replacement source changed')
}

async function preservedInputs() {
  const stopBytes = readFileSync(join(SECOND, 'stopped-manifest.json'))
  const stop = JSON.parse(stopBytes)
  const publicStop = read(join(PROJECT, 'results/second-stopped-manifest.json'))
  insist(stop.schema === 'second-look-fresh-second-acquisition-stopped/1'
    && publicStop.stoppedManifestSha256 === sha(stopBytes)
    && publicStop.reportSha256 === stop.reportSha256, 'second stopped identity differs')
  for (const [path, digest] of Object.entries(stop.files))
    insist(sha(readFileSync(safe(path))) === digest, 'a stopped input changed')
  for (const [path, names] of Object.entries(stop.inventories))
    insist(same(readdirSync(safe(path)).sort(), names), 'a stopped inventory changed')
  const bindingBytes = readFileSync(join(BOUND, 'frozen-binding.json'))
  const binding = JSON.parse(bindingBytes)
  insist(sha(bindingBytes) === stop.frozenBindingSha256
    && binding.sourceRoot === LAB && binding.executionRoot === BOUND
    && binding.pin.commit === publicStop.appCommit && binding.pin.records === publicStop.recordsCommit,
  'frozen execution binding differs')
  const readme = verifyReadme(binding)
  verifyBoundRuntime(binding, bindingBytes)
  for (const [path, expected] of Object.entries(binding.files)) {
    insist(sha(readFileSync(join(BOUND, path))) === expected.sha256, 'bound source changed')
    if (path !== 'projects/second-look-fresh/README.md')
      insist(sha(readFileSync(safe(path))) === expected.sha256, 'original acquisition source changed')
  }
  for (const [path, digest] of Object.entries(binding.linkedFiles))
    insist(sha(readFileSync(safe(path))) === digest, 'linked frozen aggregate changed')
  if (readme.appended) {
    insist(readme.third.secondStoppedManifestSha256 === sha(stopBytes)
      && readme.third.secondAmendmentSha256 === stop.amendmentSha256,
    'third amendment names another stopped acquisition')
  } else {
    // Before the append, exercise the original complete reporting validator.
    // Afterwards it deliberately refuses an edited README, so the preserved
    // binding, byte hashes and exact prefix checks above replace this call.
    const current = await collectSecondReport()
    insist(readFileSync(join(PROJECT, 'results/second-acquisition.json'), 'utf8') === json(current.report)
      && readFileSync(join(PROJECT, 'results/second-acquisition.md'), 'utf8') === secondReportMarkdown(current.report)
      && readFileSync(join(ROOT, 'diagnostics/second-acquisition-report.json'), 'utf8') === json(current.privateReport),
    'the saved second report is stale')
  }
  const reportBytes = readFileSync(join(PROJECT, 'results/second-acquisition.json'))
  const report = JSON.parse(reportBytes)
  const privateReport = read(join(ROOT, 'diagnostics/second-acquisition-report.json'))
  insist(sha(reportBytes) === stop.reportSha256 && report.stoppedAtRegisteredAcquisitionGuard
    && !report.decidingMetricsRead && !report.complete
    && report.referenceProcessesStarted === 0 && report.analysisProcessesStarted === 0,
  'the preserved report is not a pre-comparison blocked stop')
  insist(!existsSync(join(PROJECT, 'results/compare.json'))
    && !existsSync(join(ROOT, 'analysis-per-game.json'))
    && !existsSync(join(ROOT, 'reference/manifest.json')), 'a deciding or reference output exists')
  const blocked = privateReport.attempts.filter(a => !a.old && a.outcome === 'blocked')
  insist(blocked.length === 1 && blocked[0].attempt === 1, 'expected one preserved blocked first replay')
  const casesBytes = readFileSync(join(ROOT, 'cases.json'))
  insist(sha(casesBytes) === publicStop.casesSha256, 'case set changed')
  const cases = JSON.parse(casesBytes), one = blocked[0]
  const name = `${cases[one.ordinal - 1].id}.json`
  const canonicalPath = join(ROOT, 'acquisition-amended/candidate/evidence/routine', name)
  const replayPath = join(SECOND, 'replays/first', name)
  const canonicalBytes = readFileSync(canonicalPath), replayBytes = readFileSync(replayPath)
  const classification = read(join(SECOND, 'classifications', `${one.ordinal}-1.json`))
  insist(classification.outcome === 'blocked'
    && classification.canonicalSha256 === sha(canonicalBytes)
    && classification.observationSha256 === sha(replayBytes), 'preserved blocked pair differs')
  return { stop, stopSha256: sha(stopBytes), binding, publicStop, report, privateReport,
    one, classification, canonical: JSON.parse(canonicalBytes), replay: JSON.parse(replayBytes),
    canonicalSha256: sha(canonicalBytes), replaySha256: sha(replayBytes), readme }
}

function sourceProof(inputs) {
  const appDir = join(LAB, '.cache/chess', inputs.binding.pin.commit)
  insist(realpathSync(appDir).startsWith(LAB + '/'), 'pinned app leaves this clone')
  const candidate = read(join(ROOT, 'candidate-manifest.json'))
  const candidateDir = join(LAB, '.cache/chess/candidates/second-look-fresh')
  const sources = {}, hashes = {}, candidateHashes = {}, anchors = []
  for (const path of APP_SOURCES) {
    const bytes = readFileSync(join(appDir, path))
    const original = execFileSync('git', ['-C', appDir, 'show', `${inputs.binding.pin.commit}:${path}`])
    insist(bytes.equals(original), 'a diagnostic dependency differs from the pinned app object')
    const candidateBytes = readFileSync(join(candidateDir, path))
    const replacement = candidate.replacements.find(r => r.path === path)
    insist(replacement ? sha(candidateBytes) === replacement.candidateSha256 : candidateBytes.equals(bytes),
      'candidate diagnostic source differs from the registered replacement or pinned app')
    hashes[path] = sha(bytes); sources[path] = bytes.toString()
    candidateHashes[path] = sha(candidateBytes)
  }
  const add = (path, text, meaning) => {
    const at = sources[path].indexOf(text)
    insist(at >= 0, 'source mechanism anchor is missing')
    anchors.push({ path, line: sources[path].slice(0, at).split('\n').length, meaning })
  }
  add('src/services/engine/service.ts', '  const defaultDeadline =', 'The Node service chooses its default search deadline.')
  add('src/services/engine/service.ts', '      deadlineMs: opts.deadlineMs ?? defaultDeadline',
    'Per-call overrides can replace the default; this replay supplied none.')
  add('src/services/engine/uci/session.ts', "        const timer = setTimeout(() => void recover('deadline')",
    'The deadline timer is armed inside the scheduled UCI search slot.')
  add('src/services/engine/uci/session.ts', "if (why === 'deadline') resolve({ bestLine: drained, timedOut: true })",
    'Deadline recovery resolves a timed-out result after draining; it need not throw.')
  add('src/services/engine/uci/session.ts', "resolve({ bestLine: line, timedOut: false })",
    'Receiving bestmove on the normal path resolves a non-timeout result.')
  add('src/services/engine/uci/search.ts', "completion: timedOut ? 'deadline' : 'complete'",
    'Search results distinguish the terminal path.')
  add('src/services/engine/service.ts', "partial: res.completion !== 'complete'",
    'The CandidateSet carries deadline completion as partial.')
  add('src/services/review/pipeline/evidence.ts', 'complete = multi.complete && !multi.partial',
    'Deep evidence checks the returned CandidateSet completeness and partial flag.')
  add('src/services/review/pipeline/evidence.ts', 'if (rank(next) < rank(prev)) return prev',
    'Lower-rank adaptive evidence keeps the initial reading.')
  add('src/services/review/pipeline/evidence.ts', 'if (prev.depth !== null && (next.depth === null || next.depth < prev.depth)) return prev',
    'At equal rank, lower-depth adaptive evidence keeps the initial reading.')
  add('src/services/review/pipeline/run.ts', 'const accepted = strongerEvidence(ev, next)',
    'Adaptive evidence selection precedes the emitted verification event.')
  add('src/services/review/pipeline/rebuild.ts', 'const ev = positions[i]?.deep ?? null',
    'Record refinement consumes this position’s retained deep evidence.')
  add('src/services/review/pipeline/rebuild.ts', 'r.criticality = criticalityOf(r, positions[i])',
    'Criticality is rebuilt after record refinement.')
  add('src/services/review/pipeline/document.ts', "white: input.summaries?.white ?? summarizeSide(records, 'w'",
    'The side summary is derived from the rebuilt records.')
  add('src/adapters/node/engine/transport.ts', "{ stdio: ['pipe', 'pipe', 'ignore'] }",
    'Engine stdout is piped to the transport and stderr is discarded.')
  const match = /const defaultDeadline = config\.deadlineMs \?\? \(runtime === 'node' \? ([\d_]+) : ([\d_]+)\)/.exec(
    sources['src/services/engine/service.ts'])
  insist(match, 'Node deadline constant is not identifiable')
  const probe = readFileSync(join(BOUND, 'projects/second-look-fresh/probe.mjs'), 'utf8')
  insist(probe.includes('createNodeEngine({ root: CHESS_DIR, evalCache: false, pool: 1 })')
    && !probe.includes('deadlineMs:')
    && probe.includes('call.depth = Number.isFinite(result?.depth) ? result.depth : null'),
  'the original observation instrument differs')
  return { hashes, candidateHashes,
    sourceSetSha256: sha(JSON.stringify({ hashes, candidateHashes })), anchors,
    defaultNodeDeadlineMs: Number(match[1].replaceAll('_', '')),
    observationInstrumentSha256: sha(probe),
    engineResultPayloadRecorded: false, rawUciTeePresent: false, evalCacheEnabled: false }
}

export function downstreamProof(canonical, replay) {
  const doc = replay.doc
  insist(canonical.positions.length === doc.positions.length
    && canonical.records.length === doc.records.length, 'document row counts differ')
  const positions = canonical.positions.flatMap((p, i) => same(p, doc.positions[i]) ? [] : [i])
  const records = canonical.records.flatMap((r, i) => same(r, doc.records[i]) ? [] : [i])
  const recordConsumers = new Set(['after', 'before', 'bestPv', 'criticality', 'gapToSecond',
    'lossPct', 'reasons', 'verifyDepth', 'winAfter'])
  const privateRows = positions.map(index => {
    const raw = replay.looks.find(l => l.index === index)
    const canonicalDeep = canonical.positions[index].deep
    const baseNodes = canonical.provenance.verifyNodes
    const adaptive = replay.calls.filter(call => call.index === index && call.stage === 'verify'
      && call.method === 'bestMoves' && call.budget?.nodes === baseNodes * 2)
    const initial = canonicalDeep?.history?.find(e => e.searchBudget?.nodes === baseNodes)
    const recordFields = differentKeys(canonical.records[index], doc.records[index])
    const sourceConsumersOnly = recordFields.every(key => recordConsumers.has(key))
    const proof = {
      privatePositionIndex: index,
      sameRawAndFinalReplayEvidence: same(raw?.evidence, doc.positions[index].deep),
      initialReadingMatchesCanonicalHistory: !!initial && same(reading(initial), reading(raw?.evidence)),
      rawRetainsInitialBudget: raw?.evidence?.searchBudget?.nodes === baseNodes,
      canonicalRetainsAdaptiveBudget: canonicalDeep?.searchBudget?.nodes === baseNodes * 2,
      singleAdaptiveCall: adaptive.length === 1,
      noPostVerificationCallAtPosition: !replay.calls.some(c => c.index === index && c.stage === 'after-verification'),
      sourceConsumersOnly,
      adaptiveReturnedDepthLower: adaptive.length === 1 && Number.isFinite(adaptive[0].depth)
        && Number.isFinite(raw?.evidence?.depth) && adaptive[0].depth < raw.evidence.depth,
      initialCompleteAndPlayedPresent: !!raw?.evidence?.complete
        && raw.evidence.lines?.length > 0 && raw.evidence.played != null,
      positionFieldsChanged: differentKeys(canonical.positions[index], doc.positions[index]),
      deepFieldsChanged: differentKeys(canonicalDeep, doc.positions[index].deep),
      recordFieldsChanged: recordFields,
      initialDepth: raw?.evidence?.depth, adaptiveReturnedDepth: adaptive[0]?.depth,
      canonicalRetainedDepth: canonicalDeep?.depth,
      privateAdaptiveCallIndex: adaptive.length === 1 ? replay.calls.indexOf(adaptive[0]) : null,
    }
    proof.accountedFor = Object.entries(proof).filter(([key, value]) => typeof value === 'boolean'
      && key !== 'accountedFor').every(([, value]) => value)
      && same(proof.positionFieldsChanged, ['deep'])
    return proof
  })
  const nondeepUnchanged = canonical.positions.every((p, i) =>
    same(Object.fromEntries(Object.entries(p).filter(([k]) => k !== 'deep')),
      Object.fromEntries(Object.entries(doc.positions[i]).filter(([k]) => k !== 'deep'))))
  const topFields = differentKeys(canonical, doc)
  const summaryFields = differentKeys(canonical.white, doc.white)
  const topAccounted = topFields.every(k => ['positions', 'records', 'white'].includes(k))
    && summaryFields.every(k => ['accuracy', 'acpl', 'phases'].includes(k))
  return { aggregate: { differingPositionRows: positions.length, differingRecordRows: records.length,
    sameChangedRowSets: same(positions, records), nondeepPositionsUnchanged: nondeepUnchanged,
    rawEvidenceEqualsFinalAtEveryChangedRow: privateRows.every(r => r.sameRawAndFinalReplayEvidence),
    extensionUnchanged: same(canonical.ext, doc.ext),
    allDifferingTopLevelFieldsAccountedFor: topAccounted,
    accountedForRows: privateRows.filter(r => r.accountedFor).length,
    unaccountedForRows: privateRows.filter(r => !r.accountedFor).length,
    allRowsDownstream: positions.length > 0 && same(positions, records) && nondeepUnchanged
      && topAccounted && same(canonical.ext, doc.ext) && privateRows.every(r => r.accountedFor),
    differingTopLevelFieldNames: topFields, differingSummaryFieldNames: summaryFields,
  }, privateRows }
}

function powerProof(call) {
  const logBytes = readFileSync(join(DIAGNOSTICS, 'power-window.log'))
  const captureBytes = readFileSync(join(DIAGNOSTICS, 'power-window-capture.json'))
  const capture = JSON.parse(captureBytes)
  insist(capture.sha256 === sha(logBytes) && capture.bytes === logBytes.length
    && capture.exitCode === 0 && same(capture.command, ['pmset', '-g', 'log']),
  'captured power-log provenance differs')
  const events = logBytes.toString().split('\n').flatMap((line, index) => {
    const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})\s+(Sleep|Wake)[ \t]{2,}/.exec(line)
    if (!match) return []
    const at = new Date(`${match[1]}T${match[2]}${match[3]}:${match[4]}`).toISOString()
    return [{ at, kind: match[5], privateLineIndex: index, lineSha256: sha(line) }]
  })
  const before = events.filter(e => e.kind === 'Sleep' && Date.parse(e.at) <= Date.parse(call.startedAt)).at(-1)
  const after = events.find(e => e.kind === 'Wake' && Date.parse(e.at) >= Date.parse(call.startedAt))
  insist(before && after && Date.parse(after.at) <= Date.parse(call.endedAt)
    && !events.some(e => e.kind === 'Wake' && Date.parse(e.at) > Date.parse(before.at)
      && Date.parse(e.at) < Date.parse(after.at)), 'power log has no enclosing full sleep/wake interval')
  return { aggregate: { powerLogSha256: sha(logBytes), captureMetadataSha256: sha(captureBytes),
    sleepEventAt: before.at, wakeEventAt: after.at,
    loggedEventIntervalSeconds: utcIntervalSeconds(before.at, after.at),
    callStartsAfterSleepEventSeconds: utcIntervalSeconds(before.at, call.startedAt),
    callEndsAfterWakeEventSeconds: utcIntervalSeconds(after.at, call.endedAt),
    fullSleepAndWakeDocumented: true,
    limitation: 'These are logged power-event times, not the search slot’s timer-arm or timer-delivery timestamps.',
  }, privateEvents: [before, after] }
}

export async function collectSuspensionDiagnostic() {
  const inputs = await preservedInputs(), source = sourceProof(inputs)
  const downstream = downstreamProof(inputs.canonical, inputs.replay)
  insist(downstream.aggregate.allRowsDownstream
    && downstream.aggregate.differingPositionRows === 1
    && downstream.aggregate.differingRecordRows === 1, 'the downstream prose claims no longer hold')
  const longCalls = inputs.replay.calls.filter(c => c.seconds > source.defaultNodeDeadlineMs / 1000)
  insist(longCalls.length === 1 && longCalls[0].stage === 'verify'
    && longCalls[0].method === 'bestMoves'
    && longCalls[0].budget?.nodes === inputs.canonical.provenance.verifyNodes * 2,
  'expected one preserved long adaptive verification call')
  const call = longCalls[0], power = powerProof(call)
  const nominal = new Date(Date.parse(call.startedAt) + source.defaultNodeDeadlineMs).toISOString()
  const terminalFields = ['completion', 'timedOut', 'partial', 'result', 'nodes', 'timeMs']
  const terminalCauseRecorded = ['completion', 'timedOut'].some(k => Object.hasOwn(call, k))
  const metadataPaths = readdirSync(join(SECOND, 'run-log')).filter(p => p.endsWith('-events.jsonl'))
  const starts = metadataPaths.flatMap(name => readFileSync(join(SECOND, 'run-log', name), 'utf8')
    .split('\n').filter(Boolean).map(JSON.parse)).filter(e => e.event === 'child-started'
      && e.stage === `game-${String(inputs.one.ordinal).padStart(2, '0')}-attempt-${inputs.one.attempt}`)
  insist(starts.length === 1, 'preserved process log is ambiguous')
  const logBytes = readFileSync(join(SECOND, 'run-log', starts[0].log))
  const logLines = logBytes.toString().split('\n')
  const rawUciLines = logLines.filter(l => /^(?:info |bestmove |readyok$|uciok$)/.test(l)).length
  const terminationMarkers = logLines.filter(l => /\b(?:timedOut|completion|deadline)\b/.test(l)).length
  const suspensionDocumented = power.aggregate.fullSleepAndWakeDocumented
  const nominalInside = Date.parse(nominal) > Date.parse(power.aggregate.sleepEventAt)
    && Date.parse(nominal) < Date.parse(power.aggregate.wakeEventAt)
  insist(nominalInside, 'the nominal deadline is outside the documented power interval')
  const reasons = []
  if (!downstream.aggregate.allRowsDownstream) reasons.push('differing-rows-not-fully-accounted-for')
  if (!suspensionDocumented) reasons.push('suspension-not-documented')
  if (!terminalCauseRecorded) reasons.push('deadline-termination-not-recorded')
  reasons.push('actual-search-slot-start-and-deadline-delivery-unrecorded')
  const classification = {
    qualifies: false,
    downstreamRowsAccountedFor: downstream.aggregate.allRowsDownstream,
    suspensionDocumented,
    nominalCallStartPlusDeadlineFallsInPowerInterval: nominalInside,
    actualSlotStartRecorded: false, actualDeadlineExpiryRecorded: false,
    terminalCauseRecorded, deadlineTerminationProven: false,
    reasons,
    conclusion: 'The preserved mismatch does not prove the required deadline termination and does not qualify.',
  }
  insist(!terminalCauseRecorded && rawUciLines === 0 && terminationMarkers === 0,
    'new terminal-path evidence needs a fresh read-only audit')
  const report = {
    schema: 'second-look-fresh-suspension-diagnostic/1',
    appCommit: inputs.publicStop.appCommit, recordsCommit: inputs.publicStop.recordsCommit,
    casesSha256: inputs.publicStop.casesSha256, candidateSha256: inputs.publicStop.candidateSha256,
    secondStoppedManifestSha256: inputs.stopSha256,
    secondAcquisitionReportSha256: inputs.stop.reportSha256,
    secondAmendmentSha256: inputs.stop.amendmentSha256,
    frozenBindingSha256: inputs.stop.frozenBindingSha256,
    reportingScriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
    classification,
    downstream: downstream.aggregate,
    observedCompleteness: {
      rawLooks: inputs.report.blockedDiagnosis.observedVerificationLooks,
      completeRawLooks: inputs.report.blockedDiagnosis.completeObservedVerificationLooks,
      matchingCanonicalLatestReadings: inputs.report.blockedDiagnosis.canonicalLatestVerificationReadingsEqual,
      differingCanonicalLatestReadings: inputs.report.blockedDiagnosis.canonicalLatestVerificationReadingsDifferent,
      failedCalls: inputs.report.blockedDiagnosis.calls.failed,
    },
    power: power.aggregate,
    clockComparison: {
      blockedNewProcesses: inputs.report.clockComparison.blockedNewProcesses,
      blockedNewReviewCalendarSeconds: inputs.report.clockComparison.blockedNewReviewCalendarSeconds,
      blockedNewReviewNodePerformanceSeconds: inputs.report.clockComparison.blockedNewReviewNodePerformanceSeconds,
    },
    searchTiming: {
      defaultDeadlineMs: source.defaultNodeDeadlineMs,
      wrapperCallStartedAt: call.startedAt, wrapperCallEndedAt: call.endedAt,
      recordedNodePerformanceSeconds: call.seconds,
      wrapperUtcSeconds: utcIntervalSeconds(call.startedAt, call.endedAt),
      nominalCallStartPlusDeadlineAt: nominal,
      nominalOnly: true,
      interpretation: 'Call start plus the configured delay is counterfactual arithmetic, not an observed slot start, timer expiry or deadline delivery.',
    },
    retainedTelemetry: {
      recordedCallFieldNames: Object.keys(call).sort(),
      absentTerminalFieldNames: terminalFields.filter(k => !Object.hasOwn(call, k)),
      rawUciLinesInProcessLog: rawUciLines, terminalMarkersInProcessLog: terminationMarkers,
      processLogSha256: sha(logBytes),
      returnedAdaptivePayloadSaved: false, discardedDeepEvidenceSaved: false,
      rawUciTeePresent: source.rawUciTeePresent, evalCacheEnabled: source.evalCacheEnabled,
    },
    source,
    noSearchOrDecidingMetricRun: true,
    decidingMetricsRead: false,
    limitations: [
      'The deadline callback and normal bestmove callback are distinct source paths. Neither chosen terminal path is retained for the adaptive call.',
      'The call wrapper starts before service awaits and search-slot scheduling. Its timestamp does not locate timer arming.',
      'A logged suspension and nominal deadline within that interval do not establish that the timer actually elapsed during suspension or that deadline recovery won after wake.',
      'The retained verification event contains the selected prior evidence. It cannot recover completeness or exact rejection conditions of the discarded adaptive result.',
      'No unique counterfactual cause is established by this dependency audit.',
    ],
  }
  if (inputs.readme.appended) {
    insist(inputs.readme.third.diagnostic?.path === 'results/suspension-diagnostic.json'
      && inputs.readme.third.diagnostic.sha256 === sha(json(report)),
    'diagnostic no longer matches the approved immutable aggregate')
  }
  return { report, privateReport: {
    schema: 'second-look-fresh-private-suspension-diagnostic/1',
    reportSha256: sha(json(report)), canonicalSha256: inputs.canonicalSha256,
    replaySha256: inputs.replaySha256,
    privateOrdinal: inputs.one.ordinal, privateAttempt: inputs.one.attempt,
    privateRows: downstream.privateRows,
    privateAdaptiveCallIndex: inputs.replay.calls.indexOf(call),
    adaptiveCall: call, privatePowerEvents: power.privateEvents,
  } }
}

export function diagnosticMarkdown(r) {
  const d = r.downstream, t = r.searchTiming, p = r.power, o = r.observedCompleteness
  return `# Preserved suspension diagnosis

Written by \`suspension-diagnostic.mjs\`. App \`${r.appCommit}\`; records \`${r.recordsCommit}\`; cases SHA256 \`${r.casesSha256}\`. No new search or deciding metric ran.

Classification: does not qualify. A suspension is documented and the differing rows are downstream of the recorded adaptive-evidence selection. Deadline termination of that search is not proved.

There are ${d.differingPositionRows} differing position rows and ${d.differingRecordRows} differing record rows, with identical row sets. Only retained deep evidence differs within the positions. The replay's final deep evidence equals its raw verification event at every changed row. That reading equals the canonical history's initial reading; the canonical document retains the adaptive reading. No later teaching call visits the changed position, and extensions are unchanged. The record changes consume this evidence through the app's record rebuild. The side-summary changes are derived from those records. No unexplained final field remains in this dependency account.

The raw replay has ${o.completeRawLooks}/${o.rawLooks} complete retained looks. ${o.matchingCanonicalLatestReadings}/${o.rawLooks} latest canonical verification readings match; ${o.differingCanonicalLatestReadings} differ. The trace records ${o.failedCalls} failed calls. These are retained-event facts; they do not establish completeness of a discarded adaptive result.

The captured power log records a full Sleep event at ${p.sleepEventAt} and a Wake event at ${p.wakeEventAt}, ${p.loggedEventIntervalSeconds.toFixed(3)} seconds apart. The adaptive call wrapper starts at ${t.wrapperCallStartedAt}, ${p.callStartsAfterSleepEventSeconds.toFixed(3)} seconds after the logged Sleep event, and ends at ${t.wrapperCallEndedAt}. It records ${t.recordedNodePerformanceSeconds.toFixed(3)} Node elapsed seconds and ${t.wrapperUtcSeconds.toFixed(3)} UTC seconds.

The blocked replay's driver interval is ${r.clockComparison.blockedNewProcesses.calendarSeconds.sum.toFixed(6)} UTC seconds against ${r.clockComparison.blockedNewProcesses.pythonMonotonicSeconds.sum.toFixed(6)} Python monotonic seconds, a divergence of ${r.clockComparison.blockedNewProcesses.calendarMinusPythonMonotonicSeconds.sum.toFixed(6)} seconds. The review itself records ${r.clockComparison.blockedNewReviewNodePerformanceSeconds.sum.toFixed(6)} Node performance seconds against ${r.clockComparison.blockedNewReviewCalendarSeconds.sum.toFixed(6)} UTC seconds. The Node and Python elapsed clocks therefore differ in this record; the review duration is not the driver's shorter elapsed duration.

The pinned Node service supplies a ${t.defaultDeadlineMs}-millisecond deadline unless overridden. The observation wrapper supplied no override. The UCI session arms its timer inside the scheduled search slot. One terminal path receives bestmove and records timedOut=false. The other runs deadline recovery, drains the search and records timedOut=true. Search completion and CandidateSet partial carry that distinction; a deadline need not throw.

Adding the configured delay to the wrapper's call-start timestamp gives ${t.nominalCallStartPlusDeadlineAt}, within the logged Sleep/Wake interval. This is nominal arithmetic only. It is not a measured slot-start timestamp, an observed timer expiry or a recorded deadline delivery. Service awaits and queueing precede timer arming. The preserved trace cannot establish when the timer armed, whether it elapsed during suspension, or which terminal callback won.

The call proxy retained depth, failure status and wrapper timings. It did not retain completion, timedOut, partial, returned node/time counters or the returned adaptive payload. The process log has ${r.retainedTelemetry.rawUciLinesInProcessLog} raw UCI lines and ${r.retainedTelemetry.terminalMarkersInProcessLog} terminal-path markers. The Node transport does not tee UCI stdout to a file and discards engine stderr; this replay disabled the evaluation cache. There is no retained direct terminal-path observation.

The returned adaptive depth is below the initial retained depth. In the pinned strongerEvidence source, a lower evidence rank keeps the prior reading; equal rank with lower depth also keeps it. This accounts for retention without identifying which rejection condition ran. It does not prove deadline termination. The conditional classification remains false.

Second stopped manifest SHA256 \`${r.secondStoppedManifestSha256}\`; second report SHA256 \`${r.secondAcquisitionReportSha256}\`; power log SHA256 \`${p.powerLogSha256}\`; capture metadata SHA256 \`${p.captureMetadataSha256}\`; source-set SHA256 \`${r.source.sourceSetSha256}\`; diagnostic script SHA256 \`${r.reportingScriptSha256}\`. Exact row and call locations remain private.
`
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  insist(process.argv.length === 3 && process.argv[2] === '--preserved', 'use --preserved')
  const { report, privateReport } = await collectSuspensionDiagnostic()
  for (const [path, content] of [
    [join(PROJECT, 'results/suspension-diagnostic.json'), json(report)],
    [join(PROJECT, 'results/suspension-diagnostic.md'), diagnosticMarkdown(report)],
    [join(DIAGNOSTICS, 'suspension-row-proof.json'), json(privateReport)],
  ]) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  console.log(JSON.stringify(report.classification))
}
