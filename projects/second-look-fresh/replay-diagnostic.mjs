// Acquisition diagnostics only. Importing this module performs no I/O and
// starts no engine. The caller supplies rejected pairs and the app instrument.
const insist = (ok, message) => { if (!ok) throw new Error(`replay diagnostic: ${message}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const components = ['positions', 'records', 'provenance', 'coverage']
const stages = new Set(['sweep', 'verify', 'after-verification'])
const methods = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame',
  'tablebase', 'humanPolicy', 'findability', 'compare'])
const engineMethods = new Set(['evaluate', 'bestMoves', 'scoreMove', 'newGame', 'compare'])
const deepFields = ['lines', 'complete', 'depth', 'played', 'playedFrom',
  'playedPv', 'budget', 'searchBudget', 'stability', 'history']
const guardComplete = (e, exact) => !!(e?.complete && e.lines?.length
  && e.lines.every(line => exact(line.score)) && exact(e.played))
const reading = evidence => {
  if (!evidence) return null
  const { history, stability, ...rest } = evidence
  return rest
}
const emptyEvidenceCount = () => ({
  evidence: 0, guardComplete: 0, guardIncomplete: 0,
  completeFlagTrue: 0, emptyLines: 0, hasNonexactLine: 0, playedNotExact: 0,
})
function addEvidence(target, evidence, exact) {
  for (const e of evidence) {
    target.evidence++
    const complete = guardComplete(e, exact)
    target.guardComplete += Number(complete)
    target.guardIncomplete += Number(!complete)
    target.completeFlagTrue += Number(e.complete === true)
    target.emptyLines += Number(!e.lines?.length)
    target.hasNonexactLine += Number(!!e.lines?.some(line => !exact(line.score)))
    target.playedNotExact += Number(!exact(e.played))
  }
}
const addMaximum = (old, value) => old === null ? value : Math.max(old, value)

/**
 * pairs: [{ canonical: GameReview, replay: { doc, looks, calls, summary } }]
 * The caller verifies acquisition identity and hashes before passing pairs.
 * Returns aggregate counts and timing only; no identifiers or chess verdicts.
 */
export function aggregateRejectedReplays(pairs, isExactScore) {
  insist(Array.isArray(pairs) && typeof isExactScore === 'function',
    'pairs and the app exact-score instrument are required')
  const out = {
    schema: 'second-look-fresh-rejected-replay-aggregates/1',
    rejectedReplays: pairs.length,
    comparableComponentMismatchReviews: Object.fromEntries(components.map(key => [key, 0])),
    changedPositionRows: 0,
    changedDeepEvidenceRows: 0,
    changedNonDeepPositionRows: 0,
    changedRecordRows: 0,
    deepFieldChangedRows: Object.fromEntries([...deepFields, 'other'].map(key => [key, 0])),
    savedAppCoveragePartial: { canonical: 0, replay: 0 },
    finalPostTeachingEvidence: { canonical: emptyEvidenceCount(), replay: emptyEvidenceCount() },
    observedPreTeachingEvidence: emptyEvidenceCount(),
    retainedReadingEquality: {
      observedLooksCompared: 0,
      canonicalFinalOrHistoryContainsObservedReading: 0,
      canonicalFinalOrHistoryMissingObservedReading: 0,
      canonicalLatestVerificationReadingMatchesObserved: 0,
      canonicalLatestVerificationReadingMissing: 0,
      canonicalFinalDifferentFromObservedReading: 0,
      replayFinalDifferentFromObservedReading: 0,
      changedPositionsWithCanonicalRetainedObservedReading: 0,
      changedPositionsWithPostVerificationSearch: 0,
      comparisonOmitsOnlyHistoryAndStability: true,
    },
    calls: {
      total: 0, failed: 0, failedEngineCalls: 0, failedHumanPolicyCalls: 0,
      failedOtherCalls: 0, withRecordedErrorOrReasonFields: 0,
      byStageAndMethod: {},
    },
    timing: {
      reviewSeconds: 0, verificationSeconds: 0, recordedCallSeconds: 0,
      maxRecordedCallSeconds: null, maxRecordedEngineCallSeconds: null,
    },
  }
  for (const { canonical, replay } of pairs) {
    insist(canonical?.schema === 'game-review/2' && replay?.doc?.schema === 'game-review/2'
      && Array.isArray(canonical.positions) && Array.isArray(canonical.records)
      && Array.isArray(replay.doc.positions) && Array.isArray(replay.doc.records)
      && Array.isArray(replay.looks) && Array.isArray(replay.calls), 'invalid replay pair')
    insist(canonical.positions.length === replay.doc.positions.length
      && canonical.records.length === replay.doc.records.length, 'replay shape differs')
    const verifyNodes = canonical.provenance?.verifyNodes
    insist(Number.isInteger(verifyNodes) && verifyNodes > 0,
      'canonical verification node budget is required')
    const differs = components.map(key => !same(canonical[key], replay.doc[key]))
    insist(differs.some(Boolean), 'an accepted replay was passed as rejected')
    components.forEach((key, i) => out.comparableComponentMismatchReviews[key] += Number(differs[i]))
    const changedPositions = []
    for (let i = 0; i < canonical.positions.length; i++) {
      const a = canonical.positions[i], b = replay.doc.positions[i]
      if (same(a, b)) continue
      changedPositions.push(i)
      out.changedPositionRows++
      const { deep: ad, ...ar } = a, { deep: bd, ...br } = b
      out.changedNonDeepPositionRows += Number(!same(ar, br))
      if (!same(ad, bd)) {
        out.changedDeepEvidenceRows++
        for (const field of deepFields) {
          out.deepFieldChangedRows[field] += Number(!same(ad?.[field], bd?.[field]))
        }
        const keys = new Set([...Object.keys(ad ?? {}), ...Object.keys(bd ?? {})])
        out.deepFieldChangedRows.other += Number([...keys].some(key =>
          !deepFields.includes(key) && !same(ad?.[key], bd?.[key])))
      }
    }
    for (let i = 0; i < canonical.records.length; i++)
      out.changedRecordRows += Number(!same(canonical.records[i], replay.doc.records[i]))
    for (const [label, doc] of [['canonical', canonical], ['replay', replay.doc]]) {
      insist(Number.isInteger(doc.coverage?.partial) && doc.coverage.partial >= 0,
        'invalid saved app coverage.partial')
      out.savedAppCoveragePartial[label] += doc.coverage.partial
      addEvidence(out.finalPostTeachingEvidence[label],
        doc.positions.map(position => position.deep).filter(evidence => evidence != null), isExactScore)
    }
    const seen = new Set()
    for (const look of replay.looks) {
      insist(Number.isInteger(look.index) && look.index >= 0
        && look.index < canonical.records.length && !seen.has(look.index)
        && look.evidence != null, 'invalid observed look')
      seen.add(look.index)
    }
    addEvidence(out.observedPreTeachingEvidence, replay.looks.map(look => look.evidence), isExactScore)
    const retained = new Set()
    for (const look of replay.looks) {
      const saved = canonical.positions[look.index].deep
      const found = !!saved && [saved, ...(saved.history ?? [])]
        .some(evidence => same(reading(evidence), reading(look.evidence)))
      out.retainedReadingEquality.observedLooksCompared++
      out.retainedReadingEquality.canonicalFinalOrHistoryContainsObservedReading += Number(found)
      out.retainedReadingEquality.canonicalFinalOrHistoryMissingObservedReading += Number(!found)
      // History also retains superseded adaptive evidence. Compare the latest
      // reading at either registered verification budget, not just any match.
      const latestVerification = saved && [...(saved.history ?? []), saved]
        .filter(evidence => evidence.searchBudget?.nodes === verifyNodes
          || evidence.searchBudget?.nodes === verifyNodes * 2).at(-1)
      out.retainedReadingEquality.canonicalLatestVerificationReadingMatchesObserved +=
        Number(!!latestVerification && same(reading(latestVerification), reading(look.evidence)))
      out.retainedReadingEquality.canonicalLatestVerificationReadingMissing += Number(!latestVerification)
      out.retainedReadingEquality.canonicalFinalDifferentFromObservedReading +=
        Number(!same(reading(saved), reading(look.evidence)))
      out.retainedReadingEquality.replayFinalDifferentFromObservedReading +=
        Number(!same(reading(replay.doc.positions[look.index].deep), reading(look.evidence)))
      if (found) retained.add(look.index)
    }
    const afterVerification = new Set()
    for (const call of replay.calls) {
      insist(stages.has(call.stage) && methods.has(call.method)
        && typeof call.failed === 'boolean' && Number.isFinite(call.seconds) && call.seconds >= 0,
      'invalid recorded call')
      const key = `${call.stage}/${call.method}`
      const cell = out.calls.byStageAndMethod[key] ??= {
        calls: 0, failed: 0, seconds: 0, maxSeconds: null,
      }
      cell.calls++
      cell.failed += Number(call.failed)
      cell.seconds += call.seconds
      cell.maxSeconds = addMaximum(cell.maxSeconds, call.seconds)
      out.calls.total++
      out.calls.failed += Number(call.failed)
      if (engineMethods.has(call.method)) {
        out.calls.failedEngineCalls += Number(call.failed)
        out.timing.maxRecordedEngineCallSeconds =
          addMaximum(out.timing.maxRecordedEngineCallSeconds, call.seconds)
      } else if (call.method === 'humanPolicy') out.calls.failedHumanPolicyCalls += Number(call.failed)
      else out.calls.failedOtherCalls += Number(call.failed)
      out.calls.withRecordedErrorOrReasonFields += Number(
        ['error', 'message', 'reason', 'exception'].some(key => Object.hasOwn(call, key)))
      out.timing.recordedCallSeconds += call.seconds
      out.timing.maxRecordedCallSeconds = addMaximum(out.timing.maxRecordedCallSeconds, call.seconds)
      if (call.stage === 'after-verification' && call.method === 'bestMoves') afterVerification.add(call.index)
    }
    out.retainedReadingEquality.changedPositionsWithCanonicalRetainedObservedReading +=
      changedPositions.filter(index => retained.has(index)).length
    out.retainedReadingEquality.changedPositionsWithPostVerificationSearch +=
      changedPositions.filter(index => afterVerification.has(index)).length
    insist(Number.isFinite(replay.summary?.seconds) && replay.summary.seconds >= 0
      && Number.isFinite(replay.summary?.verifySeconds) && replay.summary.verifySeconds >= 0,
    'invalid recorded review timing')
    out.timing.reviewSeconds += replay.summary.seconds
    out.timing.verificationSeconds += replay.summary.verifySeconds
  }
  return out
}
