// Phase two only. The app supplies every chess verdict; this script estimates
// pooled paired changes and applies the rule fixed in README.md.
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { CHESS_DIR, chess, resultsDir } from '../../bridge/lib/chess.mjs'
import { RULE, ARMS, PROFILES, DEVICES, ROOT, assert, readJson, writeJson, loadInputs, loadDocuments, commonLooks, referenceIdentity, referencePath, validateReference } from './common.mjs'

assert(process.argv.slice(2).length === 1 && process.argv[2] === '--phase2', 'analyze.mjs requires --phase2; do not run in phase one')
const inputs = loadInputs()
assert(CHESS_DIR.endsWith('/' + inputs.pin.commit), 'analysis imports the pinned app instruments')
const documents = loadDocuments(inputs, { timed: true })
const identity = referenceIdentity(inputs)
assert(readJson(join(ROOT, 'reference', 'manifest.json')).signature === identity.signature, 'reference manifest differs')
const { isSerious, isBlunder } = await chess('src/services/metrics/index.ts')
const { judgeMove } = await chess('src/services/knowledge/index.ts')
const { isExactScore } = await chess('src/core/score/index.ts')
const complete = (e) => !!(e?.complete && e.lines?.length && e.lines.every(l => isExactScore(l.score)) && isExactScore(e.played))
const seriousLook = (e, mover) => complete(e) ? isSerious(null, judgeMove(e.lines[0].score, e.played, mover)) : null

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function poisson1(rand) {
  const limit = Math.exp(-1)
  let k = 0, p = rand()
  while (p > limit) { k++; p *= rand() }
  return k
}
const rand = mulberry32(RULE.seed)
const weights = Array.from({ length: RULE.draws }, () => inputs.cases.map(() => poisson1(rand)))
const unit = inputs.cases.map(() => 1)
function percentile(sorted, q) {
  const at = (sorted.length - 1) * q
  const lo = Math.floor(at), hi = Math.min(lo + 1, sorted.length - 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo)
}
function estimate(fn, { decidable = true, decision = false } = {}) {
  const value = fn(unit)
  const draws = weights.map(fn)
  const validDraws = draws.filter(Number.isFinite).length
  const valid = decidable && Number.isFinite(value) && validDraws === RULE.draws
  if (!valid) return { value: decidable && Number.isFinite(value) ? value : null, valid: false, validDraws, interval95: null, corrected: null }
  draws.sort((a, b) => a - b)
  const interval = (tail) => ({ lo: percentile(draws, tail), hi: percentile(draws, 1 - tail) })
  return { value, valid: true, validDraws, interval95: interval(RULE.alpha / 2), corrected: decision ? interval(RULE.alpha / (2 * RULE.effects)) : null }
}
const total = (games, fn, w = unit) => games.reduce((s, g, i) => s + w[i] * fn(g), 0)
const rate = (games, num, den, w) => {
  const d = total(games, den, w)
  return d > 0 ? total(games, num, w) / d : NaN
}
function ratio(games, num, den, opts) {
  return { ...estimate(w => rate(games, num, den, w), opts), num: total(games, num), den: total(games, den) }
}
const difference = (games, cnum, cden, bnum, bden, opts) => estimate(w => rate(games, cnum, cden, w) - rate(games, bnum, bden, w), { ...opts, decision: true })

function gapCounters(device, routine, deviceTiming, routineTiming) {
  const deviceLooks = new Set(deviceTiming.looks.map(l => l.index))
  const routineLooks = new Set(routineTiming.looks.map(l => l.index))
  const attribution = () => ({ deviceAttempted: 0, deviceNotAttempted: 0, deviceVerified: 0, deviceNotVerified: 0, routineAttempted: 0, routineTablebase: 0, deviceTablebase: 0 })
  const out = { plies: routine.records.length, routineSerious: 0, deviceSerious: 0, missed: 0, extra: 0, routineBlunders: 0, deviceBlunders: 0, missedBlunders: 0, extraBlunders: 0, routineInaccuracies: 0, deviceInaccuracies: 0, missedInaccuracies: 0, extraInaccuracies: 0, differ: 0, accuracy: [], where: { missed: attribution(), extra: attribution() } }
  routine.records.forEach((r, i) => {
    const d = device.records[i]
    const rs = isSerious(r.cls, r.judged), ds = isSerious(d.cls, d.judged)
    const rb = isBlunder(r.cls, r.judged), db = isBlunder(d.cls, d.judged)
    const ri = r.cls === 'inaccuracy', di = d.cls === 'inaccuracy'
    out.routineSerious += rs; out.deviceSerious += ds
    out.missed += rs && !ds; out.extra += ds && !rs
    out.routineBlunders += rb; out.deviceBlunders += db
    out.missedBlunders += rb && !db; out.extraBlunders += db && !rb
    out.routineInaccuracies += ri; out.deviceInaccuracies += di
    out.missedInaccuracies += ri && !di; out.extraInaccuracies += di && !ri
    out.differ += r.cls !== d.cls
    const kind = rs && !ds ? 'missed' : ds && !rs ? 'extra' : null
    if (kind) {
      const w = out.where[kind]
      w.deviceAttempted += deviceLooks.has(i)
      w.deviceNotAttempted += !deviceLooks.has(i)
      w.deviceVerified += d.evidence === 'verified'
      w.deviceNotVerified += d.evidence !== 'verified'
      w.routineAttempted += routineLooks.has(i)
      w.routineTablebase += !!r.tablebase
      w.deviceTablebase += !!d.tablebase
    }
  })
  for (const side of ['white', 'black']) if (Number.isFinite(device[side]?.accuracy) && Number.isFinite(routine[side]?.accuracy)) out.accuracy.push(device[side].accuracy - routine[side].accuracy)
  return out
}

const referenceRows = new Map()
const perGame = documents.map((docs, caseIndex) => {
  const gap = Object.fromEntries(ARMS.map(arm => [arm, Object.fromEntries(DEVICES.map(profile => [profile, gapCounters(docs[arm][profile], docs[arm].routine, docs.timed[arm][profile], docs.timed[arm].routine)]))]))
  const coverage = Object.fromEntries(ARMS.map(arm => [arm, Object.fromEntries(PROFILES.map(profile => {
    const doc = docs[arm][profile]
    const looks = docs.timed[arm][profile].looks
    const attempted = new Set(looks.map(l => l.index))
    return [profile, {
      plies: doc.records.length, positions: doc.positions.length,
      flags: doc.coverage.flagged,
      flaggedNotAttempted: doc.coverage.flaggedPlies.filter(i => !attempted.has(i)).length,
      initialLooks: looks.length,
      adaptiveRetries: looks.reduce((s, l) => s + l.calls.filter(c => c.method === 'bestMoves' && c.budget?.nodes === inputs.manifest.profiles[profile].verifyNodes * 2).length, 0),
      unknownRecords: doc.records.filter(r => r.cls === 'unknown').length,
      recordEvidence: Object.fromEntries([...new Set(doc.records.map(r => r.evidence))].map(e => [e, doc.records.filter(r => r.evidence === e).length])),
      incompleteSecondLooks: looks.filter(l => !complete(l.evidence)).length,
      tablebasePositions: doc.positions.filter(p => p.tablebase != null).length,
      tablebaseRecords: doc.records.filter(r => r.tablebase != null).length,
    }]
  }))]))
  const quality = {}
  for (const profile of PROFILES) {
    const indices = commonLooks(docs, profile)
    const byArm = Object.fromEntries(ARMS.map(arm => [arm, new Map(docs.timed[arm][profile].looks.map(l => [l.index, l.evidence]))]))
    const q = { common: indices.length, referenceUnresolved: 0, baselineWrong: 0, candidateWrong: 0, baselineIncomplete: 0, candidateIncomplete: 0 }
    for (const index of indices) {
      const reference = readJson(referencePath(inputs.cases[caseIndex].id, index))
      validateReference(reference, identity, caseIndex, index)
      referenceRows.set(`${caseIndex}/${index}`, reference)
      const mover = docs.baseline[profile].records[index].mover
      const referenceVerdict = seriousLook(reference.attempts.at(-1).evidence, mover)
      assert((reference.status === 'complete') === (referenceVerdict !== null), 'reference completeness differs')
      if (referenceVerdict === null) q.referenceUnresolved++
      for (const arm of ARMS) {
        const verdict = seriousLook(byArm[arm].get(index), mover)
        q[`${arm}Incomplete`] += verdict === null
        // An unusable arm look is wrong. An unusable reference makes the
        // entire profile guard unresolved, never a silently removed ply.
        if (referenceVerdict !== null) q[`${arm}Wrong`] += verdict === null || verdict !== referenceVerdict
      }
    }
    quality[profile] = q
  }
  return { id: inputs.cases[caseIndex].id, gap, quality, coverage }
})

const gaps = {}
for (const profile of DEVICES) {
  const arms = {}
  for (const arm of ARMS) {
    const games = perGame.map(g => g.gap[arm][profile])
    const miss = ratio(games, g => g.missed, g => g.routineSerious)
    const extra = ratio(games, g => g.extra, g => g.deviceSerious)
    const valid = miss.valid && extra.valid
    const predecessorStatus = !valid ? 'unresolved' : miss.interval95.hi < RULE.agreement && extra.interval95.hi < RULE.agreement ? 'agrees' : miss.interval95.lo > RULE.agreement || extra.interval95.lo > RULE.agreement ? 'differs' : 'unclear'
    const accuracy = games.flatMap(g => g.accuracy)
    arms[arm] = {
      games: games.length, plies: total(games, g => g.plies), miss, extra, predecessorStatus,
      blunders: { miss: ratio(games, g => g.missedBlunders, g => g.routineBlunders), extra: ratio(games, g => g.extraBlunders, g => g.deviceBlunders) },
      inaccuracies: { miss: ratio(games, g => g.missedInaccuracies, g => g.routineInaccuracies), extra: ratio(games, g => g.extraInaccuracies, g => g.deviceInaccuracies) },
      classesDiffer: ratio(games, g => g.differ, g => g.plies),
      where: Object.fromEntries(['missed', 'extra'].map(kind => [kind, Object.fromEntries(Object.keys(games[0].where[kind]).map(key => [key, total(games, g => g.where[kind][key])]))])),
      accuracy: { sides: accuracy.length, bias: accuracy.reduce((s, x) => s + x, 0) / accuracy.length, mae: accuracy.reduce((s, x) => s + Math.abs(x), 0) / accuracy.length, largest: Math.max(...accuracy.map(Math.abs)) },
    }
  }
  const num = (arm, key) => g => g.gap[arm][profile][key]
  const deltaMiss = difference(perGame, num('candidate', 'missed'), num('candidate', 'routineSerious'), num('baseline', 'missed'), num('baseline', 'routineSerious'))
  const deltaExtra = difference(perGame, num('candidate', 'extra'), num('candidate', 'deviceSerious'), num('baseline', 'extra'), num('baseline', 'deviceSerious'))
  const deltas = [deltaMiss, deltaExtra]
  const narrows = deltas.every(d => d.valid && d.value < 0 && d.corrected.lo <= 0) && deltas.some(d => d.corrected.hi < 0)
  gaps[profile] = { ...arms, deltaMiss, deltaExtra, narrows }
}

const quality = {}
for (const profile of PROFILES) {
  const games = perGame.map(g => g.quality[profile])
  const referenceUnresolved = total(games, g => g.referenceUnresolved)
  const decidable = referenceUnresolved === 0
  const baselineError = ratio(games, g => g.baselineWrong, g => g.common, { decidable })
  const candidateError = ratio(games, g => g.candidateWrong, g => g.common, { decidable })
  const deltaError = difference(games, g => g.candidateWrong, g => g.common, g => g.baselineWrong, g => g.common, { decidable })
  quality[profile] = {
    common: total(games, g => g.common), referenceUnresolved,
    baselineIncomplete: total(games, g => g.baselineIncomplete), candidateIncomplete: total(games, g => g.candidateIncomplete),
    baselineError, candidateError, deltaError,
    status: !deltaError.valid ? 'unresolved' : deltaError.corrected.hi < RULE.qualityMargin ? 'passes' : deltaError.corrected.lo > RULE.qualityMargin ? 'worse beyond margin' : 'unclear',
  }
}

function distribution(values) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!xs.length) return { n: 0, mean: null, median: null, p90: null }
  return { n: xs.length, mean: xs.reduce((s, x) => s + x, 0) / xs.length, median: percentile(xs, 0.5), p90: percentile(xs, 0.9) }
}

// Split the engine-port trace at each MultiPV search. The optional reset
// immediately before it belongs to that attempt; a restricted played-move
// search stays with the same attempt. No chess instrument is reproduced.
function attemptsOf(look, verifyNodes) {
  const attempts = []
  let resets = [], current = null
  for (const call of look.calls) {
    assert(call.stage === 'verify' && Number.isFinite(call.seconds) && call.seconds >= 0, 'invalid verification timing call')
    if (call.method === 'newGame') { resets.push(call); continue }
    if (call.method === 'bestMoves') {
      assert(call.budget?.nodes === verifyNodes || call.budget?.nodes === verifyNodes * 2, 'unexpected verification search budget')
      current = { kind: call.budget.nodes === verifyNodes ? 'initial' : 'adaptive', nodes: call.budget.nodes, seconds: call.seconds + resets.reduce((s, c) => s + c.seconds, 0), depth: call.depth, candidateSearchSeconds: call.seconds, resetCalls: resets.length, resetSeconds: resets.reduce((s, c) => s + c.seconds, 0), restrictedCalls: 0, restrictedSeconds: 0, restrictedDepth: null, failedCalls: Number(call.failed) + resets.filter(c => c.failed).length }
      attempts.push(current)
      resets = []
    } else {
      assert(call.method === 'scoreMove' && current && resets.length === 0 && call.budget?.nodes === current.nodes, 'verification call is outside its attempt')
      current.seconds += call.seconds
      current.restrictedCalls++
      current.restrictedSeconds += call.seconds
      current.restrictedDepth = call.depth
      current.failedCalls += Number(call.failed)
    }
  }
  assert(resets.length === 0 && attempts.filter(a => a.kind === 'initial').length === 1 && attempts.filter(a => a.kind === 'adaptive').length <= 1, 'verification attempt sequence differs')
  return attempts
}
function attemptCosts(attempts) {
  const sum = key => attempts.reduce((s, a) => s + a[key], 0)
  const restricted = attempts.filter(a => a.restrictedCalls > 0)
  return {
    attempts: attempts.length, seconds: sum('seconds'), secondsPerAttempt: distribution(attempts.map(a => a.seconds)),
    candidateSearchSeconds: sum('candidateSearchSeconds'), candidateDepth: distribution(attempts.map(a => a.depth)),
    resetCalls: sum('resetCalls'), resetSeconds: sum('resetSeconds'),
    restrictedCalls: sum('restrictedCalls'), restrictedAttempts: restricted.length,
    restrictedShare: attempts.length ? restricted.length / attempts.length : null,
    restrictedSeconds: sum('restrictedSeconds'), restrictedDepth: distribution(restricted.map(a => a.restrictedDepth)), failedCalls: sum('failedCalls'),
  }
}
const coverage = Object.fromEntries(PROFILES.map(profile => [profile, Object.fromEntries(ARMS.map(arm => {
  const rows = perGame.map(g => g.coverage[arm][profile])
  const keys = Object.keys(rows[0]).filter(k => k !== 'recordEvidence')
  const evidenceKinds = [...new Set(rows.flatMap(r => Object.keys(r.recordEvidence)))].sort()
  return [arm, { games: rows.length, ...Object.fromEntries(keys.map(k => [k, total(rows, r => r[k])])), recordEvidence: Object.fromEntries(evidenceKinds.map(k => [k, total(rows, r => r.recordEvidence[k] ?? 0)])) }]
}))]))
const cost = Object.fromEntries(PROFILES.map(profile => {
  const arms = Object.fromEntries(ARMS.map(arm => {
    const rows = documents.map(d => d.timed[arm][profile])
    const looks = rows.flatMap(r => r.looks)
    const attempts = looks.flatMap(l => attemptsOf(l, inputs.manifest.profiles[profile].verifyNodes))
    return [arm, { games: rows.length, looks: looks.length, fullReviewSeconds: rows.reduce((s, r) => s + r.summary.seconds, 0), secondLookSeconds: looks.reduce((s, l) => s + l.seconds, 0), secondsPerLook: distribution(looks.map(l => l.seconds)), acceptedDepth: distribution(looks.map(l => l.depth)), initial: attemptCosts(attempts.filter(a => a.kind === 'initial')), adaptive: attemptCosts(attempts.filter(a => a.kind === 'adaptive')), allAttempts: attemptCosts(attempts) }]
  }))
  const paired = documents.flatMap(d => {
    const b = new Map(d.timed.baseline[profile].looks.map(l => [l.index, l]))
    const c = new Map(d.timed.candidate[profile].looks.map(l => [l.index, l]))
    return commonLooks(d, profile).map(i => ({ seconds: c.get(i).seconds - b.get(i).seconds, depth: Number.isFinite(c.get(i).depth) && Number.isFinite(b.get(i).depth) ? c.get(i).depth - b.get(i).depth : null }))
  })
  return [profile, { ...arms, commonLookChange: { seconds: distribution(paired.map(x => x.seconds)), acceptedDepth: distribution(paired.map(x => x.depth)) } }]
}))

const narrows = DEVICES.every(p => gaps[p].narrows)
const agrees = DEVICES.every(p => gaps[p].candidate.predecessorStatus === 'agrees')
const qualityPasses = PROFILES.every(p => quality[p].status === 'passes')
const qualityWorse = PROFILES.some(p => quality[p].status === 'worse beyond margin')
const disposition = narrows && qualityPasses ? 'keep for a port' : qualityWorse ? 'reject: quality worse beyond margin' : 'do not keep: inconclusive'
const references = [...referenceRows.values()]
const referenceAttempts = references.flatMap(r => r.attempts)
const out = {
  phase: 2, appCommit: inputs.pin.commit, recordsCommit: inputs.pin.records,
  candidateSha256: inputs.candidate.candidateSha256, casesSha256: inputs.manifest.casesSha256,
  engine: inputs.manifest.engine, nodeOptions: inputs.manifest.nodeOptions,
  data: inputs.manifest.data, games: inputs.cases.length, rule: RULE,
  correctedCoverage: 1 - RULE.alpha / RULE.effects,
  gaps, quality, coverage, cost,
  reference: { positions: references.length, attempts: referenceAttempts.length, unresolved: references.filter(r => r.status === 'unresolved').length, seconds: referenceAttempts.reduce((s, a) => s + a.seconds, 0), secondsPerAttempt: distribution(referenceAttempts.map(a => a.seconds)), depth: distribution(referenceAttempts.map(a => a.evidence.depth)) },
  decision: { narrows, agrees, qualityPasses, qualityWorse, disposition },
}
writeJson(join(ROOT, 'analysis-per-game.json'), perGame)
writeJson(join(resultsDir('second-look-fresh'), 'compare.json'), out)
const pct = x => x == null || !Number.isFinite(x) ? 'unresolved' : `${(100 * x).toFixed(2)}%`
const shown = (r, corrected = false) => {
  const interval = corrected ? r.corrected : r.interval95
  return interval ? `${pct(r.value)} (${pct(interval.lo)} to ${pct(interval.hi)})` : 'unresolved'
}
const md = [
  '# Cleared second looks: results', '',
  `Written by analyze.mjs on app \`${out.appCommit}\`, records \`${out.recordsCommit}\`, candidate \`${out.candidateSha256}\`. ${out.games} frozen games, both players; cases SHA-256 \`${out.casesSha256}\`. ${out.engine}, one thread and ${out.nodeOptions.Hash} MB hash, no evaluation cache.`, '',
  `${RULE.draws} paired Poisson(1) draws over games, seed ${RULE.seed}. Ordinary intervals are 95%; the seven decision effects use ${(100 * out.correctedCoverage).toFixed(6)}% Bonferroni intervals. Shares pool plies across games.`, '',
  '| Device | Arm | Miss share (95%) | Extra share (95%) | Predecessor status |',
  '|---|---|---|---|---|',
  ...DEVICES.flatMap(p => ARMS.map(a => `| ${p} | ${a} | ${shown(gaps[p][a].miss)} | ${shown(gaps[p][a].extra)} | ${gaps[p][a].predecessorStatus} |`)), '',
  '| Device | Candidate minus baseline miss (corrected) | Extra (corrected) | Narrows |', '|---|---|---|---|',
  ...DEVICES.map(p => `| ${p} | ${shown(gaps[p].deltaMiss, true)} | ${shown(gaps[p].deltaExtra, true)} | ${gaps[p].narrows} |`), '',
  '| Profile | Common looks | Unresolved references | Baseline error (95%) | Candidate error (95%) | Error change (corrected) | Guard |', '|---|---|---|---|---|---|---|',
  ...PROFILES.map(p => { const q = quality[p]; return `| ${p} | ${q.common} | ${q.referenceUnresolved} | ${shown(q.baselineError)} | ${shown(q.candidateError)} | ${shown(q.deltaError, true)} | ${q.status} |` }), '',
  `The reference starts fresh at ${RULE.referenceNodes} nodes, MultiPV ${RULE.referenceMultiPv}; an incomplete result gets one fresh retry. The guard is the app's serious/not-serious judgment from the accepted second-look scores, captured before routine teaching. It uses a ${pct(RULE.qualityMargin)} error-rate margin. An incomplete arm look counts as wrong. Any unresolved reference prevents that profile's guard passing.`, '',
  '| Profile | Arm | Looks | Second-look seconds | Mean seconds/look | Median depth |', '|---|---|---|---|---|---|',
  ...PROFILES.flatMap(p => ARMS.map(a => { const c = cost[p][a]; return `| ${p} | ${a} | ${c.looks} | ${c.secondLookSeconds.toFixed(2)} | ${c.secondsPerLook.mean?.toFixed(3) ?? 'unavailable'} | ${c.acceptedDepth.median ?? 'unavailable'} |` })), '',
  '| Profile | Arm | Flags | Initial looks | Adaptive retries | Unknown records | Incomplete looks | Tablebase positions / records |', '|---|---|---|---|---|---|---|---|',
  ...PROFILES.flatMap(p => ARMS.map(a => { const c = coverage[p][a]; return `| ${p} | ${a} | ${c.flags} | ${c.initialLooks} | ${c.adaptiveRetries} | ${c.unknownRecords} | ${c.incompleteSecondLooks} | ${c.tablebasePositions} / ${c.tablebaseRecords} |` })), '',
  '| Device | Arm | Disagreement | Plies | Device attempted look | Device verified record | Routine attempted look | Routine tablebase record |', '|---|---|---|---|---|---|---|---|',
  ...DEVICES.flatMap(p => ARMS.flatMap(a => ['missed', 'extra'].map(kind => {
    const w = gaps[p][a].where[kind]
    return `| ${p} | ${a} | ${kind} | ${w.deviceAttempted + w.deviceNotAttempted} | ${w.deviceAttempted} | ${w.deviceVerified} | ${w.routineAttempted} | ${w.routineTablebase} |`
  }))), '',
  '| Profile | Arm | Attempt | Count | Search and reset seconds | Mean seconds | Median candidate depth | Restricted searches | Reset seconds | Failed calls |', '|---|---|---|---|---|---|---|---|---|---|',
  ...PROFILES.flatMap(p => ARMS.flatMap(a => ['initial', 'adaptive'].map(kind => {
    const c = cost[p][a][kind]
    return `| ${p} | ${a} | ${kind} | ${c.attempts} | ${c.seconds.toFixed(2)} | ${c.secondsPerAttempt.mean?.toFixed(3) ?? 'unavailable'} | ${c.candidateDepth.median ?? 'unavailable'} | ${c.restrictedCalls} (${pct(c.restrictedShare)}) | ${c.resetSeconds.toFixed(3)} | ${c.failedCalls} |`
  }))), '',
  '| Device | Arm | Blunders missed / extra (95%) | Inaccuracies missed / extra (95%) | Classes differing (95%) | Side accuracy bias / MAE / largest |', '|---|---|---|---|---|---|',
  ...DEVICES.flatMap(p => ARMS.map(a => {
    const g = gaps[p][a], f = x => Number.isFinite(x) ? x.toFixed(2) : 'unavailable'
    return `| ${p} | ${a} | ${shown(g.blunders.miss)} / ${shown(g.blunders.extra)} | ${shown(g.inaccuracies.miss)} / ${shown(g.inaccuracies.extra)} | ${shown(g.classesDiffer)} | ${f(g.accuracy.bias)} / ${f(g.accuracy.mae)} / ${f(g.accuracy.largest)} |`
  })), '',
  'compare.json also reports full review seconds, the count, mean, median and 90th percentile of search times and depths, their paired changes on common plies, restricted-search depth and time, flags without an attempted look, and each record evidence status. Attempt times include reset, candidate and any restricted played-move search; retained depth is read before teaching.', '',
  `Narrows for both devices: ${narrows}. Both devices meet the predecessor's agreement bar: ${agrees}. Every quality guard passes: ${qualityPasses}. Decision: **${disposition}**.`, '',
  'Costs, blunders, inaccuracies, class changes and accuracy are descriptive. This run does not measure the phone hardware, its smaller hash, cached evidence, or migration of reviews already kept.', '',
]
writeFileSync(join(resultsDir('second-look-fresh'), 'compare.md'), md.join('\n'))
console.log(JSON.stringify(out.decision))
