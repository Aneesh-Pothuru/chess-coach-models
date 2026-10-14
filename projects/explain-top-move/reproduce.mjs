#!/usr/bin/env node
// Reproduces the explanation hill-climb's numbers in the lab, two ways.
//
// Recomputed: every variant's aggregates, from the per-moment grades the
// records keep (results.jsonl), by summarize.mjs, and checked line by line
// against the aggregates the records' metrics.md published.
//
// Rerun: the pinned app's explanations rebuilt end to end on engine evidence
// the lab rebuilt (build-evidence.mjs, phone profile): build-cases.mjs, then
// probes.mjs on those cases, then build-cases.mjs again with the probes, then
// grade.mjs and results.mjs. Its rates are set beside the recorded baseline's
// and the kept variant's, with how many moments are the same moments.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone   (first; see README.md)
//   bridge/run.sh projects/explain-top-move/reproduce.mjs [--no-rerun]
//
// --no-rerun reads the rerun already in private/explain-top-move/reproduce/app/.
// The rerun's moments stay there; results/reproduction.{md,json} hold
// aggregates only.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHESS_DIR, LAB_DIR, privateDir, projectDir, records, resultsDir } from '../../bridge/lib/chess.mjs';
import { score } from './judge/pairwise.mjs';
import { rates, summarize } from './summarize.mjs';

const FLOW = 'explain-top-move';
const KEPT = 'v8';
const DIMS = ['faithful', 'concrete', 'named_deep', 'faithfulAll'];
// The judge rounds as the records keep them. Round 6 made no run of its own:
// it re-read round 5's judgments on the moments whose texts v6 changes from v4.
const ROUNDS = [
  { round: '3', dirs: ['round3'] },
  { round: '4', dirs: ['round4'] },
  { round: '5', dirs: ['round5'] },
  { round: '6', dirs: ['round5'], changed: ['v4', 'v6'] },
  { round: '7', dirs: ['round7'] },
  { round: '7b', dirs: ['round7b'] },
  { round: '7 and 7b', dirs: ['round7', 'round7b'] },
  { round: '8', dirs: ['round8'] },
  { round: '9', dirs: ['round9'] },
];

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const run = (script, ...args) => execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir(FLOW), script), ...args], {
  cwd: LAB_DIR, stdio: ['ignore', 'ignore', 'inherit'],
});
const jsonl = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

function rerun(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  console.error('[reproduce] cases on the pinned app, without probes');
  run('build-cases.mjs', '--out', dir, '--probes', join(dir, 'probes.json'));
  console.error('[reproduce] probes: the capture searches the best lines decline');
  run('probes.mjs', '--cases', join(dir, 'cases.json'), '--out', join(dir, 'probes.json'));
  console.error('[reproduce] cases again, with the probes');
  run('build-cases.mjs', '--out', dir, '--probes', join(dir, 'probes.json'));
  console.error('[reproduce] grades');
  run('grade.mjs', join(dir, 'cases.json'), '--out', join(dir, 'grades.json'));
  execFileSync(process.execPath, [join(projectDir(FLOW), 'results.mjs'), dir], { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** The published aggregate block of a metrics.md, line by line. */
function publishedLines(path) {
  const md = readFileSync(path, 'utf8');
  const start = '<!-- aggregates:start -->', end = '<!-- aggregates:end -->';
  const i = md.indexOf(start), j = md.indexOf(end);
  if (i < 0 || j < i) throw new Error(`${path} has no aggregate markers`);
  return md.slice(i + start.length, j).split('\n').map(l => l.trim()).filter(Boolean);
}

const pct = x => Math.round(1000 * x) / 10;
const rate = r => ({ est: pct(r.est), lo: pct(r.lo), hi: pct(r.hi), moments: r.n });

function main() {
  const recorded = join(records(), '.claude', 'hillclimb', FLOW);
  const state = JSON.parse(readFileSync(join(recorded, '_state.json'), 'utf8'));
  const split = new Map([...state.train_ids.map(id => [String(id), 'train']), ...state.test_ids.map(id => [String(id), 'test'])]);

  // Recomputed from the records' per-moment grades.
  const recomputed = summarize({ flow: recorded, records: recorded });
  const lines = new Set(recomputed.markdown.split('\n').map(l => l.trim()).filter(Boolean));
  const published = publishedLines(join(recorded, 'metrics.md'));
  const missing = published.filter(l => !lines.has(l));

  // The judge rounds, recomputed from the judge's answers and each run's order key.
  const judgeDir = join(records(), 'evals', FLOW, 'judge');
  const textHashes = v => new Map(jsonl(join(recorded, v, 'results.jsonl')).map(m => [m.id, m.textHash]));
  const reasons = new Map([...state.rounds, ...state.rounds_not_kept].map(r => [String(r.round), r.why]));
  const judge = ROUNDS.map(({ round, dirs, changed }) => {
    let only = null;
    if (changed) {
      const [from, to] = changed.map(textHashes);
      only = new Set([...to].filter(([id, h]) => h !== from.get(id)).map(([id]) => id));
    }
    const { tally, keep } = score(dirs.map(d => join(judgeDir, d)), only);
    return { round, judged: dirs.join(' then '), moments: only?.size ?? null, tally, keepByRule: keep, recordedReason: reasons.get(round.split(' ')[0]) ?? null };
  });

  // Rerun on the pinned app.
  const dir = join(privateDir(FLOW), 'reproduce', 'app');
  if (!process.argv.includes('--no-rerun')) rerun(dir);
  if (!existsSync(join(dir, 'results.jsonl'))) throw new Error(`no rerun in ${dir}: run without --no-rerun`);
  const app = new Map(jsonl(join(dir, 'results.jsonl')).map(m => [m.id, m]));
  const kept = new Map(jsonl(join(recorded, KEPT, 'results.jsonl')).map(m => [m.id, m]));
  const probes = JSON.parse(readFileSync(join(dir, 'probes.json'), 'utf8'));
  const gameOf = id => id.slice(0, id.lastIndexOf('-'));

  const rows = [];
  for (const which of ['test', 'train']) {
    const inSplit = ids => [...ids].filter(id => split.get(gameOf(id)) === which);
    const shared = inSplit(app.keys()).filter(id => kept.has(id));
    const sameGrades = shared.filter(id => DIMS.every(d => app.get(id)[d] === kept.get(id)[d])).length;
    const recordedRow = v => recomputed.rows.find(r => r.split === which && r.variant === v);
    const pick = r => Object.fromEntries(DIMS.map(d => [d, rate(r[d])]));
    rows.push({
      split: which,
      recordedBaseline: pick(recordedRow('baseline')),
      recordedKept: pick(recordedRow(KEPT)),
      app: pick(rates(app, split, which)),
      momentsApp: inSplit(app.keys()).length,
      momentsKept: inSplit(kept.keys()).length,
      sharedMoments: shared.length,
      sharedSameGrades: sameGrades,
    });
  }

  const phone = join(privateDir('accuracy-vs-chesscom'), 'evidence', 'phone');
  const provenance = readdirSync(phone).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(phone, f), 'utf8')).provenance ?? {});
  const report = {
    eval: 'explain-top-move reproduction',
    chess: { pinned_commit: git(CHESS_DIR, 'rev-parse', 'HEAD'), records_commit: git(records(), 'rev-parse', 'HEAD') },
    recomputed: { publishedLines: published.length, matched: published.length - missing.length, missing },
    rerun: {
      moments: app.size,
      probes: { budget: probes.budget, kept: Object.values(probes.games ?? {}).flat().length },
      evidence: { documents: provenance.length, versions: [...new Set(provenance.map(p => p.evidenceVersion))], builds: [...new Set(provenance.map(p => p.build))] },
    },
    judge,
    kept: KEPT,
    rows,
  };
  writeFileSync(join(resultsDir(FLOW), 'reproduction.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir(FLOW), 'reproduction.md'), render(report));
  console.log(render(report));
}

function render(report) {
  const f = r => `${r.est.toFixed(1)} [${r.lo.toFixed(1)}, ${r.hi.toFixed(1)}]`;
  const L = [
    '# Explaining the top move: the hill-climb reproduced in the lab',
    '',
    `Generated by \`projects/explain-top-move/reproduce.mjs\` on app commit \`${report.chess.pinned_commit.slice(0, 7)}\`, reading the records at \`${report.chess.records_commit.slice(0, 7)}\`. Rates are shares of key moments in percent, with 95% intervals from a bootstrap over games.`,
    '',
    '## Recomputed from the records',
    '',
    `${report.recomputed.matched} of the ${report.recomputed.publishedLines} lines of the published aggregates are recomputed exactly from the per-moment grades the records keep.${report.recomputed.missing.length ? ` Not recomputed: ${report.recomputed.missing.map(l => `\`${l}\``).join(', ')}.` : ''}`,
    '',
    '## The judge rounds, recomputed from the records',
    '',
    'Pooled over the two runs of each round (the order of the versions reversed in the second); each cell reads new–old preferred, with the same-answers after it.',
    '',
    '| round | judged | train | test | the rule says |',
    '|---|---|---|---|---|',
    ...report.judge.map(j => `| ${j.round} | ${j.judged}${j.moments != null ? ` (the ${j.moments} moments the round changed)` : ''} | ${j.tally.train.new}–${j.tally.train.old} (${j.tally.train.same}) | ${j.tally.test.new}–${j.tally.test.old} (${j.tally.test.same}) | ${j.keepByRule ? 'keep' : 'do not keep'} |`),
    '',
    'The reasons the records give for each round, to read beside the table:',
    '',
    ...[...new Map(report.judge.filter(j => j.recordedReason).map(j => [j.round.split(' ')[0], j.recordedReason])).entries()].map(([r, why]) => `- Round ${r}: ${why}`),
    '',
    '## Rerun on the pinned app',
    '',
    `The pinned app's explanations, rebuilt from engine evidence the lab rebuilt (${report.rerun.evidence.documents} games, ${report.rerun.evidence.versions.join(', ')}, ${report.rerun.evidence.builds.join(', ')}), with the capture searches redone on that evidence (${report.rerun.probes.kept} kept). ${report.rerun.moments} key moments.`,
    '',
    '| split | grade | recorded baseline | recorded ' + report.kept + ' | pinned app, rerun |',
    '|---|---|---|---|---|',
  ];
  for (const r of report.rows) {
    for (const d of DIMS) L.push(`| ${r.split} | ${d} | ${f(r.recordedBaseline[d])} | ${f(r.recordedKept[d])} | ${f(r.app[d])} |`);
  }
  L.push('');
  for (const r of report.rows) {
    L.push(`${r.split}: the rerun has ${r.momentsApp} key moments and ${report.kept} had ${r.momentsKept}; ${r.sharedMoments} are the same moments, and ${r.sharedSameGrades} of those carry the same three grades and the Why-sheet grade.`);
  }
  L.push('');
  return L.join('\n');
}

main();
