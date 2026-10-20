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
import { Chess } from 'chess.js';
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
// A round whose final texts are a lettered variant is decided on its first judging and its "b"
// judging together, or on its "b" judging alone when its first version failed before any judge
// ran (20b); a later letter changes nothing the judge reads (17c, the grade note's numbers).
const judgeKey = (round, variant) => (/^v\d+[b-z]$/.test(variant) ? (judgeOf.has(`${round} and ${round}b`) ? `${round} and ${round}b` : `${round}b`) : String(round));
const verdictOf = r => judgeOf.get(judgeKey(r.round, r.variant));
const unjudged = state.rounds.filter(r => !verdictOf(r)).map(r => r.round);
claim(unjudged.join() === '1,2,11,14,28', 'the judge read every kept round but rounds 1, 2, 11, 14 and 28');
claim(state.rounds.filter(verdictOf).every(r => verdictOf(r).keepByRule), 'every kept round the judge read was preferred on both halves');
claim(['5', '9', '13'].every(r => !judgeOf.get(r).keepByRule), 'the judge did not prefer rounds 5, 9 and 13');
const newShare = j => (j.tally.train.new + j.tally.test.new) / (j.tally.train.new + j.tally.train.old + j.tally.test.new + j.tally.test.old);
claim(['9', '13'].every(r => newShare(judgeOf.get(r)) < 0.1), 'rounds 9 and 13 were rejected nearly unanimously');
g.def('UnjudgedKept', listed(unjudged.map(String)));
// A round graded on documents rebuilt for it has no rates on the rounds' documents: its row points to its own table.
const rebuilt = new Map(repro.rebuilt.map(r => [r.variant, r]));
const roundOf = v => kept.get(v) ?? notKept.get(v);
for (const v of [...kept.keys(), ...notKept.keys()].filter(v => rebuilt.has(v) && !variants.includes(v)).sort((a, b) => roundOf(a) - roundOf(b))) {
  const judge = judgeOf.get(judgeKey(roundOf(v), v));
  // A lettered variant only rewords or corrects its round, whose own change names the idea,
  // unless that round's first version was not kept: then the variant's own change names it.
  const first = /^v\d+[b-z]$/.test(v) ? changeLine(v.slice(0, -1)) : null;
  const named = first && !/\(not kept\)$/.test(first) ? v.slice(0, -1) : v;
  roundRows.push(`${v} & ${esc(changeLine(named) ?? '')}${kept.has(v) ? '' : ' (\\emph{not kept})'} & \\multicolumn{5}{c}{\\emph{graded on rebuilt documents (Table~\\ref{tab:rebuilt})}} & ${tally(judge)} \\\\`);
}
// Two parts of one table, so that each fits on a page.
const roundsTable = rows => [
  '\\begin{tabularx}{\\textwidth}{l L rrrr r r}', '\\toprule',
  ' & & \\multicolumn{2}{c}{test (\\%)} & \\multicolumn{2}{c}{train (\\%)} & texts & judge \\\\',
  '\\cmidrule(lr){3-4}\\cmidrule(lr){5-6}',
  'variant & change & faithful & concrete & faithful & concrete & changed & train / test \\\\', '\\midrule',
  ...rows, '\\bottomrule', '\\end{tabularx}',
].join('\n');
const roundsHalf = Math.ceil(roundRows.length / 2);
g.block('RoundsTable', roundsTable(roundRows.slice(0, roundsHalf)));
g.block('RoundsTableTwo', roundsTable(roundRows.slice(roundsHalf)));

// ---- the judge rounds, as reproduce.mjs recomputed them
g.block('JudgeTable', [
  '\\begin{tabular}{l l rr l}', '\\toprule', 'round & judged & train & test & the rule says \\\\', '\\midrule',
  ...repro.judge.map(j => `${esc(j.round)} & ${esc(j.judged.replace(/round/g, 'round '))}${j.moments != null ? ` (${j.moments} moments)` : ''} & ${j.tally.train.new}--${j.tally.train.old} (${j.tally.train.same}) & ${j.tally.test.new}--${j.tally.test.old} (${j.tally.test.same}) & ${j.keepByRule ? 'keep' : 'do not keep'} \\\\`),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));
// ---- a round graded on documents rebuilt for it, beside its base on the same documents
const both = (s, d) => (s.base[d] === s.variant[d] ? String(s.variant[d]) : `${s.base[d]} / ${s.variant[d]}`);
// Two tables, the 60 games' and the endgame sets', the second in two parts, so that each fits on a page.
const rebuiltRow = (name, s) => `${name} & ${s.split} & ${s.moments} & ${DIMS.map(d => both(s, d)).join(' & ')} & ${s.textsChanged} \\\\`;
const rebuiltTable = (rows) => [
  '\\begin{tabular}{ll r rrrr r}', '\\toprule',
  'variant & split & moments & faithful & concrete & named\\_deep & faithfulAll & texts changed \\\\', '\\midrule',
  ...rows,
  '\\bottomrule', '\\end{tabular}',
].join('\n');
g.block('RebuiltTable', rebuiltTable(repro.rebuilt.flatMap(r => r.splits.map(s => rebuiltRow(r.variant, s)))));
g.block('RebuiltEndgameTable', rebuiltTable(repro.rebuilt.filter(r => r.endgames).flatMap(r => r.endgames.splits.map(s => rebuiltRow(r.variant, s)))));
g.block('RebuiltEndgameTwoTable', rebuiltTable(repro.rebuilt.filter(r => r.endgames2).flatMap(r => r.endgames2.splits.map(s => rebuiltRow(r.variant, s)))));
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

// ---- round 13: the defense sentence without its moves, on the reproduction's documents at the pinned app
const thirteen = rebuilt.get('v13');
claim(thirteen?.sameMoments && thirteen.gradesEqual, "round 13's grades equal its base's on the documents it was graded on");
const thirteenSplit = s => thirteen.splits.find(x => x.split === s);
const thirteenBase = new Map(jsonl(join(flow, 'v13', 'rebuilt', 'base.results.jsonl')).map(m => [m.id, m]));
const thirteenChanged = jsonl(join(flow, 'v13', 'rebuilt', 'v13.results.jsonl')).filter(m => m.textHash !== thirteenBase.get(m.id)?.textHash);
claim(thirteenChanged.length > 0 && thirteenChanged.every(m => m.faithful === 1 && m.faithfulAll === 1), 'every moment round 13 changes is graded faithful');
const r13 = judgeOf.get('13');
const cut = readFileSync(join(flow, 'v13', 'change.patch'), 'utf8').match(/^\+const DEFENSE_MOVES_SHOWN = (\d+)$/m);
claim(cut, "round 13's patch names how many moves the sentence still shows");
g.def('RoundThirteenChangedTest', String(thirteenSplit('test').textsChanged)).def('RoundThirteenChangedTrain', String(thirteenSplit('train').textsChanged))
  .def('RoundThirteenTrainNew', String(r13.tally.train.new)).def('RoundThirteenTrainOld', String(r13.tally.train.old))
  .def('RoundThirteenTestNew', String(r13.tally.test.new)).def('RoundThirteenTestOld', String(r13.tally.test.old))
  .def('RoundThirteenCut', cut[1]);
// Its two cases, the characters it cut, and how often the line it points to
// ends before the gain: the sentence stops at the ply after its last move, and
// the lesson prints the better line beside it.
{
  const dir = join(judgeDir, 'round13');
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const POINTER = "as in the engine's line";
  const cases = { pointer: { new: 0, old: 0, n: 0, past: 0 }, long: { new: 0, old: 0, n: 0 } };
  const cuts = [], quote = {};
  const text = v => v.map(x => x.text).join(' ');
  for (const item of read(join(dir, 'items-r1.json')).items) {
    const newIsX = keys[0][item.id].X === 'new';
    const [after, before] = newIsX ? [item.versionX, item.versionY] : [item.versionY, item.versionX];
    const sentence = text(after).match(/if (?:they|you) (?:move the|block with)[^;·]*/)?.[0].trim();
    if (!sentence) throw new Error('round 13: a judged moment without its defense sentence');
    const kind = sentence.includes(POINTER) ? 'pointer' : 'long';
    const t = cases[kind];
    t.n += 1;
    quote[kind] ??= sentence;
    for (const i of [0, 1]) {
      const c = answers[i].get(item.id);
      if (c === 'X' || c === 'Y') t[keys[i][item.id][c]] += 1;
    }
    cuts.push(text(before).length - text(after).length);
    if (kind === 'pointer') {
      const section = before.find(x => / does instead$/.test(x.heading));
      const m = section?.text.match(DEFENSE);
      if (!m?.[1]) throw new Error("round 13: a pointed-to line without round 12's moves");
      const shown = m[1].trim().split(/\s+/).length;
      const printed = section.text.split(' · ').at(-1).trim().split(/\s+/).length;
      if (shown + 2 > printed) t.past += 1;
    }
  }
  claim(cases.pointer.old > cases.pointer.new && cases.long.old > cases.long.new, 'the judge preferred round 12\'s sentence in both of round 13\'s cases');
  claim(cases.pointer.past > 0, 'some sentences point to a gain after the moves the lesson prints');
  cuts.sort((a, b) => a - b);
  const median = (cuts[(cuts.length - 1) >> 1] + cuts[cuts.length >> 1]) / 2;
  claim(median > 0, 'round 13 shortened its texts');
  g.def('RoundThirteenPointerNew', String(cases.pointer.new)).def('RoundThirteenPointerOld', String(cases.pointer.old))
    .def('RoundThirteenLongNew', String(cases.long.new)).def('RoundThirteenLongOld', String(cases.long.old))
    .def('RoundThirteenPointerCases', String(cases.pointer.n)).def('RoundThirteenPastLine', String(cases.pointer.past))
    .def('RoundThirteenMedianCut', String(Math.round(median))).def('RoundThirteenGrew', String(cuts.filter(x => x < 0).length))
    .def('RoundThirteenJudged', String(cuts.length))
    .def('RoundThirteenQuotePointer', esc(quote.pointer)).def('RoundThirteenQuoteLong', esc(quote.long));
}

// ---- round 14: an amount in the pieces it is made of, on the documents round 13 was graded on
const fourteen = rebuilt.get('v14');
claim(fourteen?.sameMoments && fourteen.gradesEqual, "round 14's grades equal its base's on the documents it was graded on");
const fourteenSplit = s => fourteen.splits.find(x => x.split === s);
const AMOUNT_DEFECT_LABEL = {
  amountNamesUnwon: 'an amount that names pieces other than the ones that changed hands',
  fallenGivenBack: 'a piece said to fall that the line gives back',
};
const F = fourteen.defects;
claim(F && Object.keys(F.base).every(d => DEFECT_LABEL[d] || AMOUNT_DEFECT_LABEL[d]), 'round 14 counts the defects the paper names');
claim(Object.keys(AMOUNT_DEFECT_LABEL).every(d => F.base[d] > 0 && F.variant[d] === 0), 'round 14 removes both defects it counts');
claim(Object.keys(DEFECT_LABEL).every(d => F.base[d] === 0 && F.variant[d] === 0), "none of round 11's defects appears in round 14's texts or its base's");
const fourteenDefects = read(join(flow, 'v14', 'defects.json'));
const defectMoments = new Set(Object.keys(AMOUNT_DEFECT_LABEL).flatMap(d => fourteenDefects.base.moments[d]));
const fourteenBase = new Map(jsonl(join(flow, 'v14', 'rebuilt', 'base.results.jsonl')).map(m => [m.id, m]));
const fourteenChanged = jsonl(join(flow, 'v14', 'rebuilt', 'v14.results.jsonl')).filter(m => m.textHash !== fourteenBase.get(m.id)?.textHash);
claim(fourteenChanged.length === defectMoments.size && fourteenChanged.every(m => defectMoments.has(m.id)), 'round 14 changes the texts of its defect moments and no other');
const fourteenPatch = readFileSync(join(flow, 'v14', 'change.patch'), 'utf8');
claim(['they win a bishop for two pawns', 'limits the loss to a rook for a pawn', "a pawn's worth of material"].every(q => fourteenPatch.includes(q)), "round 14's tests pin the phrases the paper quotes");
g.def('RoundFourteenChangedTest', String(fourteenSplit('test').textsChanged)).def('RoundFourteenChangedTrain', String(fourteenSplit('train').textsChanged))
  .def('RoundFourteenAmountMoments', String(F.base.amountNamesUnwon)).def('RoundFourteenFallenMoments', String(F.base.fallenGivenBack))
  .def('RoundFourteenDefectMoments', String(defectMoments.size));
const roundElevenKinds = counts => Object.keys(DEFECT_LABEL).reduce((n, d) => n + counts[d], 0);
g.block('DefectsFourteenTable', [
  '\\begin{tabular}{l rr}', '\\toprule', 'defect & base & v14 \\\\', '\\midrule',
  ...Object.keys(AMOUNT_DEFECT_LABEL).map(d => `${AMOUNT_DEFECT_LABEL[d]} & ${F.base[d]} & ${F.variant[d]} \\\\`),
  `the five of Table~\\ref{tab:defects} & ${roundElevenKinds(F.base)} & ${roundElevenKinds(F.variant)} \\\\`,
  '\\bottomrule', '\\end{tabular}',
].join('\n'));

// ---- round 15: what a quiet reply defends, on the documents round 14 was graded on, at the pinned app's texts
const fifteen = rebuilt.get('v15');
claim(fifteen?.sameMoments, "round 15 was graded on its base's moments");
const fifteenSplit = s => fifteen.splits.find(x => x.split === s);
claim(['train', 'test'].every(s => DIMS.every(d => fifteenSplit(s).variant[d] >= fifteenSplit(s).base[d])), 'no grade falls with round 15 on either half');
claim(['train', 'test'].every(s => fifteenSplit(s).variant.concrete > fifteenSplit(s).base.concrete), 'round 15 raises concrete on both halves');
const fifteenBase = new Map(jsonl(join(flow, 'v15', 'rebuilt', 'base.results.jsonl')).map(m => [m.id, m]));
const fifteenChanged = jsonl(join(flow, 'v15', 'rebuilt', 'v15.results.jsonl')).filter(m => m.textHash !== fifteenBase.get(m.id)?.textHash);
claim(fifteenChanged.length > 0 && fifteenChanged.every(m => m.faithful === 1 && m.faithfulAll === 1), 'every moment round 15 changes is graded faithful');
const fifteenPatch = readFileSync(join(flow, 'v15', 'change.patch'), 'utf8');
claim(['it moves the rook off e5, where dxe5 would have won it', 'it guards the pawn on e4, which Nxe4 would have won', 'it takes away the check Qd3 would have given', 'it guards the pawn on b5, which Rd5 attacked'].every(q => fifteenPatch.includes(q)), "round 15's tests pin the phrases the paper quotes");
const r15 = judgeOf.get('15');
claim(r15?.keepByRule, 'the judge preferred round 15 on both halves');
{
  const dir = join(judgeDir, 'round15');
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const notBoth = Object.keys(keys[0]).filter(id => ![0, 1].every(i => keys[i][id][answers[i].get(id)] === 'new')).length;
  claim(notBoth === 1, 'one moment of round 15 was not preferred in both runs');
}
g.def('RoundFifteenChangedTest', String(fifteenSplit('test').textsChanged)).def('RoundFifteenChangedTrain', String(fifteenSplit('train').textsChanged))
  .def('RoundFifteenConcreteBaseTest', String(fifteenSplit('test').base.concrete)).def('RoundFifteenConcreteTest', String(fifteenSplit('test').variant.concrete))
  .def('RoundFifteenConcreteBaseTrain', String(fifteenSplit('train').base.concrete)).def('RoundFifteenConcreteTrain', String(fifteenSplit('train').variant.concrete))
  .def('RoundFifteenTrainNew', String(r15.tally.train.new)).def('RoundFifteenTrainOld', String(r15.tally.train.old)).def('RoundFifteenTrainSame', String(r15.tally.train.same))
  .def('RoundFifteenTestNew', String(r15.tally.test.new)).def('RoundFifteenTestOld', String(r15.tally.test.old));

// ---- round 16: an endgame's passed pawns, on the documents round 15 was graded on and on the endgame set
const sixteen = rebuilt.get('v16');
claim(sixteen?.sameMoments && sixteen.endgames?.sameMoments, "round 16 was graded on its base's moments in both sets");
const sixteenSets = [[sixteen, join(flow, 'v16', 'rebuilt')], [sixteen.endgames, join(flow, 'v16', 'rebuilt', 'endgames')]];
claim(sixteenSets.every(([set]) => set.splits.every(x => DIMS.every(d => x.variant[d] >= x.base[d]))), 'no grade falls with round 16 in either set or half');
const sixteenMoments = sixteenSets.map(([, dir]) => {
  const before = new Map(jsonl(join(dir, 'base.results.jsonl')).map(m => [m.id, m]));
  const after = jsonl(join(dir, 'v16.results.jsonl'));
  return {
    changed: after.filter(m => m.textHash !== before.get(m.id)?.textHash),
    fell: after.filter(m => DIMS.some(d => Number(m[d]) < Number(before.get(m.id)[d]))),
    rose: after.filter(m => Number(m.concrete) > Number(before.get(m.id).concrete)),
  };
});
claim(sixteenMoments.every(x => x.fell.length === 0), 'no moment loses a grade with round 16');
claim(sixteenMoments.every(x => x.changed.length > 0 && x.changed.every(m => m.faithful === 1 && m.faithfulAll === 1)), 'every moment round 16 changes, in both sets, is graded faithful');
const sixteenPatch = readFileSync(join(flow, 'v16', 'change.patch'), 'utf8');
claim(['Nxb6 takes it first.', 'After Rc3 it falls (Rxh2)', 'it blocks their passed b-pawn on b7', 'your king walks over to their c-pawn: Kb2, Kc3 and Kxc4', 'goes on to queen'].every(q => sixteenPatch.includes(q)), "round 16's tests pin the phrases the paper quotes");
const r16 = judgeOf.get('16');
claim(r16?.keepByRule, 'the judge preferred round 16 on both halves');
{
  const dir = join(judgeDir, 'round16');
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdict = (i, id) => { const choice = answers[i].get(id); return choice === 'same' ? 'same' : keys[i][id][choice]; };
  const oldBoth = Object.keys(keys[0]).filter(id => [0, 1].every(i => verdict(i, id) === 'old')).length;
  claim(oldBoth === 2, 'two moments of round 16 lost both runs');
  g.def('RoundSixteenOldBothCap', Cap(word(oldBoth)));
}
const sixteenSplit = (set, s) => set.splits.find(x => x.split === s);
const E = sixteen.endgames;
g.def('EndgameGames', String(E.games.train + E.games.test)).def('EndgameGamesTrain', String(E.games.train)).def('EndgameGamesTest', String(E.games.test))
  .def('EndgameMoments', String(sixteenSplit(E, 'train').moments + sixteenSplit(E, 'test').moments))
  .def('EndgameMomentsTrain', String(sixteenSplit(E, 'train').moments)).def('EndgameMomentsTest', String(sixteenSplit(E, 'test').moments))
  .def('RoundSixteenChangedEndgameTrain', String(sixteenSplit(E, 'train').textsChanged)).def('RoundSixteenChangedEndgameTest', String(sixteenSplit(E, 'test').textsChanged))
  .def('RoundSixteenChangedSixtyTrain', String(sixteenSplit(sixteen, 'train').textsChanged)).def('RoundSixteenChangedSixtyTest', String(sixteenSplit(sixteen, 'test').textsChanged))
  .def('RoundSixteenRose', word(sixteenMoments.reduce((n, x) => n + x.rose.length, 0)))
  .def('RoundSixteenTrainNew', String(r16.tally.train.new)).def('RoundSixteenTrainOld', String(r16.tally.train.old)).def('RoundSixteenTrainSame', String(r16.tally.train.same))
  .def('RoundSixteenTestNew', String(r16.tally.test.new)).def('RoundSixteenTestOld', String(r16.tally.test.old)).def('RoundSixteenTestSame', String(r16.tally.test.same));

// ---- round 17: where each move leaves the game, on round 16's documents and the endgame set, judged on a seeded sample
const seventeen = rebuilt.get('v17b'), seventeenFirst = rebuilt.get('v17');
claim([seventeen, seventeenFirst].every(r => r?.sameMoments && r.gradesEqual && r.endgames?.sameMoments && r.endgames.gradesEqual), "round 17's grades equal its base's in both sets, in its first wording and its last");
const seventeenSplit = (set, s) => set.splits.find(x => x.split === s);
const changedOf = (r, s) => seventeenSplit(r, s).textsChanged + seventeenSplit(r.endgames, s).textsChanged;
claim(['train', 'test'].every(s => changedOf(seventeen, s) === changedOf(seventeenFirst, s)), 'round 17b changes the texts of the moments round 17 changed');
const seventeenPatch = readFileSync(join(flow, 'v17', 'change.patch'), 'utf8');
// The sentences the paper quotes, as round 17's tests pin them, with a real minus sign.
const SEVENTEEN_QUOTES = {
  Behind: 'You are behind either way: losing after Rb5 (-8.1), much worse after Rxb2+ (-4.4).',
  Ahead: 'You stay ahead either way: much better after Re7 (+4.1), winning after Rdf1 (+5.0).',
  Crossing: 'After Kg4 you are losing (-7.0). After Nxb6 you would be winning (+7.0).',
};
claim(Object.values(SEVENTEEN_QUOTES).every(q => seventeenPatch.includes(q)), "round 17's tests pin the sentences the paper quotes");
for (const [k, q] of Object.entries(SEVENTEEN_QUOTES)) g.def(`RoundSeventeenQuote${k}`, esc(q.replace(/\(-(\d)/g, '(−$1')));
const r17 = judgeOf.get('17'), r17b = judgeOf.get('17b'), r17final = judgeOf.get('17 and 17b');
claim(r17?.keepByRule && r17final?.keepByRule, 'the judge preferred round 17 on both halves, in its first wording and its last');
claim(r17final.sample.reproduced, "round 17's sample is the seeded draw from the moments it changed");
claim(r17final.sample.of === changedOf(seventeen, 'train') + changedOf(seventeen, 'test'), "round 17's sample was drawn from every moment it changed");
claim([r17, r17b, r17final].every(j => j.tally.train.old === 0 && j.tally.test.old === 0), 'no judge of round 17 preferred the old text');
{
  // The same-answers on the final texts, each judged moment counted by the last round that read it.
  const counted = new Set(read(join(judgeDir, 'round17', 'sample.json')).counted);
  const dirs = ['round17', 'round17b'];
  const owner = new Map(dirs.flatMap(d => Object.keys(read(join(judgeDir, d, 'key-r1.json'))).map(id => [id, d])));
  const sames = [];
  for (const d of dirs) for (const r of ['r1', 'r2']) {
    const key = read(join(judgeDir, d, `key-${r}.json`));
    const items = new Map(read(join(judgeDir, d, `items-${r}.json`)).items.map(i => [i.id, i]));
    for (const a of read(join(judgeDir, d, `out-${r}.judge.json`)).answers) {
      if (owner.get(a.id) !== d || !counted.has(a.id) || a.choice !== 'same') continue;
      const item = items.get(a.id);
      const after = key[a.id].X === 'new' ? item.versionX : item.versionY;
      sames.push({ run: r, eitherWay: after.some(x => x.heading === 'The difference' && /either way:/.test(x.text)) });
    }
  }
  claim(sames.length === r17final.tally.train.same + r17final.tally.test.same, "round 17's same-answers are counted once each");
  claim(sames.every(x => x.eitherWay), "every same-answer on round 17's final texts is on the either-way form");
  claim(sames.every(x => x.run === 'r2'), "every same-answer on round 17's final texts came from the second run");
}
const extras = r17final.sample.extrasTally;
g.def('RoundSeventeenChanged', String(changedOf(seventeen, 'train') + changedOf(seventeen, 'test')))
  .def('RoundSeventeenChangedTrain', String(changedOf(seventeen, 'train'))).def('RoundSeventeenChangedTest', String(changedOf(seventeen, 'test')))
  .def('RoundSeventeenSampled', String(r17final.sample.drawn)).def('RoundSeventeenPer', String(r17final.sample.per)).def('RoundSeventeenSeed', String(r17final.sample.seed))
  .def('RoundSeventeenRejudged', String(r17b.sample.judged))
  .def('RoundSeventeenExtras', word(r17final.sample.extras))
  .def('RoundSeventeenExtrasNew', String(extras.train.new + extras.test.new))
  .def('RoundSeventeenExtrasN', String(['new', 'old', 'same'].reduce((n, k) => n + extras.train[k] + extras.test[k], 0)))
  .def('RoundSeventeenFirstTrainNew', String(r17.tally.train.new)).def('RoundSeventeenFirstTrainSame', String(r17.tally.train.same))
  .def('RoundSeventeenFirstTestNew', String(r17.tally.test.new)).def('RoundSeventeenFirstTestSame', String(r17.tally.test.same))
  .def('RoundSeventeenTrainNew', String(r17final.tally.train.new)).def('RoundSeventeenTrainOld', String(r17final.tally.train.old)).def('RoundSeventeenTrainSame', String(r17final.tally.train.same))
  .def('RoundSeventeenTestNew', String(r17final.tally.test.new)).def('RoundSeventeenTestOld', String(r17final.tally.test.old)).def('RoundSeventeenTestSame', String(r17final.tally.test.same));

// ---- round 17c: the grade note's numbers, on round 17's documents in both sets
const seventeenC = rebuilt.get('v17c');
claim(seventeenC?.sameMoments && seventeenC.gradesEqual && seventeenC.endgames?.sameMoments && seventeenC.endgames.gradesEqual, "round 17c's grades equal round 17b's in both sets");
const C = seventeenC.defects;
claim(C?.endgames, 'round 17c counts its defect in both sets');
claim(C.base.gradeScoreDiffers > 0 && C.endgames.base.gradeScoreDiffers > 0 && C.variant.gradeScoreDiffers === 0 && C.endgames.variant.gradeScoreDiffers === 0, 'round 17c removes its defect from both sets');
claim(Object.keys(C.base).every(d => d === 'gradeScoreDiffers' || (C.base[d] === C.variant[d] && C.endgames.base[d] === C.endgames.variant[d])), "round 17c changes no other defect's count");
const seventeenCPatch = readFileSync(join(flow, 'v17c', 'change.patch'), 'utf8');
claim(/^\+.*\bevalFor\(score, mover\)/m.test(seventeenCPatch) && /^-.*\.toFixed\(1\)/m.test(seventeenCPatch), "round 17c's patch replaces the note's toFixed with evalFor");
g.def('RoundSeventeenCDefectsGames', String(C.base.gradeScoreDiffers)).def('RoundSeventeenCDefectsEnd', String(C.endgames.base.gradeScoreDiffers))
  .def('RoundSeventeenCDefects', String(C.base.gradeScoreDiffers + C.endgames.base.gradeScoreDiffers))
  .def('RoundSeventeenCChanged', String(changedOf(seventeenC, 'train') + changedOf(seventeenC, 'test')));

// ---- round 18: a check with a reason, on round 17's documents, every key moment of the endgame set and a second endgame set
const eighteen = rebuilt.get('v18');
const eighteenSets = [eighteen, eighteen?.endgames, eighteen?.endgames2];
claim(eighteenSets.every(r => r?.sameMoments && r.gradesEqual), "round 18's grades equal its base's in all three sets");
const splitOf = (set, s) => set.splits.find(x => x.split === s);
const momentsOf = set => splitOf(set, 'train').moments + splitOf(set, 'test').moments;
const eighteenChanged = s => eighteenSets.reduce((n, set) => n + splitOf(set, s).textsChanged, 0);
const EIGHTEEN_QUOTE = 'Rd8+ is a check with a reason: after Kh7, their king no longer guards f8, and Rf8 follows.';
claim([EIGHTEEN_QUOTE, 'and Rxf1+ takes the rook there.'].every(q => readFileSync(join(flow, 'v18', 'change.patch'), 'utf8').includes(q)), "round 18's tests pin the phrases the paper quotes");
claim(momentsOf(eighteen.endgames) > momentsOf(sixteen.endgames), 'round 18 reads more of the endgame set than its endgame moments');
const r18 = judgeOf.get('18');
claim(r18?.keepByRule, 'the judge preferred round 18 on both halves');
{
  const dir = join(judgeDir, 'round18');
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  claim(items.length === eighteenChanged('train') + eighteenChanged('test'), 'the judges read every moment round 18 changed');
  const REASON = / is a check with a reason: after \S+, (?:their|your) king no longer guards ([a-h][1-8]), and /;
  // The king's guard held nothing where, after the check, another of the mover's pieces covered the square and the piece that lands there is not a king.
  const heldNothing = new Set(items.filter(item => {
    const after = keys[0][item.id].X === 'new' ? item.versionX : item.versionY;
    const square = after.find(x => x.heading === 'The difference')?.text.match(REASON)?.[1];
    if (!square) throw new Error('round 18: a judged moment without its sentence');
    const [check, reply, next] = sansOf(item.engine.bestLine);
    const position = new Chess(item.fenBefore);
    const given = position.move(check);
    const covers = position.attackers(square, given.color);
    position.move(reply);
    const lands = position.move(next);
    return lands.to === square && lands.piece !== 'k' && covers.some(from => from !== lands.from);
  }).map(item => item.id));
  const against = Object.keys(keys[0]).filter(id => [0, 1].some(i => keys[i][id][answers[i].get(id)] === 'old'));
  claim(r18.tally.train.old + r18.tally.test.old === 1, 'the judges gave one answer against round 18');
  claim(heldNothing.size > 0 && against.length === 1 && heldNothing.has(against[0]), "the answer against round 18 is on a sentence whose king's guard held nothing");
  g.def('RoundEighteenHeldNothing', word(heldNothing.size)).def('RoundEighteenJudged', String(items.length));
}
const E2 = eighteen.endgames2;
g.def('EndgameTwoGames', String(E2.games.train + E2.games.test)).def('EndgameTwoGamesTrain', String(E2.games.train)).def('EndgameTwoGamesTest', String(E2.games.test))
  .def('EndgameTwoMoments', String(momentsOf(E2))).def('EndgameAllMoments', String(momentsOf(eighteen.endgames)))
  .def('RoundEighteenQuote', esc(EIGHTEEN_QUOTE))
  .def('RoundEighteenChangedTrain', String(eighteenChanged('train'))).def('RoundEighteenChangedTest', String(eighteenChanged('test')))
  .def('RoundEighteenTrainNew', String(r18.tally.train.new)).def('RoundEighteenTrainOld', String(r18.tally.train.old))
  .def('RoundEighteenTestNew', String(r18.tally.test.new)).def('RoundEighteenTestOld', String(r18.tally.test.old));

// ---- rounds 19 and 20b: the moments a judged round's sentence names, read from its judge items
const judgedRound = (round, re) => {
  const dir = join(judgeDir, round);
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const sentence = item => {
    const after = keys[0][item.id].X === 'new' ? item.versionX : item.versionY;
    const m = after.find(x => x.heading === 'The difference')?.text.match(re);
    if (!m) throw new Error(`${round}: a judged moment without its sentence`);
    return m;
  };
  const against = Object.keys(keys[0]).filter(id => [0, 1].some(i => keys[i][id][answers[i].get(id)] === 'old'));
  return { items, sentence, against };
};
const changedIn = (sets, s) => sets.reduce((n, set) => n + splitOf(set, s).textsChanged, 0);
const sampledDefs = (name, j, sets) => g.def(`${name}Changed`, String(changedIn(sets, 'train') + changedIn(sets, 'test')))
  .def(`${name}ChangedTrain`, String(changedIn(sets, 'train'))).def(`${name}ChangedTest`, String(changedIn(sets, 'test')))
  .def(`${name}Sampled`, String(j.sample.drawn)).def(`${name}Per`, String(j.sample.per)).def(`${name}Seed`, String(j.sample.seed))
  .def(`${name}TrainNew`, String(j.tally.train.new)).def(`${name}TrainOld`, String(j.tally.train.old))
  .def(`${name}TestNew`, String(j.tally.test.new)).def(`${name}TestOld`, String(j.tally.test.old));
const sampledFully = (j, sets) => j?.sample?.reproduced && j.sample.of === changedIn(sets, 'train') + changedIn(sets, 'test') && j.sample.judged === j.sample.drawn && j.sample.extras === 0;

// ---- round 19: the guard a played move gives up, on round 18's three sets, judged on a seeded sample
const nineteen = rebuilt.get('v19');
const nineteenSets = [nineteen, nineteen?.endgames, nineteen?.endgames2];
claim(nineteenSets.every(r => r?.sameMoments && r.gradesEqual), "round 19's grades equal its base's in all three sets");
const NINETEEN_QUOTES = { Quote: 'After Qe1, your queen no longer guards d3, and Rxd3 takes the bishop there.', QuoteKing: 'After Kc1, your king no longer guards c3, and Kc3 follows.' };
claim(Object.values(NINETEEN_QUOTES).every(q => readFileSync(join(flow, 'v19', 'change.patch'), 'utf8').includes(q)), "round 19's tests pin the sentences the paper quotes");
const r19 = judgeOf.get('19');
claim(r19?.keepByRule, 'the judge preferred round 19 on both halves');
claim(sampledFully(r19, nineteenSets), "round 19's judges read the whole seeded draw from every moment it changed");
{
  const { items, sentence, against } = judgedRound('round19', /After \S+, (?:their|your) \w+ no longer guards ([a-h][1-8]), and /);
  // The better move leaves the square unguarded too where, after it, nothing of the mover's attacks the square.
  const bothLeave = new Set(items.filter(item => {
    const square = sentence(item)[1];
    const position = new Chess(item.fenBefore);
    const mover = position.turn();
    position.move(sansOf(item.engine.bestLine)[0]);
    return position.attackers(square, mover).length === 0;
  }).map(item => item.id));
  claim(items.length === r19.sample.judged, 'the judge items of round 19 are its judged moments');
  claim(r19.tally.train.old + r19.tally.test.old === 1 && against.length === 1, 'the judges gave one answer against round 19');
  claim(bothLeave.has(against[0]), 'the answer against round 19 is on a sentence whose better move leaves the square unguarded too');
  g.def('RoundNineteenBothLeave', word(bothLeave.size)).def('RoundNineteenJudged', String(items.length));
}
for (const [k, q] of Object.entries(NINETEEN_QUOTES)) g.def(`RoundNineteen${k}`, esc(q));
sampledDefs('RoundNineteen', r19, nineteenSets);

// ---- round 20: the chased piece that escapes, on round 19's three sets; its first version failed its
// grades before any judge ran, and its variant 20b is the round judged, on a seeded sample
const twenty = rebuilt.get('v20b');
const twentySets = [twenty, twenty?.endgames, twenty?.endgames2];
claim(twentySets.every(r => r?.sameMoments), "round 20b was graded on every moment of round 19's three sets");
claim(/\bv20 failed its grades on one test moment\b/.test(state.rounds.find(r => r.variant === 'v20b')?.why ?? ''), 'round 20 failed its grades on one test moment');
{
  const jsonlOf = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  let up = 0, other = 0, down = 0;
  for (const sub of [[], ['endgames'], ['endgames2']]) {
    const [before, after] = ['base', 'v20b'].map(v => new Map(jsonlOf(join(flow, 'v20b', 'rebuilt', ...sub, `${v}.results.jsonl`)).map(m => [m.id, m])));
    for (const [id, m] of after) for (const d of DIMS) {
      const x = Number(before.get(id)[d]), y = Number(m[d]);
      if (y < x) down++;
      else if (y > x) d === 'concrete' ? up++ : other++;
    }
  }
  claim(down === 0 && other === 0 && up > 0, 'round 20b lowers no grade and raises only concrete');
  g.def('RoundTwentyConcreteUp', String(up));
}
const TWENTY_QUOTES = { Quote: 'Ne5 attacks their bishop on g4, but it escapes to f5, where it attacks your queen on d3.', QuoteTakes: 'Nf3 attacks their queen on h4, but it escapes by taking your bishop on f4.' };
claim(Object.values(TWENTY_QUOTES).every(q => readFileSync(join(flow, 'v20b', 'change.patch'), 'utf8').includes(q)), "round 20b's tests pin the sentences the paper quotes");
const r20 = judgeOf.get('20b');
claim(r20?.keepByRule, 'the judge preferred round 20b on both halves');
claim(sampledFully(r20, twentySets), "round 20b's judges read the whole seeded draw from every moment it changed");
{
  const { items, sentence, against } = judgedRound('round20b', /attacks (?:their|your) \w+ on ([a-h][1-8]), but it escapes (?:to ([a-h][1-8])|by taking (?:their|your) \w+ on ([a-h][1-8]))/);
  const WORTH = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  // The escape hands the piece back where the mover can take it at once on its new square: nothing of
  // theirs guards the square, or something of the mover's worth less than the piece attacks it.
  const hangs = new Set(items.filter(item => {
    const [, from, to, takenOn] = sentence(item);
    const position = new Chess(item.fenBefore);
    const played = position.move(sansOf(item.move)[0]);
    const escape = position.move({ from, to: to ?? takenOn });
    const guarded = position.attackers(escape.to, escape.color).length > 0;
    return position.attackers(escape.to, played.color).map(sq => position.get(sq))
      .some(p => !guarded || (p.type !== 'k' && WORTH[p.type] < WORTH[escape.piece]));
  }).map(item => item.id));
  claim(items.length === r20.sample.judged, 'the judge items of round 20b are its judged moments');
  claim(against.length === 3, 'the judges held three moments against round 20b');
  claim(against.filter(id => hangs.has(id)).length === 2, 'two of the moments held against round 20b are escapes the mover can take at once');
  g.def('RoundTwentyHangs', word(hangs.size)).def('RoundTwentyJudged', String(items.length));
}
for (const [k, q] of Object.entries(TWENTY_QUOTES)) g.def(`RoundTwenty${k}`, esc(q));
sampledDefs('RoundTwenty', r20, twentySets);

// ---- round 21: the pawn ending a trade leads to, on round 20's three sets; its seeded draw takes every moment it changed
const twentyOne = rebuilt.get('v21');
const twentyOneSets = [twentyOne, twentyOne?.endgames, twentyOne?.endgames2];
claim(twentyOneSets.every(r => r?.sameMoments && r.gradesEqual), "round 21's grades equal its base's in all three sets");
const TWENTY_ONE_QUOTES = { Quote: "After Qxg1+ Kxg1, only kings and pawns are left: in the engine's line your king takes their pawns on h4 and g2, and their king takes your pawn on e3.", QuoteDraw: 'After Qxh2+ Kxh2, only the kings are left: a draw.' };
claim(Object.values(TWENTY_ONE_QUOTES).every(q => readFileSync(join(flow, 'v21', 'change.patch'), 'utf8').includes(q)), "round 21's tests pin the sentences the paper quotes");
const r21 = judgeOf.get('21');
claim(r21?.keepByRule, 'the judge preferred round 21 on both halves');
claim(sampledFully(r21, twentyOneSets) && r21.sample.drawn === r21.sample.of, "round 21's judges read every moment it changed");
{
  const { items, sentence, against } = judgedRound('round21', /After (\S+(?: \S+)*), only (?:kings and pawns are left: in the engine's line ([^.]+)|the kings are left: a draw)\./);
  const escRe = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // The played move's line, where the sentence names only the mover's king's captures and the card's closing sentence calls the played move lost.
  const lostCapture = new Set(items.filter(item => {
    const [, moves, body] = sentence(item);
    const played = sansOf(item.move)[0];
    if (moves.split(' ')[0] !== played || !/^your king takes their pawns? on [a-h][1-8](?:(?:, | and )[a-h][1-8])*$/.test(body ?? '')) return false;
    const difference = [item.versionX, item.versionY].map(v => v.find(x => x.heading === 'The difference')?.text ?? '');
    return difference.some(t => new RegExp(`(?:losing after ${escRe(played)} \\(|After ${escRe(played)} you are losing)`).test(t));
  }).map(item => item.id));
  claim(items.length === r21.sample.judged, 'the judge items of round 21 are its judged moments');
  claim(r21.tally.train.old + r21.tally.test.old === 1 && against.length === 1, 'the judges gave one answer against round 21');
  claim(lostCapture.size === 1 && lostCapture.has(against[0]), "the answer against round 21 is on its one sentence that names only the mover's king's capture in an ending the card calls lost");
  g.def('RoundTwentyOneLostCapture', word(lostCapture.size)).def('RoundTwentyOneJudged', String(items.length));
}
for (const [k, q] of Object.entries(TWENTY_ONE_QUOTES)) g.def(`RoundTwentyOne${k}`, esc(q));
sampledDefs('RoundTwentyOne', r21, twentyOneSets);

// ---- round 22: what the better line does first, on round 21's three sets; its seeded draw takes every
// moment it changed. Its first wording joined its two sentences with a semicolon, and round 22b, the
// same words as two sentences, judged every one of them again
const twentyTwo = rebuilt.get('v22b'), twentyTwoFirst = rebuilt.get('v22');
const twentyTwoSets = [twentyTwo, twentyTwo?.endgames, twentyTwo?.endgames2];
claim([...twentyTwoSets, twentyTwoFirst, twentyTwoFirst?.endgames, twentyTwoFirst?.endgames2].every(r => r?.sameMoments && r.gradesEqual), "round 22's grades equal its base's in all three sets, in its first wording and its last");
{
  const changedIds = v => [[], ['endgames'], ['endgames2']].flatMap(sub => {
    const [before, after] = ['base', v].map(x => jsonl(join(flow, v, 'rebuilt', ...sub, `${x}.results.jsonl`)));
    const was = new Map(before.map(m => [m.id, m.textHash]));
    return after.filter(m => m.textHash !== was.get(m.id)).map(m => m.id);
  }).sort();
  claim(changedIds('v22b').join() === changedIds('v22').join(), 'round 22b changes the texts of the moments round 22 changed, and no other');
}
const TWENTY_TWO_QUOTES = { Quote: 'Played now, Bf5 allows dxc5. cxd4 first takes the pawn on d4.', QuoteDrive: 'Played now, Nc6 allows Qxb7. Qd7 first drives the queen from b5 (Qe2).', QuoteAway: 'Played now, g6 allows Bxf5. Nfd6 first moves your knight on f5 away.' };
claim(Object.values(TWENTY_TWO_QUOTES).every(q => readFileSync(join(flow, 'v22', 'change.patch'), 'utf8').includes(q)), "round 22's tests pin the sentences the paper quotes, in its final wording");
const r22 = judgeOf.get('22'), r22b = judgeOf.get('22b'), r22final = judgeOf.get('22 and 22b');
claim(r22?.keepByRule && r22final?.keepByRule, 'the judge preferred round 22 on both halves, in its first wording and its last');
claim(sampledFully(r22final, twentyTwoSets) && r22final.sample.drawn === r22final.sample.of, "round 22's judges read every moment it changed");
claim(r22b.sample.judged === r22final.sample.drawn, 'round 22b judged again every moment round 22 changed');
claim([r22, r22b, r22final].every(j => j.tally.train.old === 0 && j.tally.test.old === 0), 'no judge of round 22 preferred the old text');
claim(r22final.tally.train.same + r22final.tally.test.same === 0, 'on the final texts the judges preferred the new text in every comparison');
{
  const SENTENCE = /Played now, (\S+) allows (\S+)[;.] (\S+) first (?:takes the \w+ on [a-h][1-8]|drives the (\w+) from [a-h][1-8] \((\S+)\)|moves (?:their|your) \w+ on [a-h][1-8] away)\./;
  const first = judgedRound('round22', SENTENCE), last = judgedRound('round22b', SENTENCE);
  claim(first.items.length === r22final.sample.drawn && last.items.length === r22final.sample.drawn, 'the judge items of rounds 22 and 22b are its judged moments');
  const bare = san => san.replace(/[+#]+$/, '');
  const toSquare = san => bare(san).match(/([a-h][1-8])(?:=[QRBN])?$/)?.[1];
  // The difference names the reply before the sentence: its move stands among the words before it.
  const repeats = new Set(last.items.filter(item => {
    const m = last.sentence(item);
    return m.input.slice(0, m.index).split(/[\s(),:;.]+/).some(w => w && bare(w) === bare(m[2]));
  }).map(item => item.id));
  // A drive whose driven piece leaves by taking the piece that drove it, on the square that piece went to.
  const trades = last.items.filter(item => {
    const m = last.sentence(item);
    return Boolean(m[5]) && m[5].includes('x') && toSquare(m[5]) === toSquare(m[3]);
  });
  const verdicts = round => {
    const dir = join(judgeDir, round);
    const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
    const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
    return id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  };
  const firstVerdicts = verdicts('round22'), lastVerdicts = verdicts('round22b');
  const sames = first.items.filter(item => firstVerdicts(item.id).includes('same')).map(item => item.id);
  claim(sames.length === r22.tally.train.same + r22.tally.test.same, "round 22's same-answers are on different moments");
  claim(sames.length > 0 && sames.every(id => repeats.has(id)), "every same-answer on round 22's first texts is on a sentence whose reply the difference already names");
  claim(trades.length > 0 && trades.every(item => { const m = last.sentence(item); return m[4] === 'queen' && /^Q/.test(m[3]) && /^Qx/.test(m[5]); }), "round 22's drives that are trades are each a queen taking the queen that drove it");
  claim(trades.every(item => lastVerdicts(item.id).every(v => v === 'new')), "the judges preferred round 22b's texts on every trade in both runs");
  g.def('RoundTwentyTwoRepeats', word(repeats.size)).def('RoundTwentyTwoTrades', word(trades.length))
    .def('RoundTwentyTwoFirstSames', word(sames.length)).def('RoundTwentyTwoJudged', String(last.items.length));
}
for (const [k, q] of Object.entries(TWENTY_TWO_QUOTES)) g.def(`RoundTwentyTwo${k}`, esc(q));
sampledDefs('RoundTwentyTwo', r22final, twentyTwoSets);
g.def('RoundTwentyTwoRejudged', String(r22b.sample.judged))
  .def('RoundTwentyTwoFirstTrainNew', String(r22.tally.train.new)).def('RoundTwentyTwoFirstTrainOld', String(r22.tally.train.old)).def('RoundTwentyTwoFirstTrainSame', String(r22.tally.train.same))
  .def('RoundTwentyTwoFirstTestNew', String(r22.tally.test.new)).def('RoundTwentyTwoFirstTestOld', String(r22.tally.test.old)).def('RoundTwentyTwoFirstTestSame', String(r22.tally.test.same));

// ---- round 23: the capture that was a trap, on round 22's three sets; its seeded draw takes every moment
// it changed. Its sentence opens the headline, so the judged cards differ from the base's there alone
const twentyThree = rebuilt.get('v23');
const twentyThreeSets = [twentyThree, twentyThree?.endgames, twentyThree?.endgames2];
claim(twentyThreeSets.every(r => r?.sameMoments && r.gradesEqual), "round 23's grades equal its base's in all three sets");
const TWENTY_THREE_QUOTES = { Quote: 'Their pawn on c7 looked free, but it was a trap. Qxc7 allows Rxe6, and it wins the rook outright.', QuoteMate: 'Their rook on h7 looked free, but it was a trap. Rxh7 allows mate in 1 with Bf7#. Ng4+ avoids it.' };
claim(Object.values(TWENTY_THREE_QUOTES).every(q => readFileSync(join(flow, 'v23', 'change.patch'), 'utf8').includes(q)), "round 23's tests pin the sentences the paper quotes");
const r23 = judgeOf.get('23');
claim(r23?.keepByRule, 'the judge preferred round 23 on both halves');
claim(sampledFully(r23, twentyThreeSets) && r23.sample.drawn === r23.sample.of, "round 23's judges read every moment it changed");
{
  const dir = join(judgeDir, 'round23');
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdicts = id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  const version = (item, side) => (keys[0][item.id].X === side ? item.versionX : item.versionY);
  const card = (item, side) => version(item, side).find(x => x.heading === 'On the card')?.text ?? '';
  const TRAP = /^(?:Their|Your) \w+ on [a-h][1-8] looked free, but it was a trap\. /;
  claim(items.length === r23.sample.judged && items.every(item => { const m = card(item, 'new').match(TRAP); return Boolean(m) && card(item, 'new') === m[0] + card(item, 'old'); }),
    "every card round 23's judges read opens with its sentence, and the rest of it is the base's");
  const played = item => sansOf(item.move)[0];
  const replyOf = item => {
    const head = `What ${played(item)} allowed: `;
    const section = version(item, 'new').find(x => x.heading.startsWith(head));
    if (!section) throw new Error(`round 23: ${item.id} names no reply`);
    return section.heading.slice(head.length);
  };
  // Had the mover passed instead of capturing, the engine's reply would make the same capture or the same mate.
  const stood = new Set(items.filter(item => {
    if (new Chess(item.fenBefore).inCheck()) return false;
    const after = new Chess(item.fenBefore);
    after.move(played(item));
    const hit = after.move(replyOf(item));
    const fen = item.fenBefore.split(' ');
    fen[1] = fen[1] === 'w' ? 'b' : 'w';
    fen[3] = '-';
    const passed = new Chess(fen.join(' '), { skipValidation: true });
    let again = null;
    try { again = passed.move({ from: hit.from, to: hit.to, promotion: hit.promotion }); } catch { again = null; }
    if (!again) return false;
    return (after.isCheckmate() && passed.isCheckmate()) || (Boolean(hit.captured) && again.captured === hit.captured && again.to === hit.to);
  }).map(item => item.id));
  // The better line plays the same capture one or two of the mover's moves later.
  const later = new Set(items.filter(item => {
    const [uci] = ucisOf(item.fenBefore, [played(item)]);
    return ucisOf(item.fenBefore, sansOf(item.engine.bestLine)).filter((_, i) => i % 2 === 0).slice(1, 3).includes(uci);
  }).map(item => item.id));
  const misses = items.filter(item => item.appVerdict === 'Miss');
  const tallyOn = ids => { const v = ids.flatMap(verdicts); return { n: v.length, new: v.filter(x => x === 'new').length }; };
  const onStood = tallyOn([...stood]), onRest = tallyOn(items.map(item => item.id).filter(id => !stood.has(id)));
  const against = items.filter(item => verdicts(item.id).includes('old'));
  claim(onStood.new * onRest.n < onRest.new * onStood.n, "the judges preferred round 23's texts less often where the reply's capture or mate stood before the capture");
  claim(misses.length === 1 && verdicts(misses[0].id).every(v => v === 'old'), "round 23's one miss drew both runs' answers against it");
  claim(misses.every(item => version(item, 'new').some(x => x.heading === 'The difference' && x.text.includes(`After ${played(item)} you are about even`))), "round 23's miss leaves the game about even, its card says");
  claim(against.filter(item => later.has(item.id)).every(item => stood.has(item.id)), "the answers against round 23 where the better line takes the piece later are on a moment where the reply's capture stood before it too");
  g.def('RoundTwentyThreeStood', word(stood.size)).def('RoundTwentyThreeLater', word(later.size)).def('RoundTwentyThreeJudged', String(items.length))
    .def('RoundTwentyThreeStoodNew', String(onStood.new)).def('RoundTwentyThreeStoodAnswers', String(onStood.n))
    .def('RoundTwentyThreeRestNew', String(onRest.new)).def('RoundTwentyThreeRestAnswers', String(onRest.n))
    .def('RoundTwentyThreeAgainst', word(against.length));
}
for (const [k, q] of Object.entries(TWENTY_THREE_QUOTES)) g.def(`RoundTwentyThree${k}`, esc(q));
sampledDefs('RoundTwentyThree', r23, twentyThreeSets);

// ---- round 24: where the other side's pawn is when one queens, on round 23's three sets; its seeded
// draw takes every moment it changed. Its sentence ends the pawn's story in the difference
const twentyFour = rebuilt.get('v24');
const twentyFourSets = [twentyFour, twentyFour?.endgames, twentyFour?.endgames2];
claim(twentyFourSets.every(r => r?.sameMoments && r.gradesEqual), "round 24's grades equal its base's in all three sets");
const TWENTY_FOUR_QUOTES = { Quote: 'When h1=R comes, your b-pawn is still on b5, three squares from b8, with your knight on b6 in its way.', QuoteClear: 'When a1=Q comes, your h-pawn is still on h6, two squares from h8.' };
claim(Object.values(TWENTY_FOUR_QUOTES).every(q => readFileSync(join(flow, 'v24', 'change.patch'), 'utf8').includes(q)), "round 24's tests pin the sentences the paper quotes");
const r24 = judgeOf.get('24');
claim(r24?.keepByRule, 'the judge preferred round 24 on both halves');
claim(sampledFully(r24, twentyFourSets) && r24.sample.drawn === r24.sample.of, "round 24's judges read every moment it changed");
{
  const SQUARES = ['one', 'two', 'three', 'four', 'five', 'six'];
  const RACE = new RegExp(String.raw` When \S+ comes, (?:their|your) [a-h]-pawn is still on [a-h][1-8], (${SQUARES.join('|')}) squares? from [a-h][18](?:, with (?:their|your) \w+ on [a-h][1-8] in its way)?\.`);
  const { items, sentence } = judgedRound('round24', RACE);
  const dir = join(judgeDir, 'round24');
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdicts = id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  const version = (item, side) => (keys[0][item.id].X === side ? item.versionX : item.versionY);
  claim(items.length === r24.sample.judged && items.every(item => {
    const [before, after] = ['old', 'new'].map(side => version(item, side));
    const m = sentence(item);
    return before.length === after.length && after.every((x, i) => x.heading === before[i].heading
      && (x.text === before[i].text || (x.heading === 'The difference' && x.text.slice(0, m.index) + x.text.slice(m.index + m[0].length) === before[i].text)));
  }), "every card round 24's judges read differs from the base's by its sentence in the difference alone");
  // The squares the pawn the sentence names has left to its last rank.
  const left = item => SQUARES.indexOf(sentence(item)[1]) + 1;
  claim(items.every(item => new Set(verdicts(item.id)).size === 1), "each moment round 24's judges read drew the same verdict in both runs");
  const preferred = items.filter(item => verdicts(item.id).every(v => v === 'new'));
  const against = items.filter(item => verdicts(item.id).includes('old'));
  const far = against.filter(item => left(item) >= 4);
  claim(preferred.length + against.length === items.length, 'every answer on round 24 preferred one side');
  claim(preferred.every(item => left(item) <= 3), 'every moment the judges preferred in round 24 names a pawn three squares or fewer from its last rank');
  claim(2 * far.length > against.length, 'most moments the judges answered against in round 24 name a pawn four squares or more from its last rank');
  g.def('RoundTwentyFourJudged', String(items.length)).def('RoundTwentyFourPreferred', word(preferred.length))
    .def('RoundTwentyFourAgainst', word(against.length)).def('RoundTwentyFourAgainstFar', word(far.length))
    .def('RoundTwentyFourAgainstAnswers', String(against.flatMap(item => verdicts(item.id)).filter(v => v === 'old').length));
}
for (const [k, q] of Object.entries(TWENTY_FOUR_QUOTES)) g.def(`RoundTwentyFour${k}`, esc(q));
sampledDefs('RoundTwentyFour', r24, twentyFourSets);

// ---- round 25: the square the better move keeps their king out of, on round 24's three sets; its
// seeded draw takes every moment it changed. Its point stands among the better move's points
const twentyFive = rebuilt.get('v25');
const twentyFiveSets = [twentyFive, twentyFive?.endgames, twentyFive?.endgames2];
claim(twentyFiveSets.every(r => r?.sameMoments && r.gradesEqual), "round 25's grades equal its base's in all three sets");
const TWENTY_FIVE_QUOTES = { Quote: 'it keeps their king out of c5', QuoteHeadline: 'Kd6 was better: it keeps their king out of c5. After Kf6, they can answer Kc5' };
claim(Object.values(TWENTY_FIVE_QUOTES).every(q => readFileSync(join(flow, 'v25', 'change.patch'), 'utf8').includes(q)), "round 25's tests and docs pin the words the paper quotes");
const r25 = judgeOf.get('25');
claim(r25?.keepByRule, 'the judge preferred round 25 on both halves');
claim(sampledFully(r25, twentyFiveSets) && r25.sample.drawn === r25.sample.of, "round 25's judges read every moment it changed");
{
  const KEPT = /\bit keeps (?:their|your) king out of [a-h][1-8]/;
  const dir = join(judgeDir, 'round25');
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdicts = id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  const version = (item, side) => (keys[0][item.id].X === side ? item.versionX : item.versionY);
  const better = (item, side) => version(item, side).find(x => / does instead$/.test(x.heading))?.text ?? '';
  claim(items.length === r25.sample.judged && items.every(item => KEPT.test(better(item, 'new')) && !KEPT.test(better(item, 'old'))),
    "every card round 25's judges read names the square in the better move's section, and the base's does not");
  claim(items.every(item => verdicts(item.id).every(v => v === 'new')), "both runs preferred round 25's texts on every moment its judges read");
  const first = items.filter(item => better(item, 'new').search(KEPT) === 0);
  claim(first.every(item => /\bkeeps (?:their|your) king out of [a-h][1-8]/.test(version(item, 'new').find(x => x.heading === 'On the card')?.text ?? '')), "where round 25's point is the first, the card's headline gives it");
  g.def('RoundTwentyFiveJudged', String(items.length)).def('RoundTwentyFiveFirst', word(first.length)).def('RoundTwentyFiveSecond', word(items.length - first.length));
  const pad = read(join(judgeDir, 'controls', 'round25', 'padding.json'));
  const added = pad.padding.map(p => p.added);
  claim(pad.target < 0 && pad.growth.filter(x => x < 0).length * 2 > pad.growth.length, "round 25 shortens most cards it changes, so its median growth is below zero");
  g.def('PadTwentyFiveShrinks', word(pad.growth.filter(x => x < 0).length)).def('PadTwentyFiveOf', word(pad.growth.length))
    .def('PadTwentyFiveFillerMin', String(Math.min(...added))).def('PadTwentyFiveFillerMax', String(Math.max(...added)));
}
for (const [k, q] of Object.entries(TWENTY_FIVE_QUOTES)) g.def(`RoundTwentyFive${k}`, esc(q));
sampledDefs('RoundTwentyFive', r25, twentyFiveSets);

// ---- round 26: the piece the better move brings into play, on round 25's three sets; its seeded
// draw takes every moment it changed. It comes from a count with a bar written before it (q6c/)
{
  const counts = read(join(flow, 'q6c', 'counts.json'));
  const bar = readFileSync(join(flow, 'q6c', 'bar.md'), 'utf8');
  const barShare = Number(bar.match(/at least one in five \((\d+)%\)/)?.[1]) / 100;
  const barLessons = Number(bar.match(/at least (\d+) moments give no reason/)?.[1]);
  const [train, test] = ['train', 'test'].map(s => counts[s].find(r => r.set === 'pooled'));
  claim(train.noReason >= barLessons && train.noReason >= barShare * train.quietBest, "the quiet best moves without a reason passed their bar on the training halves");
  const share = r => pct(r.noReason / r.quietBest);
  g.def('SixCQuiet', String(train.quietBest)).def('SixCNoReason', String(train.noReason)).def('SixCShare', share(train))
    .def('SixCTestQuiet', String(test.quietBest)).def('SixCTestNoReason', String(test.noReason)).def('SixCTestShare', share(test));
}
const twentySix = rebuilt.get('v26');
const twentySixSets = [twentySix, twentySix?.endgames, twentySix?.endgames2];
claim(twentySixSets.every(r => r?.sameMoments && r.gradesEqual), "round 26's grades equal its base's in all three sets");
const twentySixPatch = readFileSync(join(flow, 'v26', 'change.patch'), 'utf8');
const TWENTY_SIX_QUOTES = {
  Quote: 'it brings the bishop on c8 into play, with 5 squares to go to instead of none',
  QuoteHeadline: 'd5 was better: it brings the bishop on c8 into play, with 5 squares to go to instead of none.',
};
claim(Object.values(TWENTY_SIX_QUOTES).every(q => twentySixPatch.includes(q)), "round 26's tests pin the words the paper quotes");
{
  const limit = name => Number(twentySixPatch.match(new RegExp(String.raw`^\+const ${name} = (\d+)$`, 'm'))?.[1]);
  const [outOfPlay, intoPlay] = [limit('OUT_OF_PLAY'), limit('INTO_PLAY')];
  claim(Number.isInteger(outOfPlay) && Number.isInteger(intoPlay), "round 26's change sets how few squares a piece out of play has and how many it must gain");
  g.def('RoundTwentySixOutOfPlay', word(outOfPlay)).def('RoundTwentySixIntoPlay', word(intoPlay));
}
const r26 = judgeOf.get('26');
claim(r26?.keepByRule, 'the judge preferred round 26 on both halves');
claim(sampledFully(r26, twentySixSets) && r26.sample.drawn === r26.sample.of, "round 26's judges read every moment it changed");
{
  const INTO = /^it brings the (knight|bishop|rook|queen) on [a-h][1-8] into play, with \d+ squares to go to instead of (?:none|one|\d+)/;
  const dir = join(judgeDir, 'round26');
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdicts = id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  const version = (item, side) => (keys[0][item.id].X === side ? item.versionX : item.versionY);
  const part = (item, side, heading) => version(item, side).find(x => heading.test(x.heading))?.text ?? '';
  const better = (item, side) => part(item, side, / does instead$/);
  claim(items.length === r26.sample.judged && items.every(item => INTO.test(better(item, 'new')) && !/ into play/.test(better(item, 'old'))),
    "every card round 26's judges read names the piece in the better move's section, and the base's does not");
  claim(items.every(item => / was better: it brings the (?:knight|bishop|rook|queen) on [a-h][1-8] into play/.test(part(item, 'new', /^On the card$/))),
    "on every card round 26's judges read, the headline gives the piece as the better move's reason");
  claim(items.every(item => verdicts(item.id).every(v => v === 'new')), "both runs preferred round 26's texts on every moment its judges read");
  const named = piece => items.filter(item => better(item, 'new').match(INTO)?.[1] === piece).length;
  g.def('RoundTwentySixJudged', String(items.length)).def('RoundTwentySixKnights', word(named('knight'))).def('RoundTwentySixBishops', word(named('bishop')))
    .def('RoundTwentySixRooks', word(named('rook'))).def('RoundTwentySixQueens', word(named('queen')));
  const pad = read(join(judgeDir, 'controls', 'round26', 'padding.json'));
  const added = pad.padding.map(p => p.added);
  claim(pad.target > Math.max(...added), "round 26's cards grow past the longest filler its control has");
  g.def('PadTwentySixGrowth', String(pad.target)).def('PadTwentySixGrowthMin', String(Math.min(...pad.growth))).def('PadTwentySixGrowthMax', String(Math.max(...pad.growth)))
    .def('PadTwentySixFillerMin', String(Math.min(...added))).def('PadTwentySixFillerMax', String(Math.max(...added)));
}
for (const [k, q] of Object.entries(TWENTY_SIX_QUOTES)) g.def(`RoundTwentySix${k}`, esc(q));
sampledDefs('RoundTwentySix', r26, twentySixSets);

// ---- round 28: no absence said before a reason, on round 26's three sets. It corrects a text
// defect, so it counts it as rounds 11, 14 and 17c did, and no judge reads it
const twentyEight = rebuilt.get('v28');
const twentyEightSets = [twentyEight, twentyEight?.endgames, twentyEight?.endgames2];
claim(twentyEightSets.every(r => r?.sameMoments && r.gradesEqual), "round 28's grades equal its base's in all three sets");
const twentyEightCounts = [twentyEight.defects, twentyEight.defects?.endgames, twentyEight.defects?.endgames2];
claim(twentyEightCounts.every(Boolean), 'round 28 counts its defect in all three sets');
claim(twentyEightCounts.every(s => s.base.absentBeforeReason > 0 && s.variant.absentBeforeReason === 0), 'round 28 removes its defect from all three sets');
claim(twentyEightCounts.every(s => Object.keys(s.base).every(d => d === 'absentBeforeReason' || (s.base[d] === 0 && s.variant[d] === 0))), "none of the counter's other defects appears in round 28's texts or its base's");
{
  const recorded = read(join(flow, 'v28', 'defects.json'));
  const defectIds = new Set([recorded, recorded.endgames, recorded.endgames2].flatMap(s => s.base.moments.absentBeforeReason));
  const changed = [[], ['endgames'], ['endgames2']].flatMap((sub) => {
    const before = new Map(jsonl(join(flow, 'v28', 'rebuilt', ...sub, 'base.results.jsonl')).map(m => [m.id, m.textHash]));
    return jsonl(join(flow, 'v28', 'rebuilt', ...sub, 'v28.results.jsonl')).filter(m => m.textHash !== before.get(m.id)).map(m => m.id);
  });
  claim(changed.length === defectIds.size && changed.every(id => defectIds.has(id)), 'round 28 changes the texts of its defect moments and no other');
}
const twentyNinePatch = readFileSync(join(flow, 'v29', 'change.patch'), 'utf8');
const TWENTY_EIGHT_QUOTES = {
  QuoteAbsent: "The concrete reason for the engine's preference is not established.",
  QuoteMaterial: 'The lines shown do not establish a material advantage for either continuation.',
  QuoteGuard: 'After c5, your pawn no longer guards b5, and Bb5+ follows.',
};
claim(Object.values(TWENTY_EIGHT_QUOTES).every(q => twentyNinePatch.includes(q)), "the app's tests for rounds 28 and 29 pin the sentences the paper quotes for round 28");
g.def('RoundTwentyEightDefectsGames', String(twentyEightCounts[0].base.absentBeforeReason))
  .def('RoundTwentyEightDefectsEnd', String(twentyEightCounts[1].base.absentBeforeReason))
  .def('RoundTwentyEightDefectsEndTwo', String(twentyEightCounts[2].base.absentBeforeReason))
  .def('RoundTwentyEightDefects', String(twentyEightCounts.reduce((n, s) => n + s.base.absentBeforeReason, 0)))
  .def('RoundTwentyEightChangedTrain', String(changedIn(twentyEightSets, 'train'))).def('RoundTwentyEightChangedTest', String(changedIn(twentyEightSets, 'test')));
for (const [k, q] of Object.entries(TWENTY_EIGHT_QUOTES)) g.def(`RoundTwentyEight${k}`, esc(q));

// ---- round 29: the pin that keeps a piece from taking the reply, on round 28's three sets; its
// seeded draw takes every moment it changed. Its point stands among the played move's points
const twentyNine = rebuilt.get('v29');
const twentyNineSets = [twentyNine, twentyNine?.endgames, twentyNine?.endgames2];
claim(twentyNineSets.every(r => r?.sameMoments && r.gradesEqual), "round 29's grades equal its base's in all three sets");
const TWENTY_NINE_QUOTES = {
  Quote: 'After Be7, your bishop no longer guards h4: the rook on e1 pins it to your king, and Nh4 follows.',
  QuoteSafe: 'it is safe from your knight on d2: the bishop on b4 pins the knight to your king',
};
claim(Object.values(TWENTY_NINE_QUOTES).every(q => twentyNinePatch.includes(q)), "round 29's tests pin the words the paper quotes");
const r29 = judgeOf.get('29');
claim(r29?.keepByRule, 'the judge preferred round 29 on both halves');
claim(sampledFully(r29, twentyNineSets) && r29.sample.drawn === r29.sample.of, "round 29's judges read every moment it changed");
{
  const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
  const PIECE = `(${PIECES.join('|')})`;
  const SAFE = new RegExp(`^it is safe from (?:your|their) ${PIECE} on [a-h][1-8]: the ${PIECE} on [a-h][1-8] pins the \\1 to (?:your|their) king$`);
  const ALLOWED = /^What .+ allowed/;
  const dir = join(judgeDir, 'round29');
  const items = read(join(dir, 'items-r1.json')).items;
  const keys = ['r1', 'r2'].map(r => read(join(dir, `key-${r}.json`)));
  const answers = ['r1', 'r2'].map(r => new Map(read(join(dir, `out-${r}.judge.json`)).answers.map(a => [a.id, a.choice])));
  const verdicts = id => [0, 1].map(i => { const c = answers[i].get(id); return c === 'same' ? 'same' : keys[i][id][c]; });
  const version = (item, side) => (keys[0][item.id].X === side ? item.versionX : item.versionY);
  const allowed = (item, side) => version(item, side).find(x => ALLOWED.test(x.heading))?.text ?? '';
  const point = item => allowed(item, 'new').split(' · ')[0].split('; ').at(-1);
  claim(items.length === r29.sample.judged, 'the judge items of round 29 are its judged moments');
  claim(items.every((item) => {
    const [after, before] = [version(item, 'new'), version(item, 'old')];
    const [points, ...line] = allowed(item, 'old').split(' · ');
    return SAFE.test(point(item)) && points !== '' && !/^\d+\./.test(points) && allowed(item, 'new') === [`${points}; ${point(item)}`, ...line].join(' · ')
      && after.length === before.length && after.every((x, i) => x.heading === before[i].heading && (x.text === before[i].text || ALLOWED.test(x.heading)));
  }), "every card round 29's judges read differs from the base's by the point alone, after the section's other points, so no moment of the three sets gets the guard's pin");
  claim(items.every(item => verdicts(item.id).every(v => v === 'new')), "both runs preferred round 29's texts on every moment its judges read");
  const named = (group, piece) => items.filter(item => point(item).match(SAFE)[group] === piece).length;
  for (const piece of PIECES) g.def(`RoundTwentyNinePinned${Name(piece)}s`, word(named(1, piece))).def(`RoundTwentyNinePinner${Name(piece)}s`, word(named(2, piece)));
  claim(['knight', 'pawn', 'bishop', 'rook'].every(p => named(1, p) > 0) && named(1, 'queen') === 0, 'the pieces round 29 names as pinned are knights, pawns, a bishop and a rook');
  claim(['bishop', 'rook', 'queen'].every(p => named(2, p) > 0) && named(2, 'pawn') + named(2, 'knight') === 0, 'the pinners round 29 names are bishops, rooks and a queen');
  const absentBeside = items.filter(item => version(item, 'new').find(x => x.heading === 'The difference')?.text.includes(TWENTY_EIGHT_QUOTES.QuoteAbsent)).length;
  claim(absentBeside > 0, "a card round 29's judges read still says the reason is not established beside the point");
  g.def('RoundTwentyNineJudged', String(items.length)).def('RoundTwentyNineAbsentBeside', word(absentBeside));
  const cdir = join(judgeDir, 'controls', 'round29');
  const pad = read(join(cdir, 'padding.json'));
  claim(pad.section === 'allowed' && pad.growthOf === 'the whole card', "round 29's padding control pads the section on what the played move allowed, as long as the card's growth");
  const kindOf = new Map(pad.padding.map(p => [p.moment, p.kind]));
  const ckeys = ['r1', 'r2'].map(r => read(join(cdir, `key-${r}.json`)));
  const byKind = { restate: { new: 0, old: 0, same: 0, reasons: [] }, generic: { new: 0, old: 0, same: 0, reasons: [] } };
  ['r1', 'r2'].forEach((r, i) => read(join(cdir, `out-${r}.judge.json`)).answers.forEach((a) => {
    const t = byKind[kindOf.get(a.id)];
    t[a.choice === 'same' ? 'same' : ckeys[i][a.id][a.choice]] += 1;
    t.reasons.push(a.reason);
  }));
  const restating = pad.padding.filter(p => p.kind === 'restate');
  claim(restating.length > 0 && restating.every(p => p.filler.includes("it is the engine's first choice here")), "round 29's restating filler says the line is the engine's first choice");
  claim(byKind.restate.reasons.every(r => /first choice/.test(r)), "every reason the judges gave on round 29's restating decoys names its words on the engine's first choice");
  claim(byKind.generic.new === 0 && byKind.generic.old > 0, "on round 29's neutral decoys alone the shorter text won every decided comparison");
  const fifteenPad = read(join(judgeDir, 'controls', 'round15', 'padding.json'));
  claim(fifteenPad.section === 'allowed' && fifteenPad.padding.filter(p => p.kind === 'restate').every(p => !p.filler.includes('first choice')), "round 15's restating filler in the same section restates the line alone");
  const added = pad.padding.map(p => p.added);
  g.def('PadTwentyNineGrowth', String(pad.target)).def('PadTwentyNineGrowthMin', String(Math.min(...pad.growth))).def('PadTwentyNineGrowthMax', String(Math.max(...pad.growth)))
    .def('PadTwentyNineFillerMin', String(Math.min(...added))).def('PadTwentyNineFillerMax', String(Math.max(...added)))
    .def('PadTwentyNineRestating', word(restating.length)).def('PadTwentyNineNeutral', word(pad.padding.length - restating.length))
    .def('PadTwentyNineNeutralUnchanged', String(byKind.generic.old)).def('PadTwentyNineNeutralN', String(byKind.generic.new + byKind.generic.old + byKind.generic.same));
}
for (const [k, q] of Object.entries(TWENTY_NINE_QUOTES)) g.def(`RoundTwentyNine${k}`, esc(q));
sampledDefs('RoundTwentyNine', r29, twentyNineSets);

// ---- the judge's controls, as reproduce.mjs recomputed them
const c = repro.controls;
claim(c.length.matchesRecorded, 'the length check recomputed from its answers matches the score the records keep');
claim(!c.length.J1.inventsDifferences, 'the judge answers "same" to the same text on both sides');
claim(!c.length.J2.lengthBiased, 'the judge is not length-biased');
claim(Object.values(c.length.J3).every(r => r.survives), "every round's longer text survives a decoy of its own length");
claim(c.perRound.every(p => !p.drifted), 'no round\'s control found the judge drifting toward length or shortness');
g.def('LongerPicked', String(c.longer.longer)).def('LongerDecided', String(c.longer.decided)).def('LongerRounds', esc(listed(c.longer.rounds)))
  .def('LengthItems', String(c.length.items)).def('LengthBatches', String(c.length.batches))
  .def('LengthRounds', esc(listed(Object.keys(c.length.J3).map(r => r.replace(/^round/, '')))))
  .def('LengthIdentitySame', String(c.length.J1.same)).def('LengthIdentityN', String(c.length.J1.n))
  .def('LengthPaddingDecoy', String(c.length.J2.decoy)).def('LengthPaddingN', String(c.length.J2.n));
const pad10 = c.perRound.find(p => p.round === '10');
claim(pad10?.kind === 'padding', 'round 10 carried a padding control');
g.def('PadTenDecoy', String(pad10.decoy)).def('PadTenN', String(pad10.comparisons));
const pad12 = c.perRound.find(p => p.round === '12');
claim(pad12?.kind === 'padding', 'round 12 carried a padding control');
g.def('PadTwelveDecoy', String(pad12.decoy)).def('PadTwelveN', String(pad12.comparisons));
const trim13 = c.perRound.find(p => p.round === '13');
claim(trim13?.kind === 'trim', 'round 13 carried a trim control');
g.def('TrimThirteenDecoy', String(trim13.decoy)).def('TrimThirteenN', String(trim13.comparisons))
  .def('TrimThirteenUnchanged', String(trim13.unchanged)).def('TrimThirteenSame', String(trim13.same));
const pad15 = c.perRound.find(p => p.round === '15');
claim(pad15?.kind === 'padding', 'round 15 carried a padding control');
g.def('PadFifteenDecoy', String(pad15.decoy)).def('PadFifteenN', String(pad15.comparisons))
  .def('PadFifteenUnchanged', String(pad15.unchanged)).def('PadFifteenSame', String(pad15.same));
const pad16 = c.perRound.find(p => p.round === '16');
claim(pad16?.kind === 'padding', 'round 16 carried a padding control');
g.def('PadSixteenDecoy', String(pad16.decoy)).def('PadSixteenN', String(pad16.comparisons))
  .def('PadSixteenUnchanged', String(pad16.unchanged)).def('PadSixteenSame', String(pad16.same));
const pad17 = c.perRound.find(p => p.round === '17');
claim(pad17?.kind === 'padding', 'round 17 carried a padding control');
g.def('PadSeventeenDecoy', String(pad17.decoy)).def('PadSeventeenN', String(pad17.comparisons))
  .def('PadSeventeenUnchanged', String(pad17.unchanged)).def('PadSeventeenSame', String(pad17.same));
const pad18 = c.perRound.find(p => p.round === '18');
claim(pad18?.kind === 'padding', 'round 18 carried a padding control');
g.def('PadEighteenDecoy', String(pad18.decoy)).def('PadEighteenN', String(pad18.comparisons))
  .def('PadEighteenUnchanged', String(pad18.unchanged)).def('PadEighteenSame', String(pad18.same));
for (const [round, name] of [['19', 'Nineteen'], ['20b', 'Twenty'], ['21', 'TwentyOne'], ['22', 'TwentyTwo'], ['23', 'TwentyThree'], ['24', 'TwentyFour'], ['25', 'TwentyFive'], ['26', 'TwentySix'], ['29', 'TwentyNine']]) {
  const pad = c.perRound.find(p => p.round === round);
  claim(pad?.kind === 'padding', `round ${round} carried a padding control`);
  g.def(`Pad${name}Decoy`, String(pad.decoy)).def(`Pad${name}N`, String(pad.comparisons))
    .def(`Pad${name}Unchanged`, String(pad.unchanged)).def(`Pad${name}Same`, String(pad.same));
}
const won = t => `${t.long} of ${t.long + t.decoy}`;
g.block('ControlsTable', [
  '\\begin{tabularx}{\\textwidth}{L l l}', '\\toprule', 'check & result & verdict \\\\', '\\midrule',
  `J1, the same text on both sides: answered \`\`same'' & ${c.length.J1.same} of ${c.length.J1.n} & ${c.length.J1.inventsDifferences ? 'invents differences' : "uses ``same''"} \\\\`,
  `J2, the shorter text against itself with filler: the decoy preferred & ${c.length.J2.decoy} of ${c.length.J2.n} (${c.length.J2.short} the shorter text, ${c.length.J2.same} same) & ${c.length.J2.lengthBiased ? 'length-biased' : 'not length-biased'} \\\\`,
  ...Object.entries(c.length.J3).map(([r, j]) => `J3, round ${esc(r.replace(/^round/, ''))}: the longer text against a decoy of its length & train ${won(j.train)}, test ${won(j.test)} & ${j.survives ? 'survives' : 'does not survive'} \\\\`),
  ...c.perRound.map(p => `${p.kind} control, round ${esc(p.round)}: the decoy preferred & ${p.decoy} of ${p.comparisons} (${p.unchanged} the ${p.kind === 'trim' ? 'full' : 'shorter'} text, ${p.same} same) & ${p.drifted ? `drifted toward ${p.kind === 'trim' ? 'shortness' : 'length'}` : 'no drift'} \\\\`),
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
  { round: 'round13', want: 'old', has: ' by move ' },
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
const tm = repro.rerun.textsMatch;
const differ = tm?.differ ?? [];
claim(!tm || differ.length === tm.of - tm.same, "the reproduction describes every moment whose text differs from the last kept round's");
claim(differ.every(d => d.sameGrades), 'every moment whose text differs from the last kept round\'s keeps the grades recorded for it');
const opponentsBand = "the band the app now gives the player's opponents, not his own";
const differSentence = !differ.length ? ''
  : differ.length === 1
    ? ` The one that differs is ${differ[0].mine ? "the player's move" : "his opponent's move"} and keeps the grades recorded for it${differ[0].opponentBandDefense ? `; the defense searches read its natural defense at ${opponentsBand}` : ''}.`
    : ` The ${word(differ.length)} that differ keep the grades recorded for them, and the defense searches read the natural defense of ${word(differ.filter(d => d.opponentBandDefense).length)} of them at ${opponentsBand}.`;
g.def('RerunTextsSentence', tm ? `Its texts equal the recorded texts of ${tm.variant}, the last kept round, on ${tm.same === tm.of ? `all ${tm.of}` : `${tm.same} of the ${tm.of}`} moments of round ${kept.get(tm.variant)}'s documents.${differSentence}` : '');
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
