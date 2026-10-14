#!/usr/bin/env node
// Writes paper/generated.tex for the judge-in-context paper: every number,
// table and example position it prints, from the records' flips.json and
// judge rounds and from results/reproduction.json (reproduce.mjs).
//
//   bridge/run.sh projects/judge-in-context/paper/generate.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chess, records, resultsDir } from '../../../bridge/lib/chess.mjs';
import { Generated, board, esc, fixed, movesTex, percent, sansOf, ucisOf, word } from '../../paper.mjs';
import { tally } from '../tally.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const recorded = join(records(), 'evals', 'judge-in-context');
const flips = read(join(recorded, 'flips.json'));
const repro = read(join(resultsDir('judge-in-context'), 'reproduction.json'));
const t = tally(join(recorded, 'judge'));
const c = flips.counts;
const g = new Generated('projects/judge-in-context/paper/generate.mjs');
const { JUDGMENT_THRESHOLDS: th } = await chess('src/services/knowledge/verdicts.ts');

// ---- the judge's thresholds, as the pinned app defines them
g.def('ThBlunder', String(th.blunder)).def('ThMistake', String(th.mistake)).def('ThInaccuracy', String(th.inaccuracy))
  .def('ThGood', String(th.good)).def('ThKeptWon', String(th.keptWon)).def('ThKeptWinning', String(th.keptWinning));

// ---- the setting
const proposal = flips.inputs.proposedSlope;
g.def('ShippedSlope', String(flips.inputs.shippedSlope))
  .def('LowSlope', String(proposal.atOrBelowFloor))
  .def('RatingFloor', String(proposal.floor))
  .def('RatingSpan', String(proposal.span))
  .def('RatingTop', String(proposal.floor + proposal.span))
  .def('Games', String(c.games))
  .def('Records', String(c.records))
  .def('ExactPlies', String(c.exactScorePlies))
  .def('NotExactPlies', String(c.notExactScorePlies))
  .def('BookPlies', String(c.excludedByClass.book ?? 0))
  .def('ForcedPlies', String(c.excludedByClass.forced ?? 0))
  .def('GradedPlies', String(c.gradedPlies))
  .def('GradedPlayer', String(c.gradedByRole.player))
  .def('GradedOpponent', String(c.gradedByRole.opponent))
  .def('Flips', String(c.flips))
  .def('FlipShare', percent(c.flips / c.gradedPlies))
  .def('FlipsPlayer', String(c.flipsByRole.player))
  .def('FlipsOpponent', String(c.flipsByRole.opponent))
  .def('FlipSharePlayer', percent(c.flipsByRole.player / c.gradedByRole.player))
  .def('FlipShareOpponent', percent(c.flipsByRole.opponent / c.gradedByRole.opponent))
  .def('MateSlipChanged', String(c.mateSlipChangedGraded))
  .def('PlayerRatingMin', String(c.ratings.player.min))
  .def('PlayerRatingMax', String(c.ratings.player.max))
  .def('OpponentRatingMin', String(c.ratings.opponent.min))
  .def('OpponentRatingMax', String(c.ratings.opponent.max))
  .def('CrossoverPawns', fixed(c.crossoverPawns, 1))
  .def('FloorOld', fixed(c.floorPawns.kept88.old, 1))
  .def('FloorNew', fixed(c.floorPawns.kept88.new, 1))
  .def('CapOld', fixed(c.floorPawns.kept75.old, 1))
  .def('CapNew', fixed(c.floorPawns.kept75.new, 1))
  .def('AssertMaxDiff', `${(flips.assertion.maxWinPercentDifference).toExponential(1).replace('e', '\\times 10^{').replace(/\{\+?/, '{')}}`)
  .def('EvidenceRecorded', esc(flips.inputs.evidenceVersion));
g.def('FlipOneIn', word(Math.round(c.gradedPlies / c.flips)));

// The games' time control, from the accuracy eval's frozen sample, which these games are.
const cases = read(join(records(), 'evals', 'accuracy-vs-chesscom', 'cases.json'));
if (cases.length !== c.games) throw new Error(`flips.json counts ${c.games} games, the accuracy sample ${cases.length}`);
const byControl = new Map();
for (const { timeControl } of cases) byControl.set(timeControl, (byControl.get(timeControl) ?? 0) + 1);
const [mainControl, mainGames] = [...byControl].sort((a, b) => b[1] - a[1])[0];
// The paper calls them N-minute games: a whole number of minutes and no increment.
if (!/^\d+$/.test(mainControl) || Number(mainControl) % 60) throw new Error(`time control ${mainControl} is not N-minute games`);
g.def('MainTcGames', String(mainGames)).def('MainTcMinutes', String(Number(mainControl) / 60));

// The judge's brief on the student, quoted from its instructions.
const brief = readFileSync(join(recorded, 'judge', 'flips-instructions.md'), 'utf8').replace(/\s+/g, ' ');
const student = /Your student is (.+?)\. Each item/.exec(brief);
if (!student) throw new Error('the judge instructions no longer describe the student as the paper quotes');
g.def('JudgeStudent', esc(student[1]).replace(/(\d)-(\d)/g, '$1--$2'));

// ---- the flip matrices
const ORDER = ['blunder', 'mistake', 'inaccuracy', 'ok', 'good'];
function matrix(role) {
  const m = flips.matrix[role];
  const cell = (a, b) => m[`${a}→${b}`] ?? 0;
  const rows = ORDER.map(a => {
    const cells = ORDER.map(b => (a === b ? `(${cell(a, b)})` : cell(a, b) ? `\\textbf{${cell(a, b)}}` : '0'));
    return `${a} & ${cells.join(' & ')} & ${ORDER.reduce((s, b) => s + cell(a, b), 0)} \\\\`;
  });
  const totals = ORDER.map(b => ORDER.reduce((s, a) => s + cell(a, b), 0));
  return [
    '\\begin{tabular}{l rrrrr r}', '\\toprule',
    `shipped $\\downarrow$ proposed $\\rightarrow$ & ${ORDER.join(' & ')} & total \\\\`, '\\midrule',
    ...rows, '\\midrule',
    `total & ${totals.join(' & ')} & ${totals.reduce((s, x) => s + x, 0)} \\\\`, '\\bottomrule', '\\end{tabular}',
  ].join('\n');
}
g.block('MatrixPlayer', matrix('player')).block('MatrixOpponent', matrix('opponent'));

// ---- the judge
const runs = Object.keys(t.runs);
g.def('JudgeMoves', String(t.moves))
  .def('RunsAgree', String(t.identical))
  .def('ShippedRunOne', String(t.runs[runs[0]].shipped))
  .def('ShippedRunTwo', String(t.runs[runs[1]].shipped))
  .def('ProposedRunOne', String(t.runs[runs[0]].proposed))
  .def('ProposedRunTwo', String(t.runs[runs[1]].proposed))
  .def('UnsureRunOne', String(t.runs[runs[0]].unsure))
  .def('UnsureRunTwo', String(t.runs[runs[1]].unsure));
// The paper says neither run prefers the proposed verdict.
if (runs.some(r => t.runs[r].proposed > t.runs[r].shipped)) throw new Error('a run prefers the proposed verdict');
g.block('JudgeTable', [
  '\\begin{tabular}{lrr}', '\\toprule', ' & run 1 & run 2 \\\\', '\\midrule',
  `shipped verdict preferred & ${t.runs[runs[0]].shipped} & ${t.runs[runs[1]].shipped} \\\\`,
  `proposed verdict preferred & ${t.runs[runs[0]].proposed} & ${t.runs[runs[1]].proposed} \\\\`,
  `unsure & ${t.runs[runs[0]].unsure} & ${t.runs[runs[1]].unsure} \\\\`,
  '\\bottomrule', '\\end{tabular}',
].join('\n'));
g.block('KindTable', [
  '\\begin{tabular}{lrrrr}', '\\toprule', 'shown label: shipped $\\to$ proposed & moves & both runs: shipped & both runs: proposed & split \\\\', '\\midrule',
  ...t.byKind.map(k => `${esc(k.kind)} & ${k.moves} & ${k.bothShipped} & ${k.bothProposed} & ${k.split} \\\\`),
  '\\bottomrule', '\\end{tabular}',
].join('\n'));

// ---- examples: for each of the four commonest kinds, the first move (in the
// sample's order) on which both runs agree with the kind's majority.
const judgeDir = join(recorded, 'judge');
const items = read(join(judgeDir, 'flips-r1.json')).items;
const keys = runs.map(r => read(join(judgeDir, `flips-${r}.key.json`)));
const answers = runs.map(r => new Map(read(join(judgeDir, `flips-${r}.judge.json`)).answers.map(a => [a.id, a])));
const pickOf = (i, id) => { const a = answers[i].get(id); return a.choice === 'unsure' ? 'unsure' : keys[i][id][a.choice]; };
const labelsOf = item => {
  const k = keys[0][item.id];
  return { shipped: k.X === 'old' ? item.labelX : item.labelY, proposed: k.X === 'new' ? item.labelX : item.labelY };
};
const examples = [];
for (const kind of t.byKind.slice(0, 4)) {
  const want = kind.bothProposed > kind.bothShipped ? 'new' : 'old';
  const item = items.find(i => {
    const l = labelsOf(i);
    return `${l.shipped} → ${l.proposed}` === kind.kind && runs.every((_, r) => pickOf(r, i.id) === want);
  });
  if (item) examples.push({ item, want });
}
g.def('ExampleCount', String(examples.length));
const sideName = fen => (fen.split(' ')[1] === 'w' ? 'White' : 'Black');
examples.forEach(({ item, want }, n) => {
  const fen = item.fenBefore;
  const [played] = ucisOf(fen, sansOf(item.move));
  const bestSans = item.engine.bestLine ? sansOf(item.engine.bestLine) : [];
  const bestUcis = bestSans.length ? ucisOf(fen, bestSans) : [];
  const l = labelsOf(item);
  const reason = answers[0].get(item.id).reason;
  g.def(`Example${'ABCDEFGH'[n]}Caption`, `${esc(l.shipped)} on the shipped curve, ${esc(l.proposed)} on the proposed one: the judge preferred the ${want === 'old' ? 'shipped' : 'proposed'} label in both runs.`);
  g.input(`Example${'ABCDEFGH'[n]}`, `example-${'abcdefgh'[n]}`, [
    '\\begin{minipage}[t]{0.4\\textwidth}\\vspace{0pt}',
    board(fen, { played, better: bestUcis[0] ?? null, size: '13pt' }),
    '\\end{minipage}\\hfill',
    '\\begin{minipage}[t]{0.56\\textwidth}\\vspace{0pt}\\small',
    `\\textbf{Played:} ${movesTex(fen, sansOf(item.move))}, ${sideName(fen)} to move; ratings ${item.playerRating} (the player) and ${item.opponentRating}.\\par`,
    `\\textbf{Engine:} ${esc(item.engine.evalText)}.\\par`,
    bestSans.length ? `\\textbf{Best line:} ${movesTex(fen, bestSans)}\\par\\textbf{UCI:} \\uci{${played}}; best line \\uci{${bestUcis.join(' ')}}\\par` : '',
    `\\textbf{Shipped:} ${esc(l.shipped)}. \\textbf{Proposed:} ${esc(l.proposed)}. \\textbf{Judge:} the ${want === 'old' ? 'shipped' : 'proposed'} verdict, in both runs.\\par`,
    `\\textbf{Reason (run 1):} \`\`${esc(reason)}''\\par`,
    `\\textbf{FEN:} \\fen{${fen}}`,
    '\\end{minipage}',
  ].join('\n'));
});

// ---- the reproduction
const a = repro.flips.recorded, b = repro.flips.rerun;
g.def('EvidenceRerun', esc(b.evidenceVersion))
  .def('RerunFlips', String(b.flips))
  .def('RerunFlipShare', percent(b.flipShare))
  .def('RerunFlipsPlayer', String(b.flipsByRole.player))
  .def('RerunFlipsOpponent', String(b.flipsByRole.opponent));
if (!repro.judge.matchesPublished) throw new Error('the judge table does not recompute: fix that before writing the paper');
g.block('ReproTable', [
  '\\begin{tabular}{lrr}', '\\toprule', ' & recorded & rerun in the lab \\\\', '\\midrule',
  `engine evidence & ${esc(a.evidenceVersion)} & ${esc(b.evidenceVersion)} \\\\`,
  `games & ${a.games} & ${b.games} \\\\`,
  `plies with exact scores & ${a.exactScorePlies} & ${b.exactScorePlies} \\\\`,
  `graded plies & ${a.gradedPlies} & ${b.gradedPlies} \\\\`,
  `flips & ${a.flips} (${percent(a.flipShare)}\\%) & ${b.flips} (${percent(b.flipShare)}\\%) \\\\`,
  `the player's flips & ${a.flipsByRole.player} of ${a.gradedByRole.player} & ${b.flipsByRole.player} of ${b.gradedByRole.player} \\\\`,
  `the opponents' flips & ${a.flipsByRole.opponent} of ${a.gradedByRole.opponent} & ${b.flipsByRole.opponent} of ${b.gradedByRole.opponent} \\\\`,
  `the copy of the judge matches the app's & ${a.assertionPassed ? 'yes' : 'no'} & ${b.assertionPassed ? 'yes' : 'no'} \\\\`,
  '\\bottomrule', '\\end{tabular}',
].join('\n'));
g.def('AppCommit', `\\texttt{${repro.chess.pinned_commit.slice(0, 7)}}`)
  .def('RecordsCommit', `\\texttt{${repro.chess.records_commit.slice(0, 7)}}`);

g.write(join(HERE, 'generated.tex'));
console.log(`wrote ${join(HERE, 'generated.tex')}: ${examples.length} examples`);
