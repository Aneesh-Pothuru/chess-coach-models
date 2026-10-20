// A preserved-source dependency test. It compares bytes and call order;
// it does not judge a move or compute a comparison measure.
import { downstreamProof } from './suspension-diagnostic.mjs'

const insist = (ok, message) => { if (!ok) throw new Error(`sleep dependency: ${message}`) }
const instant = value => {
  insist(typeof value === 'string', 'invalid call or power timestamp')
  const n = Date.parse(value)
  insist(Number.isFinite(n), 'invalid call or power timestamp')
  return n
}
export function validateReplayClocks({ replay, processStartedAt, processEndedAt }) {
  const begin = instant(processStartedAt), end = instant(processEndedAt)
  insist(begin <= end, 'process timestamps are reversed')
  insist(Array.isArray(replay.calls), 'recorded calls are missing')
  let observationBegin = begin, observationEnd = end
  if (replay.observation != null) {
    observationBegin = instant(replay.observation.startedAt)
    observationEnd = instant(replay.observation.endedAt)
    insist(begin <= observationBegin && observationBegin <= observationEnd && observationEnd <= end,
      'observation timestamps leave the process interval')
  }
  for (const call of replay.calls) {
    const callBegin = instant(call.startedAt), callEnd = instant(call.endedAt)
    insist(observationBegin <= callBegin && callBegin <= callEnd && callEnd <= observationEnd,
      'call timestamps leave the observation or process interval')
    insist(Number.isFinite(call.startedMonotonicMs) && Number.isFinite(call.endedMonotonicMs)
      && call.startedMonotonicMs <= call.endedMonotonicMs, 'call monotonic timestamps are invalid')
  }
  return { begin, end }
}
export function powerEvents(lines) {
  return lines.flatMap((raw, index) => {
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})\s+(.+)$/.exec(raw)
    if (!m) return []
    const at = new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`).toISOString()
    const kind = /^(Sleep|Wake|DarkWake)[ \t]{2,}/.exec(m[5])?.[1]
      ?? (/^PM Client Acks\s+Delays to Sleep notifications:/.test(m[5]) ? 'sleep-acks' : 'other')
    return [{ at, kind, privateLineIndex: index }]
  })
}

export function classifySleepMismatch({ canonical, replay, powerLines, processStartedAt, processEndedAt }) {
  const { begin, end } = validateReplayClocks({ replay, processStartedAt, processEndedAt })
  const proof = downstreamProof(canonical, replay)
  const events = powerEvents(powerLines)
  const sleeps = []
  for (const [i, event] of events.entries()) {
    if (event.kind !== 'Sleep' || instant(event.at) < begin || instant(event.at) > end) continue
    const wake = events.slice(i + 1).find(e => e.kind === 'Wake')
    if (!wake || instant(wake.at) > end) continue
    const between = events.slice(i + 1, events.indexOf(wake))
    if (between.some(e => ['Sleep', 'DarkWake'].includes(e.kind))) continue
    const lastAck = between.filter(e => e.kind === 'sleep-acks').at(-1)
    // pmset timestamps have second precision. "Entering Sleep" precedes
    // client acknowledgements while the system is still executing. The last
    // acknowledgement's second bounds that transition; it is not timer data.
    const transitionLastSecond = instant(lastAck?.at ?? event.at)
    sleeps.push({ entryAt: event.at, wakeAt: wake.at,
      lastAcknowledgementAt: lastAck?.at ?? null,
      transitionBucketEndsAt: new Date(transitionLastSecond + 1000).toISOString() })
  }
  const rows = proof.privateRows.map(row => {
    const call = replay.calls[row.privateAdaptiveCallIndex]
    const matches = !call ? [] : sleeps.filter(s =>
      instant(call.startedAt) < instant(s.transitionBucketEndsAt)
      && instant(call.startedAt) < instant(s.wakeAt)
      && instant(call.endedAt) >= instant(s.wakeAt))
    return { ...row, searchSpansRecordedSuspension: matches.length === 1,
      matchedSleep: matches.length === 1 ? matches[0] : null }
  })
  const reasons = []
  if (!proof.aggregate.allRowsDownstream) reasons.push('differing-rows-not-fully-accounted-for')
  if (!sleeps.length) reasons.push('no-unambiguous-system-sleep-inside-replay')
  if (!rows.length || rows.some(r => !r.searchSpansRecordedSuspension))
    reasons.push('a-differing-row-has-no-search-spanning-suspension')
  return {
    schema: 'second-look-fresh-sleep-failure-classification/1',
    accepted: reasons.length === 0, reasons,
    aggregate: { ...proof.aggregate, documentedSleepIntervals: sleeps.length,
      rowsWhoseSearchSpansSuspension: rows.filter(r => r.searchSpansRecordedSuspension).length,
      deadlineEvidenceRequired: false },
    privateRows: rows, powerIntervals: sleeps,
  }
}
