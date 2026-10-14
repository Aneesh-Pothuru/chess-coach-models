#!/usr/bin/env node
// Writes paper/generated.tex for the explain-top-move paper: every number,
// table and example it prints, from the records (each variant's per-moment
// grades, the judge rounds, the hill-climb's state) and from
// results/reproduction.json (reproduce.mjs). It refuses to write when a
// claim the paper's text makes about them no longer holds.
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
const Cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DIMS = ['faithful', 'concrete', 'named_deep', 'faithfulAll'];
/** A list as prose writes it: "3, 4 and 5". */
const listed = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
/** The paper's text says this; stop if the numbers no longer do. */
const claim = (holds, what) => { if (!holds) throw new Error(`the paper says ${what}, and the numbers no longer do`); };

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
g.def('RoundCount', word(kept.size + notKept.size)).def('RoundCountCap', Cap(word(kept.size + notKept.size)))
  .def('KeptRoundCount', word(kept.size));
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
// The judge read every kept round but those that fix errors, and preferred each one on both halves.
const verdictOf = r => judgeOf.get(r.variant === 'v7b' ? '7 and 7b' : String(r.round));
const unjudged = state.rounds.filter(r => !verdictOf(r)).map(r => r.round);
claim(unjudged.join() === '1,2,11', 'the judge read every kept round but rounds 1, 2 and 11');
claim(state.rounds.filter(verdictOf).every(r => verdictOf(r).keepByRule), 'every kept round the judge read was preferred on both halves');
claim(!judgeOf.get('5').keepByRule && !judgeOf.get('9').keepByRule, 'the judge did not prefer rounds 5 and 9');
g.def('UnjudgedKept', listed(unjudged.map(String)));
// A round graded on documents rebuilt for it has no rates on the rounds' documents: its row points to its own table.
const rebuilt = new Map(repro.rebuilt.map(r => [r.variant, r]));
for (const v of [...kept.keys(), ...notKept.keys()].filter(v => rebuilt.has(v) && !variants.includes(v))) {
  const judge = judgeOf.get(String(kept.get(v) ?? notKept.get(v)));
  roundRows.push(`${v} & ${esc(changeLine(v) ?? '')}${kept.has(v) ? '' : ' (\\emph{not kept})'} & \\multicolumn{5}{c}{\\emph{graded on documents rebuilt for the round (Table~\\ref{tab:rebuilt})}} & ${tally(judge)} \\\\`);
}
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
// ---- a round graded on documents rebuilt for it, beside its base on the same documents
const both = (s, d) => (s.base[d] === s.variant[d] ? String(s.variant[d]) : `${s.base[d]} / ${s.variant[d]}`);
g.block('RebuiltTable', [
  '\\begin{tabular}{ll r rrrr r}', '\\toprule',
  'variant & split & moments & faithful & concrete & named\\_deep & faithfulAll & texts changed \\\\', '\\midrule',
  ...repro.rebuilt.flatMap(r => r.splits.map(s => `${r.variant} & ${s.split} & ${s.moments} & ${DIMS.map(d => both(s, d)).join(' & ')} & ${s.textsChanged} \\\\`)),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));
const ten = rebuilt.get('v10');
claim(ten?.sameMoments && ten.gradesEqual, "round 10's grades equal its base's on the documents rebuilt for it");
const tenSplit = s => ten.splits.find(x => x.split === s);
g.def('RoundTenMoments', String(ten.splits.reduce((n, s) => n + s.moments, 0)))
  .def('RoundTenChangedTest', String(tenSplit('test').textsChanged)).def('RoundTenChangedTrain', String(tenSplit('train').textsChanged));

// ---- round 11: five text defects, on round 10's rebuilt documents
const eleven = rebuilt.get('v11');
claim(eleven?.sameMoments, 'round 11 was graded on the same moments as its base');
claim(eleven.splits.every(s => DIMS.every(d => s.variant[d] >= s.base[d])), 'no grade falls in round 11');
claim(eleven.splits.every(s => s.variant.concrete > s.base.concrete), 'round 11 raises concrete on both halves');
const elevenSplit = s => eleven.splits.find(x => x.split === s);
const rise = (s, d) => `${elevenSplit(s).base[d]} to ${elevenSplit(s).variant[d]}`;
g.def('RoundElevenConcreteTest', rise('test', 'concrete')).def('RoundElevenConcreteTrain', rise('train', 'concrete'))
  .def('RoundElevenChangedTest', String(elevenSplit('test').textsChanged)).def('RoundElevenChangedTrain', String(elevenSplit('train').textsChanged));
const DEFECT_LABEL = {
  lowercaseReveal: 'a later sentence of the retry reveal in lower case',
  recaptureOutright: "a recapture called a win ``outright''",
  quietForcing: "a capture or a check called ``a quiet improvement''",
  unsettledVsOutright: "``too short or unsettled'' beside a capture the card calls outright",
  pieceOverAmount: 'a lost piece worth more than the amount named',
};
const D = eleven.defects;
claim(D && Object.keys(D.base).every(d => DEFECT_LABEL[d]), 'round 11 counts the five defects the paper names');
const total = counts => Object.values(counts).reduce((n, x) => n + x, 0);
claim(total(D.base) > 0 && total(D.variant) === 0, 'round 11 removes every defect it counts');
g.def('RoundElevenDefects', String(total(D.base)));
g.block('DefectsTable', [
  '\\begin{tabular}{l rr}', '\\toprule', 'defect & v10 & v11 \\\\', '\\midrule',
  ...Object.keys(D.base).map(d => `${DEFECT_LABEL[d]} & ${D.base[d]} & ${D.variant[d]} \\\\`),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));

// ---- round 12: what the natural defense costs, on documents rebuilt for it at round 11's code
const twelve = rebuilt.get('v12');
claim(twelve?.sameMoments && twelve.gradesEqual, "round 12's grades equal its base's on the documents rebuilt for it");
const twelveSplit = s => twelve.splits.find(x => x.split === s);
const jsonl = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const twelveBase = new Map(jsonl(join(flow, 'v12', 'rebuilt', 'base.results.jsonl')).map(m => [m.id, m]));
const twelveChanged = jsonl(join(flow, 'v12', 'rebuilt', 'v12.results.jsonl')).filter(m => m.textHash !== twelveBase.get(m.id)?.textHash);
claim(twelveChanged.length > 0 && twelveChanged.every(m => m.faithful === 1 && m.faithfulAll === 1), 'every moment round 12 changes is graded faithful');
const r12 = judgeOf.get('12');
claim(r12?.keepByRule, 'the judge preferred round 12 on both halves');
g.def('RoundTwelveChangedTest', String(twelveSplit('test').textsChanged)).def('RoundTwelveChangedTrain', String(twelveSplit('train').textsChanged))
  .def('RoundTwelveTrainNew', String(r12.tally.train.new)).def('RoundTwelveTrainOld', String(r12.tally.train.old))
  .def('RoundTwelveTestNew', String(r12.tally.test.new)).def('RoundTwelveTestOld', String(r12.tally.test.old));
// What the judge held against it: the moves the defense sentence shows, against both runs' answers.
const SHORT = 4;
const DEFENSE = /if (?:they|you) (?:move the \w+ \([^)]+\)|block with [^,]+), (?:([^,;]+?), and (?:you|they) have won|(?:([^,;]+?), then )?(\S+) is mate)/;
{
  const dir = join(judgeDir, 'round12');
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const tallies = { short: { new: 0, old: 0 }, long: { new: 0, old: 0 } };
  for (const item of read(join(dir, 'items-r1.json')).items) {
    const after = keys[0][item.id].X === 'new' ? item.versionX : item.versionY;
    const m = after.map(x => x.text).join(' ').match(DEFENSE);
    if (!m) throw new Error('round 12: a judged moment without its defense sentence');
    const shown = (m[1] ?? [m[2] ?? '', m[3]].join(' ')).trim().split(/\s+/).length;
    const t = tallies[shown <= SHORT ? 'short' : 'long'];
    for (const i of [0, 1]) {
      const c = answers[i].get(item.id);
      if (c === 'X' || c === 'Y') t[keys[i][item.id][c]] += 1;
    }
  }
  const share = t => t.new / (t.new + t.old);
  claim(share(tallies.short) > share(tallies.long), 'the judge preferred round 12\'s short defense lines more often than its long ones');
  g.def('RoundTwelveShortMax', String(SHORT)).def('RoundTwelveLongMin', String(SHORT + 1))
    .def('RoundTwelveShortNew', String(tallies.short.new)).def('RoundTwelveShortOld', String(tallies.short.old))
    .def('RoundTwelveLongNew', String(tallies.long.new)).def('RoundTwelveLongOld', String(tallies.long.old));
}

// ---- the judge's controls, as reproduce.mjs recomputed them
const c = repro.controls;
claim(c.length.matchesRecorded, 'the length check recomputed from its answers matches the score the records keep');
claim(!c.length.J1.inventsDifferences, 'the judge answers "same" to the same text on both sides');
claim(!c.length.J2.lengthBiased, 'the judge is not length-biased');
claim(Object.values(c.length.J3).every(r => r.survives), "every round's longer text survives a decoy of its own length");
claim(c.padding.every(p => !p.drifted), 'no round\'s padding control found the judge drifting toward length');
g.def('LongerPicked', String(c.longer.longer)).def('LongerDecided', String(c.longer.decided)).def('LongerRounds', esc(listed(c.longer.rounds)))
  .def('LengthItems', String(c.length.items)).def('LengthBatches', String(c.length.batches))
  .def('LengthRounds', esc(listed(Object.keys(c.length.J3).map(r => r.replace(/^round/, '')))))
  .def('LengthIdentitySame', String(c.length.J1.same)).def('LengthIdentityN', String(c.length.J1.n))
  .def('LengthPaddingDecoy', String(c.length.J2.decoy)).def('LengthPaddingN', String(c.length.J2.n));
const pad10 = c.padding.find(p => p.round === '10');
claim(pad10, 'round 10 carried a padding control');
g.def('PadTenDecoy', String(pad10.decoy)).def('PadTenN', String(pad10.comparisons));
const pad12 = c.padding.find(p => p.round === '12');
claim(pad12, 'round 12 carried a padding control');
g.def('PadTwelveDecoy', String(pad12.decoy)).def('PadTwelveN', String(pad12.comparisons));
const won = t => `${t.long} of ${t.long + t.decoy}`;
g.block('ControlsTable', [
  '\\begin{tabularx}{\\textwidth}{L l l}', '\\toprule', 'check & result & verdict \\\\', '\\midrule',
  `J1, the same text on both sides: answered \`\`same'' & ${c.length.J1.same} of ${c.length.J1.n} & ${c.length.J1.inventsDifferences ? 'invents differences' : "uses ``same''"} \\\\`,
  `J2, the shorter text against itself with filler: the decoy preferred & ${c.length.J2.decoy} of ${c.length.J2.n} (${c.length.J2.short} the shorter text, ${c.length.J2.same} same) & ${c.length.J2.lengthBiased ? 'length-biased' : 'not length-biased'} \\\\`,
  ...Object.entries(c.length.J3).map(([r, j]) => `J3, round ${esc(r.replace(/^round/, ''))}: the longer text against a decoy of its length & train ${won(j.train)}, test ${won(j.test)} & ${j.survives ? 'survives' : 'does not survive'} \\\\`),
  ...c.padding.map(p => `padding control, round ${esc(p.round)}: the decoy preferred & ${p.decoy} of ${p.comparisons} (${p.short} the shorter text, ${p.same} same) & ${p.drifted ? 'drifted toward length' : 'no drift'} \\\\`),
  '\\bottomrule', '\\end{tabularx}',
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
  { round: 'round10', want: 'new', has: 'an even trade' },
  { round: 'round12', want: 'new', has: 'if they move the' },
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
  // The defense sentence as the card shows it: up to the next point or the line beside it.
  if (round === 'round12') g.def('RoundTwelveQuote', esc(after.map(s => s.text).join(' ').match(/if (?:they|you) (?:move the|block with)[^;·]*/)[0].trim()));
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
  .def('RerunSearches', `the capture searches on it (${repro.rerun.probes.kept} kept)${repro.rerun.defenses ? ` and the defense searches (${repro.rerun.defenses.kept} kept)` : ''}`)
  .def('RerunEvidence', esc(repro.rerun.evidence.versions.join(', ')));
// How far the app the rerun measures has come: the kept rounds after the kept
// variant that it carries. "Through round N" needs them carried in order.
const later = state.rounds.map(r => r.variant).filter(v => kept.get(v) > kept.get(KEPT));
claim(later.every(v => typeof repro.chess.carries?.[v] === 'boolean'), `the reproduction says whether the pinned app carries each kept round after ${KEPT}`);
const carried = later.filter(v => repro.chess.carries[v]);
claim(carried.every((v, i) => v === later[i]), `the pinned app carries the kept rounds after ${KEPT} in order`);
const pending = later.slice(carried.length).map(v => String(kept.get(v)));
g.def('AppKeptThrough', String(kept.get(carried.at(-1) ?? KEPT)))
  .def('AppKeptSentence', pending.length
    ? `The app at that commit carries the kept rounds through round ${kept.get(carried.at(-1) ?? KEPT)}; ${pending.length > 1 ? 'rounds' : 'round'} ${listed(pending)} ${pending.length > 1 ? 'are' : 'is'} not in it yet.`
    : 'The app at that commit carries every kept round.');
for (const r of rr) {
  const S = Name(r.split);
  g.def(`Rerun${S}Moments`, String(r.momentsApp)).def(`Rerun${S}Shared`, String(r.sharedMoments)).def(`Rerun${S}SameGrades`, String(r.sharedSameGrades))
    .def(`Rerun${S}Faithful`, fixed(r.app.faithful.est, 1)).def(`Rerun${S}Concrete`, fixed(r.app.concrete.est, 1));
}
const REPRO_DIMS = ['faithful', 'concrete', 'named_deep', 'faithfulAll'];
claim(rr.every(r => REPRO_DIMS.every(d => r.app[d].est >= r.recordedKept[d].lo && r.app[d].est <= r.recordedKept[d].hi)), `every rate of the rerun lies within the recorded ${KEPT}'s interval`);
const fmt = x => `${fixed(x.est, 1)} [${fixed(x.lo, 1)}, ${fixed(x.hi, 1)}]`;
g.block('ReproTable', [
  '\\begin{tabular}{ll lll}', '\\toprule', 'split & grade & recorded baseline & recorded ' + KEPT + ' & pinned app, rerun \\\\', '\\midrule',
  ...rr.flatMap(r => REPRO_DIMS.map(d => `${r.split} & ${esc(d)} & ${fmt(r.recordedBaseline[d])} & ${fmt(r.recordedKept[d])} & ${fmt(r.app[d])} \\\\`)),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));

g.write(join(HERE, 'generated.tex'));
console.log(`wrote ${join(HERE, 'generated.tex')}: ${n} examples`);
