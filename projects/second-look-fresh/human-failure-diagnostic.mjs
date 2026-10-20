// Acquisition control-flow diagnosis. No engine or chess judgment runs here.
// Unknown paths fail closed. This is not a counterfactual engine experiment.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const FROZEN_APP = 'f4bd63f19b343f686fb97ea4cf70b211c0bddc0a'
export const SOURCE_HASHES = Object.freeze({
  'src/services/review/pipeline/run.ts': '688b4ce947ce43660c58674f62f789245ef79ee089cca3b7c17965d62e1d462b',
  'src/services/review/pipeline/teaching.ts': 'bd1e208f79ade3b9ed7cdb90eb8e3ed5b2aedeccc9dcfcf1b372720bdb91f009',
  'src/services/review/pipeline/evidence.ts': 'de7daaa2e8d6a987955bd745e0e107fcbdcdfc361af176d3b610ca54cfd0400f',
  'src/services/review/pipeline/rebuild.ts': '325c0f1b819b5f2a28efa493878f4d9e543cc326dd642b84d62b62bd485ae545',
  'src/services/review/pipeline/defenses.ts': 'f5d36721d84043087c502bd6a0358f345dfb10cba2cef25d07133b796a15446c',
  'src/services/review/pipeline/captures.ts': '5be1d5231f629b7691ea69f076c0a06efe49ac399dbf5125aa1b4669a22f69fd',
  'src/services/review/punish.ts': '8ed184d68bb20340a2197d8c8b9a06214041e9679f87e0e6676a686ec43c6d9a',
  'src/services/review/moments.ts': 'a813308f15237c1f373198db070c53f1173db54acca5d29c61d310c3eb3a4497',
  'src/services/review/profiles.ts': '79c6d83c9a7b812be23a55d3bdc372cb968567b50caf2d5562f3558db7d50e47',
  'src/services/engine/budgets.ts': 'f142b5a837c87943da9e256358de8acfbbc30891c0f725bec494c9157435f099',
  'src/services/engine/service.ts': '19a969de3d80fd6971ccb593d25a4b8e58a4fbab4fdd21ae1a55fe67a38662c9',
  'src/services/engine/uci/session.ts': '24d0f36e968eedc46b6ac349797c620904dadcdf9c6bd4157781dc7ee7795a64',
  'src/adapters/node/engine/index.ts': '82105d615d8526b1449448259372f9ae60fc19a1ecd0ba4a31a22902cd0b61c4',
})
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const omit = (value, fields) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !fields.includes(key)))
const reading = e => e ? omit(e, ['history', 'stability']) : null
const guardComplete = (e, exact) => !!(e?.complete && e.lines?.length
  && e.lines.every(line => exact(line.score)) && exact(e.played))
const nodes = e => e?.searchBudget?.nodes ?? null
const engineMethods = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame', 'compare'])
const required = (ok, reason) => { if (!ok) throw new Error(`human-failure diagnosis: ${reason}`) }

/** Validate the source dependencies of the control-flow argument. Candidate
 * code may contain the approved verification reset, but its later pipeline and
 * all other dependencies below must remain exactly the original app's code. */
export function verifyHumanFailureSources({ appDir, candidateDir }) {
  const actual = {}
  for (const [path, expected] of Object.entries(SOURCE_HASHES)) {
    const source = readFileSync(join(appDir, path))
    actual[path] = hash(source)
    required(actual[path] === expected, `frozen source differs: ${path}`)
    if (candidateDir) {
      const candidate = readFileSync(join(candidateDir, path))
      if (path.endsWith('/pipeline/run.ts')) {
        const anchor = '\n  let ext: ReviewExt | undefined\n'
        const a = source.toString(), b = candidate.toString()
        required(a.split(anchor).length === 2 && b.split(anchor).length === 2
          && a.slice(a.indexOf(anchor)) === b.slice(b.indexOf(anchor)),
        'candidate post-verification pipeline differs')
      } else required(hash(candidate) === expected, `candidate dependency differs: ${path}`)
    }
  }
  return { schema: 'second-look-fresh-human-failure-sources/1',
    appCommit: FROZEN_APP, hashes: actual, candidatePostVerificationUnchanged: !!candidateDir,
    sourceSetSha256: hash(JSON.stringify(SOURCE_HASHES)) }
}

function latestVerification(deep, verifyNodes) {
  if (!deep) return null
  const prior = deep.history ?? []
  const chain = [...prior, deep]
  const at = chain.findLastIndex(e => [verifyNodes, verifyNodes * 2].includes(nodes(e)))
  if (at < 0) return null
  const history = chain.slice(0, at).map(reading)
  return { evidence: chain[at], final: at === prior.length,
    reconstructedWithoutStability: { ...reading(chain[at]), ...(history.length ? { history } : {}) } }
}

/**
 * Inspect one preserved mismatch. The caller first verifies identities/hashes
 * and verifyHumanFailureSources(). Pass the frozen app's own
 * profileSettings('routine') as settings. Keep privateRows private.
 *
 * accepted means only that every changed row has the specific, conservative
 * teaching-fallback explanation below. It never accepts a replay as study
 * evidence, authorizes a rerun, or relaxes exact reproduction.
 */
export function classifyHumanFallbackMismatch({ canonical, replay }, isExactScore, settings) {
  const reasons = []
  const check = (ok, reason) => { if (!ok) reasons.push(reason); return !!ok }
  required(typeof isExactScore === 'function', 'the app exact-score instrument is required')
  required(canonical?.schema === 'game-review/2' && replay?.doc?.schema === 'game-review/2'
    && Array.isArray(canonical.positions) && Array.isArray(canonical.records)
    && Array.isArray(replay.doc.positions) && Array.isArray(replay.doc.records)
    && Array.isArray(replay.looks) && Array.isArray(replay.calls), 'invalid pair shape')
  const doc = replay.doc
  const verifyNodes = canonical.provenance?.verifyNodes
  const teachNodes = settings?.deep?.nodes
  required(Number.isInteger(verifyNodes) && verifyNodes > 0
    && settings?.profile === 'routine' && settings.verifyNodes === verifyNodes
    && Number.isInteger(teachNodes) && teachNodes > verifyNodes * 2,
  'the app routine profile with distinct verification and teaching budgets is required')
  required(canonical.positions.length === doc.positions.length
    && canonical.records.length === doc.records.length, 'different pair dimensions')
  check(canonical.provenance.profile === 'routine', 'not-routine')
  for (const key of ['game', 'fens', 'playerColor', 'division', 'provenance', 'coverage'])
    check(same(canonical[key], doc[key]), `different-${key}`)
  check(canonical.positions.every((p, i) => same(omit(p, ['deep']), omit(doc.positions[i], ['deep']))),
    'different-nondeep-position-input')
  const changedPositions = canonical.positions.flatMap((p, i) => same(p, doc.positions[i]) ? [] : [i])
  const changedRecords = canonical.records.flatMap((r, i) => same(r, doc.records[i]) ? [] : [i])
  check(changedPositions.length > 0 && same(changedPositions, changedRecords), 'changed-row-sets-differ-or-empty')
  const byIndex = new Map(replay.looks.map(look => [look.index, look.evidence]))
  check(byIndex.size === replay.looks.length && replay.looks.every(look =>
    Number.isInteger(look.index) && look.index >= 0 && look.index < canonical.records.length),
  'invalid-or-duplicate-observed-look')
  const canonicalLookIndices = canonical.positions.flatMap((p, i) => p.deep ? [i] : [])
  check(same(canonicalLookIndices, [...byIndex.keys()].sort((a, b) => a - b)), 'verification-index-set-differs')
  let complete = 0, readingsEqual = 0, historiesEqual = 0, retainedFinalExact = 0, lostStability = 0
  for (const [index, evidence] of byIndex) {
    const prior = latestVerification(canonical.positions[index]?.deep, verifyNodes)
    complete += Number(guardComplete(evidence, isExactScore))
    readingsEqual += Number(same(reading(prior?.evidence), reading(evidence)))
    historiesEqual += Number(same(prior?.reconstructedWithoutStability, omit(evidence, ['stability'])))
    retainedFinalExact += Number(prior?.final && same(canonical.positions[index].deep, evidence))
    lostStability += Number(!!prior && !prior.final)
  }
  check(complete === byIndex.size, 'incomplete-observed-verification')
  check(readingsEqual === byIndex.size && historiesEqual === byIndex.size, 'verification-reading-or-history-differs')
  // strongerEvidence drops the earlier stability label. In the hashed source,
  // rebuild uses that label only for explanation text, never target selection.
  check(replay.calls.every(call => Number.isFinite(call.seconds) && call.seconds >= 0
    && typeof call.failed === 'boolean'), 'invalid-call-trace')
  const indexedCalls = replay.calls.map((call, order) => ({ ...call, order }))
  const engineFailures = indexedCalls.filter(call => engineMethods.has(call.method) && call.failed)
  check(engineFailures.length === 0, 'failed-engine-call')
  const teachingCalls = indexedCalls.filter(call => call.stage === 'after-verification'
    && call.method === 'bestMoves' && call.budget?.nodes === teachNodes)
  const failedHuman = indexedCalls.filter(call => call.method === 'humanPolicy' && call.failed)
  check(failedHuman.length >= 1 && failedHuman.length <= 2, 'unexpected-human-failure-count')
  check(teachingCalls.length > 0, 'no-recorded-teaching-search')
  const firstTeachingOrder = teachingCalls[0]?.order ?? -1
  const lastTeachingOrder = teachingCalls.at(-1)?.order ?? -1
  const beforeTeachingFailures = failedHuman.filter(call => call.stage === 'after-verification'
    && call.order < firstTeachingOrder)
  const afterTeachingFailures = failedHuman.filter(call => call.stage === 'after-verification'
    && call.order > lastTeachingOrder)
  check(beforeTeachingFailures.length === 1
    && beforeTeachingFailures.length + afterTeachingFailures.length === failedHuman.length,
  'human-failure-is-not-prime-or-later-defense')
  check(!indexedCalls.some(call => call.stage === 'after-verification' && call.method === 'newGame'),
    'post-verification-reset')
  check(indexedCalls.every(call => !call.failed || engineMethods.has(call.method) || call.method === 'humanPolicy'),
    'other-acquisition-failure')
  check((canonical.ext?.punish?.length ?? 0) > 0 && (doc.ext?.punish?.length ?? 0) === 0,
    'canonical-policy-availability-or-replay-fallback-unproven')
  const canonicalTargets = (canonical.ext?.teaching ?? []).map(entry => entry.ply)
  const replayTargets = (doc.ext?.teaching ?? []).map(entry => entry.ply)
  const canonicalDeepTargets = canonical.positions.flatMap((p, i) => nodes(p.deep) === teachNodes ? [i] : [])
  const replayDeepTargets = doc.positions.flatMap((p, i) => nodes(p.deep) === teachNodes ? [i] : [])
  check(same(canonicalTargets, canonicalDeepTargets) && same(replayTargets, replayDeepTargets)
    && same(replayTargets, teachingCalls.map(call => call.index)), 'teaching-selection-or-retention-not-fully-accounted')
  check(canonicalTargets.length === replayTargets.length && canonicalTargets.length > 1,
    'different-teaching-count-or-no-shared-prefix')
  const changedSlots = canonicalTargets.flatMap((index, slot) => index === replayTargets[slot] ? [] : [slot])
  const swap = changedSlots[0]
  check(changedSlots.length === 1 && swap > 0, 'not-one-teaching-target-substitution-after-shared-prefix')
  const prefixEqual = Number.isInteger(swap) && canonicalTargets.slice(0, swap)
    .every(index => same(canonical.positions[index].deep, doc.positions[index].deep))
  check(prefixEqual, 'shared-teaching-prefix-reading-differs')
  const canonicalSet = new Set(canonicalTargets), replaySet = new Set(replayTargets)
  const canonicalOnly = canonicalTargets.filter(index => !replaySet.has(index))
  const replayOnly = replayTargets.filter(index => !canonicalSet.has(index))
  check(canonicalOnly.length === 1 && replayOnly.length === 1, 'not-one-target-swap')
  const privateRows = changedPositions.map(index => {
    const observed = byIndex.get(index)
    const c = canonical.positions[index].deep, r = doc.positions[index].deep
    let path = 'unresolved'
    if (canonicalOnly.includes(index) && same(reading(r), reading(observed))
      && nodes(c) === teachNodes) path = 'canonical-only-teaching-target'
    else if (replayOnly.includes(index) && same(reading(c), reading(observed))
      && nodes(r) === teachNodes) path = 'replay-only-teaching-target'
    else if (canonicalSet.has(index) && replaySet.has(index)
      && canonicalTargets.indexOf(index) > swap && replayTargets.indexOf(index) > swap
      && nodes(c) === teachNodes && nodes(r) === teachNodes) path = 'shared-teaching-target-after-substitution'
    return { plyIndexPrivate: index, path, recordRowAlsoDiffers: changedRecords.includes(index),
      latestVerificationReadingEqual: same(reading(latestVerification(c, verifyNodes)?.evidence), reading(observed)),
      canonicalTeachingSlotPrivate: canonicalTargets.indexOf(index),
      replayTeachingSlotPrivate: replayTargets.indexOf(index) }
  })
  check(privateRows.every(row => row.path !== 'unresolved' && row.latestVerificationReadingEqual),
    'a-differing-row-is-outside-the-teaching-fallback-path')
  const lastLook = replay.looks.at(-1)
  check(!!lastLook && same(canonical.positions[lastLook.index]?.deep, lastLook.evidence),
    'last-verification-retained-state-not-exactly-reproduced')
  const aggregate = {
    pairedReviews: 1, differingPositionRows: changedPositions.length,
    differingRecordRows: changedRecords.length, observedVerificationLooks: byIndex.size,
    completeObservedVerificationLooks: complete,
    canonicalLatestVerificationReadingsEqual: readingsEqual,
    canonicalVerificationHistoriesEqualIgnoringStability: historiesEqual,
    untouchedCanonicalVerificationEvidenceExactlyEqual: retainedFinalExact,
    earlierStabilityLabelsNotRetainedAfterTeaching: lostStability,
    failedEngineCalls: engineFailures.length, failedHumanPolicyCalls: failedHuman.length,
    failedHumanPolicyCallsBeforeTeaching: beforeTeachingFailures.length,
    failedHumanPolicyCallsAfterTeaching: afterTeachingFailures.length,
    canonicalTeachingTargets: canonicalTargets.length, replayTeachingTargets: replayTargets.length,
    differingTeachingTargetSlots: changedSlots.length,
    sharedTeachingPrefixEqual: !!prefixEqual,
    canonicalOnlyTeachingRows: privateRows.filter(row => row.path === 'canonical-only-teaching-target').length,
    replayOnlyTeachingRows: privateRows.filter(row => row.path === 'replay-only-teaching-target').length,
    sharedTeachingRowsAfterSubstitution: privateRows.filter(row => row.path === 'shared-teaching-target-after-substitution').length,
    unresolvedDifferingRows: privateRows.filter(row => row.path === 'unresolved').length,
    exceptionTextRetained: replay.calls.some(call =>
      ['error', 'message', 'reason', 'exception'].some(key => Object.hasOwn(call, key))),
  }
  return { schema: 'second-look-fresh-human-fallback-classification/1',
    accepted: reasons.length === 0, reasons, aggregate, privateRows,
    conclusion: reasons.length ? 'the preserved mismatch does not meet this conservative downstream classification'
      : 'all differing rows follow the human-policy fallback through changed teaching selection and subsequent teaching searches',
    uniqueCausalityProven: false,
    limitation: 'No canonical raw call trace, hash-memory snapshot, retained exception text or counterfactual replay establishes a unique underlying cause. The later defense failure cannot cause the already-built core document.' }
}
