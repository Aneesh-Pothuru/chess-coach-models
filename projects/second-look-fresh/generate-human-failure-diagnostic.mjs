// Diagnose the preserved first amended mismatch. This reads frozen artifacts
// and app code; it starts no engine and computes no chess judgment.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FROZEN_APP, verifyHumanFailureSources, classifyHumanFallbackMismatch } from './human-failure-diagnostic.mjs'

const LAB = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const PROJECT = join(LAB, 'projects/second-look-fresh')
const ROOT = join(LAB, 'private/second-look-fresh')
const NEW = join(ROOT, 'acquisition-amended')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const read = path => JSON.parse(readFileSync(path))
const names = path => readdirSync(path).filter(name => name.endsWith('.json')).sort()
const insist = (ok, message) => { if (!ok) throw new Error(`preserved mismatch: ${message}`) }

export async function collectHumanFailureDiagnostic() {
  const stoppedBytes = readFileSync(join(NEW, 'stopped-manifest.json'))
  const stopped = JSON.parse(stoppedBytes)
  const status = read(join(PROJECT, 'results/acquisition-status.json'))
  insist(status.appCommit === FROZEN_APP && status.stoppedAcquisitionManifestSha256 === hash(stoppedBytes)
    && status.noVerdict && status.exactReproductionPassed === false,
  'the original stopped acquisition identity differs')
  const frozenNames = prefix => Object.keys(stopped.files).filter(name => name.startsWith(prefix))
    .map(name => name.slice(prefix.length)).sort()
  const accepted = new Set(frozenNames('candidate/timed/routine/'))
  const rejected = frozenNames('first-replays/').filter(name => !accepted.has(name))
  insist(rejected.length === 1, 'expected the single preserved first mismatch')
  const firstName = `first-replays/${rejected[0]}`
  const canonicalName = `candidate/evidence/routine/${rejected[0]}`
  const firstBytes = readFileSync(join(NEW, firstName)), canonicalBytes = readFileSync(join(NEW, canonicalName))
  insist(stopped.files[firstName] === hash(firstBytes)
    && stopped.files[canonicalName] === hash(canonicalBytes), 'a preserved diagnostic input changed')
  const replay = JSON.parse(firstBytes), canonical = JSON.parse(canonicalBytes)
  insist(replay.app === FROZEN_APP && replay.records === status.recordsCommit
    && replay.caseIndex === 49 && replay.summary.variant === 'candidate'
    && replay.summary.profile === 'routine', 'the preserved mismatch identity differs')
  const { CHESS_DIR, chess } = await import('../../bridge/lib/chess.mjs')
  insist(resolve(CHESS_DIR) === join(LAB, '.cache/chess', FROZEN_APP),
    'explicitly run against the original frozen app, not the current lab pin')
  const candidateDir = join(LAB, '.cache/chess/candidates/second-look-fresh')
  const sourceProof = verifyHumanFailureSources({ appDir: CHESS_DIR, candidateDir })
  const sourceHash = hash([
    'src/services/review/pipeline/run.ts', 'src/services/review/pipeline/evidence.ts',
    'src/services/review/ports.ts', 'src/adapters/node/engine/index.ts',
  ].map(path => readFileSync(join(candidateDir, path), 'utf8')).join('\n'))
  insist(sourceHash === replay.sourceHash, 'the acquired candidate source differs')
  const { isExactScore } = await chess('src/core/score/index.ts')
  const { profileSettings } = await chess('src/services/review/profiles.ts')
  const settings = profileSettings('routine')
  const classification = classifyHumanFallbackMismatch({ canonical, replay }, isExactScore, settings)
  const logRoot = join(ROOT, 'run-log')
  const runs = names(logRoot).filter(name => name.endsWith('-run.json'))
    .map(name => ({ name, metadata: read(join(logRoot, name)) }))
    .filter(row => row.metadata.command.includes('projects/second-look-fresh/phase2-amended.sh'))
  insist(runs.length === 1, 'the original amended invocation set differs')
  const logBytes = readFileSync(join(logRoot, runs[0].name.replace('-run.json', '-output.jsonl')))
  const lines = logBytes.toString().trim().split('\n').map(line => JSON.parse(line))
  const before = lines.find(row => row.line.includes('[candidate/routine] case 49 timed'))
  const failure = lines.find(row => row.line.includes('does not reproduce the CLI document at case 50;'))
  insist(before && failure, 'the preserved replay wall-clock bounds are missing')
  const failedHuman = replay.calls.map((call, order) => ({ ...call, order }))
    .filter(call => call.method === 'humanPolicy' && call.failed)
  const teaching = replay.calls.map((call, order) => ({ ...call, order }))
    .filter(call => call.stage === 'after-verification' && call.method === 'bestMoves'
      && call.budget?.nodes === settings.deep.nodes)
  const timing = {
    replayBeginsAfter: before.at, reproductionFailureAt: failure.at,
    calendarWindowSeconds: (Date.parse(failure.at) - Date.parse(before.at)) / 1000,
    monotonicWindowSeconds: failure.seconds - before.seconds,
    measuredReviewSeconds: replay.summary.seconds,
    failedHumanCalls: failedHuman.map(call => ({
      phase: call.order < teaching[0]?.order ? 'before teaching' : 'after teaching',
      seconds: call.seconds,
    })),
    callUtcTimestampsAvailable: false,
    limitation: 'The log lines bound the replay window. Calls retain monotonic durations and ordering, but no individual UTC start or end timestamps.',
  }
  const { privateRows, ...publicClassification } = classification
  const sourceAnchors = [
    ['src/services/review/punish.ts', '          missing = true', 'A caught human-policy failure disables the persistent policy object.'],
    ['src/services/review/pipeline/run.ts', '    const priced = human ? await human.prime', 'Human policy is primed before teaching.'],
    ['src/services/review/pipeline/run.ts', '      ...(human && priced ?', 'Teaching receives punishment odds only when policy priming succeeds.'],
    ['src/services/review/pipeline/teaching.ts', '  const severity = (m: TeachingCandidate)', 'The optional policy changes the teaching-selection input.'],
    ['src/services/review/pipeline/teaching.ts', '  const targets = selectTargets(candidates', 'Teaching targets are selected before the teaching-search loop.'],
    ['src/services/review/pipeline/teaching.ts', '    positions[i] = { ...positions[i], deep: accepted }', 'A teaching search can replace retained deep evidence at its target.'],
    ['src/services/review/pipeline/rebuild.ts', '    const ev = positions[i]?.deep ?? null', 'Record refinement reads that position’s retained deep evidence.'],
    ['src/services/review/pipeline/rebuild.ts', '    const confidence = stabilityReason(ev?.stability)', 'Earlier stability labels affect explanation text.'],
    ['src/services/review/pipeline/run.ts', '  let review = doc(positions, flaggedPlies, ext)', 'The core document is constructed before later auxiliary probes.'],
    ['src/services/review/pipeline/defenses.ts', '      const hp = await engine.humanPolicy(after', 'The later human-policy call belongs to defense probing.'],
  ].map(([path, anchor, purpose]) => {
    const source = readFileSync(join(CHESS_DIR, path), 'utf8')
    const at = source.indexOf(anchor)
    insist(at >= 0, 'a source dependency anchor is missing')
    return { path, line: source.slice(0, at).split('\n').length, purpose }
  })
  const report = {
    schema: 'second-look-fresh-preserved-human-failure-diagnostic/1',
    appCommit: FROZEN_APP, recordsCommit: status.recordsCommit,
    casesSha256: status.casesSha256, candidateSha256: status.candidateSha256,
    designSha256: status.designSha256, amendmentSha256: status.amendmentSha256,
    stoppedAcquisitionManifestSha256: hash(stoppedBytes),
    originalAmendedRunLogSha256: hash(logBytes),
    classifierSha256: hash(readFileSync(join(PROJECT, 'human-failure-diagnostic.mjs'))),
    generatorSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    sourceProof, sourceAnchors, classification: publicClassification, timing,
    noNewSearchOrJudgment: true,
    interpretation: [
      'The first human-policy rejection disables the persistent reply-policy object and removes the punishment-odds callback from teaching. Retained canonical punishment entries show that its policy object remained available.',
      'Teaching selection changes one target after a shared prefix. The two unshared target rows and the later shared teaching rows account for the final differences. Subsequent teaching searches use the same analyst without a new-game reset.',
      'The later human-policy rejection is in defense probing after construction of the core document. It cannot cause the differing core rows.',
      'Earlier stability labels are omitted when evidence enters history. In the frozen source these labels affect explanation text, not teaching selection. The compared reading fields and reconstructed verification histories are unchanged.',
      'This establishes a downstream control-flow explanation, not a unique underlying failure cause or a counterfactual engine result.',
    ],
  }
  return { report, privateProof: {
    schema: 'second-look-fresh-private-human-failure-row-proof/1',
    firstReplaySha256: hash(firstBytes), canonicalSha256: hash(canonicalBytes),
    stoppedAcquisitionManifestSha256: hash(stoppedBytes),
    classifierSha256: report.classifierSha256,
    classification: publicClassification, privateRows,
    canonicalTeachingIndicesPrivate: (canonical.ext?.teaching ?? []).map(entry => entry.ply),
    replayTeachingIndicesPrivate: (replay.doc.ext?.teaching ?? []).map(entry => entry.ply),
  } }
}

export function humanFailureDiagnosticMarkdown(report) {
  const c = report.classification, a = c.aggregate, t = report.timing
  return `# Preserved human-policy failure diagnosis

Written by \`generate-human-failure-diagnostic.mjs\`. No new search or chess judgment ran. App \`${report.appCommit}\`; records \`${report.recordsCommit}\`; cases SHA256 \`${report.casesSha256}\`.

Downstream classification: ${c.accepted ? 'passes' : 'does not pass'}. ${c.conclusion}. Unique causality remains unproven.

The preserved mismatch has ${a.differingPositionRows} differing position rows and ${a.differingRecordRows} differing record rows. Its ${a.observedVerificationLooks} observed second looks are complete, and all ${a.canonicalLatestVerificationReadingsEqual} latest canonical verification readings match. The reconstructed verification histories also match; ${a.earlierStabilityLabelsNotRetainedAfterTeaching} earlier stability labels were not retained by the app after teaching.

There is ${a.differingTeachingTargetSlots} teaching-target substitution after an equal shared prefix. ${a.canonicalOnlyTeachingRows} differing row received teaching only in the canonical document; ${a.replayOnlyTeachingRows} received it only in the replay; ${a.sharedTeachingRowsAfterSubstitution} are later shared teaching targets. ${a.unresolvedDifferingRows} differing rows remain outside this explanation.

The trace has ${a.failedEngineCalls} failed engine calls and ${a.failedHumanPolicyCalls} failed human-policy calls. ${a.failedHumanPolicyCallsBeforeTeaching} failure precedes teaching. The source catches it and disables the punishment-odds callback used to select teaching targets. ${a.failedHumanPolicyCallsAfterTeaching} failure follows teaching, in defense probing after the core document is built. That later failure cannot cause its differing rows. Exception text was ${a.exceptionTextRetained ? 'retained' : 'not retained'}.

The replay lies between ${t.replayBeginsAfter} and ${t.reproductionFailureAt}. That window is ${t.calendarWindowSeconds.toFixed(3)} calendar seconds and ${t.monotonicWindowSeconds.toFixed(3)} monotonic seconds; the review itself records ${t.measuredReviewSeconds.toFixed(3)} seconds. Individual call UTC timestamps were not recorded. The failed human-policy durations, in call order, are ${t.failedHumanCalls.map(call => `${call.seconds.toFixed(6)} seconds (${call.phase})`).join(' and ')}.

The original first replay and canonical document remain unchanged under stopped checkpoint SHA256 \`${report.stoppedAcquisitionManifestSha256}\`. Classifier SHA256 \`${report.classifierSha256}\`; generator SHA256 \`${report.generatorSha256}\`; source-set SHA256 \`${report.sourceProof.sourceSetSha256}\`. Exact row locations remain private.
`
}

async function main() {
  insist(process.argv.length === 3 && process.argv[2] === '--preserved', 'use --preserved')
  const { report, privateProof } = await collectHumanFailureDiagnostic()
  writeFileSync(join(ROOT, 'diagnostics/human-failure-row-proof.json'), JSON.stringify(privateProof, null, 2) + '\n')
  writeFileSync(join(PROJECT, 'results/human-failure-diagnostic.json'), JSON.stringify(report, null, 2) + '\n')
  writeFileSync(join(PROJECT, 'results/human-failure-diagnostic.md'), humanFailureDiagnosticMarkdown(report))
  console.log(JSON.stringify({ accepted: report.classification.accepted,
    reasons: report.classification.reasons, aggregate: report.classification.aggregate }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
