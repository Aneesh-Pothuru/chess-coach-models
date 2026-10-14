#!/usr/bin/env node
// Reproduces the explanation hill-climb's numbers in the lab, two ways.
//
// Recomputed: every variant's aggregates, from the per-moment grades the
// records keep (results.jsonl), by summarize.mjs, and checked line by line
// against the aggregates the records' metrics.md published.
//
// Rerun: the pinned app's explanations rebuilt end to end on engine evidence
// the lab rebuilt (build-evidence.mjs, phone profile): build-cases.mjs, then
// probes.mjs on those cases, then build-cases.mjs again with the probes, then,
// when the pinned app makes defense searches, defenses.mjs and build-cases.mjs
// once more, then grade.mjs and results.mjs. Each step reads only the searches
// the rerun made. Its rates are set beside the recorded baseline's and the
// kept variant's, with how many moments are the same moments.
//
//   bridge/run.sh projects/accuracy-vs-chesscom/build-evidence.mjs --profile phone   (first; see README.md)
//   bridge/run.sh projects/explain-top-move/reproduce.mjs [--no-rerun]
//
// --no-rerun reads the rerun already in private/explain-top-move/reproduce/app/.
// The rerun's moments stay there; results/reproduction.{md,json} hold
// aggregates only.
//
// It also recomputes the judge's controls from their answers
// (judge/controls/score.mjs), and the grades of a round graded on documents rebuilt
// for it (<variant>/rebuilt/ in the records) beside its base's on the same
// documents; a round that also ran on the endgame set keeps those grades in
// <variant>/rebuilt/endgames/, split by the games in <variant>/endgame-set.json.
// A round that fixes text defects keeps their counts in the records
// (<variant>/defects.json, written by defects.mjs over both variants' texts when
// the round ran); the report carries them, checked against the moments behind
// each count. And it says which kept rounds after the kept variant the pinned
// app carries, so the paper can say how far the app has come.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHESS_DIR, LAB_DIR, privateDir, projectDir, records, resultsDir } from '../../bridge/lib/chess.mjs';
import { DRIFT_RULE, lengthCheck, longerPicked, roundControl } from './judge/controls/score.mjs';
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
  { round: '10', dirs: ['round10'] },
  { round: '12', dirs: ['round12'] },
  { round: '13', dirs: ['round13'] },
  { round: '15', dirs: ['round15'] },
  { round: '16', dirs: ['round16'] },
];
// The rounds judged before the length check, whose streak of longer texts it tested.
const BEFORE_CHECK = ['3', '4', '5', '7', '7b', '8', '9'];

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
const run = (script, ...args) => execFileSync(join(LAB_DIR, 'bridge', 'run.sh'), [join(projectDir(FLOW), script), ...args], {
  cwd: LAB_DIR, stdio: ['ignore', 'ignore', 'inherit'],
});
const jsonl = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const gameOf = id => id.slice(0, id.lastIndexOf('-'));
const roundOrder = (a, b) => parseInt(a.replace(/^\D+/, ''), 10) - parseInt(b.replace(/^\D+/, ''), 10) || a.localeCompare(b);
/** JSON with every object's keys sorted, to compare two reports whatever order they were written in. */
const canonical = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/** Whether the pinned app makes the routine's defense searches (services/review `defenseProbes`). */
const appDefends = () => existsSync(join(CHESS_DIR, 'src', 'services', 'review', 'pipeline', 'defenses.ts'));

/**
 * Which kept rounds after the kept variant the pinned app carries, each read
 * from a mark its change left in the app's source: round 10's "an even trade",
 * round 11's `takesBack`, round 12's defense searches, round 14's
 * `materialChange`, round 15's `quietDefense`, round 16's `pawnRuns`.
 */
function appCarries() {
  const lessonFile = join(CHESS_DIR, 'src', 'services', 'knowledge', 'detectors', 'lesson.ts');
  const lesson = existsSync(lessonFile) ? readFileSync(lessonFile, 'utf8') : '';
  return { v10: lesson.includes('an even trade'), v11: /\btakesBack\b/.test(lesson), v12: appDefends(), v14: /\bmaterialChange\b/.test(lesson), v15: /\bquietDefense\b/.test(lesson), v16: /\bpawnRuns\b/.test(lesson) };
}

function rerun(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const searches = ['--probes', join(dir, 'probes.json'), '--defenses', join(dir, 'defenses.json')];
  console.error('[reproduce] cases on the pinned app, without probes');
  run('build-cases.mjs', '--out', dir, ...searches);
  console.error('[reproduce] probes: the capture searches the best lines decline');
  run('probes.mjs', '--cases', join(dir, 'cases.json'), '--out', join(dir, 'probes.json'));
  console.error('[reproduce] cases again, with the probes');
  run('build-cases.mjs', '--out', dir, ...searches);
  if (appDefends()) {
    console.error('[reproduce] defenses: the natural defenses to the best moves\' threats');
    run('defenses.mjs', '--cases', join(dir, 'cases.json'), '--out', join(dir, 'defenses.json'));
    console.error('[reproduce] cases again, with the defenses');
    run('build-cases.mjs', '--out', dir, ...searches);
  }
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

  // The judge's controls, recomputed from their answers; the length check's
  // also against the score the records keep.
  const controlsDir = join(judgeDir, 'controls');
  const length = lengthCheck(join(controlsDir, 'run1'));
  const recordedLength = JSON.parse(readFileSync(join(controlsDir, 'run1', 'score.json'), 'utf8'));
  const lengthMatches = ['items', 'answered', 'missing', 'J1', 'J2', 'J3'].every(k => canonical(length[k]) === canonical(recordedLength[k]));
  const perRound = readdirSync(controlsDir).filter(d => /^round\d+[a-z]?$/.test(d)).sort(roundOrder)
    .map(d => ({ round: d.slice('round'.length), ...roundControl(join(controlsDir, d)) }));
  const controls = {
    longer: { rounds: BEFORE_CHECK, ...longerPicked(BEFORE_CHECK.map(r => join(judgeDir, `round${r}`))) },
    length: { ...length, matchesRecorded: lengthMatches },
    perRound,
    driftRule: DRIFT_RULE,
  };

  // A round graded on documents rebuilt for it: its grades beside its base's on those documents.
  const compared = (dir, v, splitOf) => {
    const grades = f => new Map(jsonl(join(dir, f)).map(m => [m.id, m]));
    const before = grades('base.results.jsonl'), after = grades(`${v}.results.jsonl`);
    const outside = [...after.keys()].filter(id => !splitOf.has(gameOf(id)));
    if (outside.length) throw new Error(`${dir}: ${outside.length} moments in no split's games`);
    const splits = ['test', 'train'].map((which) => {
      const ids = [...after.keys()].filter(id => splitOf.get(gameOf(id)) === which);
      const count = m => Object.fromEntries(DIMS.map(d => [d, ids.filter(id => Number(m.get(id)?.[d]) === 1).length]));
      return { split: which, moments: ids.length, base: count(before), variant: count(after), textsChanged: ids.filter(id => after.get(id).textHash !== before.get(id)?.textHash).length };
    });
    return {
      before, after, splits,
      sameMoments: before.size === after.size && [...after.keys()].every(id => before.has(id)),
      gradesEqual: splits.every(s => DIMS.every(d => s.base[d] === s.variant[d])),
    };
  };
  const rebuilt = readdirSync(recorded).filter(v => existsSync(join(recorded, v, 'rebuilt'))).sort(roundOrder).map((v) => {
    const { after, splits, sameMoments, gradesEqual } = compared(join(recorded, v, 'rebuilt'), v, split);
    const defectsFile = join(recorded, v, 'defects.json');
    let defects = null;
    if (existsSync(defectsFile)) {
      const recordedDefects = JSON.parse(readFileSync(defectsFile, 'utf8'));
      const side = (k) => {
        const { counts, moments } = recordedDefects[k];
        if (Object.keys(counts).some(d => counts[d] !== moments[d]?.length)) throw new Error(`${v}/defects.json: a ${k} count does not match its moments`);
        if (Object.values(moments).flat().some(id => !after.has(id))) throw new Error(`${v}/defects.json: a ${k} moment is not one of the round's moments`);
        return counts;
      };
      defects = { base: side('base'), variant: side(v) };
    }
    let endgames = null;
    if (existsSync(join(recorded, v, 'rebuilt', 'endgames'))) {
      const set = JSON.parse(readFileSync(join(recorded, v, 'endgame-set.json'), 'utf8'));
      const setSplit = new Map(set.games.map(g => [String(g.id), g.split]));
      const shared = set.games.filter(g => split.has(String(g.id))).length;
      if (shared) throw new Error(`${v}/endgame-set.json: ${shared} of its games are among the 60`);
      const { splits: setSplits, sameMoments: setSame, gradesEqual: setEqual } = compared(join(recorded, v, 'rebuilt', 'endgames'), v, setSplit);
      endgames = {
        seed: set.seed,
        games: Object.fromEntries(['test', 'train'].map(which => [which, set.games.filter(g => g.split === which).length])),
        splits: setSplits, sameMoments: setSame, gradesEqual: setEqual,
      };
    }
    return { variant: v, sameMoments, splits, gradesEqual, defects, endgames };
  });

  // Rerun on the pinned app.
  const dir = join(privateDir(FLOW), 'reproduce', 'app');
  if (!process.argv.includes('--no-rerun')) rerun(dir);
  if (!existsSync(join(dir, 'results.jsonl'))) throw new Error(`no rerun in ${dir}: run without --no-rerun`);
  const app = new Map(jsonl(join(dir, 'results.jsonl')).map(m => [m.id, m]));
  const kept = new Map(jsonl(join(recorded, KEPT, 'results.jsonl')).map(m => [m.id, m]));
  const probes = JSON.parse(readFileSync(join(dir, 'probes.json'), 'utf8'));
  const defensesFile = join(dir, 'defenses.json');
  const defenses = existsSync(defensesFile) ? JSON.parse(readFileSync(defensesFile, 'utf8')) : null;

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
    chess: { pinned_commit: git(CHESS_DIR, 'rev-parse', 'HEAD'), records_commit: git(records(), 'rev-parse', 'HEAD'), carries: appCarries() },
    recomputed: { publishedLines: published.length, matched: published.length - missing.length, missing },
    rerun: {
      moments: app.size,
      probes: { budget: probes.budget, kept: Object.values(probes.games ?? {}).flat().length },
      defenses: defenses && { budget: defenses.budget, kept: Object.values(defenses.games ?? {}).flat().length },
      evidence: { documents: provenance.length, versions: [...new Set(provenance.map(p => p.evidenceVersion))], builds: [...new Set(provenance.map(p => p.build))] },
    },
    judge,
    controls,
    rebuilt,
    kept: KEPT,
    rows,
  };
  writeFileSync(join(resultsDir(FLOW), 'reproduction.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(resultsDir(FLOW), 'reproduction.md'), render(report));
  console.log(render(report));
}

function renderControls(c) {
  const L = c.length, decided = t => t.long + t.decoy;
  const rounds = Object.keys(L.J3);
  const listed = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  return [
    '## The judge\'s controls, recomputed from the records',
    '',
    `Before the length check, the judge's decided answers in rounds ${listed(c.longer.rounds)} picked the longer of the two versions ${c.longer.longer} times in ${c.longer.decided}${c.longer.ties ? ` (${c.longer.ties} of equal length)` : ''}.`,
    '',
    `The length check: ${L.items} items in ${L.batches} batches, ${L.answered} answered. Recomputed from the judges' answers, it ${L.matchesRecorded ? 'matches' : 'does not match'} the score the records keep.`,
    '',
    '| check | result | verdict |',
    '|---|---|---|',
    `| J1, the same text on both sides: answered "same" | ${L.J1.same} of ${L.J1.n} | ${L.J1.inventsDifferences ? 'invents differences' : 'uses "same"'} |`,
    `| J2, the shorter text against itself with filler: the decoy preferred | ${L.J2.decoy} of ${L.J2.n} (${L.J2.short} the shorter text, ${L.J2.same} same) | ${L.J2.lengthBiased ? 'length-biased' : 'not length-biased'} |`,
    ...rounds.map(r => `| J3, round ${r.replace(/^round/, '')}: the longer text against a decoy of its length | train ${L.J3[r].train.long} of ${decided(L.J3[r].train)}, test ${L.J3[r].test.long} of ${decided(L.J3[r].test)} | ${L.J3[r].survives ? 'survives' : 'does not survive'} |`),
    '',
    `Each later round's control, pooled over its two runs: a padding control's decoy is the text with filler, a trim control's the text with a point cut. The rule: ${c.driftRule}`,
    '',
    '| round | control | comparisons | decoy | the text as it is | same | the rule says |',
    '|---|---|---|---|---|---|---|',
    ...c.perRound.map(p => `| ${p.round} | ${p.kind} | ${p.comparisons} | ${p.decoy} | ${p.unchanged} | ${p.same} | ${p.drifted ? `drifted toward ${p.kind === 'trim' ? 'shortness' : 'length'}` : 'no drift'} |`),
    '',
  ];
}

function renderRebuilt(rebuilt) {
  if (!rebuilt.length) return [];
  const cell = (s, d) => (s.base[d] === s.variant[d] ? `${s.variant[d]}` : `${s.base[d]} to ${s.variant[d]}`);
  return [
    '## Rounds graded on rebuilt documents',
    '',
    'A round graded on documents rebuilt for it, beside its base on the same documents: moments graded 1, with one number where the two agree.',
    '',
    '| variant | split | moments | faithful | concrete | named_deep | faithfulAll | texts changed |',
    '|---|---|---|---|---|---|---|---|',
    ...rebuilt.flatMap(r => r.splits.map(s => `| ${r.variant} | ${s.split} | ${s.moments} | ${DIMS.map(d => cell(s, d)).join(' | ')} | ${s.textsChanged} |`)),
    ...rebuilt.filter(r => r.endgames).flatMap(r => r.endgames.splits.map(s => `| ${r.variant}, endgame set | ${s.split} | ${s.moments} | ${DIMS.map(d => cell(s, d)).join(' | ')} | ${s.textsChanged} |`)),
    '',
    ...rebuilt.map(r => `${r.variant}: ${r.sameMoments ? 'the same moments as its base' : 'not the same moments as its base'}; its grades ${r.gradesEqual ? 'equal' : 'differ from'} the base's.`),
    ...rebuilt.filter(r => r.endgames).map(r => `${r.variant} on the endgame set (${r.endgames.games.train + r.endgames.games.test} games outside the 60, ${r.endgames.games.train} train and ${r.endgames.games.test} test, drawn with seed ${r.endgames.seed}): ${r.endgames.sameMoments ? 'the same moments as its base' : 'not the same moments as its base'}; its grades ${r.endgames.gradesEqual ? 'equal' : 'differ from'} the base's.`),
    '',
    ...rebuilt.filter(r => r.defects).flatMap(r => [
      `The text defects ${r.variant} fixes, as \`defects.mjs\` counted them in each variant's texts (the records' \`${r.variant}/defects.json\`):`,
      '',
      `| defect | base | ${r.variant} |`,
      '|---|---|---|',
      ...Object.keys(r.defects.base).map(d => `| ${d} | ${r.defects.base[d]} | ${r.defects.variant[d]} |`),
      '',
    ]),
  ];
}

function renderCarries(report) {
  const rounds = Object.entries(report.chess.carries);
  const yes = rounds.filter(([, c]) => c).map(([v]) => v), no = rounds.filter(([, c]) => !c).map(([v]) => v);
  const listed = (xs, and) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);
  const carries = !yes.length ? `none of ${listed(no, 'and')}` : `${listed(yes, 'and')}${no.length ? `, and not ${listed(no, 'or')}` : ''}`;
  return `Of the kept rounds after ${report.kept}, the pinned app carries ${carries}, each read from a mark its change left in the app's source.`;
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
    ...renderControls(report.controls),
    ...renderRebuilt(report.rebuilt),
    '## Rerun on the pinned app',
    '',
    `The pinned app's explanations, rebuilt from engine evidence the lab rebuilt (${report.rerun.evidence.documents} games, ${report.rerun.evidence.versions.join(', ')}, ${report.rerun.evidence.builds.join(', ')}), with the capture searches redone on that evidence (${report.rerun.probes.kept} kept)${report.rerun.defenses ? ` and the defense searches (${report.rerun.defenses.kept} kept)` : '; the pinned app makes no defense searches'}. ${report.rerun.moments} key moments.`,
    '',
    renderCarries(report),
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
