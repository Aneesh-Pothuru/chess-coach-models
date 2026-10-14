#!/usr/bin/env node
// Writes paper/generated.tex for the explain-top-move paper: every number,
// table and example it prints, from the records (each variant's per-moment
// grades, the judge rounds, the hill-climb's state) and from
// results/reproduction.json (reproduce.mjs).
//
//   bridge/run.sh projects/explain-top-move/paper/generate.mjs

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { records, resultsDir } from '../../../bridge/lib/lab.mjs';
import { Generated, board, esc, fixed, movesTex, sansOf, ucisOf, word } from '../../paper.mjs';
import { summarize } from '../summarize.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FLOW = 'explain-top-move';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const flow = join(records(), '.claude', 'hillclimb', FLOW);
const judgeDir = join(records(), 'evals', FLOW, 'judge');
const state = read(join(flow, '_state.json'));
const repro = read(join(resultsDir(FLOW), 'reproduction.json'));
const { rows } = summarize({ flow, records: flow });
const g = new Generated('projects/explain-top-move/paper/generate.mjs');

const row = (split, variant) => rows.find(r => r.split === split && r.variant === variant);
const pct = x => fixed(100 * x, 1);
const ci = x => `${pct(x.est)} [${pct(x.lo)}, ${pct(x.hi)}]`;
const delta = x => `${x.est >= 0 ? '+' : ''}${pct(x.est)} [${pct(x.lo)}, ${pct(x.hi)}]`;
const Name = s => s.replace(/(^|[^A-Za-z])([a-z])/g, (_, __, c) => c.toUpperCase()).replace(/[^A-Za-z]/g, '');

// ---- the data
const base = { test: row('test', 'baseline'), train: row('train', 'baseline') };
g.def('MomentsTest', String(base.test.moments)).def('MomentsTrain', String(base.train.moments))
  .def('Moments', String(base.test.moments + base.train.moments))
  .def('GamesTest', String(state.test_ids.length)).def('GamesTrain', String(state.train_ids.length))
  .def('Games', String(state.test_ids.length + state.train_ids.length))
  .def('HandcheckMoments', String(read(join(records(), 'evals', FLOW, 'handcheck.json')).moments.length));

// The player's rating in these games: the accuracy eval's frozen sample, which these games are.
const gameIds = new Set([...state.test_ids, ...state.train_ids].map(String));
const cases = read(join(records(), 'evals', 'accuracy-vs-chesscom', 'cases.json')).filter(c => gameIds.has(String(c.id)));
if (cases.length !== gameIds.size) throw new Error(`${gameIds.size - cases.length} of the games are not in the accuracy sample`);
const ratings = cases.map(c => c.myRating);
g.def('PlayerRatingMin', String(Math.min(...ratings))).def('PlayerRatingMax', String(Math.max(...ratings)));

// The hand check: the hand verdicts against the baseline's grades, moment by moment.
const baseGrades = new Map(readFileSync(join(flow, 'baseline', 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(m => [m.id, m]));
const hand = read(join(records(), 'evals', FLOW, 'handcheck.json')).moments;
g.def('HandcheckAgree', String(hand.filter(m => ['faithful', 'concrete', 'named_deep'].every(d => baseGrades.get(m.id)?.[d] === m[d])).length));

// ---- headline numbers: baseline and the kept variant, each split
const KEPT = repro.kept;
for (const split of ['test', 'train']) {
  const S = Name(split);
  for (const [v, V] of [['baseline', 'Base'], [KEPT, 'Kept']]) {
    const r = row(split, v);
    for (const d of ['faithful', 'concrete', 'named_deep', 'faithfulAll']) {
      g.def(`${V}${S}${Name(d)}`, pct(r[d].est)).def(`${V}${S}${Name(d)}CI`, ci(r[d]));
    }
  }
  const k = row(split, KEPT);
  g.def(`Kept${S}FaithfulVsBase`, delta(k.faithfulVsBaseline)).def(`Kept${S}ConcreteVsBase`, delta(k.concreteVsBaseline))
    .def(`Kept${S}TextsChanged`, String(k.textsChanged));
}
g.def('KeptVariant', KEPT);

// ---- the rounds
const changeLine = v => {
  const p = join(flow, v, 'change.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').split('\n').map(s => s.replace(/^#+\s*/, '').trim()).find(Boolean) ?? null;
};
const kept = new Map(state.rounds.map(r => [r.variant, r.round]));
const notKept = new Map(state.rounds_not_kept.map(r => [`v${r.round}`, r.round]));
g.def('RoundCount', word(kept.size + notKept.size)).def('KeptRoundCount', word(kept.size));
const judgeOf = new Map(repro.judge.map(j => [j.round, j]));
const variants = [...new Set(rows.map(r => r.variant))];
const tally = j => (j ? `${j.tally.train.new}--${j.tally.train.old} / ${j.tally.test.new}--${j.tally.test.old}` : '');
const roundRows = variants.map(v => {
  const t = row('test', v), tr = row('train', v);
  const round = v === 'baseline' ? 0 : v.slice(1);
  const decision = v === 'baseline' ? '' : kept.has(v) ? 'kept' : notKept.has(v) ? 'not kept' : 'replaced by v7b';
  const judge = judgeOf.get(round === 0 ? '' : v === 'v7b' ? '7 and 7b' : String(round));
  return `${v} & ${esc(changeLine(v) ?? (v === 'baseline' ? 'the app before the rounds' : ''))}${decision && decision !== 'kept' ? ` (\\emph{${decision}})` : ''} & ${pct(t.faithful.est)} & ${pct(t.concrete.est)} & ${pct(tr.faithful.est)} & ${pct(tr.concrete.est)} & ${t.textsChanged ?? ''}${tr.textsChanged != null ? `, ${tr.textsChanged}` : ''} & ${tally(judge)} \\\\`;
});
g.block('RoundsTable', [
  '\\begin{tabularx}{\\textwidth}{l L rrrr r r}', '\\toprule',
  ' & & \\multicolumn{2}{c}{test (\\%)} & \\multicolumn{2}{c}{train (\\%)} & texts & judge \\\\',
  '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}',
  'variant & change & faithful & concrete & faithful & concrete & changed & train / test \\\\', '\\midrule',
  ...roundRows, '\\bottomrule', '\\end{tabularx}',
].join('\n'));

// ---- the judge rounds, as reproduce.mjs recomputed them
g.block('JudgeTable', [
  '\\begin{tabular}{l l rr l}', '\\toprule', 'round & judged & train new--old (same) & test new--old (same) & the rule says \\\\', '\\midrule',
  ...repro.judge.map(j => `${esc(j.round)} & ${esc(j.judged.replace(/round/g, 'round '))}${j.moments != null ? ` (${j.moments} moments)` : ''} & ${j.tally.train.new}--${j.tally.train.old} (${j.tally.train.same}) & ${j.tally.test.new}--${j.tally.test.old} (${j.tally.test.same}) & ${j.keepByRule ? 'keep' : 'do not keep'} \\\\`),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));
const r5 = judgeOf.get('5');
g.def('RoundFiveTrainNew', String(r5.tally.train.new)).def('RoundFiveTrainOld', String(r5.tally.train.old))
  .def('RoundFiveTestNew', String(r5.tally.test.new)).def('RoundFiveTestOld', String(r5.tally.test.old))
  .def('RoundFiveReason', esc(r5.recordedReason));

// ---- examples from the judge rounds: the first moment (in the round's own
// order) on which both runs agree, for the rounds the paper shows.
const EXAMPLES = [
  { round: 'round3', want: 'new' },
  { round: 'round4', want: 'new' },
  { round: 'round7', want: 'new', has: 'if they take it with' },
  { round: 'round8', want: 'new' },
  { round: 'round9', want: 'old' },
];
const newer = key => (Object.values(key).some(k => k.X === 'new') ? 'new' : [...new Set(Object.values(key).flatMap(k => [k.X, k.Y]))].sort().at(-1));
const sideName = fen => (fen.split(' ')[1] === 'w' ? 'White' : 'Black');
let n = 0;
for (const { round, want, has } of EXAMPLES) {
  const dir = join(judgeDir, round);
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a])));
  const pick = (i, id) => { const a = answers[i].get(id); if (!a) return null; return a.choice === 'same' ? 'same' : keys[i][id][a.choice] === newer(keys[i]) ? 'new' : 'old'; };
  const versions = item => {
    const k = keys[0][item.id];
    const isNew = k.X === newer(keys[0]);
    return { before: isNew ? item.versionY : item.versionX, after: isNew ? item.versionX : item.versionY };
  };
  const item = items.find(i => [0, 1].every(r => pick(r, i.id) === want) && (!has || versions(i).after.some(s => s.text.includes(has))));
  if (!item) throw new Error(`${round}: no moment fits`);
  const L = 'ABCDEFGH'[n++];
  const fen = item.fenBefore;
  const playedSans = sansOf(item.move);
  const [played] = ucisOf(fen, playedSans);
  const bestSans = item.engine.bestLine ? sansOf(item.engine.bestLine) : [];
  const bestUcis = bestSans.length ? ucisOf(fen, bestSans) : [];
  const { before, after } = versions(item);
  const differ = after.map((s, i) => ({ heading: s.heading, before: before[i]?.heading === s.heading ? before[i].text : null, after: s.text }))
    .filter(s => s.before !== s.after);
  const removed = before.filter(s => !after.some(a => a.heading === s.heading)).map(s => ({ heading: s.heading, before: s.text, after: null }));
  const sections = [...differ, ...removed];
  const reason = answers[0].get(item.id).reason;
  const newIsX = keys[0][item.id].X === newer(keys[0]);
  const roundName = round.replace('round', '');
  g.def(`Example${L}Round`, roundName);
  g.def(`Example${L}Caption`, `Round ${roundName}: the judge preferred the ${want === 'new' ? 'new' : 'old'} text in both runs. The move played is the red arrow, the engine's best move the green one.`);
  g.input(`Example${L}`, `example-${L.toLowerCase()}`, [
    '\\begin{minipage}[t]{0.4\\textwidth}\\vspace{0pt}',
    board(fen, { played, better: bestUcis[0] ?? null, size: '13pt' }),
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{0.56\\textwidth}\\vspace{0pt}\\small',
    `\\textbf{Played:} ${movesTex(fen, playedSans)}, ${sideName(fen)} to move; the app's verdict: ${esc(item.appVerdict)}.\\par`,
    `\\textbf{Engine:} ${esc(item.engine.evalText)}.\\par`,
    bestSans.length ? `\\textbf{Best line:} ${movesTex(fen, bestSans)}\\par` : '',
    `\\textbf{UCI:} \\uci{${played}}; best line \\uci{${bestUcis.join(' ')}}\\par`,
    `\\textbf{FEN:} \\fen{${fen}}`,
    '\\end{minipage}',
    '',
    '\\smallskip\\small',
    '\\begin{tabularx}{\\textwidth}{>{\\raggedright\\arraybackslash}p{0.17\\textwidth} L L}',
    '\\toprule', 'section & before & after \\\\', '\\midrule',
    ...sections.map(s => `${esc(s.heading)} & ${s.before == null ? '\\emph{(not shown)}' : esc(s.before)} & ${s.after == null ? '\\emph{(not shown)}' : esc(s.after)} \\\\`),
    '\\bottomrule', '\\end{tabularx}',
    '',
    `\\textbf{The judge (run 1, where the new text was ${newIsX ? 'X' : 'Y'}):} \`\`${esc(reason)}''`,
  ].join('\n'));
}
g.def('ExampleCount', String(n));

// ---- the reproduction
const rr = repro.rows;
g.def('ReproLinesMatched', String(repro.recomputed.matched)).def('ReproLines', String(repro.recomputed.publishedLines))
  .def('AppCommit', `\\texttt{${repro.chess.pinned_commit.slice(0, 7)}}`)
  .def('RecordsCommit', `\\texttt{${repro.chess.records_commit.slice(0, 7)}}`)
  .def('RerunProbes', String(repro.rerun.probes.kept))
  .def('RerunEvidence', esc(repro.rerun.evidence.versions.join(', ')));
for (const r of rr) {
  const S = Name(r.split);
  g.def(`Rerun${S}Moments`, String(r.momentsApp)).def(`Rerun${S}Shared`, String(r.sharedMoments)).def(`Rerun${S}SameGrades`, String(r.sharedSameGrades))
    .def(`Rerun${S}Faithful`, fixed(r.app.faithful.est, 1)).def(`Rerun${S}Concrete`, fixed(r.app.concrete.est, 1));
}
const fmt = x => `${fixed(x.est, 1)} [${fixed(x.lo, 1)}, ${fixed(x.hi, 1)}]`;
g.block('ReproTable', [
  '\\begin{tabular}{ll lll}', '\\toprule', 'split & grade & recorded baseline & recorded ' + KEPT + ' & pinned app, rerun \\\\', '\\midrule',
  ...rr.flatMap(r => ['faithful', 'concrete', 'named_deep', 'faithfulAll'].map(d => `${r.split} & ${esc(d)} & ${fmt(r.recordedBaseline[d])} & ${fmt(r.recordedKept[d])} & ${fmt(r.app[d])} \\\\`)),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));

g.write(join(HERE, 'generated.tex'));
console.log(`wrote ${join(HERE, 'generated.tex')}: ${n} examples`);
