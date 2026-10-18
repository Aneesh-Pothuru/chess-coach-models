#!/usr/bin/env node
// Preserve the historical paper and append the completed round's checked aggregates.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, LAB_DIR } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed } from '../../paper.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const resultDir = join(here, '../results/round2')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const claim = (ok, what) => { if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`) }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-12
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args])
const frozen = 'b055ee132c0cde90c2409f52ae9a94c8d9afa0a6'
const names = ['best-deflection', 'best-trapped']
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
claim(same(Object.keys(report.candidates).sort(), [...names].sort()), 'exactly the independently finalized candidates were tested')
claim(same(report.rule, { draws: 2000, seed: 20261014, confidence: 0.95, agreementLowerAbove: 0, disagreementUpperAtMost: 0.01 }), 'the candidate rule is unchanged')
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
  claim(s.sourceSha256[sourceKey] === digest(name ? frozenSource(`candidates/${name}/theme.ts`) : pinnedTheme), 'the scored theme reader is the frozen reader')
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
for (const name of names) {
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
  claim(c.verdict === verdict && comparison.verdict === verdict && verdict === 'keep', 'both finalized candidates meet the unchanged rule')
  claim(c.sets.app.candidate.agreeCount === development.candidates[name].agree && c.sets.app.candidate.disagreeCount === development.candidates[name].disagree, 'candidate app counts are unchanged from development')
  const source = frozenSource(`candidates/${name}/theme.ts`)
  claim(source.includes('solutionPv: string[] = []') && source.includes('solutionPv[0] === mv.lan'), 'optional line evidence starts with the named move')
  claim(source.indexOf('for (const [concept, theme] of DESCRIBED)') < source.lastIndexOf("return '" + c.word + "'"), 'existing named tactics retain priority')
  const publisher = frozenSource(`candidates/${name}/mistakes.ts`)
  claim(publisher.includes("import { replaySans } from '../../../core/chess'") && publisher.includes('theme: themeOfBest(m.fen, best, replaySans('), 'the misses publisher passes its best line through app replay')
}
const deflection = frozenSource('candidates/best-deflection/theme.ts')
const trapped = frozenSource('candidates/best-trapped/theme.ts')
claim(deflection.includes('detectDeflection(fen, solutionPv)') && !deflection.includes('collectsTrappedPiece') && !trapped.includes('detectDeflection'), 'the candidates are independent changes')
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
const output = join(here, 'generated.tex')
const temporary = `${output}.partial`
writeFileSync(temporary, archive + '\n' + g.parts.join('\n') + '\n')
renameSync(temporary, output)
console.error('wrote unchanged historical macros and verified round-two held-out results')
