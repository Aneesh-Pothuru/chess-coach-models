#!/usr/bin/env node
// Preserve the historical paper and append the completed round's checked aggregates.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, LAB_DIR } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed } from '../../paper.mjs'
import { COMBINED, MANIFEST, SPEC, verifyCombined } from '../combined-freeze.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const resultDir = join(here, '../results/round2')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const claim = (ok, what) => { if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-12
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args])
const frozen = 'da8a4cb1d3ef23ad4a71703dd09967f072b2e851'
const names = ['best-deflection', 'best-trapped']
const variants = [...names, COMBINED]
const sets = ['app', 'heldout']

const archive = readFileSync(join(here, 'generated-round1.tex'), 'utf8')
const manifest = json(join(here, 'round1-manifest.json'))
claim(manifest.project === 'detector-themes' && manifest.round === 1 && manifest.archive === 'generated-round1.tex', 'the historical archive is identified')
claim(digest(archive) === manifest.archiveSha256, 'the historical generated paper is unchanged')
claim(archive.includes(`\\newcommand{\\AppCommit}{${manifest.app.slice(0, 10)}}`), 'the historical app commit matches its archive')
for (const [path, hash] of Object.entries(manifest.inputs)) {
  claim(/^projects\/(detector-themes|drill-decks)\/results\/[a-z-]+\.json$/.test(path), 'the historical manifest names aggregate inputs only')
  claim(validDigest(hash) && digest(readFileSync(join(LAB_DIR, path))) === hash, `historical aggregate ${path} is unchanged`)
}
const historicalBody = (text) => text.slice(text.indexOf('\\begin{abstract}'), text.indexOf('\\appendix'))
claim(historicalBody(readFileSync(join(here, 'paper.tex'), 'utf8')) === historicalBody(git(LAB_DIR, 'show', `${frozen}:projects/detector-themes/paper/paper.tex`).toString('utf8')), 'the historical prose is unchanged')

const pin = json(join(LAB_DIR, 'bridge/chess.json')).commit
const report = json(join(resultDir, 'result.json'))
const sample = json(join(resultDir, 'sample.json'))
const development = json(join(resultDir, 'development.json'))
claim(report.project === 'detector-themes' && report.round === 2 && report.frozenCommit === frozen && report.app === pin, 'the completed report names the frozen design and current app pin')
claim(git(CHESS_DIR, 'rev-parse', 'HEAD').toString().trim() === pin, 'paper source checks use the pinned app')
claim(same(Object.keys(report.candidates).sort(), [...variants].sort()), 'the report contains the independent candidates and the registered combination')
claim(same(report.rule, { draws: 2000, seed: 20261014, confidence: 0.95, agreementLowerAbove: 0, disagreementUpperAtMost: 0.01 }), 'the candidate rule is unchanged')
const combinedFreeze = verifyCombined()
claim(report.combinedFreeze.path === MANIFEST && report.combinedFreeze.sha256 === combinedFreeze.sha256 && same(report.combinedFreeze.manifest, combinedFreeze.manifest), 'the report uses the verified combined content freeze')
const specification = json(join(LAB_DIR, SPEC))
claim(same(combinedFreeze.manifest.priority, ['trappedPiece', 'deflection']) && same(combinedFreeze.manifest.rule, report.rule), 'the combined tie-break and keep rule are the registered ones')
claim(specification.priorEvidence.includes('Individual held-out outcomes have already been observed.'), 'the combined test follows observed individual held-out results')
claim(specification.rationale.includes('extend its describeMove gain stage') && specification.rationale.includes('The pin does not itself rank the two new words.'), 'the combined priority explicitly extends the describer stage')
claim(specification.decision.includes('Overlap counts are descriptive and add no threshold.'), 'overlap adds no decision rule')
claim(Object.keys(report.frozenChecksums).length > 0, 'the report carries frozen source checksums')
for (const [path, record] of Object.entries(report.frozenChecksums)) {
  claim((path === 'bridge/chess.json' || path.startsWith('projects/detector-themes/')) && !path.includes('..'), 'frozen paths name this project or its app pin')
  const bytes = readFileSync(join(LAB_DIR, path))
  claim(validDigest(record.sha256) && digest(bytes) === record.sha256 && bytes.equals(git(LAB_DIR, 'show', `${frozen}:${path}`)), `frozen artifact ${path} is unchanged`)
  claim(git(LAB_DIR, 'rev-parse', `${frozen}:${path}`).toString().trim() === record.gitBlob, `frozen git blob ${path} matches`)
}
const frozenSource = (path) => {
  const full = `projects/detector-themes/${path}`
  claim(Object.hasOwn(report.frozenChecksums, full), `the report binds ${path} to the pretest commit`)
  return readFileSync(join(LAB_DIR, full), 'utf8')
}
const contentSource = (path) => {
  const full = `projects/detector-themes/${path}`
  const source = readFileSync(join(LAB_DIR, full), 'utf8')
  claim(combinedFreeze.manifest.files[full] === digest(source), `the combined content freeze binds ${path}`)
  return source
}
const candidateSource = (name, file) => (name === COMBINED ? contentSource : frozenSource)(`candidates/${name}/${file}`)
const aggregate = (name) => {
  const path = `projects/detector-themes/results/round2/${name}.json`
  claim(validDigest(report.inputs[path]) && digest(readFileSync(join(LAB_DIR, path))) === report.inputs[path], `report input ${name} is unchanged`)
  return json(join(LAB_DIR, path))
}
claim(same(report.data.sample, sample) && same(development.sample, sample), 'development and test use the same frozen sample')
claim(sample.app === pin && sample.sampled === 20000 && sample.seed === 20261014 && same(sample.ratings, [400, 1899]), 'the sample follows the fixed design')
claim(sample.eligible >= sample.sampled && validDigest(sample.source_sha256) && validDigest(sample.data_sha256), 'the source database and sample are identified')
claim(report.data.app.puzzles === development.puzzles && report.data.app.datasetSha256 === development.datasetSha256 && sample.excluded_app_ids === development.puzzles, 'the app pool is the frozen development pool')
claim(report.data.heldout.puzzles === sample.sampled && report.data.heldout.serializedSha256 === sample.data_sha256, 'the tested sample is the frozen sample')
const sampler = frozenSource('sample.py')
for (const fragment of ['rnd = random.Random(SEED)', 'row["PuzzleId"] in skip', 'j = rnd.randrange(seen)', 'reservoir[j] = item']) claim(sampler.includes(fragment), 'the frozen sample is a seeded reservoir excluding the app pool')
const comparisonSource = frozenSource('compare.mjs')
for (const fragment of ['const DRAWS = 2000', 'const SEED = 20261014', 'const u = rng(SEED)', 'Array.from({ length: n }, () => Math.floor(u() * n))', 'Math.floor(0.025 * s.length)', 'Math.floor(0.975 * s.length)', 's.agreeCi[0] > 0 && s.disagreeCi[1] <= 0.01']) claim(comparisonSource.includes(fragment), 'the frozen paired percentile bootstrap and keep predicate match the method')
const scorerHash = digest(frozenSource('score.mts'))
const sum = (s, key) => Object.values(s.table.best).reduce((n, row) => n + row[key], 0)
const sourceKey = 'src/services/knowledge/detectors/theme.ts'
const motifKey = 'src/services/knowledge/detectors/motifs.ts'
const vocabularyKey = 'src/services/knowledge/catalogue/vocabulary.ts'
const appSource = (path) => {
  const bytes = readFileSync(join(CHESS_DIR, path))
  claim(bytes.equals(git(CHESS_DIR, 'show', `${pin}:${path}`)), `pinned source ${path} is unchanged`)
  return bytes.toString('utf8')
}
const pinnedTheme = appSource(sourceKey)
const pinnedMotifsHash = digest(appSource(motifKey))
const vocabulary = appSource(vocabularyKey)
claim(vocabulary.includes("deflection: 'deflection'") && vocabulary.includes("trappedPiece: 'trapped-piece'"), 'both words already resolve to their catalogue concepts')
const checkedScore = (set, name) => {
  const s = aggregate(`score-${set}${name ? `-${name}` : ''}`)
  claim(s.project === report.project && s.round === 2 && s.set === set && s.candidate === name && s.app === pin, 'each score has the declared identity')
  claim(s.skipped === 0 && s.puzzles === report.data[set].puzzles && s.datasetSha256 === report.data[set].datasetSha256, 'each score uses every paired puzzle in the declared set')
  claim(s.scorerSha256 === scorerHash && validDigest(s.labelsSha256), 'each score identifies the frozen scorer and labels')
  claim(s.sourceSha256[sourceKey] === digest(name ? candidateSource(name, 'theme.ts') : pinnedTheme), 'the scored theme reader is the frozen reader')
  claim(s.sourceSha256[motifKey] === pinnedMotifsHash && s.sourceSha256[vocabularyKey] === digest(vocabulary), 'review motifs and vocabulary are unchanged')
  return s
}
const baseline = Object.fromEntries(sets.map((set) => [set, checkedScore(set, null)]))
for (const set of sets) {
  const b = report.baseline[set]
  claim(b.puzzles === baseline[set].puzzles && b.agreeCount === sum(baseline[set], 'tp') && b.disagreeCount === sum(baseline[set], 'fp'), 'baseline counts match their scored aggregate')
  claim(near(b.agreeRate, b.agreeCount / b.puzzles) && near(b.disagreeRate, b.disagreeCount / b.puzzles), 'baseline rates match their counts')
}
claim(report.baseline.app.agreeCount === development.baseline.agree && report.baseline.app.disagreeCount === development.baseline.disagree, 'the app baseline is the pretest result')
for (const name of variants) {
  const c = report.candidates[name]
  const comparison = aggregate(`compare-${name}`)
  claim(c.labeller === 'best' && comparison.labeller === 'best' && comparison.candidate === name && comparison.round === 2 && comparison.draws === report.rule.draws && comparison.seed === report.rule.seed, 'each comparison targets the declared labeller under the frozen rule')
  claim(same(Object.keys(comparison.sets).sort(), [...sets].sort()), 'each comparison covers both sets')
  for (const set of sets) {
    const s = checkedScore(set, name)
    const r = c.sets[set]
    const cmp = comparison.sets[set]
    claim(r.puzzles === s.puzzles && cmp.puzzles === s.puzzles && cmp.datasetSha256 === s.datasetSha256, 'comparison and report use the complete scored set')
    claim(same(cmp.labelsSha256, { baseline: baseline[set].labelsSha256, candidate: s.labelsSha256 }), 'comparison label hashes match the score aggregates')
    for (const [who, scored] of [['baseline', baseline[set]], ['candidate', s]]) {
      const rates = who === 'baseline' ? cmp.base : cmp.candidate
      claim(r[who].agreeCount === sum(scored, 'tp') && r[who].disagreeCount === sum(scored, 'fp'), 'agreement counts come from score aggregates')
      claim(near(r[who].agreeRate, rates.agree) && near(r[who].disagreeRate, rates.disagree), 'rates match the paired comparison')
      claim(comparison.provenance[who].app === pin && comparison.provenance[who].scorerSha256 === scorerHash && same(comparison.provenance[who].sourceSha256, scored.sourceSha256), 'both sets compare the same frozen app sources')
    }
    for (const key of ['agreeDiff', 'disagreeDiff', 'agreeCi', 'disagreeCi']) claim(same(r[key], cmp[key]), 'effects and intervals match the unchanged comparison')
    for (const key of ['agreeCi', 'disagreeCi']) claim(r[key].length === 2 && r[key].every(Number.isFinite) && r[key][0] <= r[key][1], 'interval endpoints are finite and ordered')
    claim(near(r.agreeDiff, r.candidate.agreeRate - r.baseline.agreeRate) && near(r.disagreeDiff, r.candidate.disagreeRate - r.baseline.disagreeRate), 'effects are candidate minus pinned rates')
    claim(r.passesRule === (r.agreeCi[0] > report.rule.agreementLowerAbove && r.disagreeCi[1] <= report.rule.disagreementUpperAtMost), 'each set passes exactly the fixed predicate')
  }
  const verdict = sets.every((set) => c.sets[set].passesRule) ? 'keep' : 'drop'
  claim(c.verdict === verdict && comparison.verdict === verdict, 'every candidate verdict follows exactly the unchanged rule')
  if (name !== COMBINED) {
    claim(verdict === 'keep', 'both independent candidates meet the unchanged rule')
    claim(c.sets.app.candidate.agreeCount === development.candidates[name].agree && c.sets.app.candidate.disagreeCount === development.candidates[name].disagree, 'independent app counts are unchanged from development')
  }
  const source = candidateSource(name, 'theme.ts')
  claim(source.includes('solutionPv: string[] = []') && source.includes('solutionPv[0] === mv.lan'), 'optional line evidence starts with the named move')
  for (const { word } of c.words ?? [c]) claim(source.indexOf('for (const [concept, theme] of DESCRIBED)') < source.lastIndexOf("return '" + word + "'"), 'existing named tactics retain priority')
  const publisher = candidateSource(name, 'mistakes.ts')
  claim(publisher.includes("import { replaySans } from '../../../core/chess'") && publisher.includes('theme: themeOfBest(m.fen, best, replaySans('), 'the misses publisher passes its best line through app replay')
}
const deflection = frozenSource('candidates/best-deflection/theme.ts')
const trapped = frozenSource('candidates/best-trapped/theme.ts')
claim(deflection.includes('detectDeflection(fen, solutionPv)') && !deflection.includes('collectsTrappedPiece') && !trapped.includes('detectDeflection'), 'the candidates are independent changes')
const combined = candidateSource(COMBINED, 'theme.ts')
claim(same(report.candidates[COMBINED].words, [{ word: 'deflection', concept: 'deflection' }, { word: 'trappedPiece', concept: 'trapped-piece' }]), 'the combined report names exactly the independently added words')
const expectedCombined = trapped
  .replace("import { detectFork } from './fork'", "import { detectFork } from './fork'\nimport { detectDeflection } from './tactics/line'")
  .replace("| 'pin' | 'trappedPiece'", "| 'pin' | 'trappedPiece' | 'deflection'")
  .replace("    if (defends(fen, mine, mv, afterFen)) return 'defensiveMove'", "    if (solutionPv[0] === mv.lan && detectDeflection(fen, solutionPv)) return 'deflection'\n    if (defends(fen, mine, mv, afterFen)) return 'defensiveMove'")
claim(combined === expectedCombined, 'the combination preserves both frozen predicates and inserts only the registered trapped-first order')
claim(candidateSource(COMBINED, 'mistakes.ts') === candidateSource('best-trapped', 'mistakes.ts'), 'the combined publisher has the same line plumbing')
claim(pinnedTheme.includes('const gains = new Set((describeMove(') && pinnedTheme.includes('for (const [concept, theme] of DESCRIBED)') && !pinnedTheme.includes("return 'trappedPiece'") && !pinnedTheme.includes("return 'deflection'"), 'the pin has a describer gain stage but neither new theme')
const lineReader = appSource('src/services/knowledge/detectors/tactics/line.ts')
claim(lineReader.includes('replayPv(fenPunish, pv, 3)') && lineReader.includes('const forced = afterM1.inCheck() || baited || afterM1.attackers(d, them).includes(m1.to)') && lineReader.includes('if (!winsExchangeOn(r.fens[2], m1.color, p)) return null'), 'deflection reads a forcing departure and the collected target capture war')
for (const fragment of ["f.conceptId === 'trapped-piece'", 'move.color === piece.color && move.from === target', 'captureExchangeByMove(board.fen, uci)', 'gain > 0 && materialFor(board, mine) - before + gain > 0', 'for (const uci of solutionPv.slice(1))']) claim(trapped.includes(fragment), 'trapped-piece follows the named target and checks its actual capture after prior costs')
const trappedReader = appSource('src/services/knowledge/detectors/insights/readers.ts')
claim(trappedReader.includes('if (!provablyLoses(after, p.square)) continue') && trappedReader.includes('escapes.every((m) => provablyLoses(after.child(m), m.to))'), 'the describer requires losing current and escape squares')
const competency = appSource('src/services/learner/competencies.ts').match(/export const THEME_COMPETENCY:[\s\S]*?= \{([\s\S]*?)\n\}/)?.[1]
claim(competency && !/\b(deflection|trappedPiece)\s*:/.test(competency), 'neither word has a direct theme competency')
for (const path of ['misses', 'graduation']) claim(appSource(`src/services/exercises/families/${path}.ts`).includes("competencies: THEME_COMPETENCY[item.theme] ?? 'calc.scan'"), 'miss and graduation attempts use the scan fallback')
claim(appSource('tools/coach-review/lib/facts-deps.cjs').includes('K.themeOfBest(m.fen, best)'), 'the separate routine facts caller has no solution-line argument')
claim(appSource('src/features/review/Review.tsx').includes("if (result.motifs.includes('hangingPiece')) bumpWeakness"), 'direct review weakness updates read review motifs')
const heldTrapped = report.candidates['best-trapped'].sets.heldout
claim(heldTrapped.disagreeDiff > 0 && heldTrapped.disagreeCi[0] <= 0 && heldTrapped.disagreeCi[1] > 0 && heldTrapped.disagreeCi[1] <= report.rule.disagreementUpperAtMost, 'the trapped held-out disagreement estimate is positive, its interval crosses zero, and it passes the allowance')

const overlap = aggregate(`overlap-${COMBINED}`)
claim(same(report.overlap, overlap) && overlap.project === report.project && overlap.round === 2 && overlap.phase === 3 && overlap.candidate === COMBINED && overlap.app === pin && overlap.manifestSha256 === combinedFreeze.sha256, 'overlap uses the same report, pin and content freeze')
claim(same(Object.keys(overlap.sets).sort(), [...sets].sort()), 'overlap covers exactly the app pool and held-out set')
claim(same(overlap.priority, combinedFreeze.manifest.priority) && overlap.availabilityDefinition === combinedFreeze.manifest.availabilityDefinition, 'overlap uses the registered independent-label availability and priority')
const overlapSource = contentSource('overlap-combined.mjs')
for (const fragment of ['const d = paired.deflection.best === wordFor.deflection', 'const t = paired.trapped.best === wordFor.trapped', 'const expected = manifest.priority.find((word) => available.has(word)) ?? base.best', 'assert(actual === expected']) claim(overlapSource.includes(fragment), 'overlap counts available independent labels and enforces composition on every puzzle')
const groups = ['neither', 'deflectionOnly', 'trappedOnly', 'both']
const winners = ['baseline', 'deflection', 'trappedPiece', 'other']
const expectedWinner = { neither: 'baseline', deflectionOnly: 'deflection', trappedOnly: 'trappedPiece', both: 'trappedPiece' }
const count = (value) => Number.isInteger(value) && value >= 0
claim(Object.keys(overlap.inputs).length === sets.length * (variants.length + 1), 'overlap records every baseline and candidate score input')
for (const [path, hash] of Object.entries(overlap.inputs)) claim(report.inputs[path] === hash && validDigest(hash), 'overlap and effects use the same score aggregates')
for (const set of sets) {
  const row = overlap.sets[set]
  claim(row.puzzles === report.data[set].puzzles && row.datasetSha256 === report.data[set].datasetSha256, 'overlap describes the complete scored set')
  const d = checkedScore(set, 'best-deflection'), t = checkedScore(set, 'best-trapped'), c = checkedScore(set, COMBINED)
  const labels = { baseline: baseline[set].labelsSha256, deflection: d.labelsSha256, trapped: t.labelsSha256, combined: c.labelsSha256 }
  claim(same(row.labelsSha256, labels), 'overlap labels are exactly the scored labels')
  claim(same(Object.keys(row.availability).sort(), [...groups].sort()) && same(Object.keys(row.selection).sort(), [...groups].sort()), 'overlap has every availability class')
  claim(Object.values(row.availability).every(count) && Object.values(row.availability).reduce((a, b) => a + b, 0) === row.puzzles, 'availability partitions the set')
  for (const group of groups) {
    const selected = row.selection[group]
    claim(same(Object.keys(selected).sort(), [...winners].sort()) && Object.values(selected).every(count) && Object.values(selected).reduce((a, b) => a + b, 0) === row.availability[group], 'winner counts partition each availability class')
    claim(selected[expectedWinner[group]] === row.availability[group] && selected.other === 0, 'combined selection follows the registered priority')
  }
  claim(row.availability.deflectionOnly + row.availability.both === (d.bestWords.deflection ?? 0) && row.availability.trappedOnly + row.availability.both === (t.bestWords.trappedPiece ?? 0), 'overlap availability matches the independent new-word totals')
  for (const word of combinedFreeze.manifest.priority) claim(groups.reduce((n, group) => n + row.selection[group][word], 0) === (c.bestWords[word] ?? 0), 'overlap selection matches the combined new-word totals')
}
claim(sets.every((set) => overlap.sets[set].availability.both === 0 && Object.values(overlap.sets[set].selection.both).every((n) => n === 0)), 'neither measured set has an available-word overlap or an observed overlap winner')
const combinedTests = candidateSource(COMBINED, 'theme.test.ts')
for (const fragment of ["expect(trapped?.squares).toEqual(['a1'])", "expect(detectDeflection(fen, pv)).toMatchObject({ kind: 'deflection', defender: 'b8', square: 'e8' })", "expect(themeOfBest(fen, 'Bb2', pv)).toBe('trappedPiece')"]) claim(combinedTests.includes(fragment), 'the synthetic regression covers an app-reader overlap and the registered priority')

const number = (n) => n.toLocaleString('en-US')
const g = new Generated('projects/detector-themes/paper/generate.mjs --round2')
g.def('RTwoAppCommit', pin).def('RTwoFrozenCommit', frozen)
g.def('RTwoPuzzles', number(report.data.app.puzzles)).def('RTwoSampled', number(sample.sampled))
g.def('RTwoEligible', number(sample.eligible)).def('RTwoRatingLow', String(sample.ratings[0])).def('RTwoRatingHigh', number(sample.ratings[1]))
g.def('RTwoPoolHash', report.data.app.datasetSha256).def('RTwoSampleHash', sample.data_sha256).def('RTwoDatabaseHash', sample.source_sha256)
g.def('RTwoSeed', String(sample.seed)).def('RTwoBootstrapSeed', String(report.rule.seed))
g.def('RTwoDraws', number(report.rule.draws)).def('RTwoConfidence', fixed(100 * report.rule.confidence, 0))
g.def('RTwoDisagreementLimit', fixed(100 * report.rule.disagreementUpperAtMost, 0))
const effect = (delta, ci) => `${fixed(100 * delta, 2)} [${fixed(100 * ci[0], 3)}, ${fixed(100 * ci[1], 3)}]`
g.block('RTwoCounts', [
  '\\begin{tabular}{llrr}', '\\toprule',
  'reader & set & agrees & disagrees \\\\', '\\midrule',
  ...sets.map((set) => `pinned & ${set === 'app' ? 'app pool' : 'held out'} & ${number(report.baseline[set].agreeCount)} & ${number(report.baseline[set].disagreeCount)} \\\\`),
  ...names.flatMap((name) => sets.map((set) => {
    const r = report.candidates[name].sets[set].candidate
    return `${name === 'best-deflection' ? 'deflection' : 'trapped piece'} & ${set === 'app' ? 'app pool' : 'held out'} & ${number(r.agreeCount)} & ${number(r.disagreeCount)} \\\\`
  })), '\\bottomrule', '\\end{tabular}',
].join('\n'))
g.block('RTwoTable', [
  '\\begin{tabular}{llrrl}', '\\toprule',
  'candidate & set & agreement change & disagreement change & rule \\\\', '\\midrule',
  ...names.flatMap((name) => sets.map((set) => {
    const r = report.candidates[name].sets[set]
    return `${name === 'best-deflection' ? 'deflection' : 'trapped piece'} & ${set === 'app' ? 'app pool' : 'held out'} & ${effect(r.agreeDiff, r.agreeCi)} & ${effect(r.disagreeDiff, r.disagreeCi)} & ${r.passesRule ? 'pass' : 'fail'} \\\\`
  })), '\\bottomrule', '\\end{tabular}',
].join('\n'))
g.def('RTwoVerdicts', names.map((name) => `\\texttt{${esc(name)}}: ${esc(report.candidates[name].verdict)}`).join('; '))
g.def('RTwoCombinedManifestHash', combinedFreeze.sha256)
g.def('RTwoCombinedVerdict', esc(report.candidates[COMBINED].verdict))
g.def('RTwoCombinedMeaning', report.candidates[COMBINED].verdict === 'keep' ? 'The fixed combination passes on both sets and supports proposing this combined port.' : 'The fixed combination fails the rule and does not support this combined port.')
g.block('RTwoCombinedCounts', [
  '\\begin{tabular}{lrr}', '\\toprule', 'set & agrees & disagrees \\\\', '\\midrule',
  ...sets.map((set) => {
    const r = report.candidates[COMBINED].sets[set].candidate
    return `${set === 'app' ? 'app pool' : 'held out'} & ${number(r.agreeCount)} & ${number(r.disagreeCount)} \\\\`
  }), '\\bottomrule', '\\end{tabular}',
].join('\n'))
g.block('RTwoCombinedTable', [
  '\\begin{tabular}{lrrl}', '\\toprule',
  'set & agreement change & disagreement change & rule \\\\', '\\midrule',
  ...sets.map((set) => {
    const r = report.candidates[COMBINED].sets[set]
    return `${set === 'app' ? 'app pool' : 'held out'} & ${effect(r.agreeDiff, r.agreeCi)} & ${effect(r.disagreeDiff, r.disagreeCi)} & ${r.passesRule ? 'pass' : 'fail'} \\\\`
  }), '\\bottomrule', '\\end{tabular}',
].join('\n'))
g.block('RTwoOverlap', [
  '\\begin{tabular}{lrrr}', '\\toprule',
  'set & both available & trapped piece selected & deflection selected \\\\', '\\midrule',
  ...sets.map((set) => {
    const r = overlap.sets[set]
    return `${set === 'app' ? 'app pool' : 'held out'} & ${number(r.availability.both)} & ${number(r.selection.both.trappedPiece)} & ${number(r.selection.both.deflection)} \\\\`
  }), '\\bottomrule', '\\end{tabular}',
].join('\n'))
const output = join(here, 'generated.tex')
const temporary = `${output}.partial`
writeFileSync(temporary, archive + '\n' + g.parts.join('\n') + '\n')
renameSync(temporary, output)
console.error('wrote unchanged historical macros and verified independent, combined and overlap results')
