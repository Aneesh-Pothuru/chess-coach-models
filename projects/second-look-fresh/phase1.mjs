// Counts, time, depth and the permitted raw-search determinism check only.
// Do not import analyze.mjs or any verdict instrument into this report.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { LAB_DIR, privateDir, resultsDir } from '../../bridge/lib/lab.mjs'
import { RULE } from './rules.mjs'

const root = privateDir('second-look-fresh'), result = resultsDir('second-look-fresh')
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))
const hash = x => createHash('sha256').update(x).digest('hex')
const insist = (ok, message) => { if (!ok) throw new Error(message) }
insist(!existsSync(join(result, 'compare.json')), 'phase one cannot be regenerated after a comparison')
const inputs = read(join(root, 'manifest.json'))
const candidate = read(join(root, 'candidate-manifest.json'))
const games = read(join(root, 'games.json'))
const pin = read(join(LAB_DIR, 'bridge/chess.json'))
insist(inputs.appCommit === pin.commit && inputs.recordsCommit === pin.records, 'input manifest no longer matches the pin')
insist(inputs.casesSha256 === hash(readFileSync(join(root, 'cases.json'))), 'frozen cases no longer match the input manifest')
insist(candidate.appCommit === pin.commit && candidate.recordsCommit === pin.records, 'candidate manifest no longer matches the pin')
const { candidateSha256, ...candidatePayload } = candidate
insist(candidateSha256 === hash(JSON.stringify(candidatePayload)), 'candidate manifest digest differs')
insist(candidate.recipeSha256 === hash(readFileSync(join(LAB_DIR, 'projects/second-look-fresh/candidate.mjs'))), 'candidate recipe changed after the build')
const { profiles } = RULE
const arms = ['baseline', 'candidate']
const appPaths = { baseline: join(LAB_DIR, '.cache/chess', pin.commit), candidate: join(LAB_DIR, '.cache/chess/candidates/second-look-fresh') }
for (const replacement of candidate.replacements) {
  insist(hash(readFileSync(join(appPaths.baseline, replacement.path))) === replacement.sourceSha256, 'pinned replacement source changed')
  insist(hash(readFileSync(join(appPaths.candidate, replacement.path))) === replacement.candidateSha256, 'candidate replacement source changed')
}
const sourceHashes = Object.fromEntries(arms.map(arm => [arm, hash([
  'src/services/review/pipeline/run.ts', 'src/services/review/pipeline/evidence.ts',
  'src/services/review/ports.ts', 'src/adapters/node/engine/index.ts',
].map(path => readFileSync(join(appPaths[arm], path), 'utf8')).join('\n'))]))
const docs = Object.fromEntries(arms.map(arm => [arm, Object.fromEntries(profiles.map(profile => [profile, read(join(root, 'probe', arm, profile + '.json'))]))]))
const reference = read(join(root, 'probe/reference.json'))
const all = arms.flatMap(arm => profiles.map(profile => docs[arm][profile]))
for (const p of [...all, reference]) insist(p.app === inputs.appCommit && p.records === inputs.recordsCommit && p.inputHash === hash(JSON.stringify(games[0])), 'probe provenance differs')
for (const arm of arms) for (const profile of profiles) {
  const p = docs[arm][profile]
  insist(p.sourceHash === sourceHashes[arm], `${arm}/${profile}: probe source changed`)
  insist(p.summary.variant === arm && p.summary.profile === profile && p.caseIndex === 0, `${arm}/${profile}: probe identity differs`)
}
insist(reference.sourceHash === sourceHashes.baseline && reference.caseIndex === 0, 'reference probe source or identity differs')
const quantile = (s, q) => {
  const n = (s.length - 1) * q, a = Math.floor(n)
  return s[a] + (s[Math.min(a + 1, s.length - 1)] - s[a]) * (n - a)
}
function distribution(xs) {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b)
  return { n: s.length, mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null,
    median: s.length ? quantile(s, .5) : null, p90: s.length ? quantile(s, .9) : null }
}
const timing = all.map(p => {
  const calls = p.looks.flatMap(l => l.calls)
  const initial = inputs.profiles[p.summary.profile].verifyNodes
  const candidateCalls = calls.filter(c => c.method === 'bestMoves')
  return { arm: p.summary.variant, profile: p.summary.profile, games: 1, plies: p.summary.plies,
    seconds: p.summary.seconds, looks: p.looks.length, flags: p.doc.coverage.flagged,
    initialSearches: candidateCalls.filter(c => c.budget?.nodes === initial).length,
    adaptiveSearches: candidateCalls.filter(c => c.budget?.nodes === initial * 2).length,
    restrictedSearches: calls.filter(c => c.method === 'scoreMove').length,
    resetCalls: calls.filter(c => c.method === 'newGame').length,
    resetSeconds: calls.filter(c => c.method === 'newGame').reduce((s, c) => s + c.seconds, 0),
    verifySeconds: p.summary.verifySeconds, secondsPerLook: distribution(p.looks.map(l => l.seconds)),
    depth: distribution(p.looks.map(l => l.depth)), failedCalls: p.calls.filter(c => c.failed).length }
})
const commonByProfile = Object.fromEntries(profiles.map(profile => {
  const c = new Set(docs.candidate[profile].looks.map(l => l.index))
  return [profile, docs.baseline[profile].looks.map(l => l.index).filter(i => c.has(i))]
}))
const commonUnion = new Set(Object.values(commonByProfile).flat()).size
const checks = profiles.map(p => docs.candidate[p].checks)
insist(checks.every(c => c.length === 4), 'the determinism slice is incomplete')
let compared = 0, identical = 0
for (let i = 0; i < checks[0].length; i++) {
  const first = checks[0][i]
  insist(first.evidence.complete && first.evidence.played && first.evidence.lines.length, 'incomplete determinism evidence')
  for (let p = 1; p < checks.length; p++) {
    const other = checks[p][i]
    insist(first.index === other.index && first.nodes === other.nodes, 'determinism inputs differ')
    compared++
    identical += JSON.stringify(first.evidence) === JSON.stringify(other.evidence)
  }
}
const determinism = { passed: identical === compared, positions: new Set(checks[0].map(c => c.index)).size,
  budgets: [...new Set(checks[0].map(c => c.nodes))], profiles: profiles.length,
  searches: checks.flat().length, pairedComparisons: compared, identical,
  candidateSha256: candidate.candidateSha256 }
const samplePlies = games[0].game.sans.length, scale = inputs.counts.plies / samplePlies
const workSeconds = timing.reduce((s, t) => s + t.seconds * scale, 0)
// Devices get two workers. Routine runs alone so its human model has room.
const onePassWallSeconds = timing.reduce((s, t) => s + t.seconds * scale / (t.profile === 'routine' ? 1 : 2), 0)
const refResetSeconds = reference.probes.flatMap(p => p.calls).filter(c => c.method === 'newGame').reduce((s, c) => s + c.seconds, 0)
const refSeconds = (reference.summary.seconds + refResetSeconds) / reference.summary.positions
const estimatedReferencePositions = commonUnion * scale
const referenceWall = estimatedReferencePositions * refSeconds / 2
const expectedSeconds = 2 * onePassWallSeconds + referenceWall
const ceilingSeconds = 2 * onePassWallSeconds + inputs.counts.plies * refSeconds * RULE.referenceAttempts / 2
const estimate = { method: 'scale first-game review seconds by plies; two device/reference workers, routine alone; canonical plus observed replay; no reference retries in central estimate',
  canonicalDocuments: RULE.games * profiles.length * arms.length,
  observedReplays: RULE.games * profiles.length * arms.length,
  initialLookQuotaCeilings: Object.fromEntries(profiles.map(p => [p, games.reduce((s, { game }) => s + Math.max(1, Math.ceil(game.sans.length * inputs.profiles[p].pass2Share)), 0)])),
  sampleCommonLooks: Object.fromEntries(profiles.map(p => [p, commonByProfile[p].length])), sampleCommonUnion: commonUnion,
  estimatedReferencePositions, maximumReferencePositions: inputs.counts.plies,
  referenceSecondsPerPosition: refSeconds, canonicalProcessHours: workSeconds / 3600,
  totalProcessHours: (2 * workSeconds + estimatedReferencePositions * refSeconds) / 3600,
  canonicalWallHours: onePassWallSeconds / 3600, observedWallHours: onePassWallSeconds / 3600,
  referenceWallHours: referenceWall / 3600, totalWallHours: expectedSeconds / 3600,
  allPliesTwoAttemptsWallHours: ceilingSeconds / 3600,
  planningHoursAtOneAndHalfSpeedCost: expectedSeconds / 3600 * 1.5 }
const out = { phase: 1, appCommit: inputs.appCommit, recordsCommit: inputs.recordsCommit,
  candidateSha256: candidate.candidateSha256, casesSha256: inputs.casesSha256, engine: inputs.engine,
  data: inputs.data, counts: inputs.counts, nodeOptions: inputs.nodeOptions, rule: RULE,
  sample: { games: 1, plies: samplePlies, selection: 'first frozen game; no label-based selection' },
  timing, referenceTiming: { positions: reference.summary.positions, nodes: reference.summary.nodes,
    seconds: reference.summary.seconds, resetSeconds: refResetSeconds, depth: distribution(reference.summary.depths) },
  determinism, estimate, comparisonComputed: false, packagesInstalled: false }
writeFileSync(join(result, 'phase1.json'), JSON.stringify(out, null, 2) + '\n')
const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : 'unavailable'
const md = [
  '# Fresh second looks: phase one', '',
  `Written by phase1.mjs. App \`${out.appCommit}\`; records \`${out.recordsCommit}\`; candidate SHA-256 \`${out.candidateSha256}\`.`, '',
  `Data: ${out.data}; cases SHA-256 \`${out.casesSha256}\`. Engine: ${out.engine}; ${out.nodeOptions.Threads} thread, ${out.nodeOptions.Hash} MB hash, no evaluation cache.`, '',
  `All ${out.counts.games} games replay: ${out.counts.plies} plies, ${out.counts.positions} positions, ${out.counts.nonterminalPositions} nonterminal positions, ${out.counts.tablebasePositions} positions within the app's tablebase piece limit. Lengths: ${out.counts.lengths.short} short, ${out.counts.lengths.medium} medium, ${out.counts.lengths.long} long; ${out.counts.minPlies} to ${out.counts.maxPlies} plies.`, '',
  `Time controls: ${Object.entries(out.counts.timeControls).map(([k, v]) => `${v} at ${k}`).join('; ')}. The frozen sample is retained without filtering.`, '',
  `Timing slice: the first frozen game, ${samplePlies} plies. Devices ran two at a time; each routine ran alone. These are descriptive counts and timings, not a comparison under the rule.`, '',
  '| Arm | Profile | Review seconds | Looks | Adaptive calls | Second-look seconds | Seconds/look mean (median, p90) | Depth mean (median, p90) |',
  '|---|---|---|---|---|---|---|---|',
  ...timing.map(t => `| ${t.arm} | ${t.profile} | ${f(t.seconds)} | ${t.looks} | ${t.adaptiveSearches} | ${f(t.verifySeconds)} | ${f(t.secondsPerLook.mean)} (${f(t.secondsPerLook.median)}, ${f(t.secondsPerLook.p90)}) | ${f(t.depth.mean)} (${f(t.depth.median)}, ${f(t.depth.p90)}) |`), '',
  `Reference timing: ${out.referenceTiming.positions} fresh ${out.referenceTiming.nodes}-node positions in ${f(out.referenceTiming.seconds)} search seconds, ${f(refSeconds)} seconds each including resets. Mean depth ${f(out.referenceTiming.depth.mean)}. No reference verdict or agreement was read.`, '',
  `Determinism: ${determinism.identical} of ${determinism.pairedComparisons} raw evidence comparisons identical, across ${determinism.positions} positions, ${determinism.budgets.length} budgets and ${determinism.profiles} profiles (${determinism.searches} searches). Gate passed: ${determinism.passed}.`, '',
  `The slice has ${commonUnion} unique common attempted plies across profiles (${profiles.map(p => `${p}: ${commonByProfile[p].length}`).join(', ')}). The full common sets require phase two; these are not whole-sample counts.`, '',
  `Full run: ${estimate.canonicalDocuments} CLI documents and ${estimate.observedReplays} instrumented replays, plus about ${f(estimatedReferencePositions, 0)} unique reference plies (${estimate.maximumReferencePositions} at most). Initial-look quota ceilings: ${profiles.map(p => `${p}: ${estimate.initialLookQuotaCeilings[p]}`).join(', ')}.`, '',
  `Estimated process work: ${f(estimate.totalProcessHours)} hours. With at most two workers, and routine alone: ${f(estimate.canonicalWallHours)} hours for CLI documents, ${f(estimate.observedWallHours)} hours for observed replays and ${f(estimate.referenceWallHours)} hours for references; ${f(estimate.totalWallHours)} hours total. Reserving fifty percent for slowdown gives ${f(estimate.planningHoursAtOneAndHalfSpeedCost)} hours.`, '',
  `If every ply needed a reference and every reference needed its retry, the same measured rate gives ${f(estimate.allPliesTwoAttemptsWallHours)} hours total. This is a work envelope, not a runtime bound. The slice does not measure full-run tablebase/network stalls, all teaching costs, warm-model loading differences or thermal slowdown.`, '',
  'No deciding measure was computed. No packages were installed. Per-game documents and traces, including app runtime caches, are under private/second-look-fresh. The app pin and shared scripts were not changed. No TeX or PDF build was run.', '',
]
writeFileSync(join(result, 'phase1.md'), md.join('\n'))
console.log(JSON.stringify({ counts: out.counts, determinism, estimate }))
insist(determinism.passed, 'cleared reads did not repeat: phase two must not compare')
