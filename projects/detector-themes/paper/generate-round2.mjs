#!/usr/bin/env node
// Append app-pool development evidence to the frozen historical paper. This
// generator never opens a held-out puzzle or label file and computes no verdict.
import { readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHESS_DIR, LAB_DIR } from '../../../bridge/lib/chess.mjs'
import { Generated, esc, fixed } from '../../paper.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const resultDir = join(here, '../results/round2')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const validDigest = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const claim = (ok, what) => {
  if (!ok) throw new Error(`the paper's claim no longer holds: ${what}`)
}

const archive = readFileSync(join(here, 'generated-round1.tex'), 'utf8')
const manifest = json(join(here, 'round1-manifest.json'))
claim(manifest.project === 'detector-themes' && manifest.round === 1 && manifest.archive === 'generated-round1.tex', 'the historical archive is identified')
claim(digest(archive) === manifest.archiveSha256, 'the historical generated paper is unchanged')
claim(archive.includes(`\\newcommand{\\AppCommit}{${manifest.app.slice(0, 10)}}`), 'the historical app commit matches its archive')
for (const [path, hash] of Object.entries(manifest.inputs)) {
  claim(/^projects\/(detector-themes|drill-decks)\/results\/[a-z-]+\.json$/.test(path), 'the historical manifest names aggregate inputs only')
  claim(validDigest(hash) && digest(readFileSync(join(LAB_DIR, path))) === hash, `historical aggregate ${path} is unchanged`)
}

const pin = json(join(LAB_DIR, 'bridge/chess.json')).commit
const report = json(join(resultDir, 'development.json'))
const sample = json(join(resultDir, 'sample.json'))
claim(report.project === 'detector-themes' && report.round === 2 && report.set === 'app' && report.app === pin && sample.app === pin, 'development and sample metadata measure the current pin')
claim(JSON.stringify(report.sample) === JSON.stringify(sample), 'development uses the recorded sample metadata')
claim(!Object.hasOwn(report, 'verdict') && !readdirSync(resultDir).some((name) => /^(compare-|score-heldout).*\.json$/.test(name)), 'this is app-only development without held-out scores or a keep verdict')
const poolBytes = readFileSync(join(CHESS_DIR, 'src/data/puzzles.json'))
claim(digest(poolBytes) === sample.app_pool_sha256, 'the sample excluded the measured app pool')
const buckets = JSON.parse(poolBytes.toString('utf8'))
const all = Array.isArray(buckets) ? buckets : Object.values(buckets).flat()
const pool = [...new Map(all.map((p) => [p.id, p])).values()]
claim(digest(JSON.stringify(pool)) === report.datasetSha256 && pool.length === report.puzzles && sample.excluded_app_ids === pool.length, 'the app-pool dataset and count match development')
claim(validDigest(sample.source_sha256) && validDigest(sample.data_sha256) && sample.sampled > 0 && sample.eligible >= sample.sampled, 'the held-out sample is identified by metadata')
claim(sample.sampled === 20000 && sample.seed === 20261014 && JSON.stringify(sample.ratings) === '[400,1899]', 'the recorded sample follows the fixed design')

const score = (name) => json(join(resultDir, `score-app${name ? `-${name}` : ''}.json`))
const baseline = score(null)
const validCount = (n) => Number.isInteger(n) && n >= 0 && n <= report.puzzles
const countFromScore = (s, key) => Object.values(s.table.best).reduce((sum, c) => sum + c[key], 0)
const checkScore = (s, name) => {
  claim(s.project === report.project && s.round === 2 && s.set === 'app' && s.app === pin && s.candidate === name, 'each app score has the declared identity')
  claim(s.datasetSha256 === report.datasetSha256 && s.puzzles === report.puzzles && s.skipped === 0, 'each app score uses the complete paired pool')
  claim(s.scorerSha256 === baseline.scorerSha256 && validDigest(s.labelsSha256), 'each app score identifies its scorer and labels')
}
checkScore(baseline, null)
claim(validCount(report.baseline.agree) && validCount(report.baseline.disagree), 'the baseline counts are possible')
claim(countFromScore(baseline, 'tp') === report.baseline.agree && countFromScore(baseline, 'fp') === report.baseline.disagree, 'the baseline development counts match its score aggregate')
const candidates = Object.entries(report.candidates)
claim(candidates.length > 0, 'at least one candidate is finalized for the held-out test')
for (const [name, c] of candidates) {
  claim(/^[a-z0-9-]+$/.test(name), 'candidate names are plain identifiers')
  claim(c.status === 'finalized for held-out test; no keep verdict' && !Object.hasOwn(c, 'verdict'), 'each candidate is finalized without a keep verdict')
  claim(validCount(c.agree) && validCount(c.disagree) && validCount(c.changed), 'candidate counts are possible')
  claim(c.agree > report.baseline.agree, 'each finalized candidate increases app-pool agreement')
  claim(c.agree - report.baseline.agree === c.agreeAdded - c.agreeLost && c.disagree - report.baseline.disagree === c.disagreeAdded - c.disagreeLost, 'paired transitions match the app totals')
  const s = score(name)
  checkScore(s, name)
  claim(countFromScore(s, 'tp') === c.agree && countFromScore(s, 'fp') === c.disagree, 'candidate development counts match the score aggregate')
  claim(JSON.stringify(s.sourceSha256) === JSON.stringify(c.sourceSha256) && s.timing.puzzleSeconds === c.puzzleSeconds, 'development uses each candidate score and timing')
  claim(c.concept && validCount(c.concept.tp) && validCount(c.concept.fp), 'each new word has counted agreement and disagreement')
  claim(Object.values(s.table.best).some((row) => JSON.stringify(row) === JSON.stringify(c.concept)), 'the new word counts come from the score aggregate')
}
claim(baseline.timing.puzzleSeconds === report.baseline.puzzleSeconds, 'development uses the baseline timing')
const puzzleSeconds = report.baseline.puzzleSeconds + candidates.reduce((sum, [, c]) => sum + c.puzzleSeconds, 0)
const estimate = report.estimatedHeldout
claim(estimate.puzzles === sample.sampled && estimate.processes === 2 && Number.isFinite(puzzleSeconds) && puzzleSeconds > 0, 'the timing estimate uses the sampled set and two processes')
claim(Math.abs(estimate.scoringSeconds - puzzleSeconds * sample.sampled / report.puzzles / estimate.processes) < 1e-9, 'the timing estimate scales the measured app-pool work')
const comparison = readFileSync(join(here, '../compare.mjs'), 'utf8')
claim(/const DRAWS = 2000\b/.test(comparison) && /const SEED = 20261014\b/.test(comparison) && comparison.includes('s.agreeCi[0] > 0 && s.disagreeCi[1] <= 0.01'), 'the fixed candidate rule is unchanged')

const number = (n) => n.toLocaleString('en-US')
const g = new Generated('projects/detector-themes/paper/generate.mjs --round2')
g.def('RTwoAppCommit', pin)
g.def('RTwoPoolHash', report.datasetSha256)
g.def('RTwoPuzzles', number(report.puzzles))
g.def('RTwoSampled', number(sample.sampled)).def('RTwoEligible', number(sample.eligible))
g.def('RTwoSampleHash', sample.data_sha256).def('RTwoDatabaseHash', sample.source_sha256)
g.def('RTwoRatingLow', String(sample.ratings[0])).def('RTwoRatingHigh', number(sample.ratings[1]))
g.def('RTwoSeed', String(sample.seed)).def('RTwoBootstrapSeed', '20261014')
g.def('RTwoDraws', number(2000)).def('RTwoConfidence', '95').def('RTwoDisagreementLimit', '1')
g.def('RTwoProcesses', String(estimate.processes))
g.def('RTwoAppSeconds', fixed(puzzleSeconds, 1)).def('RTwoHeldSeconds', fixed(estimate.scoringSeconds, 1))
g.def('RTwoSampleSeconds', fixed(sample.total_seconds, 1))
g.block('RTwoTable', [
  '\\begin{tabular}{lrrrrr}',
  '\\toprule',
  'reader & agrees & disagrees & changed & new word TP & new word FP \\\\',
  '\\midrule',
  `pinned & ${number(report.baseline.agree)} & ${number(report.baseline.disagree)} & -- & -- & -- \\\\`,
  ...candidates.map(([name, c]) => `\\texttt{${esc(name)}} & ${number(c.agree)} & ${number(c.disagree)} & ${number(c.changed)} & ${number(c.concept.tp)} & ${number(c.concept.fp)} \\\\`),
  '\\bottomrule',
  '\\end{tabular}',
].join('\n'))
const output = join(here, 'generated.tex')
const temporary = `${output}.partial`
writeFileSync(temporary, archive + '\n' + g.parts.join('\n') + '\n')
renameSync(temporary, output)
console.error('wrote the historical macros and app-only development appendix; no held-out labels read')
